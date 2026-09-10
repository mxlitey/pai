// 排课业务逻辑：查询 / 跨学员搜索 / 新增 / 批量新增 / 修改 / 点名 / 删除
import {
  getStudents,
  getCourses,
  getAllSchedulesByStudent,
  getSchedulesByDateRange,
  searchSchedules,
  addSchedule,
  batchAddSchedules,
  updateSchedule,
  setScheduleAttendance,
  deleteSchedule,
} from './store.js'
import { requireAuth } from './auth.js'
import { genScheduleId } from './id.js'
import { readBody, json } from './http.js'
import {
  DATE_RE,
  ID_RE,
  TIME_RE,
  validateScheduleForAdd,
  validateScheduleForUpdate,
  validateAttendanceUpdate,
} from './validate.js'

const MAX_ATTENDANCE_UPDATES = 100

// GET /api/schedules?studentId=s001&startDate=2026-07-01&endDate=2026-07-31
// GET /api/schedules?studentName=张伟&startDate=2026-07-01&endDate=2026-07-31
// 未传日期范围时返回该学员所有排课
export async function handleSchedulesGet({ request }) {
  const url = new URL(request.url)
  const studentId = url.searchParams.get('studentId')
  const studentName = url.searchParams.get('studentName')
  const startDate = url.searchParams.get('startDate')
  const endDate = url.searchParams.get('endDate')

  // 确定学员ID
  let targetId = studentId
  if (!targetId && studentName) {
    const students = await getStudents()
    const matched = students.find((s) => s.name === studentName)
    if (!matched) {
      return json({ code: 0, message: 'ok', data: { schedules: [] } })
    }
    targetId = matched.id
  }

  if (!targetId) {
    return json({
      code: 1,
      message: '缺少 studentId 或 studentName 参数',
      data: { schedules: [] },
    })
  }

  let schedules
  if (startDate && endDate) {
    schedules = await getSchedulesByDateRange(targetId, startDate, endDate)
  } else {
    schedules = await getAllSchedulesByStudent(targetId)
  }

  // 按日期+时间排序
  schedules.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.startTime.localeCompare(b.startTime)
  })

  return json({ code: 0, message: 'ok', data: { schedules } })
}

// GET /api/schedules-search?startDate=&endDate=&courseId=&studentId=
// 支持日期范围 + 可选课程 ID + 可选学员 ID 组合过滤；全部缺省时返回全量排课
// 该接口为后台管理端使用，需登录鉴权
export async function handleSchedulesSearchGet(context) {
  const authFail = await requireAuth(context)
  if (authFail) return authFail
  const url = new URL(context.request.url)
  const startDate = url.searchParams.get('startDate') || ''
  const endDate = url.searchParams.get('endDate') || ''
  const courseId = url.searchParams.get('courseId') || ''
  const studentId = url.searchParams.get('studentId') || ''

  // 日期格式校验：传了就必须合法，避免脏输入触发异常分支
  if (startDate && !DATE_RE.test(startDate)) {
    return json({ code: 1, message: 'startDate 格式应为 yyyy-MM-dd', data: null }, 400)
  }
  if (endDate && !DATE_RE.test(endDate)) {
    return json({ code: 1, message: 'endDate 格式应为 yyyy-MM-dd', data: null }, 400)
  }
  if (startDate && endDate && startDate > endDate) {
    return json({ code: 1, message: 'startDate 不能晚于 endDate', data: null }, 400)
  }

  try {
    const schedules = await searchSchedules({ startDate, endDate, courseId, studentId })
    return json({ code: 0, message: 'ok', data: { schedules, total: schedules.length } })
  } catch (e) {
    console.error('[schedules-search] 查询异常:', e?.message || String(e))
    return json({ code: 1, message: '查询失败，请稍后重试', data: null }, 500)
  }
}

