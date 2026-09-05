// 点名（设置到课状态）API
// PUT /api/schedule-attendance  body: { updates: [{ id, studentId, date, attendance }] }
// attendance: 'attended'=到课 / 'absent'=缺勤 / 'none'=清除标记（回到未点名）
// 批量接口：单个点名传长度 1 的数组；「全部到课」传整个时段的数组
// 记录不存在不报错，计入返回的 notFound（部分成功语义）
import { setScheduleAttendance, json } from './store.js'
import { requireAuth } from './auth.js'

const MAX_UPDATES = 100

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

// 校验单条点名更新项
function validateUpdate(u, index) {
  const prefix = `updates[${index}]`
  if (!u || typeof u !== 'object') throw new Error(`${prefix}: 数据不能为空`)
  if (!u.id) throw new Error(`${prefix}: 缺少 id`)
  if (!u.studentId) throw new Error(`${prefix}: 缺少 studentId`)
  if (!u.date || !/^\d{4}-\d{2}-\d{2}$/.test(u.date)) {
    throw new Error(`${prefix}: date 格式应为 yyyy-MM-dd`)
  }
  if (!['attended', 'absent', 'none'].includes(u.attendance)) {
    throw new Error(`${prefix}: attendance 取值应为 attended / absent / none`)
  }
}

export async function handleScheduleAttendance(context) {
  const authFail = await requireAuth(context)
  if (authFail) return authFail
  const { request } = context
  const body = await readBody(request)
  const { updates } = body

  if (!Array.isArray(updates) || updates.length === 0) {
    return json(
      { code: 1, message: '请求体需包含 updates 非空数组', data: null },
      400,
    )
  }
  if (updates.length > MAX_UPDATES) {
    return json(
      { code: 1, message: `单次最多 ${MAX_UPDATES} 条更新`, data: null },
      400,
    )
  }

  try {
    updates.forEach(validateUpdate)
  } catch (e) {
    return json({ code: 1, message: e.message, data: null }, 400)
  }

  try {
    const result = await setScheduleAttendance(updates)
    return json({
      code: 0,
      message: `已更新 ${result.updatedCount} 条点名记录`,
      data: result,
    })
  } catch (e) {
    return json({ code: 1, message: e.message, data: null }, 500)
  }
}
