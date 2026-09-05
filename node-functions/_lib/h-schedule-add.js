// 新增排课 API
// POST /api/schedule-add  body: { schedule: Schedule }
// 用于后台少量新增排课，无需走完整的 JSON 导入流程
// courseName 由后端根据 courseId 自动补全（不采信传入值）；startTime/endTime 必填
import { addSchedule, getCourses, getStudents, json } from './store.js'
import { requireAuth } from './auth.js'
import { genScheduleId } from './id.js'

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
  if (!s.courseId) throw new Error('缺少 courseId（courseName 由后端自动补全）')
  if (!s.date) throw new Error('缺少 date')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date)) {
    throw new Error('date 格式应为 yyyy-MM-dd')
  }
  if (!s.startTime) throw new Error('缺少 startTime（开始时间为必填项）')
  if (!s.endTime) throw new Error('缺少 endTime（结束时间为必填项）')
  if (!/^\d{2}:\d{2}$/.test(s.startTime)) {
    throw new Error('startTime 格式应为 HH:mm')
  }
  if (!/^\d{2}:\d{2}$/.test(s.endTime)) {
    throw new Error('endTime 格式应为 HH:mm')
  }
}

export async function handleScheduleAdd(context) {
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

    // courseId 必须在课程表中存在；courseName 由后端根据 courseId 自动补全（不采信传入值）
    const courses = await getCourses()
    const course = courses.find((c) => c.id === schedule.courseId)
    if (!course) {
      return json(
        { code: 1, message: `courseId="${schedule.courseId}" 在课程表中不存在`, data: null },
        400,
      )
    }

    // 新增排课一律从「未点名」开始：剥离客户端可能传入的 attendance
    delete schedule.attendance

    // id 由服务端自动生成；studentName/courseName/color 不再冗余存储，读取时由后端 join 拼回
    const finalSchedule = {
      ...schedule,
      id: genScheduleId(),
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      note: schedule.note || '',
    }

    const result = await addSchedule(finalSchedule)
    if (result.duplicate) {
      return json(
        {
          code: 1,
          message: `该学员 ${finalSchedule.date} ${finalSchedule.startTime}-${finalSchedule.endTime} 已有此课程的排课，未重复新增`,
          data: { duplicate: true, existing: result.existing },
        },
        409,
      )
    }
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
