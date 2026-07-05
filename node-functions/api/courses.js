// 课程列表 API
// GET /api/courses
// 返回全部课程（后台管理用，需鉴权）
import { getCourses, json } from '../_lib/store.js'
import { requireAuth } from '../_lib/auth.js'

export default async function onRequestGet(context) {
  const authFail = await requireAuth(context)
  if (authFail) return authFail

  try {
    const courses = await getCourses()
    return json({
      code: 0,
      message: 'ok',
      data: { courses },
    })
  } catch (e) {
    console.error('[courses] 查询异常:', e?.message || String(e))
    return json(
      { code: 1, message: '查询失败，请稍后重试', data: null },
      500,
    )
  }
}
