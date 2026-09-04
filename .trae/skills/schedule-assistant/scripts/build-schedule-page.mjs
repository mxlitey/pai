// 排课总览页生成器（本地脚本，跨平台，纯渲染零配置）
//
// 渲染模块 renderSchedulePage({schedules, courses, month, makeup?, outFile?, titleOverride?})
// CLI 用法：node build-schedule-page.mjs --month 2026-09 [--makeup 2026-08-13,2026-08-28] [--out 文件名.html] [--title 标题] (--data data.json | < data.json)
//   数据由调用方传入（AI 先通过云端 MCP 工具 search_schedules / list_courses 获取后写入 JSON 文件），
//   JSON 格式：{ "schedules": [...排课记录], "courses": [...课程列表] }
//   来源：--data <文件路径>，或 stdin 管道；HTML 输出到当前工作目录
//
// 请假判定：同班型内，该班型有课但该学员缺席的日期，自动标为「请假」，无需手工传入。
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

  // 每个班型的完整上课日期集合
  const datesOfCourse = {}
  for (const cn of courseOrder) {
    datesOfCourse[cn] = new Set(schedules.filter((s) => s.courseName === cn).map((s) => s.date))
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

  // 学员实际报名的全部课程（一个学员可报多门），按班型顺序排列
  const coursesOf = {}
  for (const st of studentList) {
    coursesOf[st.name] = courseOrder.filter((cn) =>
      schedules.some((s) => s.studentName === st.name && s.courseName === cn))
  }

  // 到课精确到（课程, 日期）：同一天一门到、一门缺不会误判为全到
  const attendedOf = {}
  for (const st of studentList) {
    attendedOf[st.name] = new Set(
      schedules.filter((s) => s.studentName === st.name).map((s) => `${s.courseName}|${s.date}`))
  }

  // 请假/应排按学员全部课程累计（同一天上两门课各计 1 次，不按日期去重）
  const leaveOf = {}
  const dueOf = {}
  for (const st of studentList) {
    let leave = 0
    let due = 0
    for (const cn of coursesOf[st.name]) {
      for (const d of datesOfCourse[cn]) {
        due++
        if (!attendedOf[st.name].has(`${cn}|${d}`)) leave++
      }
    }
    leaveOf[st.name] = leave
    dueOf[st.name] = due
  }

  const totalLeave = Object.values(leaveOf).reduce((n, v) => n + v, 0)
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  // ---------- 渲染 ----------
  const cards = dates.map((d) => {
    const day = schedules.filter((s) => s.date === d)
    const blocks = courseOrder.map((cn) => {
      const items = day.filter((s) => s.courseName === cn)
      if (!items.length) return ''
      const m = courseMeta[cn]
      return `<div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px solid #EFEFEA;">
      <span style="flex:0 0 92px;font-size:12px;color:${m.text};font-variant-numeric:tabular-nums;padding-top:1px;">${items[0].startTime}–${items[0].endTime}</span>
      <span style="flex:1;min-width:0;font-size:13px;line-height:1.7;">${items.map((s) => `<div style="white-space:nowrap;">${s.studentName}</div>`).join('')}</span>
      <span style="flex:0 0 auto;max-width:96px;font-size:11px;color:${m.text};background:${m.fill};border:0.5px solid ${m.stroke};border-radius:5px;padding:1px 7px;line-height:1.4;text-align:center;overflow-wrap:break-word;word-break:break-all;">${cn}</span>
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
    // 每门课当天独立渲染标记：到课 ●（该课颜色）/ 缺席 ✕；同日多课并排显示如 ●● / ●✕
    const cells = dates.map((d) => {
      const marks = coursesOf[st.name]
        .filter((cn) => datesOfCourse[cn].has(d))
        .map((cn) => attendedOf[st.name].has(`${cn}|${d}`)
          ? `<span class="mark" data-course="${escAttr(cn)}" style="color:${courseMeta[cn].stroke};font-size:14px;">●</span>`
          : `<span class="mark" data-course="${escAttr(cn)}" style="color:#A32D2D;font-weight:500;font-size:14px;">✕</span>`)
      if (!marks.length) return `<td style="text-align:center;padding:7px 4px;border-bottom:1px solid #F2F1EC;color:#DDDAD2;">·</td>`
      return `<td style="text-align:center;padding:7px 4px;border-bottom:1px solid #F2F1EC;">
        <div style="display:flex;justify-content:center;gap:3px;white-space:nowrap;">${marks.join('')}</div>
      </td>`
    }).join('')
    const total = dueOf[st.name]
    const leave = leaveOf[st.name]
    const attended = total - leave
    return `<tr>
    <td style="padding:7px 10px 7px 14px;border-bottom:1px solid #F2F1EC;white-space:nowrap;">${st.name}</td>
    ${cells}
    <td style="padding:7px 14px 7px 10px;border-bottom:1px solid #F2F1EC;color:#7A7973;font-size:12px;white-space:nowrap;">${attended}/${total}${leave ? `　请假${leave}` : ''}</td>
  </tr>`
  }).join('\n')

  const title = titleOverride || `${year}年${mon}月排课看板`
  const mdFmt = (d) => { const [, m, dd] = d.split('-'); return `${+m}/${+dd}` }
  const subParts = [`共 ${dates.length} 次训练`]
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
  th:last-child { padding-right: 14px; }
  tbody tr:last-child td { border-bottom: none; padding-bottom: 12px; }
  .legend { display: flex; flex-wrap: wrap; gap: 14px; margin: 0 0 12px; font-size: 12px; color: #5F5E5A; }
  .legend span { display: flex; align-items: center; gap: 6px; }
  .dot { width: 10px; height: 10px; border-radius: 3px; }
  .legend-course { cursor: pointer; padding: 2px 8px; border-radius: 6px; user-select: none; -webkit-user-select: none; transition: background .15s; }
  .legend-course:hover { background: #EFEFEA; }
  .legend-course.active { background: #EFEFEA; box-shadow: inset 0 0 0 0.5px #DDDAD2; }
  .mark { display: inline-block; transition: transform .15s ease, opacity .15s ease; }
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
    <div class="stat"><div class="k">训练日期</div><div class="v">${dates.length}</div></div>
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
    <span style="color:#A32D2D;">✕ 请假</span>
    <span style="color:#A9A79F;">· 无课</span>
    <span style="color:#A9A79F;">同日多课并排显示（如 ●● / ●✕）</span>
    <span style="color:#A9A79F;">点击班型可高亮标识</span>
  </div>
  <table>
    <thead><tr><th>学员</th>${dates.map((d) => `<th>${mdFmt(d)}</th>`).join('')}<th>合计</th></tr></thead>
    <tbody>
${matrixRows}
    </tbody>
  </table>
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
  items.forEach(function (it) {
    it.addEventListener('click', function () {
      it.classList.toggle('active')
      refresh()
    })
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
  if (totalLeave) summaryLines.push(`请假 ${totalLeave} 人次（同班型有课但缺席，自动识别）`)
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