// POST /api/schedule-add  body: { schedule }
// courseName 由后端根据 courseId 自动补全（不采信传入值）；startTime/endTime 必填
export async function handleScheduleAdd(context) {
  const authFail = await requireAuth(context)
  if (authFail) return authFail
  const body = await readBody(context.request)
  const { schedule } = body

  if (!schedule) {
    return json({ code: 1, message: '请求体需包含 schedule 字段', data: null }, 400)
  }

  try {
    validateScheduleForAdd(schedule)
  } catch (e) {
    return json({ code: 1, message: e.message, data: null }, 400)
  }

  try {
    // 跨表关联校验：studentId 必须在学员表中存在
    const students = await getStudents()
    if (!students.some((s) => s.id === schedule.studentId)) {
      return json(
        { code: 1, message: `studentId="${schedule.studentId}" 在学员表中不存在`, data: null },
        400,
      )
    }

    // courseId 必须在课程表中存在
    const courses = await getCourses()
    if (!courses.some((c) => c.id === schedule.courseId)) {
      return json(
        { code: 1, message: `courseId="${schedule.courseId}" 在课程表中不存在`, data: null },
        400,
      )
    }

    // 落库字段白名单：显示字段（studentName/courseName/color）由读取时 join 拼回，不落库；
    // 新增排课一律从「未点名」开始，id 由服务端自动生成
    const finalSchedule = {
      id: genScheduleId(),
      studentId: schedule.studentId,
      courseId: schedule.courseId,
      date: schedule.date,
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
    return json({ code: 0, message: '排课已新增', data: { ...result, schedule: finalSchedule } })
  } catch (e) {
    // 仅记录日志，不向客户端回显内部异常
    console.error('[schedule-add] 新增异常:', e?.message || String(e))
    return json({ code: 1, message: '新增失败，请稍后重试', data: null }, 500)
  }
}

// POST /api/schedule-add-batch  body: { courseId, dates, startTime, endTime, note, studentIds }
// 为每个 (date, studentId) 组合生成一条排课记录
export async function handleScheduleAddBatch(context) {
  const authFail = await requireAuth(context)
  if (authFail) return authFail
  const body = await readBody(context.request)
  const { courseId, dates, startTime, endTime, note, studentIds } = body

  // 字段校验
  if (!courseId) {
    return json({ code: 1, message: '缺少 courseId', data: null }, 400)
  }
  if (!Array.isArray(dates) || dates.length === 0) {
    return json({ code: 1, message: '请至少选择一个日期', data: null }, 400)
  }
  for (const d of dates) {
    if (typeof d !== 'string' || !DATE_RE.test(d)) {
      return json({ code: 1, message: `日期格式应为 yyyy-MM-dd，当前为 "${d}"`, data: null }, 400)
    }
  }
  if (!startTime) {
    return json({ code: 1, message: '缺少 startTime（开始时间为必填项）', data: null }, 400)
  }
  if (!endTime) {
    return json({ code: 1, message: '缺少 endTime（结束时间为必填项）', data: null }, 400)
  }
  if (!TIME_RE.test(startTime)) {
    return json({ code: 1, message: 'startTime 格式应为 HH:mm', data: null }, 400)
  }
  if (!TIME_RE.test(endTime)) {
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
      return json({ code: 1, message: `courseId="${courseId}" 在课程表中不存在`, data: null }, 400)
    }
    const finalCourseName = course.name

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
    // id 由 genScheduleId() 生成，进程内计数器保证同批次不重复；
    // studentName/courseName/color 不落库，读取时由后端 join 拼回
    const schedules = []
    for (const date of dates) {
      for (const sid of studentIds) {
        schedules.push({
          id: genScheduleId(),
          studentId: sid,
          courseId,
          date,
          startTime,
          endTime,
          note: note || '',
        })
      }
    }

    const result = await batchAddSchedules(schedules)
    // 回显学员/课程明细，便于调用方核对"课排到了谁名下"，及早发现张冠李戴
    const studentSummary = studentIds.map((sid) => ({
      studentId: sid,
      studentName: studentMap.get(sid)?.name || '',
    }))
    return json({
      code: 0,
      message:
        `已新增 ${result.created} 条排课（课程「${finalCourseName}」${startTime}-${endTime}，学员：${studentSummary.map((s) => s.studentName).join('、')}）` +
        (result.skipped > 0 ? `，跳过 ${result.skipped} 条重复` : '') +
        '。请核对学员名单是否与预期一致。',
      data: {
        ...result,
        totalAttempts: schedules.length,
        course: { courseId, courseName: finalCourseName, startTime, endTime },
        students: studentSummary,
        dates,
      },
    })
  } catch (e) {
    console.error('[schedule-add-batch] 批量新增异常:', e?.message || String(e))
    return json({ code: 1, message: '批量新增失败，请稍后重试', data: null }, 500)
  }
}

