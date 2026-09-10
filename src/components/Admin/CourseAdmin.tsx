import { useState } from 'react'
import type { Course } from '@/types'
import { cn } from '@/utils/cn'
import { COURSE_COLOR_OPTIONS, getCourseDotClass } from '@/utils/courseColors'
import { Modal } from '@/components/Modal'
import { Pagination, usePagination } from './Pagination'

interface CourseAdminProps {
  courses: Course[]
  busy: boolean
  onBack: () => void
  onDelete: (course: Course) => void
  onAdd: (course: Course) => Promise<boolean>
  onUpdate: (course: Course) => Promise<boolean>
}

const PAGE_SIZE = 15

export function CourseAdmin({ courses, busy, onBack, onDelete, onAdd, onUpdate }: CourseAdminProps) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Course | null>(null)
  const { safePage, totalPages, pageItems, setPage } = usePagination(courses, PAGE_SIZE)

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
            <h1 className="text-base font-semibold text-slate-800">课程管理</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 hidden sm:block">共 {courses.length} 门课程</span>
            <button
              onClick={() => setAdding(true)}
              disabled={busy}
              className="btn-primary text-sm py-1.5 px-3 disabled:opacity-50"
            >
              + 新增课程
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {courses.length === 0 ? (
          <div className="card p-10 text-center">
            <div className="text-slate-400 text-sm mb-3">暂无课程数据</div>
            <p className="text-xs text-slate-400 mb-4">
              新增课程后，可在「排课管理」中按课程为多个学员批量排课
            </p>
            <button
              onClick={() => setAdding(true)}
              disabled={busy}
              className="btn-primary text-sm py-1.5 px-3 disabled:opacity-50"
            >
              + 新增第一个课程
            </button>
          </div>
        ) : (
          <section className="card p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-xs">
                    <th className="text-left py-2 px-2 font-medium">颜色</th>
                    <th className="text-left py-2 px-2 font-medium">课程名称</th>
                    <th className="text-left py-2 px-2 font-medium">默认时间</th>
                    <th className="text-right py-2 px-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-2.5 px-2">
                        <span
                          className={cn(
                            'inline-block w-4 h-4 rounded-full',
                            getCourseDotClass(c.color),
                          )}
                        />
                      </td>
                      <td className="py-2.5 px-2 font-medium text-slate-700 whitespace-nowrap">{c.name}</td>
                      <td className="py-2.5 px-2 text-slate-600 text-xs whitespace-nowrap">
                        {c.defaultStartTime || c.defaultEndTime
                          ? `${c.defaultStartTime || '--'} - ${c.defaultEndTime || '--'}`
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2.5 px-2 text-right whitespace-nowrap">
                        <button
                          onClick={() => setEditing(c)}
                          disabled={busy}
                          className="text-brand-600 hover:text-brand-700 text-xs font-medium mr-3 disabled:opacity-50"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => onDelete(c)}
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

      {/* 新增弹窗 */}
      {adding && (
        <CourseEditModal
          onClose={() => setAdding(false)}
          onSubmit={onAdd}
        />
      )}

      {/* 编辑弹窗 */}
      {editing && (
        <CourseEditModal
          course={editing}
          onClose={() => setEditing(null)}
          onSubmit={onUpdate}
        />
      )}
    </div>
  )
}

// ===== 新增/编辑课程弹窗 =====
interface CourseEditModalProps {
  course?: Course // 有值 = 编辑模式；无值 = 新增模式
  onClose: () => void
  onSubmit: (course: Course) => Promise<boolean>
}

function CourseEditModal({ course, onClose, onSubmit }: CourseEditModalProps) {
  const isEdit = !!course
  const [form, setForm] = useState<Course>(
    course || {
      id: '', // 新增时由后端自动生成
      name: '',
      color: 'blue',
      defaultStartTime: '',
      defaultEndTime: '',
    },
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (field: keyof Course, value: string) => {
    setForm((f) => ({ ...f, [field]: value }))
    setError('')
  }

  const handleSave = async () => {
    setError('')
    if (!form.name.trim()) {
      setError('课程名称不能为空')
      return
    }
    if (!form.defaultStartTime || !/^\d{2}:\d{2}$/.test(form.defaultStartTime)) {
      setError('请选择默认开始时间（小时和分钟均为必填）')
      return
    }
    if (!form.defaultEndTime || !/^\d{2}:\d{2}$/.test(form.defaultEndTime)) {
      setError('请选择默认结束时间（小时和分钟均为必填）')
      return
    }
    if (form.defaultStartTime >= form.defaultEndTime) {
      setError('默认结束时间必须晚于开始时间')
      return
    }

    setSaving(true)
    const finalCourse: Course = {
      id: form.id.trim(),
      name: form.name.trim(),
      color: form.color || '',
      defaultStartTime: form.defaultStartTime || '',
      defaultEndTime: form.defaultEndTime || '',
    }
    const ok = await onSubmit(finalCourse)
    setSaving(false)
    if (ok) {
      onClose()
    }
  }

  const inputClass =
    'w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent'

  return (
    <Modal
      title={isEdit ? '编辑课程' : '新增课程'}
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

          {/* 课程名称 */}
          <div className="flex items-start gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">
              <span className="text-rose-500 mr-0.5">*</span>课程名称
            </span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className={inputClass}
              placeholder="如：数学提高班"
              autoFocus
            />
          </div>

          {/* 颜色标签 */}
          <div className="flex items-start gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">颜色标签</span>
            <div className="flex flex-wrap gap-2 flex-1">
              {COURSE_COLOR_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => handleChange('color', opt.key)}
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs transition-all',
                    form.color === opt.key
                      ? 'border-slate-400 bg-slate-50 ring-1 ring-slate-300'
                      : 'border-slate-200 hover:border-slate-300',
                  )}
                >
                  <span className={cn('inline-block w-3 h-3 rounded-full', opt.dot)} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 默认时间 */}
          <div className="flex items-start gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">
              <span className="text-rose-500 mr-0.5">*</span>默认时间
            </span>
            <div className="flex items-center gap-2 flex-1">
              <input
                type="time"
                value={form.defaultStartTime || ''}
                onChange={(e) => handleChange('defaultStartTime', e.target.value)}
                className={inputClass}
              />
              <span className="text-slate-400">-</span>
              <input
                type="time"
                value={form.defaultEndTime || ''}
                onChange={(e) => handleChange('defaultEndTime', e.target.value)}
                className={inputClass}
              />
            </div>
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
