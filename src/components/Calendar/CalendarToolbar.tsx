import { addDays, addMonths } from 'date-fns'
import type { ViewMode } from '@/types'
import { cn } from '@/utils/cn'
import { useI18n } from '@/i18n'

interface CalendarToolbarProps {
  currentDate: Date
  view: ViewMode
  onNavigate: (direction: 'prev' | 'next' | 'today') => void
  onViewChange: (view: ViewMode) => void
}

// 计算左右导航按钮的文案
// 月视图：显示上月/下月的月份（如 "6月" / "Jun"）；周视图：显示"上一周/下一周"；日视图：显示上一天/下一天的日期（如 "7-4"）
export function CalendarToolbar({
  currentDate,
  view,
  onNavigate,
  onViewChange,
}: CalendarToolbarProps) {
  const { lang, t } = useI18n()

  let prev: string
  let next: string
  let todayLabel: string
  if (view === 'month') {
    prev = monthLabel(addMonths(currentDate, -1), lang)
    next = monthLabel(addMonths(currentDate, 1), lang)
    todayLabel = t('toolbarThisMonth')
  } else if (view === 'week') {
    prev = t('toolbarPrevWeek')
    next = t('toolbarNextWeek')
    todayLabel = t('toolbarThisWeek')
  } else {
    prev = `${addDays(currentDate, -1).getMonth() + 1}-${addDays(currentDate, -1).getDate()}`
    next = `${addDays(currentDate, 1).getMonth() + 1}-${addDays(currentDate, 1).getDate()}`
    todayLabel = t('toolbarToday')
  }

  // 月/周视图：左右按钮使用文字（显示具体月份/周）；日视图：保持紧凑文字
  const navBtnClass =
    'px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition-colors whitespace-nowrap'

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1">
      {/* 导航按钮 */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onNavigate('prev')}
          className={navBtnClass}
          aria-label={t('toolbarPrevAria')}
        >
          {prev}
        </button>
        <button onClick={() => onNavigate('today')} className="btn-primary">
          {todayLabel}
        </button>
        <button
          onClick={() => onNavigate('next')}
          className={navBtnClass}
          aria-label={t('toolbarNextAria')}
        >
          {next}
        </button>
      </div>

      {/* 视图切换 */}
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
        {(
          [
            { value: 'month', label: t('toolbarMonth') },
            { value: 'week', label: t('toolbarWeek') },
            { value: 'day', label: t('toolbarDay') },
          ] as { value: ViewMode; label: string }[]
        ).map((opt) => (
          <button
            key={opt.value}
            onClick={() => onViewChange(opt.value)}
            className={cn(
              'px-4 py-1.5 text-sm font-medium rounded-md transition-all',
              view === opt.value
                ? 'bg-brand-500 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// 月视图导航按钮月份文案：zh "6月" / en "Jun"
function monthLabel(date: Date, lang: 'zh' | 'en'): string {
  const fmt = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short' })
  return fmt.format(date)
}