// 更新课程 API
// PUT /api/course-update  body: { course }
import { updateCourse, json } from './store.js'
import { requireAuth } from './auth.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

function validateCourse(c) {
  if (!c) throw new Error('课程数据不能为空')
  if (!c.id) throw new Error('缺少 id')
  if (!c.name) throw new Error('缺少 name')
  if (typeof c.name !== 'string' || c.name.length > 64) {
    throw new Error('name 需为 1-64 字符的字符串')
  }
  if (!c.defaultStartTime) throw new Error('缺少 defaultStartTime（默认开始时间为必填项）')
  if (!c.defaultEndTime) throw new Error('缺少 defaultEndTime（默认结束时间为必填项）')
  if (!/^\d{2}:\d{2}$/.test(c.defaultStartTime)) {
    throw new Error('defaultStartTime 格式应为 HH:mm')
  }
  if (!/^\d{2}:\d{2}$/.test(c.defaultEndTime)) {
    throw new Error('defaultEndTime 格式应为 HH:mm')
  }
}

export async function handleCourseUpdate(context) {
  const authFail = await requireAuth(context)
  if (authFail) return authFail
  const { request } = context
  const body = await readBody(request)
  const { course } = body

  if (!course) {
    return json(
      { code: 1, message: '请求体需包含 course 字段', data: null },
      400,
    )
  }

  try {
    validateCourse(course)
  } catch (e) {
    return json({ code: 1, message: e.message, data: null }, 400)
  }

  try {
    const finalCourse = {
      id: course.id.trim(),
      name: course.name.trim(),
      color: course.color || '',
      defaultStartTime: course.defaultStartTime || '',
      defaultEndTime: course.defaultEndTime || '',
    }

    const result = await updateCourse(finalCourse)
    if (result.notFound) {
      return json(
        { code: 1, message: `课程 id="${finalCourse.id}" 不存在`, data: null },
        404,
      )
    }
    return json({
      code: 0,
      message: '课程已更新',
      data: { ...result, course: finalCourse },
    })
  } catch (e) {
    console.error('[course-update] 更新异常:', e?.message || String(e))
    return json(
      { code: 1, message: '更新失败，请稍后重试', data: null },
      500,
    )
  }
}
