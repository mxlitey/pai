// 批量新增排课 API
// POST /api/schedule-add-batch
// body: { courseId, dates: string[], startTime, endTime, color?, note?, studentIds: [] }
// courseName 由后端根据 courseId 自动补全（不采信传入值）
// startTime / endTime 为必填项；color 缺省时取课程颜色
// 为每个 (date, studentId) 组合生成一条排课记录，一次性写入
// dates 为多日期数组，支持一次性排多天的课
import { batchAddSchedules, getCourses, getStudents, json } from '../_lib/store.js'
import { requireAuth } from '../_lib/auth.js'
import { genScheduleId } from '../_lib/id.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

export default async function onRequestPost(context) {
  const authFail = await requireAuth(context)
  if (authFail) return authFail
  const { request } = context
  const body = await readBody(request)

  const {
    courseId,
    courseName,
    color,
    dates,
    startTime,
    endTime,
    note,
    studentIds,
  } = body

  // 字段校验
  if (!courseId) {
    return json({ code: 1, message: '缺少 courseId', data: null }, 400)
  }
  // dates 必须是非空字符串数组，每个需符合 yyyy-MM-dd
  if (!Array.isArray(dates) || dates.length === 0) {
    return json({ code: 1, message: '请至少选择一个日期', data: null }, 400)
  }
  for (const d of dates) {
    if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      return json({ code: 1, message: `日期格式应为 yyyy-MM-dd，当前为 "${d}"`, data: null }, 400)
    }
  }
  // startTime / endTime 为必填项（格式校验后，取课程默认时间前先验空）
  if (!startTime) {
    return json({ code: 1, message: '缺少 startTime（开始时间为必填项）', data: null }, 400)
  }
  if (!endTime) {
    return json({ code: 1, message: '缺少 endTime（结束时间为必填项）', data: null }, 400)
  }
  if (!/^\d{2}:\d{2}$/.test(startTime)) {
    return json({ code: 1, message: 'startTime 格式应为 HH:mm', data: null }, 400)
  }
  if (!/^\d{2}:\d{2}$/.test(endTime)) {
    return json({ code: 1, message: 'endTime 格式应为 HH:mm', data: null }, 400)
  }
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return json({ code: 1, message: '请至少选择一名学员', data: null }, 400)
  }

  try {
    // courseId 必须在课程表中存在；courseName 由后端根据 courseId 自动补全（不采信传入值）
    const courses = await getCourses()
    const course = courses.find((c) => c.id === courseId)
    if (!course) {
      return json(
        { code: 1, message: `courseId="${courseId}" 在课程表中不存在`, data: null },
        400,
      )
    }
    const finalCourseName = course.name
    const finalColor = color || course.color || ''

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

    // 笛卡尔积：dates × studentIds，为每个组合生成一条排课
    const schedules = []
    const usedIds = new Set() // 请求内去重，确保生成的 id 绝对不重复
    for (const date of dates) {
      for (const sid of studentIds) {
        const student = studentMap.get(sid)
        let id
        do {
          id = genScheduleId()
        } while (usedIds.has(id))
        usedIds.add(id)
        schedules.push({
          id,
          studentId: sid,
          studentName: student.name,
          courseId,
          courseName: finalCourseName,
          date,
          startTime,
          endTime,
          note: note || '',
          color: finalColor,
        })
      }
    }

    const result = await batchAddSchedules(schedules)
    return json({
      code: 0,
      message: `已新增 ${result.created} 条排课` + (result.skipped > 0 ? `，跳过 ${result.skipped} 条重复` : ''),
      data: { ...result, totalAttempts: schedules.length },
    })
  } catch (e) {
    console.error('[schedule-add-batch] 批量新增异常:', e?.message || String(e))
    return json(
      { code: 1, message: '批量新增失败，请稍后重试', data: null },
      500,
    )
  }
}
