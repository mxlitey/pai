#!/usr/bin/env node
// 排课日历系统 MCP Server（stdio 传输）
// 架构：MCP Client --stdio--> 本进程 --HTTP--> EdgeOne Pages Functions (/api/*)
//
// 环境变量：
//   PAI_BASE_URL       后端地址（默认 http://localhost:8788，生产填 EdgeOne 域名）
//   PAI_ADMIN_PASSWORD 管理员密码（用于自动登录换取 token）
//
// 注意：本进程所有日志走 stderr（console.error），stdout 专用于 MCP 协议

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const BASE_URL = (process.env.PAI_BASE_URL || 'http://localhost:8788').replace(/\/+$/, '')
const ADMIN_PASSWORD = process.env.PAI_ADMIN_PASSWORD || ''

// ========== Token 管理 ==========
// 惰性登录换取 token，缓存复用；收到 401 时自动重登一次并重试
let cachedToken = null

async function login() {
  if (!ADMIN_PASSWORD) {
    throw new Error('未配置 PAI_ADMIN_PASSWORD 环境变量，无法执行写操作（只读工具可用）')
  }
  const resp = await fetch(`${BASE_URL}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
    signal: AbortSignal.timeout(15000),
  })
  const result = await resp.json().catch(() => null)
  if (!result || result.code !== 0 || !result.data?.token) {
    throw new Error(result?.message || `登录失败（HTTP ${resp.status}）`)
  }
  cachedToken = result.data.token
  return cachedToken
}

async function getToken() {
  return cachedToken || login()
}

function clearToken() {
  cachedToken = null
}

// 通用请求：带 Bearer token，401 时重登一次再重试
async function apiRequest(path, { method = 'GET', body, auth = true } = {}) {
  const doFetch = async (token) => {
    const headers = { 'Content-Type': 'application/json' }
    if (auth && token) headers['Authorization'] = `Bearer ${token}`
    let resp
    try {
      resp = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30000),
      })
    } catch (e) {
      const reason = e?.name === 'TimeoutError' ? '请求超时' : '无法连接后端'
      throw new Error(`${reason}，请检查 PAI_BASE_URL（当前 ${BASE_URL}）及后端是否可达`)
    }
    return resp
  }

  let resp = await doFetch(auth ? await getToken() : null)

  // 401：token 过期，重登一次后重试
  if (resp.status === 401 && auth) {
    clearToken()
    resp = await doFetch(await login())
  }

  const result = await resp.json().catch(() => null)
  if (!result) {
    throw new Error(`后端响应非 JSON（HTTP ${resp.status}），请检查 PAI_BASE_URL 是否正确`)
  }
  return result
}

// 统一的工具返回：后端 { code, message, data } → MCP text content
// code === 0 视为成功；非 0 时把 message 作为错误抛出（保留 data 供排查）
function toText(result) {
  if (result.code !== 0) {
    throw new Error(result.message || `后端返回错误码 ${result.code}`)
  }
  return JSON.stringify(result.data, null, 2)
}

const textResult = (text) => ({ content: [{ type: 'text', text }] })

// ========== zod schema 公共片段 ==========
const studentIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, '仅允许字母、数字、下划线、短横线，长度 1-64')
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '格式必须为 yyyy-MM-dd')
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, '格式必须为 HH:mm')
const monthSchema = z.string().regex(/^\d{4}-\d{2}$/, '格式必须为 yyyy-MM')

const scheduleSchema = z.object({
  id: z.string().describe('排课记录唯一 ID（新增时可留空，由系统生成；更新时必填）').optional(),
  studentId: studentIdSchema.describe('学员 ID'),
  studentName: z.string().describe('学员姓名'),
  courseId: z.string().optional().describe('关联课程 ID（历史记录可能为空）'),
  courseName: z.string().describe('课程名称'),
  date: dateSchema.describe('上课日期 yyyy-MM-dd'),
  startTime: z.string().regex(/^(\d{2}:\d{2})?$/, '格式必须为 HH:mm 或空').describe('开始时间 HH:mm（历史数据可能为空串）'),
  endTime: z.string().regex(/^(\d{2}:\d{2})?$/, '格式必须为 HH:mm 或空').describe('结束时间 HH:mm（历史数据可能为空串）'),
  note: z.string().optional().describe('备注'),
  color: z.string().optional().describe('颜色标签 key，如 blue/green（通常从课程继承）'),
})

// 删除类工具的安全开关：必须显式传 true 才执行
const confirmSchema = z.literal(true).describe('危险操作确认：必须显式传 true 才会执行删除')

// ========== MCP Server ==========
const server = new McpServer({
  name: 'pai-schedule-mcp-server',
  version: '1.0.0',
})

// ---------- 只读工具 ----------

server.registerTool(
  'list_students',
  {
    title: '搜索学员',
    description: '按关键字搜索学员（支持 id 或姓名的精确/模糊匹配）。不传 q 返回全部学员。返回学员的 id 和 name。',
    inputSchema: {
      q: z.string().optional().describe('搜索关键字（学员姓名或 ID）'),
    },
  },
  async ({ q }) => {
    const query = q ? `?q=${encodeURIComponent(q)}` : ''
    return textResult(toText(await apiRequest(`/api/students${query}`, { auth: false })))
  },
)

server.registerTool(
  'get_schedules',
  {
    title: '查询单个学员的排课',
    description: '按学员 ID 或姓名查询排课记录。可传 studentId 或 studentName（二选一）。不传日期范围时返回该学员全部排课。',
    inputSchema: {
      studentId: studentIdSchema.optional().describe('学员 ID'),
      studentName: z.string().optional().describe('学员姓名（与 studentId 二选一）'),
      startDate: dateSchema.optional().describe('开始日期 yyyy-MM-dd'),
      endDate: dateSchema.optional().describe('结束日期 yyyy-MM-dd'),
    },
  },
  async ({ studentId, studentName, startDate, endDate }) => {
    const qs = new URLSearchParams()
    if (studentId) qs.set('studentId', studentId)
    if (studentName) qs.set('studentName', studentName)
    if (startDate) qs.set('startDate', startDate)
    if (endDate) qs.set('endDate', endDate)
    const query = qs.toString()
    return textResult(toText(await apiRequest(`/api/schedules${query ? '?' + query : ''}`, { auth: false })))
  },
)

server.registerTool(
  'search_schedules',
  {
    title: '跨学员搜索排课',
    description: '按日期范围 + 可选课程 ID / 学员 ID 过滤排课（鉴权接口，聚合所有学员）。任一参数可缺省；全部缺省时返回全量排课。',
    inputSchema: {
      startDate: dateSchema.optional().describe('开始日期 yyyy-MM-dd'),
      endDate: dateSchema.optional().describe('结束日期 yyyy-MM-dd'),
      courseId: z.string().optional().describe('按课程 ID 过滤'),
      studentId: studentIdSchema.optional().describe('按学员 ID 过滤'),
    },
  },
  async (params) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) qs.set(k, v)
    }
    const query = qs.toString()
    return textResult(toText(await apiRequest(`/api/schedules-search${query ? '?' + query : ''}`, { auth: true })))
  },
)

server.registerTool(
  'list_courses',
  {
    title: '获取课程列表',
    description: '获取全部课程（含 id、名称、颜色标签、默认上下课时间）。排课前建议先调用确认 courseId。',
    inputSchema: {},
  },
  async () => {
    return textResult(toText(await apiRequest('/api/courses', { auth: true })))
  },
)

server.registerTool(
  'get_announcement',
  {
    title: '读取公告',
    description: '读取系统公告内容（Markdown 文本）与最后更新时间。',
    inputSchema: {},
  },
  async () => {
    return textResult(toText(await apiRequest('/api/announcement', { auth: false })))
  },
)

// ---------- 写操作工具（自动鉴权） ----------

server.registerTool(
  'add_schedule',
  {
    title: '新增单条排课',
    description: '为单个学员新增一条排课记录。id 可留空（服务端容忍缺省）；建议先 list_students / list_courses 确认 studentId 与课程信息。',
    inputSchema: { schedule: scheduleSchema },
  },
  async ({ schedule }) => {
    const result = await apiRequest('/api/schedule-add', { method: 'POST', body: { schedule } })
    if (result.code === 0 && result.data?.exists) {
      return textResult(`已存在同 id 的排课记录，未重复写入：\n${JSON.stringify(result.data, null, 2)}`)
    }
    return textResult(toText(result))
  },
)

server.registerTool(
  'batch_add_schedules',
  {
    title: '批量排课（多学员 × 多日期）',
    description: '为多个学员在多个日期批量排同一门课（dates × studentIds 笛卡尔积）。时间默认取课程的默认上下课时间，可显式覆盖。',
    inputSchema: {
      courseId: z.string().describe('课程 ID'),
      courseName: z.string().describe('课程名称（需与课程列表一致）'),
      color: z.string().optional().describe('颜色标签 key（通常取课程的颜色）'),
      dates: z.array(dateSchema).min(1).describe('日期列表，每个 yyyy-MM-dd'),
      startTime: timeSchema.optional().describe('开始时间 HH:mm（缺省用课程默认）'),
      endTime: timeSchema.optional().describe('结束时间 HH:mm（缺省用课程默认）'),
      note: z.string().optional().describe('备注'),
      studentIds: z.array(studentIdSchema).min(1).describe('学员 ID 列表'),
    },
  },
  async (body) => {
    // 后端不会自动套用课程默认时间（缺省即写空串），此处补齐：
    // startTime/endTime/color 缺省时，从课程列表取该课程的默认值
    if (body.courseId && (!body.startTime || !body.endTime || !body.color)) {
      const coursesResult = await apiRequest('/api/courses', { auth: true })
      if (coursesResult.code === 0) {
        const course = (coursesResult.data?.courses || []).find((c) => c.id === body.courseId)
        if (course) {
          if (!body.startTime && course.defaultStartTime) body.startTime = course.defaultStartTime
          if (!body.endTime && course.defaultEndTime) body.endTime = course.defaultEndTime
          if (!body.color && course.color) body.color = course.color
        }
      }
    }
    return textResult(toText(await apiRequest('/api/schedule-add-batch', { method: 'POST', body })))
  },
)

server.registerTool(
  'update_schedule',
  {
    title: '修改排课',
    description: '修改一条排课记录。old 必须是修改前的完整原始记录（用于定位），new 是修改后的完整记录；两者 id 必须一致。支持跨学员/跨月迁移（后端自动处理文件移动）。',
    inputSchema: {
      old: scheduleSchema,
      new: scheduleSchema,
    },
  },
  async ({ old: oldSchedule, new: newSchedule }) => {
    return textResult(toText(await apiRequest('/api/schedule-update', { method: 'PUT', body: { old: oldSchedule, new: newSchedule } })))
  },
)

server.registerTool(
  'delete_schedule',
  {
    title: '删除单条排课（危险）',
    description: '删除一条排课记录。危险操作：必须先向用户确认后再调用，且必须显式传 confirm=true。',
    inputSchema: {
      confirm: confirmSchema,
      id: z.string().describe('排课记录 ID'),
      studentId: studentIdSchema.describe('学员 ID'),
      date: dateSchema.describe('该排课的日期 yyyy-MM-dd（用于定位存储文件）'),
    },
  },
  async (params) => {
    const { confirm, ...body } = params
    return textResult(toText(await apiRequest('/api/schedule-delete', { method: 'DELETE', body })))
  },
)

server.registerTool(
  'add_student',
  {
    title: '新增学员',
    description: '新增学员。id 需全局唯一（若已存在会拒绝并返回 exists=true）。',
    inputSchema: {
      id: studentIdSchema.describe('学员 ID（全局唯一）'),
      name: z.string().min(1).describe('学员姓名'),
    },
  },
  async (student) => {
    return textResult(toText(await apiRequest('/api/student-add', { method: 'POST', body: { student } })))
  },
)

server.registerTool(
  'update_student',
  {
    title: '更新学员',
    description: '更新学员信息（按 id 定位）。若姓名变更，后端会级联更新该学员所有排课中的 studentName。',
    inputSchema: {
      id: studentIdSchema.describe('学员 ID'),
      name: z.string().min(1).describe('学员姓名'),
    },
  },
  async (student) => {
    return textResult(toText(await apiRequest('/api/student-update', { method: 'PUT', body: { student } })))
  },
)

server.registerTool(
  'delete_student',
  {
    title: '删除学员（危险）',
    description: '删除学员及其全部排课数据，不可恢复。危险操作：必须先向用户确认后再调用，且必须显式传 confirm=true。',
    inputSchema: {
      confirm: confirmSchema,
      studentId: studentIdSchema.describe('学员 ID'),
    },
  },
  async ({ confirm, studentId }) => {
    return textResult(toText(await apiRequest('/api/student-delete', { method: 'DELETE', body: { studentId } })))
  },
)

server.registerTool(
  'add_course',
  {
    title: '新增课程',
    description: '新增课程。id 全局唯一；可配置颜色标签与默认上下课时间（批量排课时会使用默认时间）。',
    inputSchema: {
      id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, '课程 ID 仅允许字母、数字、下划线、短横线'),
      name: z.string().min(1).describe('课程名称'),
      color: z.string().optional().describe('颜色标签 key，如 blue/green'),
      defaultStartTime: timeSchema.optional().describe('默认开始时间 HH:mm'),
      defaultEndTime: timeSchema.optional().describe('默认结束时间 HH:mm'),
    },
  },
  async (course) => {
    return textResult(toText(await apiRequest('/api/course-add', { method: 'POST', body: { course } })))
  },
)

server.registerTool(
  'update_course',
  {
    title: '更新课程',
    description: '更新课程信息（按 id 定位）。注意：不会级联更新已有排课记录中的 courseName。',
    inputSchema: {
      id: z.string().describe('课程 ID'),
      name: z.string().min(1).describe('课程名称'),
      color: z.string().optional().describe('颜色标签 key'),
      defaultStartTime: timeSchema.optional().describe('默认开始时间 HH:mm'),
      defaultEndTime: timeSchema.optional().describe('默认结束时间 HH:mm'),
    },
  },
  async (course) => {
    return textResult(toText(await apiRequest('/api/course-update', { method: 'PUT', body: { course } })))
  },
)

server.registerTool(
  'delete_course',
  {
    title: '删除课程（危险）',
    description: '删除课程及其所有关联排课记录，不可恢复。危险操作：必须先向用户确认后再调用，且必须显式传 confirm=true。',
    inputSchema: {
      confirm: confirmSchema,
      courseId: z.string().describe('课程 ID'),
    },
  },
  async ({ confirm, courseId }) => {
    return textResult(toText(await apiRequest('/api/course-delete', { method: 'DELETE', body: { courseId } })))
  },
)

server.registerTool(
  'save_announcement',
  {
    title: '保存公告',
    description: '保存系统公告（Markdown 文本）。传空字符串等价于清空公告。单条上限 5000 字。',
    inputSchema: {
      content: z.string().max(5000).describe('公告内容（Markdown），空字符串表示清空'),
    },
  },
  async ({ content }) => {
    return textResult(toText(await apiRequest('/api/announcement', { method: 'POST', body: { content } })))
  },
)

// ========== 启动 ==========
async function main() {
  console.error(`[pai-mcp] 启动：BASE_URL=${BASE_URL}，密码${ADMIN_PASSWORD ? '已配置' : '未配置（仅只读工具可用）'}`)
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((e) => {
  console.error('[pai-mcp] 启动失败:', e?.message || String(e))
  process.exit(1)
})
