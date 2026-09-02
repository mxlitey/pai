// 临时 mock 后端：模拟 EdgeOne Functions 的关键端点行为，用于端到端测试
import http from 'node:http'

const PASSWORD = 'test123'
// 登录两次发不同 token：tok-A 被鉴权端拒绝（模拟过期，触发 MCP 重登），tok-B 放行
let loginCount = 0

function send(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(JSON.stringify(data))
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')) } catch { resolve({}) }
    })
  })
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const auth = req.headers['authorization'] || ''

  if (url.pathname === '/api/auth' && req.method === 'POST') {
    const body = await readBody(req)
    if (body.password !== PASSWORD) {
      return send(res, { code: 1, message: '密码错误', data: null }, 401)
    }
    loginCount++
    return send(res, { code: 0, message: 'ok', data: { token: loginCount === 1 ? 'tok-A' : 'tok-B' } })
  }

  if (url.pathname === '/api/auth' && req.method === 'GET') {
    if (auth !== 'Bearer tok-B') return send(res, { code: 401, message: '未登录或登录已过期', data: null }, 401)
    return send(res, { code: 0, message: 'ok', data: { valid: true } })
  }

  // 以下鉴权端点：tok-A 一律 401（模拟过期），tok-B 放行
  if (['/api/courses', '/api/schedules-search'].includes(url.pathname)) {
    if (auth !== 'Bearer tok-B') return send(res, { code: 401, message: '未登录或登录已过期', data: null }, 401)
    if (url.pathname === '/api/courses') {
      return send(res, { code: 0, message: 'ok', data: { courses: [{ id: 'c001', name: '数学' }] } })
    }
    return send(res, { code: 0, message: 'ok', data: { schedules: [], total: 0 } })
  }

  if (url.pathname === '/api/students' && req.method === 'GET') {
    return send(res, { code: 0, message: 'ok', data: { students: [{ id: 's001', name: '张伟' }, { id: 's002', name: '李娜' }] } })
  }

  if (url.pathname === '/api/schedules' && req.method === 'GET') {
    return send(res, { code: 0, message: 'ok', data: { schedules: [{ id: 'sch1', studentId: 's001', studentName: '张伟', courseName: '数学', date: '2026-09-01', startTime: '09:00', endTime: '10:00' }] } })
  }

  if (url.pathname === '/api/announcement' && req.method === 'GET') {
    return send(res, { code: 0, message: 'ok', data: { content: 'hello', updatedAt: '2026-09-01T00:00:00Z' } })
  }

  if (url.pathname === '/api/schedule-add' && req.method === 'POST') {
    if (auth !== 'Bearer tok-B') return send(res, { code: 401, message: '未登录或登录已过期', data: null }, 401)
    return send(res, { code: 0, message: 'ok', data: { created: true, key: 'schedules/s001/2026-09.json', exists: false, schedule: (await readBody(req)).schedule } })
  }

  if (url.pathname === '/api/student-delete' && req.method === 'DELETE') {
    if (auth !== 'Bearer tok-B') return send(res, { code: 401, message: '未登录或登录已过期', data: null }, 401)
    const body = await readBody(req)
    return send(res, { code: 0, message: 'ok', data: { deletedScheduleFiles: 2, studentRemoved: body.studentId === 's001' } })
  }

  send(res, { code: 1, message: `mock 未实现 ${req.method} ${url.pathname}`, data: null }, 404)
})

server.listen(18788, () => console.log('mock ready'))
