// 多语言文案数据（仅公开页：首页 + 日历视图）
// 后台管理页暂不纳入多语言，保持中文

export type Lang = 'zh' | 'en'

// 中文文案为 key 来源
export const zh = {
  // 页脚
  footerText: '排课系统',
  // 语言切换按钮
  switchLang: '切换语言',
  // 首页
  homeViewSchedule: '查看排课',
  homeViewScheduleDisabled: '请先搜索并选中学员',
  homeViewScheduleEnabled: '查看「{name}」的排课',
  homeAdmin: '后台管理',
  // 搜索框
  searchPlaceholder: '输入学员姓名搜索排课…',
  searchNoResult: '未找到匹配的学员',
  // 日历顶栏 / 状态
  appBackHome: '返回首页',
  appStatCount: '排课',
  appStatCourses: '课程',
  appEmptyTitle: '请在上方搜索栏输入学员姓名，查看排课日历',
  appEmptyHint: '支持精确查询与模糊搜索',
  appLoading: '加载排课数据…',
  appLoadError: '加载失败',
  appLoadErrorDetail: '加载排课数据失败',
  appAnnTitle: '公告',
  appAnnGotIt: '我知道了',
  // 日历工具栏
  toolbarMonth: '月',
  toolbarWeek: '周',
  toolbarDay: '日',
  toolbarThisMonth: '本月',
  toolbarToday: '今天',
  toolbarPrevWeek: '上一周',
  toolbarThisWeek: '本周',
  toolbarNextWeek: '下一周',
  toolbarPrevAria: '上一个',
  toolbarNextAria: '下一个',
  // 星期表头前缀（zh 用「周」，en 为空直接显示周几英文缩写）
  weekHeaderPrefix: '周',
  // 月视图
  monthLessonShort: '节',
  monthMore: '更多',
  monthSwipe: '← 左右滑动查看更多日期 →',
  // 周视图
  weekTabHint: '点击下方日期切换查看',
  weekDotLegend: '表示当天有排课',
  weekNoClass: '无课',
  weekTotalLessons: '共 {n} 节课',
  weekNoSchedule: '今日无排课',
  // 日视图
  dayMorning: '上午',
  dayAfternoon: '下午',
  dayEvening: '晚上',
  dayTotalLessons: '共 {n} 节课',
  dayLessonShort: '节',
  dayNoSchedule: '今日无排课',
  // 排课卡片
  cardAttended: '到课',
  cardAbsent: '缺勤',
  // 排课详情
  detailTitle: '排课详情',
  detailCourseName: '课程名称',
  detailDate: '日期',
  detailTime: '时间',
  detailAttendance: '到课状态',
  detailStudentName: '学员姓名',
  detailNote: '备注',
  detailClose: '关闭',
  detailAttended: '到课',
  detailAbsent: '缺勤',
  detailNone: '未点名',
  // 公告
  annTitle: '公告',
  // 公开接口错误
  apiNetworkError: '网络请求失败，请检查网络连接',
  apiServerError: '服务暂不可用，请稍后重试',
  apiRequestFailed: '请求失败',
} as const

export type MessageKey = keyof typeof zh

export const en: Record<MessageKey, string> = {
  footerText: 'Schedule System',
  switchLang: 'Switch language',
  homeViewSchedule: 'View Schedule',
  homeViewScheduleDisabled: 'Search and select a student first',
  homeViewScheduleEnabled: 'View schedule for "{name}"',
  homeAdmin: 'Admin',
  searchPlaceholder: 'Search student name for schedule…',
  searchNoResult: 'No matching student found',
  appBackHome: 'Back to Home',
  appStatCount: 'Schedules',
  appStatCourses: 'Courses',
  appEmptyTitle: 'Search a student name above to view their schedule',
  appEmptyHint: 'Supports exact and fuzzy search',
  appLoading: 'Loading schedule…',
  appLoadError: 'Loading failed',
  appLoadErrorDetail: 'Failed to load schedule data',
  appAnnTitle: 'Announcement',
  appAnnGotIt: 'Got it',
  toolbarMonth: 'Month',
  toolbarWeek: 'Week',
  toolbarDay: 'Day',
  toolbarThisMonth: 'This Month',
  toolbarToday: 'Today',
  toolbarPrevWeek: 'Prev Week',
  toolbarThisWeek: 'This Week',
  toolbarNextWeek: 'Next Week',
  toolbarPrevAria: 'Previous',
  toolbarNextAria: 'Next',
  weekHeaderPrefix: '',
  monthLessonShort: '',
  monthMore: 'more',
  monthSwipe: '← Swipe to see more dates →',
  weekTabHint: 'Tap a date below to switch',
  weekDotLegend: 'shows scheduled courses',
  weekNoClass: 'No classes',
  weekTotalLessons: '{n} classes total',
  weekNoSchedule: 'No schedule today',
  dayMorning: 'Morning',
  dayAfternoon: 'Afternoon',
  dayEvening: 'Evening',
  dayTotalLessons: '{n} classes total',
  dayLessonShort: '',
  dayNoSchedule: 'No schedule today',
  cardAttended: 'Attended',
  cardAbsent: 'Absent',
  detailTitle: 'Schedule Detail',
  detailCourseName: 'Course',
  detailDate: 'Date',
  detailTime: 'Time',
  detailAttendance: 'Attendance',
  detailStudentName: 'Student',
  detailNote: 'Note',
  detailClose: 'Close',
  detailAttended: 'Attended',
  detailAbsent: 'Absent',
  detailNone: 'Not marked',
  annTitle: 'Announcement',
  apiNetworkError: 'Network request failed. Check your connection',
  apiServerError: 'Service unavailable. Try again later',
  apiRequestFailed: 'Request failed',
}

// 星期标签（周一为一周起点），用于月/周视图表头
export const WEEKDAY_LABELS: Record<Lang, string[]> = {
  zh: ['一', '二', '三', '四', '五', '六', '日'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
}