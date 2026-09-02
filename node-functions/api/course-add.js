// 新增课程 API
// POST /api/course-add  body: { course }
import { addCourse, json } from '../_lib/store.js'
import { requireAuth } from '../_lib/auth.js'
import { genCourseId } from '../_lib/id.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

// 校验课程记录（id 由服务端生成，不校验）
function validateCourse(c) {
  if (!c) throw new Error('课程数据不能为空')
  if (!c.name) throw new Error('缺少 name')
  if (typeof c.name !== 'string' || c.name.length > 64) {
    throw new Error('name 需为 1-64 字符的字符串')
  }
  if (c.color && typeof c.color !== 'string') throw new Error('color 需为字符串')
  if (c.defaultStartTime && !/^\d{2}:\d{2}$/.test(c.defaultStartTime)) {
    throw new Error('defaultStartTime 格式应为 HH:mm')
  }
  if (c.defaultEndTime && !/^\d{2}:\d{2}$/.test(c.defaultEndTime)) {
    throw new Error('defaultEndTime 格式应为 HH:mm')
  }
}

export default async function onRequestPost(context) {
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
    // id 由服务端自动生成
    const finalCourse = {
      id: genCourseId(),
      name: course.name.trim(),
      color: course.color || '',
      defaultStartTime: course.defaultStartTime || '',
      defaultEndTime: course.defaultEndTime || '',
    }

    const result = await addCourse(finalCourse)
    if (result.exists) {
      return json(
        { code: 1, message: `课程 id="${finalCourse.id}" 已存在，不可重复新增`, data: null },
        409,
      )
    }
    return json({
      code: 0,
      message: '课程已新增',
      data: { ...result, course: finalCourse },
    })
  } catch (e) {
    console.error('[course-add] 新增异常:', e?.message || String(e))
    return json(
      { code: 1, message: '新增失败，请稍后重试', data: null },
      500,
    )
  }
}
