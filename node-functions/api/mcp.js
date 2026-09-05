// MCP Server（云端版，无状态 Streamable HTTP）
// POST /api/mcp —— MCP 客户端（Trae / Claude Desktop / Cursor 等）入口
//
// 协议：MCP Streamable HTTP（无会话），单次 POST 独立处理 JSON-RPC 2.0 消息
// 架构：MCP 客户端 →（HTTPS）→ 本函数 →（函数内直调 _lib/h-*.js 业务逻辑）→ Blob 存储
//       不发起 HTTP 自请求，业务校验逻辑与 REST API 完全同源（api/*.js 与本文件复用同一实现）
//
// 鉴权（复用环境变量 ADMIN_PASSWORD）：
//   客户端在每次请求携带请求头 X-Admin-Password: <管理员密码>
//   （或 Authorization: Bearer <管理员密码>，也兼容 Bearer <token>）
//   校验通过后本函数签发内部 token 调用鉴权 API；只读公开工具（查学员/查排课/读公告）无需密码
//
// 注：业务逻辑统一从 _lib/h-*.js 导入（而非 ./xxx.js api 文件）——EdgeOne 按函数名做方法路由，
//     若 import api 文件，其 default 导出（onRequestGet/Post/...）会污染本路由 bundle 的方法分发
// 注：旧版本地 stdio MCP Server 已归档于 mcp-server/（维护模式，不再更新）
import { getTokenSecret, signToken, verifyPassword, verifyToken } from '../_lib/auth.js'
import { handleStudentsGet as studentsApi } from '../_lib/h-students.js'
import { handleSchedulesGet as schedulesApi } from '../_lib/h-schedules.js'
import { handleSchedulesSearchGet as schedulesSearchApi } from '../_lib/h-schedules-search.js'
import { handleCoursesGet as coursesApi } from '../_lib/h-courses.js'
import { handleAnnouncement as announcementApi } from '../_lib/h-announcement.js'
import { handleCourseAdd as courseAddApi } from '../_lib/h-course-add.js'
import { handleCourseUpdate as courseUpdateApi } from '../_lib/h-course-update.js'
import { handleCourseDelete as courseDeleteApi } from '../_lib/h-course-delete.js'
import { handleStudentAdd as studentAddApi } from '../_lib/h-student-add.js'
import { handleStudentUpdate as studentUpdateApi } from '../_lib/h-student-update.js'
import { handleStudentDelete as studentDeleteApi } from '../_lib/h-student-delete.js'
import { handleScheduleAdd as scheduleAddApi } from '../_lib/h-schedule-add.js'
import { handleScheduleAddBatch as scheduleAddBatchApi } from '../_lib/h-schedule-add-batch.js'
import { handleScheduleUpdate as scheduleUpdateApi } from '../_lib/h-schedule-update.js'
import { handleScheduleAttendance as scheduleAttendanceApi } from '../_lib/h-schedule-attendance.js'
import { handleScheduleDelete as scheduleDeleteApi } from '../_lib/h-schedule-delete.js'

const SERVER_NAME = 'pai-schedule-mcp'
const SERVER_VERSION = '2.0.0'
const DEFAULT_PROTOCOL_VERSION = '2025-03-26'
const SUPPORTED_PROTOCOL_VERSIONS = ['2024-11-05', '2025-03-26', '2025-06-18']
// 内部 API 调用的虚拟基址（仅用于构造 URL，不发起真实网络请求）
const INTERNAL_BASE = 'https://mcp-internal'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Admin-Password, Mcp-Session-Id, Mcp-Protocol-Revision, Last-Event-ID',
}

// ========== MCP 响应工具 ==========

function mcpJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS_HEADERS },
  })
}

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }
}

// ========== 鉴权：请求头密码 → 内部 token ==========

