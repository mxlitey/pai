// 学员查询 API
// GET /api/students          -> 获取所有学员
// GET /api/students?q=张伟   -> 按姓名搜索（精确+模糊）
// 搜索命中多条时返回 ambiguous 警示，提示调用方按 id 精确选择，防止拿错学员
import { getStudents, json } from './store.js'

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

  // 歧义检测：多条结果时明确警示，避免调用方静默选错（张冠李戴的主要来源之一）
  const ambiguous = q && students.length > 1
  const message = ambiguous
    ? `搜索"${q}"命中 ${students.length} 名学员，存在歧义。请根据 id 确认目标学员后再操作，不要凭姓名猜选。`
    : 'ok'

  return json({ code: 0, message, data: { students, ambiguous } })
}
