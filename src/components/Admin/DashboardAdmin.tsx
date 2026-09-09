import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { endOfMonth } from 'date-fns'
import type { Course, Schedule } from '@/types'
import { listCourses, searchSchedules } from '@/api/admin'
import { formatDate, formatMonth } from '@/utils/date'
import { cn } from '@/utils/cn'

interface DashboardAdminProps {
  onBack: () => void
  onToast: (type: 'success' | 'error' | 'info', message: string) => void
}

// 视角：自然月 / 日期范围
type ViewMode = 'month' | 'range'

// 颜色：与 build-schedule-page.mjs 的 COLOR_HEX / COURSE_COLOR_OPTIONS 对齐
const COLOR_HEX: Record<string, { stroke: string; fill: string; text: string }> = {
  blue: { stroke: '#3B82F6', fill: '#EFF6FF', text: '#1D4ED8' },
  green: { stroke: '#22C55E', fill: '#F0FDF4', text: '#15803D' },
  purple: { stroke: '#A855F7', fill: '#FAF5FF', text: '#7E22CE' },
  orange: { stroke: '#F97316', fill: '#FFF7ED', text: '#C2410C' },
  rose: { stroke: '#F43F5E', fill: '#FFF1F2', text: '#BE123C' },
  teal: { stroke: '#14B8A6', fill: '#F0FDFA', text: '#0F766E' },
  amber: { stroke: '#F59E0B', fill: '#FFFBEB', text: '#B45309' },
  indigo: { stroke: '#6366F1', fill: '#EEF2FF', text: '#4338CA' },
  cyan: { stroke: '#06B6D4', fill: '#ECFEFF', text: '#0E7490' },
  pink: { stroke: '#EC4899', fill: '#FDF2F8', text: '#BE185D' },
  slate: { stroke: '#94A3B8', fill: '#F8FAFC', text: '#475569' },
}
const colorOf = (key?: string) => COLOR_HEX[key || ''] || COLOR_HEX.slate

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const weekdayOf = (d: string) => WEEKDAYS[new Date(`${d}T00:00:00`).getDay()]
const mdFmt = (d: string) => {
  const [, m, dd] = d.split('-')
  return `${+m}/${+dd}`
}

