// 引导页：首次部署时创建超级管理员账号
// 仅在系统未初始化（admin 表为空）时由 AdminPanel 渲染
import { useState } from 'react'
import { bootstrapSuperAdmin } from '@/api/admin'

interface BootstrapProps {
  onSuccess: () => void
  onExit: () => void
}

// 密码强度评估：返回 0-4，越高越强
function passwordStrength(pwd: string): number {
  let score = 0
  if (pwd.length >= 6) score++
  if (pwd.length >= 10) score++
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++
  if (/\d/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score++
  return Math.min(score, 4)
}

const STRENGTH_LABELS = ['很弱', '弱', '一般', '较强', '强']
const STRENGTH_COLORS = [
  'bg-slate-200',
  'bg-rose-400',
  'bg-amber-400',
  'bg-blue-400',
  'bg-green-500',
]

export function Bootstrap({ onSuccess, onExit }: BootstrapProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const strength = passwordStrength(password)
  const canSubmit =
    password.length >= 6 &&
    password === confirmPassword &&
    !loading

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) {
      if (password.length < 6) {
        setError('密码至少 6 位')
      } else if (password !== confirmPassword) {
        setError('两次输入的密码不一致')
      }
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await bootstrapSuperAdmin(password, confirmPassword)
      if (result.code === 0) {
        onSuccess()
      } else {
        setError(result.message || '创建失败')
      }
    } catch (e) {
      setError('请求失败：' + (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-md">
        {/* 头部 */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-brand-500 flex items-center justify-center text-white mb-4">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-slate-800">系统初始化</h1>
          <p className="text-sm text-slate-500 mt-1.5">
            首次使用，请创建超级管理员账号
          </p>
        </div>

        {/* 提示卡片 */}
        <div className="card p-4 mb-4 bg-amber-50 border-amber-200">
          <div className="flex gap-2.5 text-sm text-amber-700">
            <svg
              className="w-5 h-5 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="space-y-1">
              <p className="font-medium">安全提示</p>
              <ul className="text-xs space-y-0.5 text-amber-600">
                <li>· 超管密码用于登录后台管理系统</li>
                <li>· 请妥善保管，密码丢失后需重置数据库恢复</li>
                <li>· 创建成功后此页面将自动关闭</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          {/* 密码 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              设置超管密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError('')
              }}
              placeholder="至少 6 位"
              autoFocus
              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
            />
            {/* 密码强度指示器 */}
            {password && (
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 flex gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        i < strength ? STRENGTH_COLORS[strength] : 'bg-slate-100'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-xs text-slate-400 w-8 text-right">
                  {STRENGTH_LABELS[strength]}
                </span>
              </div>
            )}
          </div>

          {/* 确认密码 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              确认密码
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value)
                setError('')
              }}
              placeholder="再次输入密码"
              className={`w-full px-4 py-2.5 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent ${
                confirmPassword && confirmPassword !== password
                  ? 'border-rose-300'
                  : 'border-slate-200'
              }`}
            />
            {confirmPassword && confirmPassword !== password && (
              <p className="text-xs text-rose-500 mt-1.5">两次输入的密码不一致</p>
            )}
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-md px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '创建中…' : '创建超管账号'}
          </button>

          <button type="button" onClick={onExit} className="btn-ghost w-full">
            返回首页
          </button>
        </form>

        <p className="text-center text-xs text-slate-400 mt-4">
          超管用户名固定为 <code className="px-1 py-0.5 bg-slate-100 rounded text-slate-600">admin</code>
        </p>
      </div>
    </div>
  )
}
