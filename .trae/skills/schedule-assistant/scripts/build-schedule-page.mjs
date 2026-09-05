// 排课总览页生成器（本地脚本，跨平台，纯渲染零配置）
//
// 渲染模块 renderSchedulePage({schedules, courses, month, makeup?, outFile?, titleOverride?})
// CLI 用法：node build-schedule-page.mjs --month 2026-09 [--makeup 2026-08-13,2026-08-28] [--out 文件名.html] [--title 标题] (--data data.json | < data.json)
//   数据由调用方传入（AI 先通过云端 MCP 工具 search_schedules / list_courses 获取后写入 JSON 文件），
//   JSON 格式：{ "schedules": [...排课记录], "courses": [...课程列表] }
//   来源：--data <文件路径>，或 stdin 管道；HTML 输出到当前工作目录
//
// 考勤矩阵（真实点名数据 attendance 字段）：到课 ● 班型色+浅色底；缺勤 ✕ 红；未点名 ● 班型色无底（旧数据无 attendance 字段按未点名）；无排课 -。
import { writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// ========== 渲染（纯函数：不取数，数据由调用方传入）==========
// 返回 { file: 输出文件绝对路径, summary: 统计摘要文本 }
export function renderSchedulePage({ schedules, courses, month, makeup = [], outFile, titleOverride }) {
  const makeupSet = new Set(makeup)
  const [year, mon] = month.split('-').map(Number)

  // ---------- 颜色 ----------
  // 与前端 src/utils/courseColors.ts 的 COURSE_COLOR_OPTIONS 对齐（10 色 + slate 兜底）
  const COLOR_HEX = {
    blue: { fill: '#EFF6FF', stroke: '#3B82F6', text: '#1D4ED8' },
    green: { fill: '#F0FDF4', stroke: '#22C55E', text: '#15803D' },
    purple: { fill: '#FAF5FF', stroke: '#A855F7', text: '#7E22CE' },
    orange: { fill: '#FFF7ED', stroke: '#F97316', text: '#C2410C' },
    rose: { fill: '#FFF1F2', stroke: '#F43F5E', text: '#BE123C' },
    teal: { fill: '#F0FDFA', stroke: '#14B8A6', text: '#0F766E' },
    amber: { fill: '#FFFBEB', stroke: '#F59E0B', text: '#B45309' },
    indigo: { fill: '#EEF2FF', stroke: '#6366F1', text: '#4338CA' },
    cyan: { fill: '#ECFEFF', stroke: '#06B6D4', text: '#0E7490' },
    pink: { fill: '#FDF2F8', stroke: '#EC4899', text: '#BE185D' },
    slate: { fill: '#F8FAFC', stroke: '#94A3B8', text: '#475569' },
  }
  const colorOf = (key) => COLOR_HEX[key] || COLOR_HEX.slate
  const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')

  // 课程顺序以后端返回顺序为准，颜色取课程自带 color
  const courseOrder = []
  const courseMeta = {}
  for (const c of courses) {
    if (!schedules.some((s) => s.courseName === c.name)) continue
    courseOrder.push(c.name)
    courseMeta[c.name] = colorOf(c.color)
  }
  // 后端课程表里没有的班型（历史数据可能缺 courseId），补进来
  for (const s of schedules) {
    if (!courseMeta[s.courseName]) {
      courseOrder.push(s.courseName)
      courseMeta[s.courseName] = COLOR_HEX.slate
    }
  }

  // ---------- 汇总 ----------
  const dates = [...new Set(schedules.map((s) => s.date))].sort()
  const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const fmtDate = (d) => {
    const [, m, dd] = d.split('-')
    return `${+m}/${+dd} ${WEEKDAYS[new Date(`${d}T00:00:00`).getDay()]}`
  }

  // 学员按班型顺序、再按首次出现顺序排列
  const studentList = []
  for (const cn of courseOrder) {
    for (const s of schedules) {
      if (s.courseName === cn && !studentList.some((x) => x.name === s.studentName)) {
        studentList.push({ name: s.studentName, course: cn })
      }
    }
  }

  // 每个学员的排课按（班型, 日期）聚合出真实点名状态
  // attendance 字段：'attended'=到课 / 'absent'=缺勤 / 缺省或其他值=未点名（旧数据无此字段，兼容为未点名）
  // 同班型同日多条记录（如补课双时段）：聚合优先级 到课 > 缺勤 > 未点名
  const STATUS_RANK = { pending: 0, absent: 1, attended: 2 }
  const attendanceOf = {}
  for (const st of studentList) {
    const m = new Map()
    for (const s of schedules) {
      if (s.studentName !== st.name) continue
      const status = s.attendance === 'attended' ? 'attended' : s.attendance === 'absent' ? 'absent' : 'pending'
      const key = `${s.courseName}|${s.date}`
      if (!m.has(key) || STATUS_RANK[status] > STATUS_RANK[m.get(key)]) m.set(key, status)
    }
    attendanceOf[st.name] = m
  }

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  // ---------- 渲染 ----------
  const cards = dates.map((d) => {
    const day = schedules.filter((s) => s.date === d)
    // 按（班型, 开始, 结束）分组，再按开始时间升序排列；同班型同日不同时段可分成多块
    const groups = new Map()
    for (const s of day) {
      const key = `${s.courseName}|${s.startTime}|${s.endTime}`
      if (!groups.has(key)) groups.set(key, { courseName: s.courseName, startTime: s.startTime, endTime: s.endTime, items: [] })
      groups.get(key).items.push(s)
    }
    const blocks = [...groups.values()]
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map((g) => {
        const m = courseMeta[g.courseName]
        return `<div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px solid #EFEFEA;">
      <span style="flex:0 0 92px;font-size:12px;color:${m.text};font-variant-numeric:tabular-nums;padding-top:1px;">${g.startTime}–${g.endTime}</span>
      <span style="flex:1;min-width:0;font-size:13px;line-height:1.7;">${g.items.map((s) => `<div style="white-space:nowrap;">${s.studentName}</div>`).join('')}</span>
      <span style="flex:0 0 auto;max-width:96px;font-size:11px;color:${m.text};background:${m.fill};border:0.5px solid ${m.stroke};border-radius:5px;padding:1px 7px;line-height:1.4;text-align:center;overflow-wrap:break-word;word-break:break-all;">${g.courseName}</span>
    </div>`
      }).join('')
    return `<div style="background:#fff;border:0.5px solid #E3E2DC;border-radius:12px;padding:14px 16px;">
    <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px;">
      <span style="font-size:15px;font-weight:500;">${fmtDate(d)}</span>
      ${makeupSet.has(d) ? '<span style="font-size:11px;color:#993C1D;background:#FAECE7;border-radius:5px;padding:1px 7px;">补课</span>' : ''}
    </div>
    ${blocks}
  </div>`
  }).join('\n')

  const matrixRows = studentList.map((st) => {
    // 每门课当天独立渲染真实点名状态：到课 ● 班型色+浅色底；缺勤 ✕ 红；未点名 ● 班型色无底；同日多课并排显示
    const cells = dates.map((d) => {
      const marks = []
      for (const cn of courseOrder) {
        const status = attendanceOf[st.name].get(`${cn}|${d}`)
        if (!status) continue
        const m = courseMeta[cn]
        if (status === 'attended') {
          marks.push(`<span class="mark" data-course="${escAttr(cn)}" style="background:${m.fill};border:0.5px solid ${m.stroke};border-radius:4px;padding:0 3px;font-size:12px;line-height:1.5;color:${m.stroke};">●</span>`)
        } else if (status === 'absent') {
          marks.push(`<span class="mark" data-course="${escAttr(cn)}" style="color:#A32D2D;font-size:14px;">✕</span>`)
        } else {
          marks.push(`<span class="mark" data-course="${escAttr(cn)}" style="color:${m.stroke};font-size:14px;">●</span>`)
        }
      }
      if (!marks.length) return `<td style="text-align:center;padding:7px 4px;border-bottom:1px solid #F2F1EC;color:#DDDAD2;">-</td>`
      return `<td style="text-align:center;padding:7px 4px;border-bottom:1px solid #F2F1EC;">
        <div style="display:flex;justify-content:center;gap:3px;white-space:nowrap;">${marks.join('')}</div>
      </td>`
    }).join('')
    const cnt = { attended: 0, absent: 0, pending: 0 }
    for (const v of attendanceOf[st.name].values()) cnt[v]++
    return `<tr>
    <td style="padding:7px 10px 7px 14px;border-bottom:1px solid #F2F1EC;white-space:nowrap;">${st.name}</td>
    ${cells}
    <td style="text-align:center;padding:7px 14px;border-bottom:1px solid #F2F1EC;color:#7A7973;font-size:12px;white-space:nowrap;">${cnt.attended}到·${cnt.absent}缺·${cnt.pending}未</td>
  </tr>`
  }).join('\n')

  const title = titleOverride || `${year}年${mon}月排课看板`
  const mdFmt = (d) => { const [, m, dd] = d.split('-'); return `${+m}/${+dd}` }
  const subParts = [`共 ${dates.length} 天排课`]
  if (makeupSet.size) subParts.push(`${[...makeupSet].sort().map(mdFmt).join(' 与 ')} 为补课`)
  subParts.push(`生成于 ${todayStr}`)
  const subtitle = subParts.join(' · ')
  const fileName = outFile || `${year}年${mon}月排课看板.html`

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 40px 28px 64px; background: #F7F6F2;
    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif;
    color: #2C2C2A; -webkit-font-smoothing: antialiased; }
  .wrap { max-width: 880px; margin: 0 auto; }
  h1 { font-size: 22px; font-weight: 500; margin: 0 0 6px; letter-spacing: .3px; }
  .sub { font-size: 13px; color: #7A7973; margin: 0 0 28px; }
  .stats { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; margin-bottom: 32px; }
  .stat { background: #fff; border: 0.5px solid #E3E2DC; border-radius: 10px; padding: 14px 16px; }
  .stat .k { font-size: 12px; color: #7A7973; margin-bottom: 4px; }
  .stat .v { font-size: 24px; font-weight: 500; letter-spacing: -.5px; }
  h2 { font-size: 15px; font-weight: 500; margin: 32px 0 14px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px; }
  table { width: 100%; border-collapse: collapse; background: #fff;
    border: 0.5px solid #E3E2DC; border-radius: 12px; font-size: 13px; }
  th { font-weight: 500; font-size: 12px; color: #7A7973; padding: 14px 4px 8px; text-align: center; white-space: nowrap; }
  th:first-child { text-align: left; padding-left: 14px; }
  th:last-child { padding: 14px 14px 8px; }
  tbody tr:last-child td { border-bottom: none; padding-bottom: 12px; }
  .legend { display: flex; flex-wrap: wrap; gap: 14px; margin: 0 0 12px; font-size: 12px; color: #5F5E5A; }
  .legend span { display: flex; align-items: center; gap: 6px; }
  .dot { width: 10px; height: 10px; border-radius: 3px; }
  .legend-course { cursor: pointer; padding: 2px 8px; border-radius: 6px; user-select: none; -webkit-user-select: none; transition: background .15s; }
  .legend-course:hover { background: #EFEFEA; }
  .legend-course.active { background: #EFEFEA; box-shadow: inset 0 0 0 0.5px #DDDAD2; }
  .mark { display: inline-block; cursor: pointer; transition: transform .15s ease, opacity .15s ease; }
  .mark.hl { transform: scale(1.35); text-shadow: 0 0 5px currentColor; }
  .mark.dim { opacity: .18; }
  @media (max-width: 600px) { .stats { grid-template-columns: repeat(2, minmax(0,1fr)); } body { padding: 24px 16px 48px; } }
  @media print { body { background: #fff; padding: 0; } .grid { grid-template-columns: repeat(2, 1fr); } }
</style>
</head>
<body>
<div class="wrap">
  <h1>${title}</h1>
  <p class="sub">${subtitle}</p>

  <div class="stats">
    <div class="stat"><div class="k">排课记录</div><div class="v">${schedules.length}</div></div>
    <div class="stat"><div class="k">排课日期</div><div class="v">${dates.length}</div></div>
    <div class="stat"><div class="k">学员</div><div class="v">${studentList.length}</div></div>
    <div class="stat"><div class="k">班型</div><div class="v">${courseOrder.length}</div></div>
  </div>

  <h2>每日安排</h2>
  <div class="grid">
${cards}
  </div>

  <h2>考勤矩阵</h2>
  <div class="legend">
${courseOrder.map((cn) => `<span class="legend-course" data-course="${escAttr(cn)}" title="点击高亮该班型标识，再次点击恢复"><i class="dot" style="background:${courseMeta[cn].stroke}"></i>${cn}</span>`).join('\n')}
    <span><span style="display:inline-block;background:#EFEFEA;border:0.5px solid #DDDAD2;border-radius:4px;padding:0 3px;font-size:12px;line-height:1.5;color:#5F5E5A;">●</span> 到课</span>
    <span style="color:#A32D2D;">✕ 缺勤</span>
    <span style="color:#7A7973;">● 未点名</span>
    <span style="color:#A9A79F;">- 无课</span>
  </div>
  <div style="overflow-x:auto;border-radius:12px;">
  <table>
    <thead><tr><th>学员</th>${dates.map((d) => `<th>${mdFmt(d)}</th>`).join('')}<th>合计</th></tr></thead>
    <tbody>
${matrixRows}
    </tbody>
  </table>
  </div>
</div>
<script>
(function () {
  var items = [].slice.call(document.querySelectorAll('.legend-course'))
  var marks = [].slice.call(document.querySelectorAll('.mark'))
  function refresh() {
    var active = {}
    var any = false
    items.forEach(function (it) {
      if (it.classList.contains('active')) { active[it.getAttribute('data-course')] = true; any = true }
    })
    marks.forEach(function (m) {
      var on = !!active[m.getAttribute('data-course')]
      m.classList.toggle('hl', on)
      m.classList.toggle('dim', any && !on)
    })
  }
  function clearActive() {
    items.forEach(function (it) { it.classList.remove('active') })
    refresh()
  }
  function toggleCourse(cn) {
    items.forEach(function (it) {
      if (it.getAttribute('data-course') === cn) it.classList.toggle('active')
    })
    refresh()
  }
  items.forEach(function (it) {
    it.addEventListener('click', function () {
      it.classList.toggle('active')
      refresh()
    })
  })
  // 点击表格里的标识（●/✕）等价于点击对应班型徽章
  marks.forEach(function (m) {
    m.addEventListener('click', function (ev) {
      ev.stopPropagation()
      toggleCourse(m.getAttribute('data-course'))
    })
  })
  // 点击空白处（非徽章/非标识）恢复原状
  document.addEventListener('click', function (ev) {
    if (!ev.target.closest('.legend-course') && !ev.target.closest('.mark')) {
      clearActive()
    }
  })
})()
</script>
</body>
</html>`

  const file = fileName.startsWith('/') ? fileName : join(process.cwd(), fileName)
  writeFileSync(file, html, 'utf8')

  const summaryLines = [
    `已生成 ${file}　${month}　排课 ${schedules.length} 条 / ${dates.length} 个日期 / ${studentList.length} 名学员 / ${courseOrder.length} 个班型`,
  ]
  return { file, summary: summaryLines.join('\n') }
}

// ========== CLI 入口：node build-schedule-page.mjs --month 2026-09 [--data data.json | < data.json] [--makeup ...] [--out ...] [--title ...] ==========
const isMain = process.argv[1] && (await import('node:url')).fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  function arg(name) {
    const i = process.argv.indexOf(`--${name}`)
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : undefined
  }

  const month = arg('month') || (() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })()
  if (!/^\d{4}-\d{2}$/.test(month)) {
    console.error(`--month 格式应为 yyyy-MM，当前为 ${month}`)
    process.exit(1)
  }

  // 读取数据：--data <文件> 优先，否则从 stdin 读（管道传入）
  async function readInputData() {
    const dataFile = arg('data')
    const raw = dataFile
      ? readFileSync(dataFile, 'utf8')
      : await new Promise((resolve, reject) => {
          if (process.stdin.isTTY) {
            reject(new Error('未提供数据：请用 --data <json文件路径> 传入，或通过管道 stdin 传入'))
            return
          }
          let buf = ''
          process.stdin.setEncoding('utf8')
          process.stdin.on('data', (c) => (buf += c))
          process.stdin.on('end', () => resolve(buf))
          process.stdin.on('error', reject)
        })
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error('数据不是合法 JSON')
    }
    const { schedules, courses } = parsed || {}
    if (!Array.isArray(schedules)) {
      throw new Error('数据缺少 schedules 数组（JSON 格式：{ "schedules": [...], "courses": [...] }，由 MCP 工具 search_schedules / list_courses 的返回数据组装）')
    }
    return { schedules, courses: Array.isArray(courses) ? courses : [] }
  }

  try {
    const { schedules, courses } = await readInputData()
    if (!schedules.length) {
      console.log(`${month} 没有任何排课记录，未生成页面。`)
      process.exit(0)
    }
    const makeup = (arg('makeup') || '').split(',').filter(Boolean)
    const { file, summary } = renderSchedulePage({
      schedules,
      courses,
      month,
      makeup,
      outFile: arg('out'),
      titleOverride: arg('title'),
    })
    console.log(`${summary}\n文件路径: ${file}`)
  } catch (e) {
    console.error(`生成失败: ${e?.message || String(e)}`)
    process.exit(1)
  }
}
