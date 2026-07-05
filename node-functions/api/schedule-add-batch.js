// 批量新增排课 API
// POST /api/schedule-add-batch
// body: { courseId, courseName, teacher, location, color, date, startTime, endTime, note, studentIds: [] }
// 为每个 studentId 生成一条排课记录，一次性写入
import { batchAddSchedules, getStudents, json } from '../_lib/store.js'
import { requireAuth } from '../_lib/auth.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

// 生成排课 id
function genScheduleId() {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `s_${ts}${rand}`
}

export default async function onRequestPost(context) {
  const authFail = await requireAuth(context)
  if (authFail) return authFail
  const { request } = context
  const body = await readBody(request)

  const {
    courseId,
    courseName,
    teacher,
    location,
    color,
    date,
    startTime,
    endTime,
    note,
    studentIds,
  } = body

  // 字段校验
  if (!courseId) {
    return json({ code: 1, message: '缺少 courseId', data: null }, 400)
  }
  if (!courseName) {
    return json({ code: 1, message: '缺少 courseName', data: null }, 400)
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ code: 1, message: 'date 格式应为 yyyy-MM-dd', data: null }, 400)
  }
  if (startTime && !/^\d{2}:\d{2}$/.test(startTime)) {
    return json({ code: 1, message: 'startTime 格式应为 HH:mm', data: null }, 400)
  }
  if (endTime && !/^\d{2}:\d{2}$/.test(endTime)) {
    return json({ code: 1, message: 'endTime 格式应为 HH:mm', data: null }, 400)
  }
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return json({ code: 1, message: '请至少选择一名学员', data: null }, 400)
  }

  try {
    // 校验学员是否存在，并构建 id->name 映射
    const students = await getStudents()
    const studentMap = new Map(students.map((s) => [s.id, s]))
    const invalidIds = studentIds.filter((id) => !studentMap.has(id))
    if (invalidIds.length > 0) {
      return json(
        { code: 1, message: `以下 studentId 不存在: ${invalidIds.join(', ')}`, data: null },
        400,
      )
    }

    // 构建排课记录
    const schedules = studentIds.map((sid) => {
      const student = studentMap.get(sid)
      return {
        id: genScheduleId(),
        studentId: sid,
        studentName: student.name,
        courseId,
        courseName,
        teacher: teacher || '',
        location: location || '',
        date,
        startTime: startTime || '',
        endTime: endTime || '',
        note: note || '',
        color: color || '',
      }
    })

    const result = await batchAddSchedules(schedules)
    return json({
      code: 0,
      message: `已新增 ${result.created} 条排课` + (result.skipped > 0 ? `，跳过 ${result.skipped} 条重复` : ''),
      data: result,
    })
  } catch (e) {
    console.error('[schedule-add-batch] 批量新增异常:', e?.message || String(e))
    return json(
      { code: 1, message: '批量新增失败，请稍后重试', data: null },
      500,
    )
  }
}
