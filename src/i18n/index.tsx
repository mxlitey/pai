import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { zhCN, enUS } from 'date-fns/locale'
import type { Locale } from 'date-fns/locale'
import { zh, en } from './messages'
import type { Lang, MessageKey } from './messages'

const STORAGE_KEY = 'pai_lang'

// 语言检测：优先取 localStorage 记忆，其次跟随浏览器语言
export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'zh' || saved === 'en') return saved
  } catch {
    // localStorage 不可用时忽略
  }
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

// 模块级翻译：供非 React（如 api 层）根据当前语言取文案
export function getLang(): Lang {
  return detectLang()
}

export function t(key: MessageKey, lang: Lang = detectLang()): string {
  return (lang === 'zh' ? zh : en)[key]
}

interface I18nContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  locale: Locale
  t: (key: MessageKey) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang)

  const setLang = (next: Lang) => {
    setLangState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // 忽略
    }
  }

  // 同步 <html lang> 便于辅助功能与字体渲染
  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
  }, [lang])

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      setLang,
      locale: lang === 'zh' ? zhCN : enUS,
      t: (key) => (lang === 'zh' ? zh : en)[key],
    }),
    [lang],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}