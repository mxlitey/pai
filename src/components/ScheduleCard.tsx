import type { Schedule } from '@/types'
import { cn } from '@/utils/cn'
import { getCourseCardClass } from '@/utils/courseColors'

interface ScheduleCardProps {
  schedule: Schedule
  compact?: boolean
  onClick?: (schedule: Schedule) => void
}

export function ScheduleCard({ schedule, compact = false, onClick }: ScheduleCardProps) {
  const colorClass = getCourseCardClass(schedule.color, schedule.courseName)

  if (compact) {
    // 月视图中的紧凑卡片
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClick?.(schedule)
        }}
        className={cn(
          'relative block w-full text-left px-1.5 py-0.5 text-xs rounded truncate border transition-opacity hover:opacity-80',
          colorClass,
        )}
      >
        {schedule.attendance && (
          <span className={schedule.attendance === 'attended' ? 'text-green-700' : 'text-rose-600'}>
            {schedule.attendance === 'attended' ? '✓ ' : '✕ '}
          </span>
        )}
        <span className="font-medium">{formatTimeShort(schedule.startTime)}</span>{' '}
        {schedule.courseName}
      </button>
    )
  }

  // 周/日视图中的完整卡片
  return (
    <button
      onClick={() => onClick?.(schedule)}
      className={cn(
        'relative block w-full text-left p-3 rounded-lg border transition-all hover:shadow-md hover:scale-[1.01]',
        colorClass,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm truncate">{schedule.courseName}</div>
          <div className="text-xs mt-1 opacity-80">
            {schedule.startTime} - {schedule.endTime}
          </div>
        </div>
        {schedule.attendance && (
          <span
            className={cn(
              'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] leading-none font-medium text-white',
              schedule.attendance === 'attended' ? 'bg-green-600' : 'bg-rose-600',
            )}
          >
            {schedule.attendance === 'attended' ? '✓ 到课' : '✕ 缺勤'}
          </span>
        )}
      </div>
    </button>
  )
}

function formatTimeShort(time: string): string {
  // 保留冒号分隔，如 16:00；空值返回原值
  return time || ''
}
