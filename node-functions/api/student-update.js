// 更新学员 API
// PUT /api/student-update  body: { student }
// 若姓名变更，级联更新该学员所有排课中的 studentName
import { updateStudent, json } from '../_lib/store.js'
import { requireAuth } from '../_lib/auth.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

// 校验学员记录必填字段与格式（与 student-add 规则一致）
function validateStudent(s) {
  if (!s) throw new Error('学员数据不能为空')
  if (!s.id) throw new Error('缺少 id')
  if (typeof s.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(s.id)) {
    throw new Error('id 仅允许字母、数字、下划线、短横线，长度 1-64')
  }
  if (!s.name) throw new Error('缺少 name')
  if (typeof s.name !== 'string' || s.name.length > 32) {
    throw new Error('name 需为 1-32 字符的字符串')
  }
}

export default async function onRequestPut(context) {
  const authFail = await requireAuth(context)
  if (authFail) return authFail
  const { request } = context
  const body = await readBody(request)
  const { student } = body

  if (!student) {
    return json(
      { code: 1, message: '请求体需包含 student 字段', data: null },
      400,
    )
  }

  try {
    validateStudent(student)
  } catch (e) {
    return json({ code: 1, message: e.message, data: null }, 400)
  }

  try {
    // 规整字段，避免脏数据落库
    const finalStudent = {
      id: student.id.trim(),
      name: student.name.trim(),
    }

    const result = await updateStudent(finalStudent)
    if (result.notFound) {
      return json(
        { code: 1, message: `学员 id="${finalStudent.id}" 不存在`, data: null },
        404,
      )
    }
    return json({
      code: 0,
      message: result.nameChanged
        ? `学员已更新，并同步更新 ${result.updatedScheduleFiles} 个排课文件中的姓名`
        : '学员已更新',
      data: { ...result, student: finalStudent },
    })
  } catch (e) {
    console.error('[student-update] 更新异常:', e?.message || String(e))
    return json(
      { code: 1, message: '更新失败，请稍后重试', data: null },
      500,
    )
  }
}