// PUT /api/schedule-update  body: { old: Schedule, new: Schedule }
// 处理跨月/跨学员的存储路径迁移
export async function handleScheduleUpdate(context) {
  const authFail = await requireAuth(context)
  if (authFail) return authFail
  const body = await readBody(context.request)
  const { old: oldSchedule, new: newSchedule } = body

  if (!oldSchedule || !newSchedule) {
    return json({ code: 1, message: '请求体需包含 old 和 new 两个字段', data: null }, 400)
  }

  try {
    validateScheduleForUpdate(oldSchedule, 'old')
    validateScheduleForUpdate(newSchedule, 'new')
  } catch (e) {
    return json({ code: 1, message: e.message, data: null }, 400)
  }

  if (oldSchedule.id !== newSchedule.id) {
    return json({ code: 1, message: '排课 id 不可修改', data: null }, 400)
  }

  try {
    // 落库字段白名单：显示字段由读取时 join 拼回，不落库；attendance 保留前端回传值
    const stored = {
      id: newSchedule.id,
      studentId: newSchedule.studentId,
      courseId: newSchedule.courseId,
      date: newSchedule.date,
      startTime: newSchedule.startTime,
      endTime: newSchedule.endTime,
      note: newSchedule.note || '',
      attendance: newSchedule.attendance,
    }

    const result = await updateSchedule(oldSchedule, stored)
    const message = result.moved
      ? `排课已迁移：${result.fromKey} → ${result.toKey}`
      : `排课已更新：${result.toKey}`
    return json({ code: 0, message, data: { ...result, schedule: newSchedule } })
  } catch (e) {
    return json({ code: 1, message: e.message, data: null }, 500)
  }
}

// PUT /api/schedule-attendance  body: { updates: [{ id, studentId, date, attendance }] }
// attendance: 'attended'=到课 / 'absent'=缺勤 / 'none'=清除标记（回到未点名）
// 批量接口：单个点名传长度 1 的数组；「全部到课」传整个时段的数组
// 记录不存在不报错，计入返回的 notFound（部分成功语义）
export async function handleScheduleAttendance(context) {
  const authFail = await requireAuth(context)
  if (authFail) return authFail
  const body = await readBody(context.request)
  const { updates } = body

  if (!Array.isArray(updates) || updates.length === 0) {
    return json({ code: 1, message: '请求体需包含 updates 非空数组', data: null }, 400)
  }
  if (updates.length > MAX_ATTENDANCE_UPDATES) {
    return json(
      { code: 1, message: `单次最多 ${MAX_ATTENDANCE_UPDATES} 条更新`, data: null },
      400,
    )
  }

  try {
    updates.forEach(validateAttendanceUpdate)
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

// DELETE /api/schedule-delete  body: { id, studentId, date }
export async function handleScheduleDelete(context) {
  const authFail = await requireAuth(context)
  if (authFail) return authFail
  const body = await readBody(context.request)
  const { id, studentId, date } = body

  if (!id || !studentId || !date) {
    return json({ code: 1, message: '需提供 id、studentId、date 三个字段', data: null }, 400)
  }

  // 格式校验，防止路径遍历与脏数据
  if (typeof studentId !== 'string' || !ID_RE.test(studentId)) {
    return json({ code: 1, message: 'studentId 格式不正确', data: null }, 400)
  }
  if (typeof date !== 'string' || !DATE_RE.test(date)) {
    return json({ code: 1, message: 'date 格式应为 yyyy-MM-dd', data: null }, 400)
  }

  try {
    const result = await deleteSchedule(id, studentId, date)
    return json({
      code: 0,
      message: result.count > 0 ? '排课已删除' : '未找到对应排课',
      data: result,
    })
  } catch (e) {
    console.error('[schedule-delete] 删除异常:', e?.message || String(e))
    return json({ code: 1, message: '删除失败，请稍后重试', data: null }, 500)
  }
}
