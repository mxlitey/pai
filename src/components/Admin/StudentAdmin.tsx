import { useState } from 'react'
import type { Student } from '@/types'
import { cn } from '@/utils/cn'
import { getCourseCardClass } from '@/utils/courseColors'
import { Modal } from '@/components/Modal'
import { Pagination, usePagination } from './Pagination'

// 学员有排课记录的课程（名称去重，带颜色）
export type StudentCourseBadge = { name: string; color?: string }

interface StudentAdminProps {
  students: Student[]
  studentCourses: Map<string, StudentCourseBadge[]>
  busy: boolean
  onBack: () => void
  onDelete: (student: Student) => void
  onAdd: (student: Student) => Promise<boolean>
  onUpdate: (student: Student) => Promise<boolean>
}

const PAGE_SIZE = 10

export function StudentAdmin({ students, studentCourses, busy, onBack, onDelete, onAdd, onUpdate }: StudentAdminProps) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Student | null>(null)
  const { safePage, totalPages, pageItems, setPage } = usePagination(students, PAGE_SIZE)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 顶部栏 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="text-slate-500 hover:text-slate-700 text-sm flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              返回后台
            </button>
            <span className="text-slate-300">/</span>
            <h1 className="text-base font-semibold text-slate-800">学员管理</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 hidden sm:block">共 {students.length} 名学员</span>
            <button
              onClick={() => setAdding(true)}
              disabled={busy}
              className="btn-primary text-sm py-1.5 px-3 disabled:opacity-50"
            >
              + 新增学员
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {students.length === 0 ? (
          <div className="card p-10 text-center">
            <div className="text-slate-400 text-sm mb-3">暂无学员数据</div>
            <button
              onClick={() => setAdding(true)}
              disabled={busy}
              className="btn-primary text-sm py-1.5 px-3 disabled:opacity-50"
            >
              + 新增第一个学员
            </button>
          </div>
        ) : (
          <section className="card p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-xs">
                    <th className="text-left py-2 px-2 font-medium">姓名</th>
                    <th className="text-left py-2 px-2 font-medium">课程</th>
                    <th className="text-right py-2 px-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-2.5 px-2 font-medium text-slate-700 whitespace-nowrap">{s.name}</td>
                      <td className="py-2.5 px-2">
                        {(studentCourses.get(s.id) || []).length === 0 ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {studentCourses.get(s.id)!.map((c) => (
                              <span
                                key={c.name}
                                className={cn(
                                  'px-1.5 py-0.5 text-xs rounded border whitespace-nowrap',
                                  getCourseCardClass(c.color),
                                )}
                              >
                                {c.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-right whitespace-nowrap">
                        <button
                          onClick={() => setEditing(s)}
                          disabled={busy}
                          className="text-brand-600 hover:text-brand-700 text-xs font-medium mr-3 disabled:opacity-50"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => onDelete(s)}
                          disabled={busy}
                          className="text-rose-600 hover:text-rose-700 text-xs font-medium disabled:opacity-50"
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 分页 */}
            <Pagination
              page={safePage}
              totalPages={totalPages}
              pageSize={PAGE_SIZE}
              onChange={setPage}
            />
          </section>
        )}
      </main>

      {/* 新增学员弹窗 */}
      {adding && (
        <StudentEditModal
          onClose={() => setAdding(false)}
          onSubmit={onAdd}
        />
      )}

      {/* 编辑学员弹窗 */}
      {editing && (
        <StudentEditModal
          student={editing}
          onClose={() => setEditing(null)}
          onSubmit={onUpdate}
        />
      )}
    </div>
  )
}

// ===== 新增/编辑学员弹窗（共用） =====
interface StudentEditModalProps {
  student?: Student // 有值 = 编辑模式；无值 = 新增模式
  onClose: () => void
  onSubmit: (student: Student) => Promise<boolean>
}

function StudentEditModal({ student, onClose, onSubmit }: StudentEditModalProps) {
  const isEdit = !!student
  const [form, setForm] = useState<Student>(
    student || {
      id: '', // 新增时由后端自动生成
      name: '',
    },
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (field: keyof Student, value: string) => {
    setForm((f) => ({ ...f, [field]: value }))
    setError('')
  }

  const handleSave = async () => {
    setError('')
    if (!form.name.trim()) {
      setError('学员姓名不能为空')
      return
    }

    setSaving(true)
    const finalStudent: Student = {
      id: form.id.trim(),
      name: form.name.trim(),
    }

    const ok = await onSubmit(finalStudent)
    setSaving(false)
    if (ok) {
      onClose()
    }
  }

  const inputClass =
    'w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent'

  return (
    <Modal
      title={isEdit ? '编辑学员' : '新增学员'}
      onClose={onClose}
      size="md"
      footerAlign="end"
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={cn('btn-primary', saving && 'opacity-50')}
          >
            {saving ? '保存中…' : isEdit ? '保存' : '新增'}
          </button>
        </>
      }
    >
      {/* 必填说明 */}
      <div className="text-xs text-slate-400">
        <span className="text-rose-500">*</span> 为必填项
      </div>

      {/* 姓名 */}
      <div className="flex items-start gap-4">
        <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">
          <span className="text-rose-500 mr-0.5">*</span>姓名
        </span>
        <input
          type="text"
          value={form.name}
          onChange={(e) => handleChange('name', e.target.value)}
          className={inputClass}
          placeholder="如：张伟"
          autoFocus
        />
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-md px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}
    </Modal>
  )
}
