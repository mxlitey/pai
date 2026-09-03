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
import { renderSchedulePage } from './build-schedule-page.mjs'

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
    description: '为单个学员新增一条排课记录。id/courseName 由服务端自动生成或补全；startTime/endTime 必填（不会自动套用课程默认时间，需要时先 list_courses 查询）；同学员同日同时段同课程已存在时返回 409 不重复写入；建议先 list_students 确认 studentId。',
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
    description: '为多个学员在多个日期批量排同一门课（dates × studentIds 笛卡尔积）。courseName 由后端根据 courseId 自动补全；startTime/endTime 必填，缺省时本工具自动取课程默认上下课时间（课程未配置默认时间则报错）。业务级去重：同学员同日同时段同课程已存在时自动跳过并计入 skipped，不会重复写入。',
    inputSchema: {
      courseId: z.string().describe('课程 ID'),
      dates: z.array(dateSchema).min(1).describe('日期列表，每个 yyyy-MM-dd'),
      startTime: timeSchema.optional().describe('开始时间 HH:mm（缺省自动用课程默认时间）'),
      endTime: timeSchema.optional().describe('结束时间 HH:mm（缺省自动用课程默认时间）'),
      color: z.string().optional().describe('颜色标签 key（缺省取课程颜色）'),
      note: z.string().optional().describe('备注'),
      studentIds: z.array(studentIdSchema).min(1).describe('学员 ID 列表'),
    },
  },
  async (body) => {
    // 后端 startTime/endTime 必填；缺省时此处从课程列表补齐默认值（courseName/color 后端自动补全）
    if (body.courseId && (!body.startTime || !body.endTime)) {
      const coursesResult = await apiRequest('/api/courses', { auth: true })
      if (coursesResult.code === 0) {
        const course = (coursesResult.data?.courses || []).find((c) => c.id === body.courseId)
        if (course) {
          if (!body.startTime && course.defaultStartTime) body.startTime = course.defaultStartTime
          if (!body.endTime && course.defaultEndTime) body.endTime = course.defaultEndTime
        }
      }
    }
    if (!body.startTime || !body.endTime) {
      return textResult('错误：startTime/endTime 为必填项。课程未配置默认时间时需显式传入（可先 list_courses 查看）。')
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
    description: '新增课程。id 由后端自动生成（传入被忽略，新建后需 list_courses 回读真实 id）；默认上下课时间为必填（批量排课缺省时间时会使用）。',
    inputSchema: {
      name: z.string().min(1).describe('课程名称'),
      color: z.string().optional().describe('颜色标签 key，如 blue/green'),
      defaultStartTime: timeSchema.describe('默认开始时间 HH:mm（必填）'),
      defaultEndTime: timeSchema.describe('默认结束时间 HH:mm（必填）'),
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
    description: '更新课程信息（按 id 定位）。默认上下课时间为必填；不会级联更新已有排课记录中的 courseName。',
    inputSchema: {
      id: z.string().describe('课程 ID'),
      name: z.string().min(1).describe('课程名称'),
      color: z.string().optional().describe('颜色标签 key'),
      defaultStartTime: timeSchema.describe('默认开始时间 HH:mm（必填）'),
      defaultEndTime: timeSchema.describe('默认结束时间 HH:mm（必填）'),
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

// ========== 本地文件解析（docx / xlsx 签到表）==========
import { parseDocx } from './parse-docx.mjs'
import { parseXlsx } from './parse-xlsx.mjs'
import { existsSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'

const PARSE_OUTPUT_LIMIT = 40000 // 返回内容上限（字符），超出截断

function parseLocalFile(filePath, parseFn, ext) {
  const abs = resolvePath(filePath)
  if (!existsSync(abs)) {
    throw new Error(`文件不存在: ${abs}`)
  }
  if (!abs.toLowerCase().endsWith(ext)) {
    throw new Error(`仅支持 ${ext} 文件，当前为: ${abs}`)
  }
  let text
  try {
    text = parseFn(abs)
  } catch (e) {
    throw new Error(`解析失败（请确认是有效的 ${ext} 文件）: ${e?.message || String(e)}`)
  }
  if (text.length > PARSE_OUTPUT_LIMIT) {
    text = text.slice(0, PARSE_OUTPUT_LIMIT) + `\n...（内容过长，已截断，共 ${text.length} 字符）`
  }
  return text
}

server.registerTool(
  'parse_docx',
  {
    title: '解析 docx 文件（本地）',
    description: '解析本地 docx 文件，提取正文段落与全部表格（单元格用 | 分隔）。适用于签到表、课程表等简单表格文档。返回 UTF-8 文本。',
    inputSchema: {
      filePath: z.string().describe('docx 文件绝对路径'),
    },
  },
  async ({ filePath }) => {
    try {
      return textResult(parseLocalFile(filePath, parseDocx, '.docx'))
    } catch (e) {
      return textResult(`解析失败: ${e?.message || String(e)}`)
    }
  },
)

server.registerTool(
  'parse_xlsx',
  {
    title: '解析 xlsx 文件（本地）',
    description: '解析本地 xlsx 文件，提取全部工作表为文本表格（单元格用 | 分隔）。支持多工作表、合并单元格、日期与数字格式。返回 UTF-8 文本。',
    inputSchema: {
      filePath: z.string().describe('xlsx 文件绝对路径'),
    },
  },
  async ({ filePath }) => {
    try {
      return textResult(parseLocalFile(filePath, parseXlsx, '.xlsx'))
    } catch (e) {
      return textResult(`解析失败: ${e?.message || String(e)}`)
    }
  },
)

// 生成排课总览看板：复用本进程的 apiRequest 取数（鉴权与重试逻辑一致），
// 渲染逻辑在 build-schedule-page.mjs 的 renderSchedulePage（HTML 输出到 mcp-server 目录）
server.registerTool(
  'build_schedule_page',
  {
    title: '生成排课总览看板（HTML）',
    description: '从后端实时拉取指定月份数据，生成排课总览 HTML 页面：每日安排卡片 + 考勤矩阵（● 到课 / ✕ 请假自动识别 / – 无课），含排课条数、训练日期、学员、班型统计。输出文件写入 mcp-server 目录，返回统计摘要与文件路径。需要配置 PAI_ADMIN_PASSWORD。',
    inputSchema: {
      month: monthSchema.optional().describe('月份 yyyy-MM，缺省为当前月'),
      makeup: z.string().regex(/^(\d{4}-\d{2}-\d{2})(,\d{4}-\d{2}-\d{2})*$/, '逗号分隔的 yyyy-MM-dd 日期列表').optional().describe('标记为「补课」的日期，逗号分隔，如 2026-08-13,2026-08-28'),
      out: z.string().optional().describe('输出文件名（缺省 {yyyy}年{M}月排课看板.html）'),
      title: z.string().optional().describe('覆盖页面主标题'),
    },
  },
  async ({ month: monthArg, makeup, out, title }) => {
    try {
      const month = monthArg || (() => {
        const now = new Date()
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      })()
      const [year, mon] = month.split('-').map(Number)
      const lastDay = new Date(year, mon, 0).getDate()
      const schedulesResult = toText(await apiRequest(
        `/api/schedules-search?startDate=${month}-01&endDate=${month}-${String(lastDay).padStart(2, '0')}`,
      ))
      const schedules = JSON.parse(schedulesResult).schedules || []
      if (!schedules.length) {
        return textResult(`${month} 没有任何排课记录，未生成页面。`)
      }
      const courses = JSON.parse(toText(await apiRequest('/api/courses'))).courses || []
      const { file, summary } = renderSchedulePage({
        schedules, courses, month,
        makeup: makeup ? makeup.split(',').filter(Boolean) : [],
        outFile: out, titleOverride: title,
      })
      return textResult(`${summary}\n文件路径: ${file}`)
    } catch (e) {
      return textResult(`生成失败: ${e?.message || String(e)}`)
    }
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
