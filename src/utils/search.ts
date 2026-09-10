import type { Student } from '@/types'

// 按姓名 / ID 模糊过滤学员（大小写不敏感，空查询返回原列表）
export function filterStudents(students: Student[], query: string): Student[] {
  const q = query.trim().toLowerCase()
  if (!q) return students
  return students.filter(
    (s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q),
  )
}
