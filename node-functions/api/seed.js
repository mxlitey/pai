// 种子数据初始化 API
// POST /api/seed 或 GET /api/seed -> 写入示例学员与排课数据到 Blob 存储
import {
  saveStudents,
  saveSchedulesByMonth,
  json,
} from '../_lib/store.js'
import { getSeedData } from '../_lib/seed-data.js'
import { requireAuth } from '../_lib/auth.js'

async function handleSeed() {
  const { students, schedulesByStudentMonth } = getSeedData()

  // 写入学员列表
  await saveStudents(students)

  // 按学员+月份写入排课
  let totalSchedules = 0
  for (const [key, schedules] of Object.entries(schedulesByStudentMonth)) {
    const [studentId, month] = key.split('/')
    await saveSchedulesByMonth(studentId, month, schedules)
    totalSchedules += schedules.length
  }

  return json({
    code: 0,
    message: '种子数据初始化成功',
    data: {
      studentCount: students.length,
      scheduleCount: totalSchedules,
      monthFiles: Object.keys(schedulesByStudentMonth).length,
    },
  })
}

// 仅支持 POST 触发（需鉴权）
// 不接受 GET：避免被浏览器预取、爬虫、缓存中间件意外触发状态变更
export default async function onRequest(context) {
  const authFail = await requireAuth(context)
  if (authFail) return authFail
  const { request } = context
  if (request.method === 'POST') {
    return handleSeed()
  }
  return json({ code: 1, message: '不支持的请求方法，请使用 POST', data: null }, 405)
}
