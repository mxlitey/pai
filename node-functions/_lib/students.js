// 学员业务逻辑：查询 / 新增 / 更新 / 删除
import {
  getStudents,
  addStudent,
  updateStudent,
  deleteStudentWithSchedules,
} from './store.js'
import { requireAuth } from './auth.js'
import { genStudentId } from './id.js'
import { readBody, json } from './http.js'
import { validateStudent } from './validate.js'

// GET /api/students          -> 获取所有学员
// GET /api/students?q=张伟   -> 按姓名搜索（精确+模糊）
// 搜索命中多条时返回 ambiguous 警示，提示调用方按 id 精确选择，防止拿错学员
export async function handleStudentsGet({ request }) {
  const url = new URL(request.url)
  const q = (url.searchParams.get('q') || '').trim()

  let students = await getStudents()

  if (q) {
    // 精确匹配优先（id 或 name），模糊匹配其次
    const exact = students.filter((s) => s.id === q || s.name === q)
    const fuzzy = students.filter(
      (s) => s.id !== q && s.name !== q && (s.name.includes(q) || s.id.includes(q)),
    )
    students = [...exact, ...fuzzy]
  }

  // 歧义检测：多条结果时明确警示，避免调用方静默选错
  const ambiguous = q && students.length > 1
  const message = ambiguous
    ? `搜索"${q}"命中 ${students.length} 名学员，存在歧义。请根据 id 确认目标学员后再操作，不要凭姓名猜选。`
    : 'ok'

  return json({ code: 0, message, data: { students, ambiguous } })
}

// POST /api/student-add  body: { student }
export async function handleStudentAdd(context) {
  const authFail = await requireAuth(context)
  if (authFail) return authFail
  const body = await readBody(context.request)
  const { student } = body

  if (!student) {
    return json({ code: 1, message: '请求体需包含 student 字段', data: null }, 400)
  }

  try {
    validateStudent(student)
  } catch (e) {
    return json({ code: 1, message: e.message, data: null }, 400)
  }

  try {
    // 规整字段，避免脏数据落库；id 由服务端自动生成
    const finalStudent = {
      id: genStudentId(),
      name: student.name.trim(),
    }

    const result = await addStudent(finalStudent)
    if (result.exists) {
      return json(
        { code: 1, message: `学员 id="${finalStudent.id}" 已存在，不可重复新增`, data: null },
        409,
      )
    }
    return json({ code: 0, message: '学员已新增', data: { ...result, student: finalStudent } })
  } catch (e) {
    // 仅记录日志，不向客户端回显内部异常
    console.error('[student-add] 新增异常:', e?.message || String(e))
    return json({ code: 1, message: '新增失败，请稍后重试', data: null }, 500)
  }
}

// PUT /api/student-update  body: { student }
// 排课不冗余存储 studentName，读取时由后端 join 拼回，无需级联更新
export async function handleStudentUpdate(context) {
  const authFail = await requireAuth(context)
  if (authFail) return authFail
  const body = await readBody(context.request)
  const { student } = body

  if (!student) {
    return json({ code: 1, message: '请求体需包含 student 字段', data: null }, 400)
  }

  try {
    validateStudent(student, { requireId: true })
  } catch (e) {
    return json({ code: 1, message: e.message, data: null }, 400)
  }

  try {
    const finalStudent = {
      id: student.id.trim(),
      name: student.name.trim(),
    }

    const result = await updateStudent(finalStudent)
    if (result.notFound) {
      return json({ code: 1, message: `学员 id="${finalStudent.id}" 不存在`, data: null }, 404)
    }
    return json({ code: 0, message: '学员已更新', data: { ...result, student: finalStudent } })
  } catch (e) {
    console.error('[student-update] 更新异常:', e?.message || String(e))
    return json({ code: 1, message: '更新失败，请稍后重试', data: null }, 500)
  }
}

// DELETE /api/student-delete  body: { studentId }
// 删除指定学员及其所有排课数据
export async function handleStudentDelete(context) {
  const authFail = await requireAuth(context)
  if (authFail) return authFail
  const body = await readBody(context.request)
  const { studentId } = body

  if (!studentId) {
    return json({ code: 1, message: '需提供 studentId 字段', data: null }, 400)
  }

  try {
    const result = await deleteStudentWithSchedules(studentId)
    if (!result.studentRemoved) {
      return json({ code: 0, message: '未找到该学员（已清理其残留排课文件）', data: result })
    }
    return json({
      code: 0,
      message: `学员已删除，清理 ${result.deletedScheduleFiles} 个排课文件`,
      data: result,
    })
  } catch (e) {
    // 仅记录日志，不向客户端回显内部异常
    console.error('[student-delete] 删除异常:', e?.message || String(e))
    return json({ code: 1, message: '删除失败，请稍后重试', data: null }, 500)
  }
}
