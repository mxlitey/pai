import type { ReactNode, RefObject } from 'react'
import { cn } from '@/utils/cn'

interface AdvancedAdminProps {
  // 顶部返回按钮
  onBack: () => void
  // 数据管理
  onSeed: () => void
  onClear: () => void
  busy: boolean
  // JSON 导入
  jsonText: string
  setJsonText: (v: string) => void
  importMode: 'merge' | 'replace'
  setImportMode: (v: 'merge' | 'replace') => void
  fileInputRef: RefObject<HTMLInputElement>
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  onDownloadTemplate: () => void
  onValidate: () => void
  onImport: () => void
  validationResults: string[] | null
  setValidationResults: (v: string[] | null) => void
  // 可选：额外提示节点（如 toast 由父级管理）
  children?: ReactNode
}

export function AdvancedAdmin(props: AdvancedAdminProps) {
  const {
    onBack,
    onSeed,
    onClear,
    busy,
    jsonText,
    setJsonText,
    importMode,
    setImportMode,
    fileInputRef,
    onFileUpload,
    onDownloadTemplate,
    onValidate,
    onImport,
    validationResults,
    setValidationResults,
    children,
  } = props

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
            <h1 className="text-base font-semibold text-slate-800">进阶管理</h1>
          </div>
          <span className="text-xs text-slate-400 hidden sm:block">数据管理 · JSON 导入</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* 危险操作警告横幅 */}
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
          </svg>
          <div className="text-sm text-amber-800">
            <div className="font-semibold mb-1">⚠ 非专业人员禁止操作</div>
            <p className="text-xs leading-relaxed">
              本页面操作将直接修改 Blob 存储中的全局数据，可能导致数据丢失或不可恢复的损坏。
              仅在明确知晓每个操作后果的情况下使用。如不确定，请返回后台管理页使用「新增排课」「编辑排课」等安全操作。
            </p>
          </div>
        </div>

        {/* 数据管理 */}
        <section className="card p-5">
          <h2 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <span className="w-1 h-4 bg-brand-500 rounded"></span>
            数据管理
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 种子数据 */}
            <div className="border border-slate-200 rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-medium text-sm text-slate-700">初始化种子数据</div>
                  <div className="text-xs text-slate-400 mt-1">
                    写入 8 名示例学员及 7 月排课，用于演示验证
                  </div>
                </div>
              </div>
              <button
                onClick={onSeed}
                disabled={busy}
                className="btn-primary w-full mt-2"
              >
                {busy ? '处理中…' : '初始化种子数据'}
              </button>
            </div>

            {/* 清空数据 */}
            <div className="border border-rose-200 rounded-lg p-4 bg-rose-50/30">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-medium text-sm text-rose-700">一键清空所有数据</div>
                  <div className="text-xs text-rose-400 mt-1">
                    删除 Blob 中全部学员与排课，不可恢复
                  </div>
                </div>
              </div>
              <button
                onClick={onClear}
                disabled={busy}
                className="btn w-full mt-2 bg-rose-600 text-white hover:bg-rose-700"
              >
                {busy ? '处理中…' : '清空全部数据'}
              </button>
            </div>
          </div>
        </section>

        {/* JSON 导入 */}
        <section className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <span className="w-1 h-4 bg-brand-500 rounded"></span>
              JSON 数据导入
            </h2>
            <button onClick={onDownloadTemplate} className="btn-ghost text-xs">
              下载模板
            </button>
          </div>

          {/* 导入模式 */}
          <div className="flex items-center gap-4 mb-3">
            <span className="text-sm text-slate-500">导入模式：</span>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                checked={importMode === 'merge'}
                onChange={() => setImportMode('merge')}
                className="accent-brand-500"
              />
              <span>追加合并（按 id 去重覆盖）</span>
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                checked={importMode === 'replace'}
                onChange={() => setImportMode('replace')}
                className="accent-brand-500"
              />
              <span>替换清空后写入</span>
            </label>
          </div>

          {/* 文件上传 + 文本框 */}
          <div className="flex items-center gap-3 mb-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={onFileUpload}
              className="hidden"
            />
            <button onClick={() => fileInputRef.current?.click()} className="btn-ghost border border-slate-200">
              选择 .json 文件
            </button>
            <span className="text-xs text-slate-400">
              或直接在下方粘贴 JSON 内容
            </span>
          </div>

          <textarea
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value)
              setValidationResults(null)
            }}
            placeholder='粘贴 JSON，例如：&#10;{&#10;  "mode": "merge",&#10;  "students": [{ "id": "s001", "name": "张伟" }],&#10;  "schedules": [{ "id": "c0001", "studentId": "s001", "courseName": "数学", "date": "2026-08-03" }]&#10;}'
            className="w-full h-48 px-3 py-2 text-sm font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400 resize-y"
          />

          {/* 校验结果面板 */}
          {validationResults !== null && (
            <div
              className={cn(
                'mt-3 rounded-md border px-3 py-2.5 text-sm',
                validationResults.length === 0
                  ? 'bg-green-50 border-green-200 text-green-700'
                  : 'bg-rose-50 border-rose-200 text-rose-700',
              )}
            >
              {validationResults.length === 0 ? (
                <div>✓ 数据校验通过，可以导入</div>
              ) : (
                <div>
                  <div className="font-medium mb-1">
                    发现 {validationResults.length} 个问题：
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-xs max-h-40 overflow-y-auto">
                    {validationResults.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end mt-3 gap-2">
            <button
              onClick={onValidate}
              disabled={!jsonText.trim()}
              className="btn-ghost border border-slate-200"
            >
              校验数据完整性
            </button>
            <button
              onClick={onImport}
              disabled={busy || !jsonText.trim()}
              className="btn-primary"
            >
              {busy ? '导入中…' : '导入数据'}
            </button>
          </div>
        </section>

        {children}
      </main>
    </div>
  )
}
