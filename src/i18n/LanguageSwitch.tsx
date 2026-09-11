import { useI18n } from '@/i18n'
import { cn } from '@/utils/cn'

// 语言切换按钮：短条显示目标语言，点击即切换（中/英互切）
// 图标取「地球」，文案用目标语言的简称（中/EN）便于自解释
export function LanguageSwitch() {
  const { lang, setLang } = useI18n()
  const next: 'zh' | 'en' = lang === 'zh' ? 'en' : 'zh'

  return (
    <button
      onClick={() => setLang(next)}
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium rounded-lg',
        'px-2.5 py-1.5 transition-colors',
        'text-slate-500 hover:text-slate-700 hover:bg-slate-100',
      )}
      title={next === 'zh' ? '中文' : 'English'}
      aria-label={next === 'zh' ? '中文' : 'English'}
    >
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8H11a2 2 0 012 2v.5a2 2 0 002 2h1.005M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9.5 4.5L8 18l.5-3 2.5-3.5 2 3 1-2"
        />
      </svg>
      {next === 'zh' ? '中' : 'EN'}
    </button>
  )
}