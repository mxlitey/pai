import { useMemo, useState } from 'react'

// 分页状态与切片：items 变化或删除导致越界时自动回到最后一页
export function usePagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return items.slice(start, start + pageSize)
  }, [items, safePage, pageSize])
  return { safePage, totalPages, pageItems, setPage }
}

interface PaginationProps {
  page: number
  totalPages: number
  pageSize: number
  onChange: (page: number) => void
}

// 分页条：统计文案 + 上一页 / 页码 / 下一页（仅一页时不渲染）
export function Pagination({ page, totalPages, pageSize, onChange }: PaginationProps) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
      <span className="text-xs text-slate-400">
        第 {page} / {totalPages} 页 · 每页 {pageSize} 条
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="btn-ghost border border-slate-200 text-xs py-1 px-2.5 disabled:opacity-40"
        >
          上一页
        </button>
        {renderPageButtons(page, totalPages, onChange)}
        <button
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="btn-ghost border border-slate-200 text-xs py-1 px-2.5 disabled:opacity-40"
        >
          下一页
        </button>
      </div>
    </div>
  )
}

// 渲染页码按钮：始终显示首页、末页、当前页前后 2 页，其余用省略号
function renderPageButtons(current: number, total: number, setPage: (p: number) => void) {
  const buttons: (number | '...')[] = []
  const around = 2
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - around && i <= current + around)) {
      buttons.push(i)
    } else if (buttons[buttons.length - 1] !== '...') {
      buttons.push('...')
    }
  }
  return buttons.map((b, idx) => {
    if (b === '...') {
      return (
        <span key={`e${idx}`} className="text-slate-400 text-xs px-1.5 select-none">
          …
        </span>
      )
    }
    return (
      <button
        key={b}
        onClick={() => setPage(b)}
        className={
          b === current
            ? 'btn-primary text-xs py-1 px-2.5'
            : 'btn-ghost border border-slate-200 text-xs py-1 px-2.5'
        }
      >
        {b}
      </button>
    )
  })
}
