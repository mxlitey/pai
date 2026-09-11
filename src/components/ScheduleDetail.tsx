import { useEffect } from 'react'
import type { Schedule } from '@/types'
import { parseDate } from '@/utils/date'
import { format } from 'date-fns'
import { useI18n } from '@/i18n'

interface ScheduleDetailProps {
  schedule: Schedule | null
  onClose: () => void
}

export function ScheduleDetail({ schedule, onClose }: ScheduleDetailProps) {
  const { lang, locale, t } = useI18n()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (schedule) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [schedule, onClose])

  if (!schedule) return null

  const date = parseDate(schedule.date)

  const fields = [
    { label: t('detailCourseName'), value: schedule.courseName },
    {
      label: t('detailDate'),
      value: format(date, lang === 'zh' ? 'yyyy年M月d日 EEEE' : 'EEEE, MMM d, yyyy', { locale }),
    },
    { label: t('detailTime'), value: `${schedule.startTime} - ${schedule.endTime}` },
    { label: t('detailAttendance'), value: attendanceText(schedule.attendance) },
    { label: t('detailStudentName'), value: schedule.studentName },
  ]

  // 点名状态文案：attendance 缺省视为未点名
  function attendanceText(attendance?: Schedule['attendance']): string {
    if (attendance === 'attended') return t('detailAttended')
    if (attendance === 'absent') return t('detailAbsent')
    return t('detailNone')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-[fadeIn_0.15s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-base text-slate-800">{t('detailTitle')}</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1"
            aria-label={t('detailClose')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 内容 */}
        <div className="px-5 py-4 space-y-3">
          {fields.map((field) => (
            <div key={field.label} className="flex items-start gap-4">
              <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-0.5">
                {field.label}
              </span>
              <span className="text-sm text-slate-800 font-medium flex-1">
                {field.value}
              </span>
            </div>
          ))}
          {schedule.note && (
            <div className="flex items-start gap-4">
              <span className="text-sm text-slate-400 w-20 flex-shrink-0 pt-0.5">{t('detailNote')}</span>
              <span className="text-sm text-slate-600 flex-1">{schedule.note}</span>
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button onClick={onClose} className="btn-ghost">
            {t('detailClose')}
          </button>
        </div>
      </div>
    </div>
  )
}
