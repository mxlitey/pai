import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AttendanceStatus, Schedule } from '@/types'
import { searchSchedules, setAttendanceBatch } from '@/api/admin'
import { formatDate } from '@/utils/date'
import { getCourseDotClass } from '@/utils/courseColors'
import { cn } from '@/utils/cn'

interface AttendanceAdminProps {
  onBack: () => void
  onToast: (type: 'success' | 'error' | 'info', message: string) => void
}

// 时段分组：同一课程、同一上课时间的一批排课
interface SessionGroup {
  key: string
  startTime: string
  endTime: string
  schedules: Schedule[]
}

// 课程分组：当日同一课程的全部时段
interface CourseGroup {
  key: string
  courseName: string
  color?: string
  sessions: SessionGroup[]
  totalStudents: number
}

export function AttendanceAdmin({ onBack, onToast }: AttendanceAdminProps) {
  // 点名日期：默认当天
  const [selectedDate, setSelectedDate] = useState(() => formatDate(new Date()))
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  // 行级防重复点击：正在提交点名请求的排课 id 集合
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())

  // onToast 引用可能随父组件渲染变化，用 ref 保证加载函数稳定，避免日期未变时重复请求
  const onToastRef = useRef(onToast)
  useEffect(() => {
    onToastRef.current = onToast
  })

  // 请求序号：日期快速切换时丢弃过期响应
  const loadSeqRef = useRef(0)

  const loadSchedules = useCallback(async (date: string) => {
    const seq = ++loadSeqRef.current
    setLoading(true)
    try {
      const result = await searchSchedules({ startDate: date, endDate: date })
      if (seq !== loadSeqRef.current) return
      if (result.code === 0) {
        setSchedules(result.data.schedules)
      } else {
        onToastRef.current('error', result.message)
        setSchedules([])
      }
    } catch (e) {
      if (seq !== loadSeqRef.current) return
      onToastRef.current('error', '加载排课失败：' + (e as Error).message)
      setSchedules([])
    } finally {
      if (seq === loadSeqRef.current) setLoading(false)
    }
  }, [])

  // 日期变化（含首次进入）时加载当日排课
  useEffect(() => {
    loadSchedules(selectedDate)
  }, [loadSchedules, selectedDate])

  // 点名单个学员：成功后本地更新该记录，失败 toast 不更新
  const handleMark = async (schedule: Schedule, attendance: AttendanceStatus | 'none') => {
    if ((schedule.attendance ?? 'none') === attendance) return
    if (busyIds.has(schedule.id)) return
    setBusyIds((prev) => new Set(prev).add(schedule.id))
    try {
      const result = await setAttendanceBatch([
        { id: schedule.id, studentId: schedule.studentId, date: schedule.date, attendance },
      ])
      if (result.code !== 0) {
        onToast('error', result.message)
        return
      }
      if (result.data.notFound.length > 0) {
        onToast('error', '排课不存在（可能已被删除）')
        loadSchedules(selectedDate)
        return
      }
      setSchedules((prev) =>
        prev.map((s) =>
          s.id === schedule.id
            ? { ...s, attendance: attendance === 'none' ? undefined : attendance }
            : s,
        ),
      )
    } catch (e) {
      onToast('error', '请求失败：' + (e as Error).message)
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev)
        next.delete(schedule.id)
        return next
      })
    }
  }

  // 「全部到课」：时段内全员置为到课（含覆盖已标缺勤）
  const handleMarkAll = async (session: SessionGroup) => {
    const targets = session.schedules.filter((s) => s.attendance !== 'attended')
    if (targets.length === 0 || targets.some((s) => busyIds.has(s.id))) return
    setBusyIds((prev) => {
      const next = new Set(prev)
      for (const s of targets) next.add(s.id)
      return next
    })
    try {
      const result = await setAttendanceBatch(
        targets.map((s) => ({
          id: s.id,
          studentId: s.studentId,
          date: s.date,
          attendance: 'attended' as const,
        })),
      )
      if (result.code !== 0) {
        onToast('error', result.message)
        return
      }
      if (result.data.notFound.length > 0) {
        onToast(
          'error',
          result.data.updatedCount > 0
            ? '部分排课不存在（可能已被删除），已刷新列表'
            : '排课不存在（可能已被删除）',
        )
        loadSchedules(selectedDate)
        return
      }
      const targetIds = new Set(targets.map((s) => s.id))
      setSchedules((prev) =>
        prev.map((s) => (targetIds.has(s.id) ? { ...s, attendance: 'attended' } : s)),
      )
    } catch (e) {
      onToast('error', '请求失败：' + (e as Error).message)
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev)
        for (const s of targets) next.delete(s.id)
        return next
      })
    }
  }

  // 分组：按课程 → 按时段 → 时段内学员按中文排序
  const courseGroups = useMemo<CourseGroup[]>(() => {
    // 课程分组：courseId 优先，历史无 courseId 的按课程名分组
    const byCourse = new Map<string, { name: string; color?: string; list: Schedule[] }>()
    for (const s of schedules) {
      const key = s.courseId || `name:${s.courseName}`
      let entry = byCourse.get(key)
      if (!entry) {
        entry = { name: s.courseName, color: s.color || undefined, list: [] }
        byCourse.set(key, entry)
      }
      entry.list.push(s)
    }

    const groups: CourseGroup[] = []
    for (const [key, entry] of byCourse) {
      // 时段分组：startTime|endTime 相同的为同一时段
      const bySession = new Map<string, Schedule[]>()
      for (const s of entry.list) {
        const sessionKey = `${s.startTime}|${s.endTime}`
        let arr = bySession.get(sessionKey)
        if (!arr) {
          arr = []
          bySession.set(sessionKey, arr)
        }
        arr.push(s)
      }
      const sessions: SessionGroup[] = [...bySession.entries()].map(([sessionKey, list]) => ({
        key: sessionKey,
        startTime: list[0].startTime,
        endTime: list[0].endTime,
        // 时段内学员按姓名中文排序
        schedules: [...list].sort((a, b) => a.studentName.localeCompare(b.studentName, 'zh')),
      }))
      // 时段按开始时间升序，空时间（''）天然排最前
      sessions.sort(
        (a, b) =>
          (a.startTime || '').localeCompare(b.startTime || '') ||
          (a.endTime || '').localeCompare(b.endTime || ''),
      )
      groups.push({
        key,
        courseName: entry.name,
        color: entry.color,
        sessions,
        totalStudents: entry.list.length,
      })
    }

    // 课程组按组内最早时段升序，次按课程名中文排序
    groups.sort((a, b) => {
      const aStart = a.sessions[0]?.startTime || ''
      const bStart = b.sessions[0]?.startTime || ''
      return aStart.localeCompare(bStart) || a.courseName.localeCompare(b.courseName, 'zh')
    })
    return groups
  }, [schedules])

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
            <h1 className="text-base font-semibold text-slate-800">点名管理</h1>
          </div>
          <div className="flex items-center gap-3">
            {!loading && schedules.length > 0 && (
              <span className="text-xs text-slate-400 hidden sm:block">
                当日 {schedules.length} 人次
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* 筛选区：点名日期 */}
        <section className="card p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">点名日期</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) setSelectedDate(e.target.value)
                }}
                className="px-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <button
              onClick={() => setSelectedDate(formatDate(new Date()))}
              className="btn-ghost text-sm py-1.5 px-3 border border-slate-200"
            >
              今天
            </button>
          </div>
        </section>

        {/* 课程卡片平铺：当日全部课程一次展示，滚动浏览 */}
        {loading ? (
          <div className="text-center py-10">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-brand-500 rounded-full animate-spin mx-auto" />
          </div>
        ) : courseGroups.length === 0 ? (
          <div className="card p-10 text-center text-slate-400 text-sm">该日期暂无排课</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {courseGroups.map((group) => (
              <section key={group.key} className="card p-5">
                {/* 课程头 */}
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <span
                    className={cn(
                      'inline-block w-2.5 h-2.5 rounded-full shrink-0',
                      getCourseDotClass(group.color),
                    )}
                  />
                  <h2 className="text-sm font-semibold text-slate-800">{group.courseName}</h2>
                  <span className="text-xs text-slate-400 ml-auto">
                    当日 {group.sessions.length} 个时段 · 共 {group.totalStudents} 人
                  </span>
                </div>

                {/* 时段块：按上课时间升序 */}
                <div className="space-y-3">
                  {group.sessions.map((session) => {
                    const stats = countAttendance(session.schedules)
                    const sessionBusy = session.schedules.some((s) => busyIds.has(s.id))
                    const allAttended =
                      session.schedules.length > 0 &&
                      session.schedules.every((s) => s.attendance === 'attended')
                    return (
                      <div
                        key={session.key}
                        className="border border-slate-100 rounded-lg p-3 bg-slate-50/50"
                      >
                        {/* 时段头 */}
                        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                          <div className="text-sm font-medium text-slate-700 font-mono">
                            {session.startTime
                              ? `${session.startTime}-${session.endTime}`
                              : '时间未标注'}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">
                              到课 {stats.attended} · 缺勤 {stats.absent} · 未点名 {stats.pending}
                            </span>
                            <button
                              onClick={() => handleMarkAll(session)}
                              disabled={allAttended || sessionBusy}
                              title={allAttended ? '该时段学员均已到课' : '将该时段全部学员标记为到课（含覆盖缺勤）'}
                              className="text-xs px-2.5 py-1 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                            >
                              全部到课
                            </button>
                          </div>
                        </div>
                        {/* 学员名单 */}
                        <div className="space-y-2">
                          {session.schedules.map((s) => (
                            <div
                              key={s.id}
                              className="flex items-center justify-between gap-2 bg-white rounded-md px-3 py-2 border border-slate-100"
                            >
                              <span className="text-sm text-slate-700 font-medium truncate">
                                {s.studentName}
                              </span>
                              <AttendanceButtons
                                schedule={s}
                                busy={busyIds.has(s.id)}
                                onMark={handleMark}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

// 三态分段按钮组：未点名（灰）/ 到课（绿）/ 缺勤（红），当前态高亮
function AttendanceButtons({
  schedule,
  busy,
  onMark,
}: {
  schedule: Schedule
  busy: boolean
  onMark: (schedule: Schedule, attendance: AttendanceStatus | 'none') => void
}) {
  const current = schedule.attendance ?? 'none'
  const options: {
    value: AttendanceStatus | 'none'
    label: string
    activeClass: string
    hoverClass: string
  }[] = [
    { value: 'none', label: '未点名', activeClass: 'bg-slate-500 text-white', hoverClass: 'hover:bg-slate-50' },
    { value: 'attended', label: '到课', activeClass: 'bg-green-600 text-white', hoverClass: 'hover:bg-green-50' },
    { value: 'absent', label: '缺勤', activeClass: 'bg-rose-600 text-white', hoverClass: 'hover:bg-rose-50' },
  ]
  return (
    <div className="flex items-center rounded-md overflow-hidden border border-slate-200 text-xs shrink-0">
      {options.map((opt, i) => (
        <button
          key={opt.value}
          onClick={() => onMark(schedule, opt.value)}
          disabled={busy}
          className={cn(
            'px-2.5 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
            i > 0 && 'border-l border-slate-200',
            current === opt.value
              ? opt.activeClass
              : cn('bg-white text-slate-500', opt.hoverClass),
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// 统计时段内三态人数
function countAttendance(list: Schedule[]) {
  let attended = 0
  let absent = 0
  for (const s of list) {
    if (s.attendance === 'attended') attended++
    else if (s.attendance === 'absent') absent++
  }
  return { attended, absent, pending: list.length - attended - absent }
}