// 解析客户端凭据：X-Admin-Password 优先，其次 Authorization: Bearer（密码或 token）
// 返回内部 token；未携带任何凭据返回 null；携带但错误抛错
async function resolveInternalToken(request, env) {
  const headerPwd = request.headers.get('X-Admin-Password')
  const bearer = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  const candidate = headerPwd || bearer
  if (!candidate) return null

  if (verifyPassword(candidate, env)) {
    return signToken(getTokenSecret(env))
  }
  // 兼容：Authorization 携带 /api/auth 签发的有效 HMAC token（24 小时）
  if (!headerPwd && bearer && (await verifyToken(bearer, getTokenSecret(env)))) {
    return bearer
  }
  throw new Error('管理密码错误（X-Admin-Password / Authorization: Bearer）')
}

// 工具执行前置检查：需要凭据但未提供/错误时抛错（转为工具级错误返回）
function needToken(ctx) {
  if (!ctx.token) {
    throw new Error(
      ctx.authError ||
        '该工具需要管理密码：请在客户端 MCP 配置的请求头中添加 X-Admin-Password（值同后台登录密码 ADMIN_PASSWORD）',
    )
  }
}

// ========== 内部 API 调用（函数内直调，无 HTTP 自请求） ==========

async function callApi(handler, { method = 'GET', path, query, body } = {}, ctx) {
  const qs = query && Object.keys(query).length ? `?${new URLSearchParams(query)}` : ''
  const headers = { 'Content-Type': 'application/json' }
  if (ctx.token) headers['Authorization'] = `Bearer ${ctx.token}`
  const request = new Request(`${INTERNAL_BASE}${path}${qs}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const resp = await handler({ request, env: ctx.env })
  let result = null
  try {
    result = await resp.json()
  } catch {
    result = null
  }
  if (!result || typeof result.code !== 'number') {
    throw new Error(`内部 API 响应异常（HTTP ${resp.status}）`)
  }
  return result
}

// 后端 { code, message, data } → MCP 工具结果；code !== 0 转为工具级错误
function apiResultToTool(result) {
  if (result.code !== 0) {
    return toolError(result.message || `后端返回错误码 ${result.code}`)
  }
  const dataText = JSON.stringify(result.data, null, 2)
  const text = result.message && result.message !== 'ok' ? `${result.message}\n${dataText}` : dataText
  return toolText(text)
}

function toolText(text) {
  return { content: [{ type: 'text', text }] }
}

function toolError(text) {
  return { content: [{ type: 'text', text }], isError: true }
}

// ========== 工具 schema 公共片段（JSON Schema） ==========

const studentIdSchema = { type: 'string', pattern: '^[A-Za-z0-9_-]{1,64}$', description: '学员 ID' }
const dateSchema = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: '日期 yyyy-MM-dd' }
const timeSchema = { type: 'string', pattern: '^\\d{2}:\\d{2}$', description: '时间 HH:mm（24 小时制）' }
const confirmSchema = { type: 'boolean', enum: [true], description: '危险操作确认：必须显式传 true 才会执行删除' }

const scheduleSchema = {
  type: 'object',
  description: '排课记录',
  properties: {
    id: { type: 'string', description: '排课记录唯一 ID（新增时可留空由系统生成；更新时必填）' },
    studentId: studentIdSchema,
    studentName: { type: 'string', description: '学员姓名' },
    courseId: { type: 'string', description: '课程 ID（新增时必填且须为已存在课程的 ID）' },
    courseName: { type: 'string', description: '课程名称' },
    date: dateSchema,
    startTime: { type: 'string', description: '开始时间 HH:mm' },
    endTime: { type: 'string', description: '结束时间 HH:mm' },
    note: { type: 'string', description: '备注' },
    color: { type: 'string', description: '颜色标签 key，如 blue/green' },
  },
  required: ['studentId', 'courseId', 'date', 'startTime', 'endTime'],
}

// ========== 工具注册表 ==========

const TOOLS = [
  {
    name: 'list_students',
    title: '搜索学员',
    description: '按关键字搜索学员（支持 id 或姓名匹配）；不传 q 返回全部学员。',
    inputSchema: {
      type: 'object',
      properties: { q: { type: 'string', description: '搜索关键字（学员姓名或 ID）' } },
    },
    handler: async (a, ctx) =>
      apiResultToTool(
        await callApi(studentsApi, { path: '/api/students', query: a.q ? { q: a.q } : null }, ctx),
      ),
  },
  {
    name: 'get_schedules',
    title: '查询单个学员的排课',
    description:
      '按学员 ID 或姓名查询排课记录（可传 studentId 或 studentName，二选一）；不传日期范围时返回该学员全部排课。',
    inputSchema: {
      type: 'object',
      properties: {
        studentId: studentIdSchema,
        studentName: { type: 'string', description: '学员姓名（与 studentId 二选一）' },
        startDate: dateSchema,
        endDate: dateSchema,
      },
    },
    handler: async (a, ctx) => {
      const query = {}
      for (const k of ['studentId', 'studentName', 'startDate', 'endDate']) {
        if (a[k]) query[k] = a[k]
      }
      return apiResultToTool(await callApi(schedulesApi, { path: '/api/schedules', query }, ctx))
    },
  },
  {
    name: 'get_announcement',
    title: '读取公告',
    description: '读取系统公告内容（Markdown 文本）与最后更新时间。',
    inputSchema: { type: 'object', properties: {} },
    handler: async (a, ctx) =>
      apiResultToTool(await callApi(announcementApi, { path: '/api/announcement' }, ctx)),
  },
  {
    name: 'search_schedules',
    title: '跨学员搜索排课',
    description:
      '按日期范围、课程 ID、学员 ID 过滤排课（聚合所有学员）；任一参数可缺省，全部缺省时返回全量排课。需管理密码。',
    inputSchema: {
      type: 'object',
      properties: {
        startDate: dateSchema,
        endDate: dateSchema,
        courseId: { type: 'string', description: '按课程 ID 过滤' },
        studentId: studentIdSchema,
      },
    },
    handler: async (a, ctx) => {
      needToken(ctx)
      const query = {}
      for (const k of ['startDate', 'endDate', 'courseId', 'studentId']) {
        if (a[k]) query[k] = a[k]
      }
      return apiResultToTool(
        await callApi(schedulesSearchApi, { path: '/api/schedules-search', query }, ctx),
      )
    },
  },
  {
    name: 'list_courses',
    title: '获取课程列表',
    description: '获取全部课程（含 id、名称、颜色标签、默认上下课时间）。排课前建议先调用确认 courseId。需管理密码。',
    inputSchema: { type: 'object', properties: {} },
    handler: async (a, ctx) => {
      needToken(ctx)
      return apiResultToTool(await callApi(coursesApi, { path: '/api/courses' }, ctx))
    },
  },
  {
    name: 'add_schedule',
    title: '新增单条排课',
    description:
      '为单个学员新增一条排课记录。startTime/endTime 必填（不会自动套用课程默认时间，需要时先 list_courses 查询）；同学员同日同时段同课程已存在时返回 409 不重复写入。需管理密码。',
    inputSchema: {
      type: 'object',
      properties: { schedule: scheduleSchema },
      required: ['schedule'],
    },
    handler: async (a, ctx) => {
      needToken(ctx)
      return apiResultToTool(
        await callApi(
          scheduleAddApi,
          { method: 'POST', path: '/api/schedule-add', body: { schedule: a.schedule } },
          ctx,
        ),
      )
    },
  },
  {
    name: 'batch_add_schedules',
    title: '批量排课（多学员 × 多日期）',
    description:
      '为多个学员在多个日期批量排同一门课（dates × studentIds 笛卡尔积）。startTime/endTime 缺省时自动取课程默认上下课时间（课程未配置默认时间则报错）；同学员同日同时段同课程已存在时自动跳过并计入 skipped。需管理密码。',
    inputSchema: {
      type: 'object',
      properties: {
        courseId: { type: 'string', description: '课程 ID' },
        dates: { type: 'array', items: dateSchema, minItems: 1, description: '日期列表，每个 yyyy-MM-dd' },
        startTime: { ...timeSchema, description: '开始时间 HH:mm（缺省自动用课程默认时间）' },
        endTime: { ...timeSchema, description: '结束时间 HH:mm（缺省自动用课程默认时间）' },
        note: { type: 'string', description: '备注' },
        studentIds: { type: 'array', items: studentIdSchema, minItems: 1, description: '学员 ID 列表' },
      },
      required: ['courseId', 'dates', 'studentIds'],
    },
    handler: async (a, ctx) => {
      needToken(ctx)
      const body = { ...a }
      // startTime/endTime 缺省时从课程默认时间补齐（courseName/color 不存储，读取时 join 返回）
      if (body.courseId && (!body.startTime || !body.endTime)) {
        const coursesResult = await callApi(coursesApi, { path: '/api/courses' }, ctx)
        if (coursesResult.code === 0) {
          const course = (coursesResult.data?.courses || []).find((c) => c.id === body.courseId)
          if (course) {
            if (!body.startTime && course.defaultStartTime) body.startTime = course.defaultStartTime
            if (!body.endTime && course.defaultEndTime) body.endTime = course.defaultEndTime
          }
        }
      }
      if (!body.startTime || !body.endTime) {
        return toolError(
          'startTime/endTime 为必填项。课程未配置默认时间时需显式传入（可先 list_courses 查看）。',
        )
      }
      return apiResultToTool(
        await callApi(
          scheduleAddBatchApi,
          { method: 'POST', path: '/api/schedule-add-batch', body },
          ctx,
        ),
      )
    },
  },
  {
    name: 'update_schedule',
    title: '修改排课',
    description:
      '修改一条排课记录。old 为修改前的完整原始记录（用于定位），new 为修改后的完整记录；两者 id 必须一致。需管理密码。',
    inputSchema: {
      type: 'object',
      properties: { old: scheduleSchema, new: scheduleSchema },
      required: ['old', 'new'],
    },
    handler: async (a, ctx) => {
      needToken(ctx)
      return apiResultToTool(
        await callApi(
          scheduleUpdateApi,
          { method: 'PUT', path: '/api/schedule-update', body: { old: a.old, new: a.new } },
          ctx,
        ),
      )
    },
  },
  {
    name: 'set_attendance',
    title: '点名（设置到课状态）',
    description:
      '为一条排课记录设置点名状态。可先用 search_schedules / get_schedules 查询排课 id。需管理密码。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '排课记录 ID' },
        studentId: studentIdSchema,
        date: dateSchema,
        attendance: {
          type: 'string',
          enum: ['attended', 'absent', 'none'],
          description: 'attended=到课，absent=缺勤，none=清除标记（回到未点名）',
        },
      },
      required: ['id', 'studentId', 'date', 'attendance'],
    },
    handler: async (a, ctx) => {
      needToken(ctx)
      return apiResultToTool(
        await callApi(
          scheduleAttendanceApi,
          {
            method: 'PUT',
            path: '/api/schedule-attendance',
            body: { updates: [{ id: a.id, studentId: a.studentId, date: a.date, attendance: a.attendance }] },
          },
          ctx,
        ),
      )
    },
  },
  {
    name: 'delete_schedule',
    title: '删除单条排课（危险）',
    description:
      '删除一条排课记录。危险操作：必须先向用户确认后再调用，且必须显式传 confirm=true。需管理密码。',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: confirmSchema,
        id: { type: 'string', description: '排课记录 ID' },
        studentId: studentIdSchema,
        date: { ...dateSchema, description: '该排课的日期 yyyy-MM-dd（用于定位存储文件）' },
      },
      required: ['confirm', 'id', 'studentId', 'date'],
    },
    handler: async (a, ctx) => {
      needToken(ctx)
      if (a.confirm !== true) {
        return toolError('危险操作：必须显式传 confirm=true 才会执行删除')
      }
      return apiResultToTool(
        await callApi(
          scheduleDeleteApi,
          {
            method: 'DELETE',
            path: '/api/schedule-delete',
            body: { id: a.id, studentId: a.studentId, date: a.date },
          },
          ctx,
        ),
      )
    },
  },
  {
    name: 'add_student',
    title: '新增学员',
    description:
      '新增一个学员。id 由后端自动生成（传入被忽略），新增后可用 list_students 查询到真实 id。需管理密码。',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', minLength: 1, description: '学员姓名' } },
      required: ['name'],
    },
    handler: async (a, ctx) => {
      needToken(ctx)
      return apiResultToTool(
        await callApi(
          studentAddApi,
          { method: 'POST', path: '/api/student-add', body: { student: { name: a.name } } },
          ctx,
        ),
      )
    },
  },
  {
    name: 'update_student',
    title: '更新学员',
    description: '更新指定学员的姓名等信息（按 id 定位）。需管理密码。',
    inputSchema: {
      type: 'object',
      properties: {
        id: studentIdSchema,
        name: { type: 'string', minLength: 1, description: '学员姓名' },
      },
      required: ['id', 'name'],
    },
    handler: async (a, ctx) => {
      needToken(ctx)
      return apiResultToTool(
        await callApi(
          studentUpdateApi,
          { method: 'PUT', path: '/api/student-update', body: { student: { id: a.id, name: a.name } } },
          ctx,
        ),
      )
    },
  },
  {
    name: 'delete_student',
    title: '删除学员（危险）',
    description:
      '删除学员及其全部排课数据，不可恢复。危险操作：必须先向用户确认后再调用，且必须显式传 confirm=true。需管理密码。',
    inputSchema: {
      type: 'object',
      properties: { confirm: confirmSchema, studentId: studentIdSchema },
      required: ['confirm', 'studentId'],
    },
    handler: async (a, ctx) => {
      needToken(ctx)
      if (a.confirm !== true) {
        return toolError('危险操作：必须显式传 confirm=true 才会执行删除')
      }
      return apiResultToTool(
        await callApi(
          studentDeleteApi,
          { method: 'DELETE', path: '/api/student-delete', body: { studentId: a.studentId } },
          ctx,
        ),
      )
    },
  },
  {
    name: 'add_course',
    title: '新增课程',
    description:
      '新增一门课程。id 由后端自动生成（传入被忽略）；默认上下课时间必填。需管理密码。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, description: '课程名称' },
        color: { type: 'string', description: '颜色标签 key，如 blue/green' },
        defaultStartTime: { ...timeSchema, description: '默认开始时间 HH:mm（必填）' },
        defaultEndTime: { ...timeSchema, description: '默认结束时间 HH:mm（必填）' },
      },
      required: ['name', 'defaultStartTime', 'defaultEndTime'],
    },
    handler: async (a, ctx) => {
      needToken(ctx)
      return apiResultToTool(
        await callApi(courseAddApi, { method: 'POST', path: '/api/course-add', body: { course: a } }, ctx),
      )
    },
  },
  {
    name: 'update_course',
    title: '更新课程',
    description: '更新指定课程的信息（按 id 定位）。默认上下课时间必填。需管理密码。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '课程 ID' },
        name: { type: 'string', minLength: 1, description: '课程名称' },
        color: { type: 'string', description: '颜色标签 key' },
        defaultStartTime: { ...timeSchema, description: '默认开始时间 HH:mm（必填）' },
        defaultEndTime: { ...timeSchema, description: '默认结束时间 HH:mm（必填）' },
      },
      required: ['id', 'name', 'defaultStartTime', 'defaultEndTime'],
    },
    handler: async (a, ctx) => {
      needToken(ctx)
      return apiResultToTool(
        await callApi(courseUpdateApi, { method: 'PUT', path: '/api/course-update', body: { course: a } }, ctx),
      )
    },
  },
  {
    name: 'delete_course',
    title: '删除课程（危险）',
    description:
      '删除课程及其所有关联排课记录，不可恢复。危险操作：必须先向用户确认后再调用，且必须显式传 confirm=true。需管理密码。',
    inputSchema: {
      type: 'object',
      properties: { confirm: confirmSchema, courseId: { type: 'string', description: '课程 ID' } },
      required: ['confirm', 'courseId'],
    },
    handler: async (a, ctx) => {
      needToken(ctx)
      if (a.confirm !== true) {
        return toolError('危险操作：必须显式传 confirm=true 才会执行删除')
      }
      return apiResultToTool(
        await callApi(
          courseDeleteApi,
          { method: 'DELETE', path: '/api/course-delete', body: { courseId: a.courseId } },
          ctx,
        ),
      )
    },
  },
  {
    name: 'save_announcement',
    title: '保存公告',
    description: '保存系统公告（Markdown 文本）。传空字符串等价于清空公告。单条上限 5000 字。需管理密码。',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', maxLength: 5000, description: '公告内容（Markdown），空字符串表示清空' },
      },
      required: ['content'],
    },
    handler: async (a, ctx) => {
      needToken(ctx)
      return apiResultToTool(
        await callApi(
          announcementApi,
          { method: 'POST', path: '/api/announcement', body: { content: a.content } },
          ctx,
        ),
      )
    },
  },
]

// ========== JSON-RPC 消息处理 ==========

function handleInitialize(params) {
  const requested = params?.protocolVersion
  const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
    ? requested
    : DEFAULT_PROTOCOL_VERSION
  return {
    protocolVersion,
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION, title: '排课系统 MCP' },
  }
}

async function handleToolCall(params, ctx) {
  const name = params?.name
  const tool = TOOLS.find((t) => t.name === name)
  if (!tool) {
    const err = new Error(`未知工具: ${name}`)
    err.rpcCode = -32602
    throw err
  }
  try {
    return await tool.handler(params?.arguments || {}, ctx)
  } catch (e) {
    // 工具执行失败按 MCP 规范返回 isError 结果（而非 JSON-RPC 错误）
    return toolError(`执行失败: ${e?.message || String(e)}`)
  }
}

async function handleRpcMessage(msg, ctx) {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return rpcError(null, -32600, 'Invalid Request：需为合法的 JSON-RPC 2.0 消息')
  }
  const { id, method, params } = msg
  const isNotification = id === undefined || id === null
  try {
    let result
    switch (method) {
      case 'initialize':
        result = handleInitialize(params)
        break
      case 'ping':
        result = {}
        break
      case 'tools/list':
        result = {
          tools: TOOLS.map(({ name, title, description, inputSchema }) => ({
            name,
            title,
            description,
            inputSchema,
          })),
        }
        break
      case 'tools/call':
        result = await handleToolCall(params, ctx)
        break
      default:
        if (method.startsWith('notifications/')) return null
        return rpcError(id, -32601, `Method not found: ${method}`)
    }
    return isNotification ? null : { jsonrpc: '2.0', id, result }
  } catch (e) {
    if (isNotification) return null
    return rpcError(id, e?.rpcCode || -32603, e?.message || 'Internal error')
  }
}

// ========== 入口 ==========

export default async function onRequest(context) {
  const { request, env } = context

  // 浏览器类客户端的 CORS 预检
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } })
  }
  // 无状态模式不提供 GET/SSE
  if (request.method !== 'POST') {
    return mcpJson(
      rpcError(null, -32000, 'Method Not Allowed：MCP 端点仅支持 POST（Streamable HTTP 无状态模式）'),
      405,
    )
  }

  let payload
  try {
    payload = await request.json()
  } catch {
    return mcpJson(rpcError(null, -32700, 'Parse error：请求体需为 JSON-RPC 2.0'), 400)
  }

  // 鉴权预解析：公开工具不强制；密码错误时记录原因，供写工具返回明确提示
  let token = null
  let authError = ''
  try {
    token = await resolveInternalToken(request, env)
  } catch (e) {
    authError = e.message
  }
  const ctx = { env, token, authError }

  // 兼容单条与批量（数组）消息；notifications 不产生响应
  const messages = Array.isArray(payload) ? payload : [payload]
  const responses = []
  for (const msg of messages) {
    const resp = await handleRpcMessage(msg, ctx)
    if (resp) responses.push(resp)
  }
  if (!responses.length) {
    return new Response(null, { status: 202, headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } })
  }
  return mcpJson(Array.isArray(payload) ? responses : responses[0])
}