export function DashboardAdmin({ onBack, onToast }: DashboardAdminProps) {
  // 视角与筛选条件
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [month, setMonth] = useState(() => formatMonth(new Date()))
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  // 有排课数据且已生成过页面（用于区分「未生成」与「无数据」）
  const [generated, setGenerated] = useState(false)

  // 当前生效的日期范围（yyyy-MM-dd）
  const effectiveRange = useMemo<{ start: string; end: string } | null>(() => {
    if (viewMode === 'month') {
      if (!/^\d{4}-\d{2}$/.test(month)) return null
      const end = formatDate(endOfMonth(new Date(`${month}-01T00:00:00`)))
      return { start: `${month}-01`, end }
    }
    if (startDate && endDate) {
      if (startDate > endDate) return null
      return { start: startDate, end: endDate }
    }
    return null
  }, [viewMode, month, startDate, endDate])

  // 请求序号：条件切换时丢弃过期响应
  const loadSeqRef = useRef(0)

  const loadData = useCallback(
    async (range: { start: string; end: string }) => {
      const seq = ++loadSeqRef.current
      setLoading(true)
      try {
        const [sch, cour] = await Promise.all([
          searchSchedules({ startDate: range.start, endDate: range.end }),
          listCourses(),
        ])
        if (seq !== loadSeqRef.current) return
        if (sch.code !== 0) {
          onToast('error', sch.message)
          setSchedules([])
          return
        }
        setSchedules(sch.data.schedules)
        setCourses(cour.code === 0 ? cour.data.courses : [])
        setGenerated(true)
      } catch (e) {
        if (seq !== loadSeqRef.current) return
        onToast('error', '加载看板数据失败：' + (e as Error).message)
        setSchedules([])
      } finally {
        if (seq === loadSeqRef.current) setLoading(false)
      }
    },
    [onToast],
  )

  // 条件变化（含首次进入）时取数
  useEffect(() => {
    if (!effectiveRange) {
      setLoading(false)
      return
    }
    loadData(effectiveRange)
  }, [effectiveRange, loadData])

  // ========== 派生渲染数据（对齐 build-schedule-page.mjs） ==========

  // 班型顺序与颜色：按后端 courses 顺序，缺省补入历史排课中不存在的班型
  const { courseOrder, courseMeta } = useMemo(() => {
    const order: string[] = []
    const meta: Record<string, { stroke: string; fill: string; text: string }> = {}
    for (const c of courses) {
      if (!schedules.some((s) => s.courseId === c.id)) continue
      order.push(c.name)
      meta[c.name] = colorOf(c.color)
    }
    for (const s of schedules) {
      if (!meta[s.courseName]) {
        order.push(s.courseName)
        meta[s.courseName] = COLOR_HEX.slate
      }
    }
    return { courseOrder: order, courseMeta: meta }
  }, [courses, schedules])

  const dates = useMemo(
    () => [...new Set(schedules.map((s) => s.date))].sort(),
    [schedules],
  )

  // 每个日期所属"周带"序号（周一为一周的起点，连续日期按周分块，两种颜色交替）
  // 用于考勤矩阵日期列头交替配色，日期多时可依周界清晰分辨
  const dateBands = useMemo(() => {
    const seen = new Map<string, number>()
    let order = 0
    return dates.map((d) => {
      const wk = new Date(`${d}T00:00:00`)
      const monday = new Date(wk)
      monday.setDate(wk.getDate() - ((wk.getDay() + 6) % 7))
      const key = `${monday.getFullYear()}-${monday.getMonth()}-${monday.getDate()}`
      if (!seen.has(key)) seen.set(key, order++)
      return seen.get(key)! % 2
    })
  }, [dates])

  // 学员按班型顺序、再按首次出现顺序排列
  const studentList = useMemo(() => {
    const list: { name: string; course: string }[] = []
    for (const cn of courseOrder) {
      for (const s of schedules) {
        if (s.courseName === cn && !list.some((x) => x.name === s.studentName)) {
          list.push({ name: s.studentName, course: cn })
        }
      }
    }
    return list
  }, [courseOrder, schedules])

  // 每学员每日点名聚合：到课 > 缺勤 > 未点名（`${courseName}|${date}` → status）
  const attendanceOf = useMemo(() => {
    const map: Record<string, { attended: number; absent: number; pending: number }> = {}
    const statusOf: Record<string, Record<string, string>> = {}
    const rank: Record<string, number> = { attended: 2, absent: 1, pending: 0 }
    for (const st of studentList) {
      const seen: Record<string, string> = {}
      for (const s of schedules) {
        if (s.studentName !== st.name) continue
        const status = s.attendance === 'attended' ? 'attended' : s.attendance === 'absent' ? 'absent' : 'pending'
        const key = `${s.courseName}|${s.date}`
        if (!seen[key] || rank[status] > rank[seen[key]]) seen[key] = status
      }
      statusOf[st.name] = seen
    }
    for (const st of studentList) {
      const cnt: Record<'attended' | 'absent' | 'pending', number> = { attended: 0, absent: 0, pending: 0 }
      for (const v of Object.values(statusOf[st.name])) cnt[v as 'attended' | 'absent' | 'pending']++
      map[st.name] = cnt
    }
    return { statusOf, count: map }
  }, [studentList, schedules])

  // 每日安排卡片：按日期 → 班型+时间组 → 学员
  const dailyCards = useMemo(() => {
    return dates.map((d) => {
      const day = schedules.filter((s) => s.date === d)
      const groups = new Map<string, { courseName: string; startTime: string; endTime: string; items: Schedule[] }>()
      for (const s of day) {
        const key = `${s.courseName}|${s.startTime}|${s.endTime}`
        const g = groups.get(key)
        if (g) g.items.push(s)
        else groups.set(key, { courseName: s.courseName, startTime: s.startTime, endTime: s.endTime, items: [s] })
      }
      const blocks = [...groups.values()].sort((a, b) => a.startTime.localeCompare(b.startTime))
      return { date: d, blocks }
    })
  }, [dates, schedules])

  // 图例高亮交互：点击班型/标识切换高亮，点击空白恢复
  const [activeCourses, setActiveCourses] = useState<Set<string>>(new Set())
  const toggleCourse = useCallback((name: string) => {
    setActiveCourses((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  const stats = useMemo(
    () => ({
      records: schedules.length,
      days: dates.length,
      students: studentList.length,
      courses: courseOrder.length,
    }),
    [schedules, dates, studentList, courseOrder],
  )

  return (
    <div
      className="min-h-screen bg-slate-50"
      onClick={(e) => {
        // 点击非图例/非标识的空白区域时，清除全部高亮（与看板脚本一致）
        if (!(e.target as HTMLElement).closest('[data-highlight]')) {
          setActiveCourses(new Set())
        }
      }}
    >
      {/* 顶部栏 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
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
            <h1 className="text-base font-semibold text-slate-800">看板数据</h1>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        {/* 筛选区：视角 + 条件 */}
        <section className="card p-5">
          <div className="flex flex-wrap items-end gap-3">
            {/* 视角切换 */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">查看方式</label>
              <div className="flex rounded-md overflow-hidden border border-slate-200 text-sm">
                <button
                  onClick={() => setViewMode('month')}
                  className={cn(
                    'px-3 py-1.5 transition-colors',
                    viewMode === 'month' ? 'bg-brand-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50',
                  )}
                >
                  自然月
                </button>
                <button
                  onClick={() => setViewMode('range')}
                  className={cn(
                    'px-3 py-1.5 transition-colors border-l border-slate-200',
                    viewMode === 'range' ? 'bg-brand-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50',
                  )}
                >
                  日期范围
                </button>
              </div>
            </div>

            {viewMode === 'month' ? (
              <div>
                <label className="block text-xs text-slate-500 mb-1">月份</label>
                <input
                  type="month"
                  value={month}
                  onChange={(e) => e.target.value && setMonth(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">开始日期</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">结束日期</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>
              </>
            )}

            <p className="text-xs text-slate-400 w-full">
              {viewMode === 'month'
                ? '按自然月展示该月的每日安排与考勤矩阵'
                : '按起止日期展示区间内的每日安排与考勤矩阵（起止日期需同时填写且不晚于结束）'}
            </p>
          </div>
        </section>

        {loading ? (
          <div className="text-center py-10">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-brand-500 rounded-full animate-spin mx-auto" />
          </div>
        ) : !generated ? (
          <div className="card p-10 text-center text-slate-400 text-sm">
            请先设置有效日期条件以加载看板
          </div>
        ) : schedules.length === 0 ? (
          <div className="card p-10 text-center text-slate-400 text-sm">该范围暂无排课</div>
        ) : (
          <>
            {/* 统计卡 */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="排课记录" value={stats.records} />
              <StatCard label="排课天数" value={stats.days} />
              <StatCard label="学员" value={stats.students} />
              <StatCard label="班型" value={stats.courses} />
            </section>

            {/* 每日安排 */}
            <section>
              <h2 className="text-sm font-semibold text-slate-800 mb-3">每日安排</h2>
              <div className="grid md:grid-cols-2 gap-4">
                {dailyCards.map((day) => (
                  <article key={day.date} className="card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium text-slate-800">
                        {mdFmt(day.date)} {weekdayOf(day.date)}
                      </span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {day.blocks.map((b) => {
                        const m = courseMeta[b.courseName] || COLOR_HEX.slate
                        return (
                          <div key={`${b.courseName}|${b.startTime}|${b.endTime}`} className="flex items-start gap-3 py-2">
                            <span
                              className="flex-0 text-xs font-mono pt-0.5 tabular-nums"
                              style={{ color: m.text }}
                            >
                              {b.startTime}–{b.endTime}
                            </span>
                            <span className="flex-1 min-w-0 text-sm leading-relaxed">
                              {b.items.map((s, i) => (
                                <span key={`${s.id}-${i}`}>
                                  {i > 0 && '、'}
                                  <span className="whitespace-nowrap">{s.studentName}</span>
                                </span>
                              ))}
                            </span>
                            <span
                              className="shrink-0 max-w-[96px] text-xs text-center rounded px-1.5 py-0.5 break-all"
                              style={{
                                color: m.text,
                                backgroundColor: m.fill,
                                border: `0.5px solid ${m.stroke}`,
                              }}
                            >
                              {b.courseName}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            {/* 考勤矩阵 */}
            <section>
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <h2 className="text-sm font-semibold text-slate-800">考勤矩阵</h2>
              </div>

              {/* 图例 */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3 text-xs text-slate-500">
                {courseOrder.map((course) => (
                  <button
                    key={course}
                    data-highlight="1"
                    onClick={() => toggleCourse(course)}
                    className={cn(
                      'flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors',
                      activeCourses.has(course) && 'bg-slate-200/70 ring-1 ring-slate-300',
                    )}
                    title="点击高亮该班型标识，再次点击恢复"
                  >
                    <i className="w-2.5 h-2.5 rounded" style={{ backgroundColor: courseMeta[course].stroke }} />
                    {course}
                  </button>
                ))}
                <span className="flex items-center gap-1.5">
                  <i
                    className="inline-block rounded px-1 leading-snug"
                    style={{ backgroundColor: '#EFEFEA', border: '0.5px solid #DDDAD2', color: '#5F5E5A' }}
                  >
                    ●
                  </i>
                  到课
                </span>
                <span style={{ color: '#A32D2D' }}>✕ 缺勤</span>
                <span style={{ color: '#7A7973' }}>● 未点名</span>
                <span style={{ color: '#A9A79F' }}>— 无课</span>
              </div>

              <div className="overflow-auto max-h-[65vh] rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left text-xs font-medium text-slate-500 px-3.5 py-3 whitespace-nowrap sticky top-0 left-0 z-30 bg-slate-50 border-b border-slate-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                        学员
                      </th>
                      {dates.map((d, i) => (
                        <th
                          key={d}
                          className={cn(
                            'text-xs font-medium text-slate-500 py-3 text-center whitespace-nowrap sticky top-0 z-10 border-b border-slate-200',
                            dateBands[i] === 0 ? 'bg-slate-50' : 'bg-slate-200/70',
                          )}
                        >
                          {mdFmt(d)}
                        </th>
                      ))}
                      <th className="text-xs font-medium text-slate-500 py-3 text-center whitespace-nowrap px-3.5 sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                        合计
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentList.map((st) => (
                      <tr key={st.name} className="border-t border-slate-100">
                        <td className="px-3.5 py-2 text-slate-700 font-medium whitespace-nowrap sticky left-0 z-10 bg-white shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">{st.name}</td>
                        {dates.map((d) => {
                          const marks: React.ReactNode[] = []
                          for (const cn of courseOrder) {
                            const status = attendanceOf.statusOf[st.name][`${cn}|${d}`]
                            if (!status) continue
                            const m = courseMeta[cn]
                            const active = activeCourses.has(cn)
                            const dimActive = activeCourses.size > 0 && !active
                            if (status === 'attended') {
                              marks.push(
                                <span
                                  data-highlight="1"
                                  key={cn}
                                  onClick={() => toggleCourse(cn)}
                                  className="cursor-pointer transition-transform px-1 rounded leading-relaxed tabular-nums"
                                  style={{
                                    backgroundColor: m.fill,
                                    border: `0.5px solid ${m.stroke}`,
                                    color: m.stroke,
                                    transform: active ? 'scale(1.3)' : undefined,
                                    opacity: dimActive ? 0.18 : undefined,
                                  }}
                                >
                                  ●
                                </span>,
                              )
                            } else if (status === 'absent') {
                              marks.push(
                                <span
                                  data-highlight="1"
                                  key={cn}
                                  onClick={() => toggleCourse(cn)}
                                  className="cursor-pointer transition-transform"
                                  style={{ color: m.stroke, transform: active ? 'scale(1.3)' : undefined, opacity: dimActive ? 0.18 : undefined }}
                                >
                                  ✕
                                </span>,
                              )
                            } else {
                              marks.push(
                                <span
                                  data-highlight="1"
                                  key={cn}
                                  onClick={() => toggleCourse(cn)}
                                  className="cursor-pointer transition-transform"
                                  style={{ color: m.stroke, transform: active ? 'scale(1.3)' : undefined, opacity: dimActive ? 0.18 : undefined }}
                                >
                                  ●
                                </span>,
                              )
                            }
                          }
                          if (!marks.length) {
                            return (
                              <td key={d} className="text-center py-2 px-1 text-slate-200">
                                —
                              </td>
                            )
                          }
                          return (
                            <td key={d} className="text-center py-2 px-1">
                              <div className="flex justify-center gap-0.5 whitespace-nowrap">{marks}</div>
                            </td>
                          )
                        })}
                        <td className="text-center py-2 px-3.5 text-xs text-slate-500 whitespace-nowrap">
                          {attendanceOf.count[st.name].attended}到·{attendanceOf.count[st.name].absent}缺·
                          {attendanceOf.count[st.name].pending}未
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}

// 统计卡片
function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="text-2xl font-semibold text-slate-800 tabular-nums">{value}</div>
    </div>
  )
}