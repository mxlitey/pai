import { useState, useEffect, useCallback } from 'react'
import type { Student, Course } from '@/types'
import { searchStudents, getAnnouncement } from '@/api'
import {
  verifyAuth,
  saveAnnouncement,
  deleteStudent,
  addStudent,
  updateStudent,
  listCourses,
  addCourse,
  updateCourse,
  deleteCourse,
  searchSchedules,
  getToken,
  clearToken,
} from '@/api/admin'
import { AnnouncementAdmin } from './AnnouncementAdmin'
import { ShareLinksAdmin } from './ShareLinksAdmin'
import { StudentAdmin } from './StudentAdmin'
import { CourseAdmin } from './CourseAdmin'
import { ScheduleAdmin } from './ScheduleAdmin'
import { AttendanceAdmin } from './AttendanceAdmin'
import { DashboardAdmin } from './DashboardAdmin'
import { AdminLogin } from './AdminLogin'
import { cn } from '@/utils/cn'

interface AdminPanelProps {
  onExit: () => void
}

type Toast = { type: 'success' | 'error' | 'info'; message: string } | null

// 后台子页面类型：null 表示后台主页，其他值表示对应二级页面
type SubPage =
  | 'students'
  | 'courses'
  | 'schedules'
  | 'attendance'
  | 'announcement'
  | 'shareLinks'
  | 'dashboard'
  | null

// 从 URL hash 解析当前子页面：#admin/students → 'students'
function readSubPageFromHash(): SubPage {
  try {
    const hash = window.location.hash
    if (!hash.startsWith('#admin')) return null
    const parts = hash.split('/')
    const sub = parts[1]
    if (!sub) return null
    const valid: SubPage[] = [
      'students',
      'courses',
      'schedules',
      'attendance',
      'announcement',
      'shareLinks',
      'dashboard',
    ]
    return valid.includes(sub as SubPage) ? (sub as SubPage) : null
  } catch {
    return null
  }
}

// 后台首页入口图标（stroke 风格 SVG）
function EntryGlyph({ d }: { d: string }) {
  return (
    <svg
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  )
}

// 后台首页入口配置：数据驱动渲染，新增入口只需在此追加
const HOME_ENTRIES: {
  key: SubPage
  title: string
  desc: string
  action: string
  icon: string
}[] = [
  {
    key: 'students',
    title: '学员管理',
    desc: '查看和管理学员数据',
    action: '进入学员管理',
    icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  },
  {
    key: 'courses',
    title: '课程管理',
    desc: '查看和管理课程数据',
    action: '进入课程管理',
    icon: 'M12 6.253v13m0-13C10 5.006 7.728 4 5 4c-.708 0-1.37.126-2 .367v13.266C4.63 17.126 5.292 17 6 17c2.728 0 5 1.006 7 2.253M12 6.253C14 5.006 16.272 4 19 4c.708 0 1.37.126 2 .367v13.266c-.63-.241-1.292-.367-2-.367-2.728 0-5 1.006-7 2.253',
  },
  {
    key: 'schedules',
    title: '排课管理',
    desc: '查看和管理排课数据',
    action: '进入排课管理',
    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  },
  {
    key: 'attendance',
    title: '点名管理',
    desc: '查看和管理点名状态',
    action: '进入点名管理',
    icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    key: 'announcement',
    title: '公告管理',
    desc: '查看和管理公告内容',
    action: '进入公告管理',
    icon: 'M3 10h18M7 15h2m4 0h4m-9-8h12a2 2 0 012 2v8a2 2 0 01-2 2H9a2 2 0 01-2-2V9a2 2 0 012-2z',
  },
  {
    key: 'shareLinks',
    title: '分享链接',
    desc: '查看和生成分享链接',
    action: '进入分享链接',
    icon: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.38-4.727a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1',
  },
  {
    key: 'dashboard',
    title: '看板数据',
    desc: '查看看板数据',
    action: '进入看板数据',
    icon: 'M3 13h4v8H3v-8zm7-9h4v17h-4V4zm7 5h4v12h-4V9z',
  },
]

// 写入子页面到 URL hash：#admin 或 #admin/students
function writeSubPageToHash(sub: SubPage) {
  try {
    const url = new URL(window.location.href)
    url.hash = sub ? `admin/${sub}` : 'admin'
    window.history.replaceState({}, '', url.toString())
  } catch {
    // 忽略
  }
}

