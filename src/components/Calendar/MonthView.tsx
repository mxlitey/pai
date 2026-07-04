import type { Schedule } from '@/types'
import { getMonthCells, WEEKDAYS } from '@/utils/date'
import { cn } from '@/utils/cn'
import { ScheduleCard } from '../ScheduleCard'

interface MonthViewProps {
  currentDate: Date
  schedules: Schedule[]
  onScheduleClick: (schedule: Schedule) => void
}

export function MonthView({ currentDate, schedules, onScheduleClick }: MonthViewProps) {
  const cells = getMonthCells(currentDate, schedules)
  const today = new Date()

  return (
    <div className="card overflow-hidden">
      {/* ============ 大屏：7列网格（保持原样） ============ */}
      <div className="hidden sm:block">
        {/* 星期表头 */}
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="py-2 text-center text-xs font-medium text-slate-500"
            >
              周{day}
            </div>
          ))}
        </div>

        {/* 日期网格 */}
        <div className="grid grid-cols-7 grid-rows-6">
          {cells.map((cell, index) => {
            const dayNum = cell.date.getDate()
            const isWeekend = index % 7 >= 5

            return (
              <div
                key={index}
                className={cn(
                  'min-h-[110px] border-b border-r border-slate-100 p-1 overflow-hidden',
                  !cell.isCurrentMonth && 'bg-slate-50/50',
                  (index + 1) % 7 === 0 && 'border-r-0',
                  index >= 35 && 'border-b-0',
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={cn(
                      'inline-flex items-center justify-center w-6 h-6 text-xs rounded-full',
                      cell.isToday
                        ? 'bg-brand-500 text-white font-semibold'
                        : cell.isCurrentMonth
                          ? isWeekend
                            ? 'text-rose-400'
                            : 'text-slate-600'
                          : 'text-slate-300',
                    )}
                  >
                    {dayNum}
                  </span>
                  {cell.schedules.length > 0 && cell.isCurrentMonth && (
                    <span className="text-[10px] text-slate-400">
                      {cell.schedules.length}节
                    </span>
                  )}
                </div>
                <div className="space-y-0.5">
                  {cell.schedules.slice(0, 3).map((s) => (
                    <ScheduleCard
                      key={s.id}
                      schedule={s}
                      compact
                      onClick={onScheduleClick}
                    />
                  ))}
                  {cell.schedules.length > 3 && (
                    <div className="text-[10px] text-slate-400 pl-1">
                      +{cell.schedules.length - 3} 更多
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ============ 小屏：横向滚动（每屏显 7~14 天，每格宽 80px） ============ */}
      <div className="sm:hidden">
        {/* 横向日期条 */}
        <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
          <div className="inline-flex min-w-full">
            {cells.map((cell, index) => {
              const dayNum = cell.date.getDate()
              const weekdayIdx = index % 7
              const isWeekend = weekdayIdx >= 5
              const isToday = cell.isToday
              const hasSchedules = cell.schedules.length > 0

              return (
                <div
                  key={index}
                  className={cn(
                    'flex-shrink-0 w-[80px] border-b border-r border-slate-100 p-1.5',
                    !cell.isCurrentMonth && 'bg-slate-50/50',
                    !hasSchedules && 'min-h-[88px]',
                  )}
                >
                  <div className="flex flex-col items-center mb-1">
                    <span className="text-[10px] text-slate-400">
                      {['一', '二', '三', '四', '五', '六', '日'][weekdayIdx]}
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center justify-center w-7 h-7 mt-0.5 text-sm rounded-full',
                        isToday
                          ? 'bg-brand-500 text-white font-semibold'
                          : cell.isCurrentMonth
                            ? isWeekend
                              ? 'text-rose-400'
                              : 'text-slate-700'
                            : 'text-slate-300',
                      )}
                    >
                      {dayNum}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {cell.schedules.slice(0, 2).map((s) => (
                      <ScheduleCard
                        key={s.id}
                        schedule={s}
                        compact
                        onClick={onScheduleClick}
                      />
                    ))}
                    {cell.schedules.length > 2 && (
                      <div className="text-[10px] text-slate-400 pl-0.5">
                        +{cell.schedules.length - 2}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        {/* 操作提示 */}
        <div className="px-3 py-2 text-center text-xs text-slate-400 bg-slate-50 border-t border-slate-100">
          ← 左右滑动查看更多日期 →
        </div>
      </div>

      {/* 今日提示 */}
      {cells.some((c) => c.isToday) && (
        <div className="hidden">今天 {today.toDateString()}</div>
      )}
    </div>
  )
}
