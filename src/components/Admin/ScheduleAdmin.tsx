import { useCallback, useState } from 'react'
import type { Course, Schedule, Student } from '@/types'
import { deleteSchedule, searchSchedules } from '@/api/admin'
import { SearchBar } from '@/components/SearchBar'
import { ScheduleEditor } from './ScheduleEditor'
import { ScheduleAddModal } from './ScheduleAddModal'

interface ScheduleAdminProps {
  students: Student[]
  courses: Course[]
  onBack: () => void
  onToast: (type: 'success' | 'error' | 'info', message: string) => void
  onRefreshStudents: () => Promise<void>
}

export function ScheduleAdmin({ students, courses, onBack, onToast, onRefreshStudents }: ScheduleAdminProps) {
  // 学员筛选（可选）：选中学员后与日期/课程条件组合搜索
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)

  // 日期/课程筛选条件
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [filterCourseId, setFilterCourseId] = useState('')
  // 标记是否已发起过搜索（用于区分"未搜索"与"搜索后无结果"）
  const [filterSubmitted, setFilterSubmitted] = useState(false)

  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loadingSchedules, setLoadingSchedules] = useState(false)
  const [busy, setBusy] = useState(false)

  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)
  const [addingSchedule, setAddingSchedule] = useState(false)

  // 搜索排课：学员 + 日期范围 + 课程 任一组合
  const runFilterSearch = useCallback(async () => {
    setLoadingSchedules(true)
    try {
      const result = await searchSchedules({
        startDate: filterStartDate || undefined,
        endDate: filterEndDate || undefined,
        courseId: filterCourseId || undefined,
        studentId: selectedStudent?.id || undefined,
      })
      if (result.code === 0) {
        setSchedules(result.data.schedules)
      } else {
        onToast('error', result.message)
        setSchedules([])
      }
    } catch (e) {
      onToast('error', '搜索排课失败：' + (e as Error).message)
      setSchedules([])
    } finally {
      setFilterSubmitted(true)
      setLoadingSchedules(false)
    }
  }, [filterStartDate, filterEndDate, filterCourseId, selectedStudent, onToast])

  // 刷新当前结果列表（删除/编辑后调用）
  const refreshCurrent = useCallback(async () => {
    if (filterSubmitted) await runFilterSearch()
  }, [filterSubmitted, runFilterSearch])

  // 删除单条排课
  const handleDeleteSchedule = async (schedule: Schedule) => {
    if (!confirm(`确认删除「${schedule.courseName}」(${schedule.date})？`)) return
    setBusy(true)
    try {
      const result = await deleteSchedule(schedule.id, schedule.studentId, schedule.date)
      if (result.code === 0) {
        onToast('success', '排课已删除')
        await refreshCurrent()
      } else {
        onToast('error', result.message)
      }
    } catch (e) {
      onToast('error', '请求失败：' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // 新增/编辑后刷新
  const handleEditorUpdated = async () => {
    await refreshCurrent()
  }

  // 清空全部筛选条件
  const clearAllFilters = () => {
    setSelectedStudent(null)
    setFilterStartDate('')
    setFilterEndDate('')
    setFilterCourseId('')
    setSchedules([])
    setFilterSubmitted(false)
  }

  const hasAnyFilter = !!(selectedStudent || filterStartDate || filterEndDate || filterCourseId)

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
            <h1 className="text-base font-semibold text-slate-800">排课管理</h1>
          </div>
          <div className="flex items-center gap-3">
            {schedules.length > 0 && (
              <span className="text-xs text-slate-400 hidden sm:block">
                共 {schedules.length} 条排课
              </span>
            )}
            <button
              onClick={() => setAddingSchedule(true)}
              disabled={busy || students.length === 0 || courses.length === 0}
              className="btn-primary text-sm py-1.5 px-3 disabled:opacity-50"
              title={
                students.length === 0
                  ? '请先添加学员数据'
                  : courses.length === 0
                    ? '请先在课程管理中添加课程'
                    : '按课程为多个学员批量排课'
              }
            >
              + 新增排课
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* 搜索区：学员 + 日期/课程 组合筛选 */}
        <section className="card p-5">
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              {/* 学员筛选 */}
              <div>
                <label className="block text-xs text-slate-500 mb-1">学员（可选）</label>
                <div className="w-56">
                  <SearchBar onSelectStudent={setSelectedStudent} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">开始日期</label>
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">结束日期</label>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">课程</label>
                <select
                  value={filterCourseId}
                  onChange={(e) => setFilterCourseId(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white min-w-[8rem]"
                >
                  <option value="">全部课程</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={runFilterSearch}
                disabled={loadingSchedules}
                className="btn-primary text-sm py-1.5 px-4 disabled:opacity-50"
              >
                {loadingSchedules ? '搜索中…' : '搜索'}
              </button>
              {hasAnyFilter && (
                <button
                  onClick={clearAllFilters}
                  className="btn-ghost text-sm py-1.5 px-3 border border-slate-200"
                >
                  清空条件
                </button>
              )}
            </div>
            {/* 当前学员筛选回显 */}
            {selectedStudent && (
              <div className="text-xs text-slate-400">
                当前筛选学员：<span className="text-brand-600 font-medium">{selectedStudent.name}</span>
                <button
                  onClick={() => setSelectedStudent(null)}
                  className="ml-2 text-slate-400 hover:text-rose-500"
                >
                  清除
                </button>
              </div>
            )}
            <p className="text-xs text-slate-400 leading-relaxed">
              提示：学员、日期范围、课程可单独或组合使用。全部留空将返回全量排课；数据量较大时建议限定条件以加快查询。
            </p>
          </div>
        </section>

        {/* 排课列表 */}
        <section className="card p-5">
          {!filterSubmitted ? (
            <div className="text-center py-10 text-slate-400 text-sm">
              请设置筛选条件并点击「搜索」
            </div>
          ) : loadingSchedules ? (
            <div className="text-center py-10">
              <div className="w-8 h-8 border-2 border-slate-200 border-t-brand-500 rounded-full animate-spin mx-auto" />
            </div>
          ) : schedules.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">
              没有符合条件的排课
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-xs">
                    <th className="text-left py-2 px-2 font-medium">学员</th>
                    <th className="text-left py-2 px-2 font-medium">课程</th>
                    <th className="text-left py-2 px-2 font-medium">日期</th>
                    <th className="text-left py-2 px-2 font-medium">时间</th>
                    <th className="text-right py-2 px-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-2.5 px-2 text-slate-700 font-medium whitespace-nowrap">
                        {s.studentName}
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="font-medium text-slate-700">{s.courseName}</div>
                        <div className="text-xs text-slate-400 font-mono">{s.id}</div>
                      </td>
                      <td className="py-2.5 px-2 text-slate-600">{s.date}</td>
                      <td className="py-2.5 px-2 text-slate-600">
                        {s.startTime}-{s.endTime}
                      </td>
                      <td className="py-2.5 px-2 text-right whitespace-nowrap">
                        <button
                          onClick={() => setEditingSchedule(s)}
                          disabled={busy}
                          className="text-brand-600 hover:text-brand-700 text-xs font-medium mr-3 disabled:opacity-50"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => handleDeleteSchedule(s)}
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
          )}
        </section>
      </main>

      {/* 编辑弹窗 */}
      <ScheduleEditor
        schedule={editingSchedule}
        students={students}
        onClose={() => setEditingSchedule(null)}
        onUpdated={handleEditorUpdated}
      />

      {/* 新增弹窗 */}
      {addingSchedule && (
        <ScheduleAddModal
          courses={courses}
          students={students}
          onClose={() => setAddingSchedule(false)}
          onUpdated={handleEditorUpdated}
          onRefreshStudents={onRefreshStudents}
        />
      )}
    </div>
  )
}
