import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

interface ModalProps {
  title: ReactNode
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer: ReactNode
  size?: 'md' | 'lg'
  footerAlign?: 'between' | 'end'
}

// 后台弹窗外壳：遮罩 + 卡片 + 标题栏 + 内容区 + 底部操作
// 点击遮罩或关闭按钮触发 onClose
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  size = 'lg',
  footerAlign = 'between',
}: ModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className={cn(
          'bg-white rounded-xl shadow-2xl w-full max-h-[90vh] overflow-y-auto',
          size === 'lg' ? 'max-w-lg' : 'max-w-md',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部：标题 + 副标题 + 关闭按钮 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-xl">
          <div>
            <h3 className="font-semibold text-base text-slate-800">{title}</h3>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1"
            aria-label="关闭"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 内容 */}
        <div className="px-5 py-4 space-y-4">{children}</div>

        {/* 底部操作 */}
        <div
          className={cn(
            'px-5 py-3 bg-slate-50 border-t border-slate-100 flex gap-2 sticky bottom-0',
            footerAlign === 'between' ? 'justify-between' : 'justify-end',
          )}
        >
          {footer}
        </div>
      </div>
    </div>
  )
}
