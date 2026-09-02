// 新增排课 API
// POST /api/schedule-add  body: { schedule: Schedule }
// 用于后台少量新增排课，无需走完整的 JSON 导入流程
import { addSchedule, getCourses, getStudents, json } from '../_lib/store.js'
import { requireAuth } from '../_lib/auth.js'
import { genScheduleId } from '../_lib/id.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

// 校验排课记录必填字段与格式（id 由服务端生成，不校验）
function validateSchedule(s) {
  if (!s) throw new Error('排课数据不能为空')
  if (!s.studentId) throw new Error('缺少 studentId')
  if (!s.courseName) throw new Error('缺少 courseName')
  if (!s.date) throw new Error('缺少 date')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date)) {
    throw new Error('date 格式应为 yyyy-MM-dd')
  }
  if (s.startTime && !/^\d{2}:\d{2}$/.test(s.startTime)) {
    throw new Error('startTime 格式应为 HH:mm')
  }
  if (s.endTime && !/^\d{2}:\d{2}$/.test(s.endTime)) {
    throw new Error('endTime 格式应为 HH:mm')
  }
}

export default async function onRequestPost(context) {
  const authFail = await requireAuth(context)
  if (authFail) return authFail
  const { request } = context
  const body = await readBody(request)
  const { schedule } = body

  if (!schedule) {
    return json(
      { code: 1, message: '请求体需包含 schedule 字段', data: null },
      400,
    )
  }

  try {
    validateSchedule(schedule)
  } catch (e) {
    return json({ code: 1, message: e.message, data: null }, 400)
  }

  // 跨表关联校验：studentId 必须在学员表中存在
  try {
    const students = await getStudents()
    if (!students.some((s) => s.id === schedule.studentId)) {
      return json(
        { code: 1, message: `studentId="${schedule.studentId}" 在学员表中不存在`, data: null },
        400,
      )
    }

    // 未传时间时，自动使用课程默认上下课时间
    let { startTime, endTime } = schedule
    if ((!startTime || !endTime) && schedule.courseId) {
      const courses = await getCourses()
      const course = courses.find((c) => c.id === schedule.courseId)
      if (course) {
        if (!startTime) startTime = course.defaultStartTime || ''
        if (!endTime) endTime = course.defaultEndTime || ''
      }
    }

    // 自动补全 studentName；id 由服务端自动生成
    const finalSchedule = {
      ...schedule,
      id: genScheduleId(),
      studentName: schedule.studentName || students.find((s) => s.id === schedule.studentId)?.name || '',
      startTime: startTime || '',
      endTime: endTime || '',
      note: schedule.note || '',
    }

    const result = await addSchedule(finalSchedule)
    if (result.exists) {
      return json(
        { code: 1, message: `排课 id="${schedule.id}" 已存在，不可重复新增`, data: null },
        409,
      )
    }
    return json({
      code: 0,
      message: '排课已新增',
      data: { ...result, schedule: finalSchedule },
    })
  } catch (e) {
    // 仅记录日志，不向客户端回显内部异常
    console.error('[schedule-add] 新增异常:', e?.message || String(e))
    return json(
      { code: 1, message: '新增失败，请稍后重试', data: null },
      500,
    )
  }
}
