import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addDays,
  addMonths,
  addWeeks,
  isSameDay,
  isSameMonth,
  parseISO,
} from 'date-fns'
import type { Locale } from 'date-fns/locale'
import type { CalendarCell, Schedule, ViewMode } from '@/types'
import type { Lang } from '@/i18n/messages'

// 格式化日期为 yyyy-MM-dd
export function formatDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

// 格式化日期为 yyyy-MM
export function formatMonth(date: Date): string {
  return format(date, 'yyyy-MM')
}

// 获取月视图的日历单元格（含上下月填充，共42格）
export function getMonthCells(date: Date, schedules: Schedule[]): CalendarCell[] {
  const monthStart = startOfMonth(date)
  const monthEnd = endOfMonth(date)
  // 周一为一周起点
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })
  const today = new Date()

  return days.map((day) => {
    const dayStr = formatDate(day)
    return {
      date: day,
      isCurrentMonth: isSameMonth(day, date),
      isToday: isSameDay(day, today),
      schedules: schedules.filter((s) => s.date === dayStr),
    }
  })
}

// 获取周视图的7个日期
export function getWeekDays(date: Date): Date[] {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

// 按日期分组排课
export function groupSchedulesByDate(schedules: Schedule[]): Record<string, Schedule[]> {
  return schedules.reduce((acc, s) => {
    if (!acc[s.date]) acc[s.date] = []
    acc[s.date].push(s)
    return acc
  }, {} as Record<string, Schedule[]>)
}

// 视图导航：根据当前视图返回前/后日期
export function navigateDate(date: Date, view: ViewMode, direction: 'prev' | 'next'): Date {
  const delta = direction === 'next' ? 1 : -1
  if (view === 'month') return addMonths(date, delta)
  if (view === 'week') return addWeeks(date, delta)
  return addDays(date, delta)
}

// 获取视图标题（公开页多语言：中英文格式串不同，locale 由调用方注入）
export function getViewTitle(date: Date, view: ViewMode, locale: Locale, lang: Lang): string {
  if (view === 'month') {
    return format(date, lang === 'zh' ? 'yyyy年M月' : 'MMMM yyyy', { locale })
  }
  if (view === 'week') {
    const weekStart = startOfWeek(date, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(date, { weekStartsOn: 1 })
    if (isSameMonth(weekStart, weekEnd)) {
      return lang === 'zh'
        ? `${format(weekStart, 'yyyy年M月', { locale })} ${format(weekStart, 'd')}-${format(weekEnd, 'd')}日`
        : `${format(weekStart, 'MMMM d', { locale })} - ${format(weekEnd, 'd', { locale })}`
    }
    return lang === 'zh'
      ? `${format(weekStart, 'yyyy年M月d日', { locale })} - ${format(weekEnd, 'M月d日', { locale })}`
      : `${format(weekStart, 'MMM d yyyy', { locale })} - ${format(weekEnd, 'MMM d', { locale })}`
  }
  return format(date, lang === 'zh' ? 'yyyy年M月d日 EEEE' : 'EEEE, MMM d, yyyy', { locale })
}

// 解析日期字符串
export function parseDate(dateStr: string): Date {
  return parseISO(dateStr)
}

// 获取月份的起止日期
export function getMonthRange(date: Date): { start: Date; end: Date } {
  return { start: startOfMonth(date), end: endOfMonth(date) }
}

// 获取周的起止日期
export function getWeekRange(date: Date): { start: Date; end: Date } {
  return {
    start: startOfWeek(date, { weekStartsOn: 1 }),
    end: endOfWeek(date, { weekStartsOn: 1 }),
  }
}
