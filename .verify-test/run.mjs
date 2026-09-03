// 重构后冒烟测试：mcp.js 全链路 + 薄路由层 api/*.js + 导入图无 onRequest 污染
import { execSync } from 'node:child_process'
import { readdirSync } from 'node:fs'

let passed = 0, failed = 0
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`PASS ${name}`) }
  else { failed++; console.log(`FAIL ${name}: ${detail}`) }
}

const mcpApi = (await import('./node-functions/api/mcp.js')).default
const ENV = { ADMIN_PASSWORD: 'test-pwd-123' }
const AUTH = { 'X-Admin-Password': 'test-pwd-123' }

async function post(body, headers = {}) {
  const request = new Request('https://example.com/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  const resp = await mcpApi({ request, env: ENV })
  const j = await resp.json()
  console.log(`  [debug] id=${body.id} ${body.method}${body.params?.name ? '/' + body.params.name : ''} ->`, j.result ? (j.result.isError ? 'isError' : 'ok') : JSON.stringify(j).slice(0, 200))
  return new Response(JSON.stringify(j), { status: resp.status })
}

// 1. initialize
{
  const resp = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } })
  const json = await resp.json()
  check('initialize', json.result?.serverInfo?.name === 'pai-schedule-mcp', JSON.stringify(json).slice(0, 200))
}

// 2. 端到端：course → student → schedule → 查询（走 _lib/h-* 新导入链）
{
  await post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'add_course', arguments: { name: '围棋入门', defaultStartTime: '09:00', defaultEndTime: '10:30', color: 'blue' } } }, AUTH)
  await post({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'add_student', arguments: { name: '张伟' } } }, AUTH)
  const rc = await post({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'list_courses', arguments: {} } }, AUTH)
  const rcJson = await rc.json()
  if (!rcJson.result?.content) { console.log('list_courses 原始响应:', JSON.stringify(rcJson).slice(0, 500)) }
  const tc = rcJson.result.content[0].text
  const course = JSON.parse(tc.slice(tc.indexOf('{'))).courses[0]
  const rs = await post({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'list_students', arguments: {} } })
  const rsJson = await rs.json()
  if (!rsJson.result?.content) { console.log('list_students 原始响应:', JSON.stringify(rsJson).slice(0, 500)) }
  const ts = rsJson.result.content[0].text
  const student = JSON.parse(ts.slice(ts.indexOf('{'))).students[0]
  const r3 = await post({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'add_schedule', arguments: { schedule: { studentId: student.id, courseId: course.id, date: '2026-09-05', startTime: '09:00', endTime: '10:30' } } } }, AUTH)
  const j3 = await r3.json()
  const t3 = j3.result?.content?.[0]?.text || ''
  check('add_schedule（_lib 新链路）', j3.result?.isError !== true && t3.includes('张伟') && t3.includes('围棋入门'), t3.slice(0, 300))

  const r4 = await post({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'search_schedules', arguments: { startDate: '2026-09-01', endDate: '2026-09-30' } } }, AUTH)
  const j4 = await r4.json()
  if (!j4.result?.content) { console.log('search_schedules 原始响应:', JSON.stringify(j4).slice(0, 500)) }
  const t4 = j4.result?.content?.[0]?.text || ''
  check('search_schedules', t4.includes('张伟'), t4.slice(0, 300))
}

// 3. 无密码只读可用、写操作拒绝
{
  const r = await post({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'list_students', arguments: {} } })
  const j = await r.json()
  check('无密码只读', j.result?.isError !== true, JSON.stringify(j).slice(0, 200))
  const r2 = await post({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'delete_student', arguments: { id: 'stu_x', confirm: true } } })
  const j2 = await r2.json()
  check('无密码写拒绝', j2.result?.isError === true, JSON.stringify(j2).slice(0, 200))
}

// 4. 薄路由层：api/*.js 语法可加载且 default 导出仍是 onRequest 具名函数
{
  const files = readdirSync('./node-functions/api').filter((f) => f.endsWith('.js') && f !== 'mcp.js')
  let ok = 0
  for (const f of files) {
    const mod = await import(`./node-functions/api/${f}`)
    const fn = mod.default
    if (typeof fn === 'function' && /^onRequest(Get|Post|Put|Delete)?$/.test(fn.name)) ok++
    else console.log(`  api/${f} default.name = ${fn?.name}`)
  }
  check(`薄路由层 16 个 default 导出命名正确（${ok}/16）`, ok === 16)
}

// 5. mcp.js 导入图无 onRequest 函数名污染（grep bundle 静态可判部分）
{
  const out = execSync("grep -rn 'function onRequest' node-functions/_lib/ || true").toString().trim()
  check('_lib 无 onRequest 命名', out === '', out)
}

console.log(`\n结果: ${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
