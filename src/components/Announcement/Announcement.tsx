import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface AnnouncementProps {
  // 公告内容（Markdown 文本，来自后端 API 异步加载），为空字符串时不渲染
  content?: string
}

// 公告栏
// - 内容由父组件通过 props 传入（异步从后端加载）
// - 内容为空（或 undefined）时不渲染
// - 支持 Markdown 渲染（GFM：表格、删除线、任务列表、自动链接等）
// - 内容过多时限定最大高度并上下滚动
export function Announcement({ content }: AnnouncementProps) {
  if (!content) return null

  return (
    <div className="card mb-4 overflow-hidden">
      <div className="flex">
        {/* 左侧标签条 */}
        <div className="flex-shrink-0 w-1 bg-amber-400" />
        <div className="flex-1 min-w-0 px-4 py-3">
          <div className="flex items-center gap-2 mb-1.5">
            <svg
              className="w-4 h-4 text-amber-500 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6a1 1 0 001 1v11.5a.5.5 0 01-1 0V8.83a4 4 0 00-1.564 4.853zM11 5.882A4 4 0 0116 6v0a4 4 0 014 4v6.5a.5.5 0 01-1 0V10a3 3 0 00-3-3 4 4 0 00-4 0"
              />
            </svg>
            <span className="text-sm font-semibold text-slate-700">公告</span>
          </div>
          {/* 公告内容：Markdown 渲染，限定最大高度，超出可上下滚动 */}
          <div className="text-sm text-slate-600 leading-relaxed max-h-80 overflow-y-auto pr-2 announcement-md">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // 标题
                h1: ({ children }) => (
                  <h1 className="text-lg font-bold text-slate-800 mt-3 mb-2">{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-base font-bold text-slate-800 mt-3 mb-2">{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-sm font-bold text-slate-800 mt-2 mb-1">{children}</h3>
                ),
                h4: ({ children }) => (
                  <h4 className="text-sm font-semibold text-slate-700 mt-2 mb-1">{children}</h4>
                ),
                h5: ({ children }) => (
                  <h5 className="text-sm font-semibold text-slate-700 mt-1 mb-1">{children}</h5>
                ),
                h6: ({ children }) => (
                  <h6 className="text-xs font-semibold text-slate-700 mt-1 mb-1">{children}</h6>
                ),
                // 段落
                p: ({ children }) => <p className="my-2">{children}</p>,
                // 列表
                ul: ({ children }) => (
                  <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>
                ),
                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                // 强调
                strong: ({ children }) => (
                  <strong className="font-semibold text-slate-800">{children}</strong>
                ),
                em: ({ children }) => <em className="italic">{children}</em>,
                del: ({ children }) => <del className="text-slate-400">{children}</del>,
                // 链接
                a: ({ children, href }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-600 hover:text-brand-700 underline"
                  >
                    {children}
                  </a>
                ),
                // 引用
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-amber-300 pl-3 my-2 text-slate-500 italic">
                    {children}
                  </blockquote>
                ),
                // 代码
                code: ({ children, className }) => {
                  // 行内代码 vs 代码块（react-markdown 用 className 区分）
                  const isBlock = className?.includes('language-')
                  if (isBlock) {
                    return (
                      <code className="block bg-slate-100 text-slate-800 rounded px-3 py-2 my-2 overflow-x-auto text-xs font-mono">
                        {children}
                      </code>
                    )
                  }
                  return (
                    <code className="bg-slate-100 text-rose-600 rounded px-1 py-0.5 text-xs font-mono">
                      {children}
                    </code>
                  )
                },
                // 代码块外层 pre（react-markdown 默认 pre>code 结构，这里简化为直接由 code 渲染）
                pre: ({ children }) => <pre className="my-2">{children}</pre>,
                // 表格
                table: ({ children }) => (
                  <div className="overflow-x-auto my-2">
                    <table className="min-w-full text-xs border border-slate-200 rounded">
                      {children}
                    </table>
                  </div>
                ),
                thead: ({ children }) => (
                  <thead className="bg-slate-50 text-slate-700">{children}</thead>
                ),
                tbody: ({ children }) => <tbody className="divide-y divide-slate-100">{children}</tbody>,
                tr: ({ children }) => <tr className="hover:bg-slate-50">{children}</tr>,
                th: ({ children }) => (
                  <th className="px-2 py-1 text-left font-semibold border-b border-slate-200">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="px-2 py-1 border-b border-slate-100">{children}</td>
                ),
                // 水平线
                hr: () => <hr className="my-3 border-slate-200" />,
                // 任务列表项（GFM）
                input: ({ checked, ...rest }) => (
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled
                    className="mr-1.5 align-middle"
                    {...rest}
                  />
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  )
}
