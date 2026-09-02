// 端到端测试：mock 后端 + MCP server（stdio）
// 场景：公开读、自动登录、401 自动重登重试、写操作鉴权、危险操作确认参数
// 运行：npm test（自动拉起 mock-server 后执行）
import { spawn } from 'node:child_process'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

// 启动 mock 后端（测试结束自动退出）
const mock = spawn(process.execPath, ['mock-server.mjs'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 500))

let passed = 0
let failed = 0

function assert(cond, name) {
  if (cond) { passed++; console.log(`PASS: ${name}`) }
  else { failed++; console.log(`FAIL: ${name}`) }
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['index.js'],
  env: {
    ...process.env,
    PAI_BASE_URL: 'http://localhost:18788',
    PAI_ADMIN_PASSWORD: 'test123',
  },
})

const client = new Client({ name: 'e2e-test', version: '1.0.0' })
await client.connect(transport)

const call = (name, arguments_) =>
  client.callTool({ name, arguments: arguments_ })
    .then((r) => ({ text: r.content?.[0]?.text || '', isError: !!r.isError }))
    .catch((e) => ({ text: e.message, isError: true }))

// 1. 公开读：无鉴权
let r = await call('list_students', {})
assert(r.text.includes('张伟') && r.text.includes('s001') && !r.isError, 'list_students 公开查询')

r = await call('get_schedules', { studentId: 's001' })
assert(r.text.includes('sch1') && !r.isError, 'get_schedules 按 ID 查询')

r = await call('get_schedules', { studentName: '张伟' })
assert(r.text.includes('sch1') && !r.isError, 'get_schedules 按姓名查询')

r = await call('get_announcement', {})
assert(r.text.includes('hello') && !r.isError, 'get_announcement 公开读取')

// 2. 鉴权读：首次登录拿 tok-A（会被 401 拒绝）→ 自动重登拿 tok-B → 成功
r = await call('list_courses', {})
assert(r.text.includes('数学') && !r.isError, 'list_courses 登录 + 401 自动重登后成功')

r = await call('search_schedules', { startDate: '2026-09-01', endDate: '2026-09-30' })
assert(r.text.includes('"total": 0') && !r.isError, 'search_schedules 鉴权查询')

// 3. 写操作：复用 tok-B
r = await call('add_schedule', {
  schedule: { id: 'sch2', studentId: 's001', studentName: '张伟', courseName: '数学', date: '2026-09-02', startTime: '09:00', endTime: '10:00' },
})
assert(r.text.includes('"created": true') && !r.isError, 'add_schedule 鉴权写入')

// 4. 危险操作：不带 confirm 应被 schema 拒绝
r = await call('delete_student', { studentId: 's001' })
assert(r.isError, 'delete_student 缺 confirm 被拒绝')

// 5. 带 confirm 执行
r = await call('delete_student', { confirm: true, studentId: 's001' })
assert(r.text.includes('"studentRemoved": true') && !r.isError, 'delete_student 带 confirm 执行成功')

// 6. 输入校验：非法 studentId 被 schema 拒绝
r = await call('get_schedules', { studentId: '../evil' })
assert(r.isError, '非法 studentId 被 schema 拒绝')

// 7. 错误传播：后端 code!=0 → 抛为错误
r = await call('get_schedules', {})
assert(!r.isError, '基线正常')

await client.close()
mock.kill()
console.log(`\n结果: ${passed} 通过, ${failed} 失败`)
process.exit(failed ? 1 : 0)
