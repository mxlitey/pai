import { useState, useEffect, useMemo } from 'react'
import type { Course, Student } from '@/types'
import { batchAddSchedules } from '@/api/admin'
import { cn } from '@/utils/cn'
import { getCourseDotClass } from '@/utils/courseColors'

interface ScheduleAddModalProps {
  courses: Course[]
  students: Student[]
  onClose: () => void
  onUpdated: () => void
}

export function ScheduleAddModal({ courses, students, onClose, onUpdated }: ScheduleAddModalProps) {
  const [courseId, setCourseId] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [teacher, setTeacher] = useState('')
  const [location, setLocation] = useState('')
  const [note, setNote] = useState('')
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // 选中的课程对象
  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === courseId) || null,
    [courses, courseId],
  )

  // 选课程时自动填充默认值
  useEffect(() => {
    if (selectedCourse) {
      setTeacher(selectedCourse.teacher || '')
      setLocation(selectedCourse.location || '')
      setStartTime(selectedCourse.defaultStartTime || '')
      setEndTime(selectedCourse.defaultEndTime || '')
    }
    // 切换课程时清空已选学员（避免误操作）
    setSelectedStudentIds(new Set())
    setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId])

  // 搜索过滤学员
  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return students
    return students.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q) ||
      (s.phone || '').toLowerCase().includes(q),
    )
  }, [students, search])

  // 全选/取消全选（仅对当前过滤结果）
  const allFilteredSelected =
    filteredStudents.length > 0 && filteredStudents.every((s) => selectedStudentIds.has(s.id))
  const toggleSelectAll = () => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        // 取消全选当前过滤结果
        filteredStudents.forEach((s) => next.delete(s.id))
      } else {
        // 全选当前过滤结果
        filteredStudents.forEach((s) => next.add(s.id))
      }
      return next
    })
  }

  const toggleStudent = (id: string) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSave = async () => {
    setError('')
    setSuccess('')

    if (!courseId || !selectedCourse) {
      setError('请选择课程')
      return
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('日期格式应为 yyyy-MM-dd')
      return
    }
    if (selectedStudentIds.size === 0) {
      setError('请至少选择一名学员')
      return
    }

    setSaving(true)
    try {
      const result = await batchAddSchedules({
        courseId,
        courseName: selectedCourse.name,
        teacher,
        location,
        color: selectedCourse.color || '',
        date,
        startTime,
        endTime,
        note,
        studentIds: Array.from(selectedStudentIds),
      })
      if (result.code === 0) {
        setSuccess(`已新增 ${result.data.created} 条排课` + (result.data.skipped > 0 ? `，跳过 ${result.data.skipped} 条重复` : ''))
        setTimeout(() => {
          onUpdated()
          onClose()
        }, 1000)
      } else {
        setError(result.message)
      }
    } catch (e) {
      setError('请求失败：' + (e as Error).message)
    } finally {
      setSaving(false)
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
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-xl">
          <h3 className="font-semibold text-base text-slate-800">新增排课</h3>
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
            <span className="text-rose-500">*</span> 为必填项，选择课程后将为每位选中学员生成一条排课
          </div>

          {/* 课程选择 */}
          <div className="flex items-start gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">
              <span className="text-rose-500 mr-0.5">*</span>课程
            </span>
            <div className="flex-1">
              {courses.length === 0 ? (
                <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  暂无课程，请先在「课程管理」中新增课程
                </div>
              ) : (
                <select
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">请选择课程…</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.teacher ? ` · ${c.teacher}` : ''}
                    </option>
                  ))}
                </select>
              )}
              {selectedCourse && (
                <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500">
                  <span className={cn('inline-block w-2.5 h-2.5 rounded-full', getCourseDotClass(selectedCourse.color))} />
                  <span className="font-mono">{selectedCourse.id}</span>
                </div>
              )}
            </div>
          </div>

          {/* 日期 */}
          <div className="flex items-start gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">
              <span className="text-rose-500 mr-0.5">*</span>日期
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* 时间 */}
          <div className="flex items-start gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">时间</span>
            <div className="flex items-center gap-2 flex-1">
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={inputClass}
              />
              <span className="text-slate-400">-</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {/* 教师 */}
          <div className="flex items-start gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">教师</span>
            <input
              type="text"
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
              className={inputClass}
              placeholder="如：张老师"
            />
          </div>

          {/* 地点 */}
          <div className="flex items-start gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">地点</span>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className={inputClass}
              placeholder="如：A教室201"
            />
          </div>

          {/* 学员多选 */}
          <div className="flex items-start gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">
              <span className="text-rose-500 mr-0.5">*</span>学员
            </span>
            <div className="flex-1 border border-slate-200 rounded-md overflow-hidden">
              {/* 搜索栏 + 全选 */}
              <div className="flex items-center gap-2 px-2 py-1.5 border-b border-slate-100 bg-slate-50">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索姓名 / ID / 手机号"
                  className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-400"
                />
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  disabled={filteredStudents.length === 0}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium px-2 py-1 disabled:opacity-40 whitespace-nowrap"
                >
                  {allFilteredSelected ? '取消全选' : '全选'}
                </button>
              </div>
              {/* 已选计数 */}
              <div className="px-2 py-1 text-xs text-slate-500 border-b border-slate-100 bg-white">
                已选 <span className="font-medium text-brand-600">{selectedStudentIds.size}</span> 名学员
                {filteredStudents.length !== students.length && (
                  <span className="text-slate-400"> · 当前筛选 {filteredStudents.length} 名</span>
                )}
              </div>
              {/* 学员列表 */}
              <div className="max-h-48 overflow-y-auto">
                {filteredStudents.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-slate-400">
                    {students.length === 0 ? '暂无学员数据' : '未找到匹配的学员'}
                  </div>
                ) : (
                  filteredStudents.map((s) => {
                    const checked = selectedStudentIds.has(s.id)
                    return (
                      <label
                        key={s.id}
                        className={cn(
                          'flex items-center gap-2 px-3 py-1.5 cursor-pointer border-b border-slate-50 last:border-0 transition-colors',
                          checked ? 'bg-brand-50' : 'hover:bg-slate-50',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleStudent(s.id)}
                          className="w-4 h-4 rounded border-slate-300 text-brand-500 focus:ring-brand-400"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-slate-700 font-medium">{s.name}</span>
                          <span className="text-xs text-slate-400 ml-2 font-mono">{s.id}</span>
                          {s.grade && <span className="text-xs text-slate-400 ml-1">· {s.grade}</span>}
                          {s.phone && <span className="text-xs text-slate-400 ml-1">· {s.phone}</span>}
                        </div>
                      </label>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          {/* 备注 */}
          <div className="flex items-start gap-4">
            <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-2">备注</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputClass}
              placeholder="可选"
            />
          </div>

          {/* 错误/成功提示 */}
          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-md px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-md px-3 py-2 text-sm text-green-700">
              ✓ {success}
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
            {saving ? '保存中…' : `新增排课${selectedStudentIds.size > 0 ? `（${selectedStudentIds.size} 条）` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