export function AdminPanel({ onExit }: AdminPanelProps) {
  // 登录状态：进入时调用后端校验 token，不依赖 localStorage 是否存在 token
  const [authed, setAuthed] = useState<boolean>(false)
  const [checking, setChecking] = useState<boolean>(true)
  const [students, setStudents] = useState<Student[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  // 学员 → 有排课记录的课程列表（课程名去重，用于学员管理页徽章展示）
  const [studentCourses, setStudentCourses] = useState<Map<string, { name: string; color?: string }[]>>(
    new Map(),
  )

  // 操作状态
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<Toast>(null)

  // 公告设置（公告管理页编辑 + 保存）
  const [announcementText, setAnnouncementText] = useState('')
  const [announcementUpdatedAt, setAnnouncementUpdatedAt] = useState('')

  // 当前激活的二级页面：初始值从 URL hash 恢复，避免刷新时丢失
  const [activeSubPage, setActiveSubPage] = useState<SubPage>(() =>
    readSubPageFromHash(),
  )

  // 切换子页面：同时更新 URL hash
  const goSubPage = (sub: SubPage) => {
    setActiveSubPage(sub)
    writeSubPageToHash(sub)
  }

  // 显示 toast
  const showToast = (type: NonNullable<Toast>['type'], message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3500)
  }

  // 统一错误处理：401 时清除 token 并回到登录页
  const handleApiError = (e: Error) => {
    const msg = e.message || ''
    if (msg.includes('未登录') || msg.includes('登录已过期') || msg.includes('401')) {
      clearToken()
      setAuthed(false)
    }
    showToast('error', msg.includes('请求失败') ? msg : '请求失败：' + msg)
  }

  // 加载学员列表（后台默认展示全部）
  const loadStudents = useCallback(async () => {
    try {
      const list = await searchStudents('')
      setStudents(list)
    } catch (e) {
      showToast('error', '加载学员列表失败：' + (e as Error).message)
    }
  }, [])

  // 加载课程列表
  const loadCourses = useCallback(async () => {
    try {
      const result = await listCourses()
      if (result.code === 0) {
        setCourses(result.data.courses)
      }
    } catch (e) {
      // 课程加载失败不阻塞主流程
      console.error('加载课程列表失败:', e)
    }
  }, [])

  // 加载全量排课并构建 学员→课程 映射（课程名去重，保留颜色）
  const loadStudentCourses = useCallback(async () => {
    try {
      const result = await searchSchedules({})
      if (result.code !== 0) return
      const map = new Map<string, { name: string; color?: string }[]>()
      for (const sch of result.data.schedules) {
        let list = map.get(sch.studentId)
        if (!list) {
          list = []
          map.set(sch.studentId, list)
        }
        if (!list.some((c) => c.name === sch.courseName)) {
          list.push({ name: sch.courseName, color: sch.color || undefined })
        }
      }
      setStudentCourses(map)
    } catch (e) {
      // 加载失败不阻塞学员管理页，仅徽章缺省
      console.error('加载学员课程失败:', e)
    }
  }, [])

  // 进入管理页时调用后端校验 token 有效性
  // 防止攻击者在 localStorage 写入伪造 token 绕过前端登录页
  useEffect(() => {
    let cancelled = false
    async function checkAuth() {
      if (!getToken()) {
        setChecking(false)
        setAuthed(false)
        return
      }
      try {
        const result = await verifyAuth()
        if (cancelled) return
        if (result.code === 0) {
          setAuthed(true)
        } else {
          setAuthed(false)
        }
      } catch {
        if (!cancelled) setAuthed(false)
      } finally {
        if (!cancelled) setChecking(false)
      }
    }
    checkAuth()
    return () => {
      cancelled = true
    }
  }, [])

  // 鉴权通过后再加载数据
  useEffect(() => {
    if (!authed) return
    loadStudents()
    loadCourses()
  }, [authed, loadStudents, loadCourses])

  // 进入学员管理页时加载学员课程映射（排课可能在排课管理页发生变化，每次进入刷新）
  useEffect(() => {
    if (authed && activeSubPage === 'students') loadStudentCourses()
  }, [authed, activeSubPage, loadStudentCourses])

  // 公告：进入公告管理页时加载当前内容
  const handleLoadAnnouncement = useCallback(async () => {
    try {
      const info = await getAnnouncement()
      setAnnouncementText(info.content)
      setAnnouncementUpdatedAt(info.updatedAt)
    } catch {
      // 加载失败不阻塞，保留空内容供管理员写入
    }
  }, [])

  // 公告：保存
  const handleSaveAnnouncement = async () => {
    setBusy(true)
    try {
      const result = await saveAnnouncement(announcementText)
      if (result.code === 0) {
        setAnnouncementUpdatedAt(result.data.updatedAt)
        showToast('success', '公告已保存')
      } else {
        showToast('error', result.message)
      }
    } catch (e) {
      handleApiError(e as Error)
    } finally {
      setBusy(false)
    }
  }

  // 删除学员及其所有排课
  const handleDeleteStudent = async (student: Student) => {
    const step1 = confirm(
      `⚠ 确认删除学员「${student.name}」(${student.id})？\n` +
      `该操作将同时删除该学员的所有排课数据，且不可恢复！`,
    )
    if (!step1) return
    const step2 = confirm('再次确认：真的要删除该学员及其全部排课吗？')
    if (!step2) return
    setBusy(true)
    try {
      const result = await deleteStudent(student.id)
      if (result.code === 0) {
        const msg = result.data.studentRemoved
          ? `已删除学员及 ${result.data.deletedScheduleFiles} 个排课文件`
          : '学员不存在（已清理残留排课文件）'
        showToast('success', msg)
        await loadStudents()
      } else {
        showToast('error', result.message)
      }
    } catch (e) {
      handleApiError(e as Error)
    } finally {
      setBusy(false)
    }
  }

  // 新增学员
  // 返回 true 表示新增成功（弹窗可关闭），false 表示失败（保持弹窗）
  const handleAddStudent = async (student: Student): Promise<boolean> => {
    setBusy(true)
    try {
      const result = await addStudent(student)
      if (result.code === 0) {
        showToast('success', `学员「${student.name}」已新增`)
        await loadStudents()
        return true
      }
      showToast('error', result.message)
      return false
    } catch (e) {
      handleApiError(e as Error)
      return false
    } finally {
      setBusy(false)
    }
  }

  // 更新学员（若姓名变更，后端会级联更新排课中的 studentName）
  const handleUpdateStudent = async (student: Student): Promise<boolean> => {
    setBusy(true)
    try {
      const result = await updateStudent(student)
      if (result.code === 0) {
        showToast('success', result.message)
        await loadStudents()
        return true
      }
      showToast('error', result.message)
      return false
    } catch (e) {
      handleApiError(e as Error)
      return false
    } finally {
      setBusy(false)
    }
  }

  // 新增课程
  const handleAddCourse = async (course: Course): Promise<boolean> => {
    setBusy(true)
    try {
      const result = await addCourse(course)
      if (result.code === 0) {
        showToast('success', `课程「${course.name}」已新增`)
        await loadCourses()
        return true
      }
      showToast('error', result.message)
      return false
    } catch (e) {
      handleApiError(e as Error)
      return false
    } finally {
      setBusy(false)
    }
  }

  // 更新课程
  const handleUpdateCourse = async (course: Course): Promise<boolean> => {
    setBusy(true)
    try {
      const result = await updateCourse(course)
      if (result.code === 0) {
        showToast('success', `课程「${course.name}」已更新`)
        await loadCourses()
        return true
      }
      showToast('error', result.message)
      return false
    } catch (e) {
      handleApiError(e as Error)
      return false
    } finally {
      setBusy(false)
    }
  }

  // 删除课程（同时删除关联排课）
  const handleDeleteCourse = async (course: Course) => {
    const step1 = confirm(
      `⚠ 确认删除课程「${course.name}」(${course.id})？\n` +
      `该操作将同时删除该课程的所有关联排课记录，且不可恢复！`,
    )
    if (!step1) return
    const step2 = confirm('再次确认：真的要删除该课程及其全部排课吗？')
    if (!step2) return
    setBusy(true)
    try {
      const result = await deleteCourse(course.id)
      if (result.code === 0) {
        const msg = result.data.courseRemoved
          ? `已删除课程及 ${result.data.deletedScheduleCount} 条关联排课`
          : '课程不存在'
        showToast('success', msg)
        await loadCourses()
      } else {
        showToast('error', result.message)
      }
    } catch (e) {
      handleApiError(e as Error)
    } finally {
      setBusy(false)
    }
  }

  // 校验中：显示加载状态
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-sm text-slate-500 flex items-center gap-2">
          <svg className="animate-spin w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          校验登录状态…
        </div>
      </div>
    )
  }

  // 未登录：渲染登录页
  if (!authed) {
    return (
      <AdminLogin
        onSuccess={() => setAuthed(true)}
        onExit={onExit}
      />
    )
  }

  // 公告管理二级页面
  if (activeSubPage === 'announcement') {
    return (
      <>
        <AnnouncementAdmin
          onBack={() => goSubPage(null)}
          busy={busy}
          announcementText={announcementText}
          setAnnouncementText={setAnnouncementText}
          announcementUpdatedAt={announcementUpdatedAt}
          onSaveAnnouncement={handleSaveAnnouncement}
        />
        {toast && <ToastView toast={toast} />}
      </>
    )
  }

  // 分享链接二级页面
  if (activeSubPage === 'shareLinks') {
    return (
      <>
        <ShareLinksAdmin
          students={students}
          onBack={() => goSubPage(null)}
        />
        {toast && <ToastView toast={toast} />}
      </>
    )
  }

  // 学员管理二级页面
  if (activeSubPage === 'students') {
    return (
      <>
        <StudentAdmin
          students={students}
          studentCourses={studentCourses}
          busy={busy}
          onBack={() => goSubPage(null)}
          onDelete={handleDeleteStudent}
          onAdd={handleAddStudent}
          onUpdate={handleUpdateStudent}
        />
        {toast && <ToastView toast={toast} />}
      </>
    )
  }

  // 课程管理二级页面
  if (activeSubPage === 'courses') {
    return (
      <>
        <CourseAdmin
          courses={courses}
          busy={busy}
          onBack={() => goSubPage(null)}
          onDelete={handleDeleteCourse}
          onAdd={handleAddCourse}
          onUpdate={handleUpdateCourse}
        />
        {toast && <ToastView toast={toast} />}
      </>
    )
  }

  // 排课管理二级页面
  if (activeSubPage === 'schedules') {
    return (
      <>
        <ScheduleAdmin
          students={students}
          courses={courses}
          onBack={() => goSubPage(null)}
          onToast={showToast}
          onRefreshStudents={loadStudents}
        />
        {toast && <ToastView toast={toast} />}
      </>
    )
  }

  // 点名管理二级页面
  if (activeSubPage === 'attendance') {
    return (
      <>
        <AttendanceAdmin
          onBack={() => goSubPage(null)}
          onToast={showToast}
        />
        {toast && <ToastView toast={toast} />}
      </>
    )
  }

  // 排课数据看板二级页面
  if (activeSubPage === 'dashboard') {
    return (
      <>
        <DashboardAdmin
          onBack={() => goSubPage(null)}
          onToast={showToast}
        />
        {toast && <ToastView toast={toast} />}
      </>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* 顶部栏 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-semibold text-slate-800">后台管理</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                clearToken()
                setAuthed(false)
              }}
              className="btn-ghost"
              title="退出登录"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="hidden sm:inline">退出登录</span>
            </button>
            <button onClick={onExit} className="btn-ghost">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span className="hidden sm:inline">返回首页</span>
            </button>
          </div>
        </div>
      </header>

      {/* Toast */}
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 animate-[fadeIn_0.2s]">
          <div
            className={cn(
              'px-4 py-2.5 rounded-lg shadow-lg text-sm text-white',
              toast.type === 'success' && 'bg-green-600',
              toast.type === 'error' && 'bg-rose-600',
              toast.type === 'info' && 'bg-slate-700',
            )}
          >
            {toast.message}
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {/* 入口卡片：手机单列，平板两列，桌面三列 */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {HOME_ENTRIES.map((entry) => {
            const { key, title, desc, action, icon } = entry
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  // 公告页进入前需先加载当前公告内容
                  if (key === 'announcement') handleLoadAnnouncement()
                  goSubPage(key)
                }}
                className="card p-5 text-left group flex items-center gap-4 hover:shadow-md hover:shadow-slate-200 transition-shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                <span className="flex-none w-11 h-11 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center group-hover:bg-brand-100 transition-colors">
                  <EntryGlyph d={icon} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-base font-semibold text-slate-800">
                    {title}
                  </span>
                  <span className="block text-xs text-slate-500 mt-0.5">
                    {desc}
                  </span>
                </span>
                <span className="flex-none text-brand-500 group-hover:translate-x-0.5 transition-transform">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 5l7 7-7 7" />
                  </svg>
                </span>
                <span className="sr-only">{action}</span>
              </button>
            )
          })}
        </div>
      </main>
    </div>
  )
}

// Toast 视图组件（二级页面复用）
function ToastView({ toast }: { toast: NonNullable<Toast> }) {
  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 animate-[fadeIn_0.2s]">
      <div
        className={cn(
          'px-4 py-2.5 rounded-lg shadow-lg text-sm text-white',
          toast.type === 'success' && 'bg-green-600',
          toast.type === 'error' && 'bg-rose-600',
          toast.type === 'info' && 'bg-slate-700',
        )}
      >
        {toast.message}
      </div>
    </div>
  )
}
