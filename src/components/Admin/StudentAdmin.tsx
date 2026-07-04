import { useMemo, useState } from 'react'
import type { Student } from '@/types'

interface StudentAdminProps {
  students: Student[]
  busy: boolean
  onBack: () => void
  onDelete: (student: Student) => void
}

const PAGE_SIZE = 15

export function StudentAdmin({ students, busy, onBack, onDelete }: StudentAdminProps) {
  const [page, setPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(students.length / PAGE_SIZE))
  // 当前页越界时回到最后一页（如删除后）
  const safePage = Math.min(page, totalPages)
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return students.slice(start, start + PAGE_SIZE)
  }, [students, safePage])

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 顶部栏 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
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
            <h1 className="text-base font-semibold text-slate-800">学员管理</h1>
          </div>
          <span className="text-xs text-slate-400">共 {students.length} 名学员</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {students.length === 0 ? (
          <div className="card p-10 text-center text-slate-400 text-sm">
            暂无学员数据
          </div>
        ) : (
          <section className="card p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-xs">
                    <th className="text-left py-2 px-2 font-medium">姓名</th>
                    <th className="text-left py-2 px-2 font-medium">ID</th>
                    <th className="text-left py-2 px-2 font-medium">年级</th>
                    <th className="text-left py-2 px-2 font-medium">电话</th>
                    <th className="text-right py-2 px-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-2.5 px-2 font-medium text-slate-700">{s.name}</td>
                      <td className="py-2.5 px-2 text-slate-500 font-mono text-xs">{s.id}</td>
                      <td className="py-2.5 px-2 text-slate-600">
                        {s.grade || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2.5 px-2 text-slate-600">
                        {s.phone || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <button
                          onClick={() => onDelete(s)}
                          disabled={busy}
                          className="text-rose-600 hover:text-rose-700 text-xs font-medium disabled:opacity-50"
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 分页 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                <span className="text-xs text-slate-400">
                  第 {safePage} / {totalPages} 页 · 每页 {PAGE_SIZE} 条
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="btn-ghost border border-slate-200 text-xs py-1 px-2.5 disabled:opacity-40"
                  >
                    上一页
                  </button>
                  {renderPageButtons(safePage, totalPages, setPage)}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    className="btn-ghost border border-slate-200 text-xs py-1 px-2.5 disabled:opacity-40"
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}

// 渲染页码按钮：始终显示首页、末页、当前页前后 2 页，其余用省略号
function renderPageButtons(
  current: number,
  total: number,
  setPage: (p: number) => void,
) {
  const buttons: (number | '...')[] = []
  const around = 2
  for (let i = 1; i <= total; i++) {
    if (
      i === 1 ||
      i === total ||
      (i >= current - around && i <= current + around)
    ) {
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
