// 课程业务逻辑：列表 / 新增 / 更新 / 删除
import {
  getCourses,
  addCourse,
  updateCourse,
  deleteCourseWithSchedules,
} from './store.js'
import { requireAuth } from './auth.js'
import { genCourseId } from './id.js'
import { readBody, json } from './http.js'
import { validateCourse } from './validate.js'

// GET /api/courses（后台管理用，需鉴权）
export async function handleCoursesGet(context) {
  const authFail = await requireAuth(context)
  if (authFail) return authFail

  try {
    const courses = await getCourses()
    return json({ code: 0, message: 'ok', data: { courses } })
  } catch (e) {
    console.error('[courses] 查询异常:', e?.message || String(e))
    return json({ code: 1, message: '查询失败，请稍后重试', data: null }, 500)
  }
}

// POST /api/course-add  body: { course }
export async function handleCourseAdd(context) {
  const authFail = await requireAuth(context)
  if (authFail) return authFail
  const body = await readBody(context.request)
  const { course } = body

  if (!course) {
    return json({ code: 1, message: '请求体需包含 course 字段', data: null }, 400)
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
    return json({ code: 0, message: '课程已新增', data: { ...result, course: finalCourse } })
  } catch (e) {
    console.error('[course-add] 新增异常:', e?.message || String(e))
    return json({ code: 1, message: '新增失败，请稍后重试', data: null }, 500)
  }
}

// PUT /api/course-update  body: { course }
export async function handleCourseUpdate(context) {
  const authFail = await requireAuth(context)
  if (authFail) return authFail
  const body = await readBody(context.request)
  const { course } = body

  if (!course) {
    return json({ code: 1, message: '请求体需包含 course 字段', data: null }, 400)
  }

  try {
    validateCourse(course, { requireId: true })
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
      return json({ code: 1, message: `课程 id="${finalCourse.id}" 不存在`, data: null }, 404)
    }
    return json({ code: 0, message: '课程已更新', data: { ...result, course: finalCourse } })
  } catch (e) {
    console.error('[course-update] 更新异常:', e?.message || String(e))
    return json({ code: 1, message: '更新失败，请稍后重试', data: null }, 500)
  }
}

// DELETE /api/course-delete  body: { courseId }
// 同时删除该课程的所有关联排课记录
export async function handleCourseDelete(context) {
  const authFail = await requireAuth(context)
  if (authFail) return authFail
  const body = await readBody(context.request)
  const { courseId } = body

  if (!courseId) {
    return json({ code: 1, message: '请求体需包含 courseId 字段', data: null }, 400)
  }

  try {
    const result = await deleteCourseWithSchedules(courseId)
    if (!result.courseRemoved) {
      return json({ code: 1, message: `课程 id="${courseId}" 不存在`, data: null }, 404)
    }
    return json({ code: 0, message: '课程已删除', data: result })
  } catch (e) {
    console.error('[course-delete] 删除异常:', e?.message || String(e))
    return json({ code: 1, message: '删除失败，请稍后重试', data: null }, 500)
  }
}
