// 课程颜色映射
// color key → Tailwind 类名（卡片背景/文字/边框 + 圆点色）
// 用于课程管理选择颜色、日历卡片按课程着色

export interface CourseColorOption {
  key: string
  label: string
  card: string // 卡片样式：bg + text + border
  dot: string // 圆点色：bg
}

// 颜色选项（课程管理选择用）
export const COURSE_COLOR_OPTIONS: CourseColorOption[] = [
  { key: 'blue', label: '蓝色', card: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
  { key: 'green', label: '绿色', card: 'bg-green-50 text-green-700 border-green-200', dot: 'bg-green-500' },
  { key: 'purple', label: '紫色', card: 'bg-purple-50 text-purple-700 border-purple-200', dot: 'bg-purple-500' },
  { key: 'orange', label: '橙色', card: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  { key: 'rose', label: '玫红', card: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
  { key: 'teal', label: '青色', card: 'bg-teal-50 text-teal-700 border-teal-200', dot: 'bg-teal-500' },
  { key: 'amber', label: '琥珀', card: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  { key: 'indigo', label: '靛蓝', card: 'bg-indigo-50 text-indigo-700 border-indigo-200', dot: 'bg-indigo-500' },
  { key: 'cyan', label: '天蓝', card: 'bg-cyan-50 text-cyan-700 border-cyan-200', dot: 'bg-cyan-500' },
  { key: 'pink', label: '粉色', card: 'bg-pink-50 text-pink-700 border-pink-200', dot: 'bg-pink-500' },
]

// key → 颜色选项映射
const COLOR_MAP = new Map(COURSE_COLOR_OPTIONS.map((c) => [c.key, c]))

const DEFAULT_COLOR: CourseColorOption = {
  key: 'slate',
  label: '灰色',
  card: 'bg-slate-50 text-slate-700 border-slate-200',
  dot: 'bg-slate-400',
}

// 获取卡片样式类名：按 color key 匹配，未命中回退灰色
export function getCourseCardClass(color?: string): string {
  return (color && COLOR_MAP.get(color)?.card) || DEFAULT_COLOR.card
}

// 获取圆点色类名：按 color key 匹配，未命中回退灰色
export function getCourseDotClass(color?: string): string {
  return (color && COLOR_MAP.get(color)?.dot) || DEFAULT_COLOR.dot
}
