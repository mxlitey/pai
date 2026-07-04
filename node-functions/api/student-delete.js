// 删除学员 API
// DELETE /api/student-delete  body: { studentId }
// 删除指定学员及其所有排课数据
import { deleteStudentWithSchedules, json } from '../_lib/store.js'
import { requireAuth } from '../_lib/auth.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

export default async function onRequestDelete(context) {
  const authFail = await requireAuth(context)
  if (authFail) return authFail
  const { request } = context
  const body = await readBody(request)
  const { studentId } = body

  if (!studentId) {
    return json(
      { code: 1, message: '需提供 studentId 字段', data: null },
      400,
    )
  }

  try {
    const result = await deleteStudentWithSchedules(studentId)
    if (!result.studentRemoved) {
      return json({
        code: 0,
        message: '未找到该学员（已清理其残留排课文件）',
        data: result,
      })
    }
    return json({
      code: 0,
      message: `学员已删除，清理 ${result.deletedScheduleFiles} 个排课文件`,
      data: result,
    })
  } catch (e) {
    // 仅记录日志，不向客户端回显内部异常
    console.error('[student-delete] 删除异常:', e?.message || String(e))
    return json(
      { code: 1, message: '删除失败，请稍后重试', data: null },
      500,
    )
  }
}
