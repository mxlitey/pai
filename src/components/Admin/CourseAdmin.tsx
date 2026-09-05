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

// 默认时间：小时 + 分钟两个独立 select
// 分钟以 5 分钟为单位：00, 05, 10, ..., 55
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))
const MINUTE_5MIN_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

// 将任意 HH:mm 对齐到最近的 5 分钟刻度（向下取整）
// 用于编辑模式加载历史数据时规整化（如 "09:03" -> "09:00"）
function alignTo5Min(time: string): string {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return time
  const [h, m] = time.split(':').map(Number)
  const alignedM = Math.floor(m / 5) * 5
  return `${String(h).padStart(2, '0')}:${String(alignedM).padStart(2, '0')}`
}

// 从 "HH:mm" 中拆出小时与分钟（无值时返回空串）
function splitTime(time?: string): { h: string; m: string } {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return { h: '', m: '' }
  const [h, m] = time.split(':')
  return { h, m }
}

function CourseEditModal({ course, onClose, onSubmit }: CourseEditModalProps) {
  const isEdit = !!course
  const [form, setForm] = useState<Course>(
    course
      ? {
          ...course,
          // 编辑模式：将历史时间对齐到 5 分钟刻度，确保 select 能匹配
          defaultStartTime: alignTo5Min(course.defaultStartTime || ''),
          defaultEndTime: alignTo5Min(course.defaultEndTime || ''),
        }
      : {
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

  // 时间字段局部变更：小时与分钟分别选择，合成 "HH:mm" 写回
  // 全空视为未设置；半选时保留中间态（如 "09:"），由 handleSave 的格式校验拦截
  const handleTimeChange = (
    field: 'defaultStartTime' | 'defaultEndTime',
    part: 'h' | 'm',
    value: string,
  ) => {
    setForm((f) => {
      const current = splitTime(String(f[field] || ''))
      const next = { ...current, [part]: value }
      const merged = next.h === '' && next.m === '' ? '' : `${next.h}:${next.m}`
      return { ...f, [field]: merged }
    })
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

          {/* 默认时间：小时 + 分钟分别选择，分钟按 5 分钟刻度 */}
          <div className="flex items-start gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">
              <span className="text-rose-500 mr-0.5">*</span>默认时间
            </span>
            <div className="flex items-center gap-2 flex-1">
              {/* 开始时间：时 : 分 */}
              <select
                value={splitTime(form.defaultStartTime).h}
                onChange={(e) => handleTimeChange('defaultStartTime', 'h', e.target.value)}
                className={cn(inputClass, 'bg-white w-20 text-center')}
              >
                <option value="">时</option>
                {HOUR_OPTIONS.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              <span className="text-slate-400">:</span>
              <select
                value={splitTime(form.defaultStartTime).m}
                onChange={(e) => handleTimeChange('defaultStartTime', 'm', e.target.value)}
                className={cn(inputClass, 'bg-white w-20 text-center')}
              >
                <option value="">分</option>
                {MINUTE_5MIN_OPTIONS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <span className="text-slate-400 px-1">-</span>
              {/* 结束时间：时 : 分 */}
              <select
                value={splitTime(form.defaultEndTime).h}
                onChange={(e) => handleTimeChange('defaultEndTime', 'h', e.target.value)}
                className={cn(inputClass, 'bg-white w-20 text-center')}
              >
                <option value="">时</option>
                {HOUR_OPTIONS.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              <span className="text-slate-400">:</span>
              <select
                value={splitTime(form.defaultEndTime).m}
                onChange={(e) => handleTimeChange('defaultEndTime', 'm', e.target.value)}
                className={cn(inputClass, 'bg-white w-20 text-center')}
              >
                <option value="">分</option>
                {MINUTE_5MIN_OPTIONS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
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
