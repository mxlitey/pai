import { useMemo, useState } from 'react'
import type { Course } from '@/types'
import { cn } from '@/utils/cn'
import { COURSE_COLOR_OPTIONS, getCourseDotClass } from '@/utils/courseColors'

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
  const [page, setPage] = useState(1)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Course | null>(null)

  const totalPages = Math.max(1, Math.ceil(courses.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return courses.slice(start, start + PAGE_SIZE)
  }, [courses, safePage])

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
                    <th className="text-left py-2 px-2 font-medium">教师</th>
                    <th className="text-left py-2 px-2 font-medium">地点</th>
                    <th className="text-left py-2 px-2 font-medium">默认时间</th>
                    <th className="text-left py-2 px-2 font-medium">ID</th>
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
                      <td className="py-2.5 px-2 font-medium text-slate-700">{c.name}</td>
                      <td className="py-2.5 px-2 text-slate-600">
                        {c.teacher || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2.5 px-2 text-slate-600">
                        {c.location || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2.5 px-2 text-slate-600 text-xs">
                        {c.defaultStartTime || c.defaultEndTime
                          ? `${c.defaultStartTime || '--'} - ${c.defaultEndTime || '--'}`
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2.5 px-2 text-slate-500 font-mono text-xs">{c.id}</td>
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
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                <span className="text-xs text-slate-400">
                  第 {safePage} / {totalPages} 页 · 每页 {PAGE_SIZE} 条
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="btn-ghost border border-slate-200 text-xs py-1 px-2.5 disabled:opacity-40"
                  >
                    上一页
                  </button>
                  {renderPageButtons(safePage, totalPages, setPage)}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    className="btn-ghost border border-slate-200 text-xs py-1 px-2.5 disabled:opacity-40"
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
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

// 渲染页码按钮
function renderPageButtons(
  current: number,
  total: number,
  setPage: (p: number) => void,
) {
  const buttons: (number | '...')[] = []
  const around = 2
  for (let i = 1; i <= total; i++) {
    if (
      i === 1 ||
      i === total ||
      (i >= current - around && i <= current + around)
    ) {
      buttons.push(i)
    } else if (buttons[buttons.length - 1] !== '...') {
      buttons.push('...')
    }
  }
  return buttons.map((b, idx) => {
    if (b === '...') {
      return (
        <span key={`e${idx}`} className="text-slate-400 text-xs px-1.5 select-none">
          …
        </span>
      )
    }
    return (
      <button
        key={b}
        onClick={() => setPage(b)}
        className={
          b === current
            ? 'btn-primary text-xs py-1 px-2.5'
            : 'btn-ghost border border-slate-200 text-xs py-1 px-2.5'
        }
      >
        {b}
      </button>
    )
  })
}

// ===== 新增/编辑课程弹窗 =====
interface CourseEditModalProps {
  course?: Course // 有值 = 编辑模式；无值 = 新增模式
  onClose: () => void
  onSubmit: (course: Course) => Promise<boolean>
}

// 生成简易唯一 id
function genCourseId(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 6)
  return `c_${ts}${rand}`
}

function CourseEditModal({ course, onClose, onSubmit }: CourseEditModalProps) {
  const isEdit = !!course
  const [form, setForm] = useState<Course>(
    course || {
      id: genCourseId(),
      name: '',
      teacher: '',
      location: '',
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
    if (!form.id.trim()) {
      setError('课程 ID 不能为空')
      return
    }
    if (form.defaultStartTime && !/^\d{2}:\d{2}$/.test(form.defaultStartTime)) {
      setError('默认开始时间格式应为 HH:mm')
      return
    }
    if (form.defaultEndTime && !/^\d{2}:\d{2}$/.test(form.defaultEndTime)) {
      setError('默认结束时间格式应为 HH:mm')
      return
    }

    setSaving(true)
    const finalCourse: Course = {
      id: form.id.trim(),
      name: form.name.trim(),
      teacher: form.teacher.trim(),
      location: form.location.trim(),
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-xl">
          <h3 className="font-semibold text-base text-slate-800">
            {isEdit ? '编辑课程' : '新增课程'}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1"
            aria-label="关闭"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 内容 */}
        <div className="px-5 py-4 space-y-4">
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

          {/* ID */}
          <div className="flex items-start gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">ID</span>
            <div className="flex-1 space-y-1">
              <input
                type="text"
                value={form.id}
                onChange={(e) => handleChange('id', e.target.value)}
                className={cn(inputClass, 'font-mono')}
                disabled={isEdit}
                placeholder="留空将自动生成"
              />
              <div className="text-xs text-slate-400">
                {isEdit ? 'ID 不可修改' : '默认自动生成，可自定义；不可与已有 ID 重复'}
              </div>
            </div>
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

          {/* 教师 */}
          <div className="flex items-start gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">教师</span>
            <input
              type="text"
              value={form.teacher}
              onChange={(e) => handleChange('teacher', e.target.value)}
              className={inputClass}
              placeholder="如：张老师"
            />
          </div>

          {/* 地点 */}
          <div className="flex items-start gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">地点</span>
            <input
              type="text"
              value={form.location}
              onChange={(e) => handleChange('location', e.target.value)}
              className={inputClass}
              placeholder="如：A教室201"
            />
          </div>

          {/* 默认时间 */}
          <div className="flex items-start gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">默认时间</span>
            <div className="flex items-center gap-2 flex-1">
              <input
                type="time"
                value={form.defaultStartTime}
                onChange={(e) => handleChange('defaultStartTime', e.target.value)}
                className={inputClass}
              />
              <span className="text-slate-400">-</span>
              <input
                type="time"
                value={form.defaultEndTime}
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
        </div>

        {/* 底部操作 */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2 sticky bottom-0">
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
        </div>
      </div>
    </div>
  )
}
