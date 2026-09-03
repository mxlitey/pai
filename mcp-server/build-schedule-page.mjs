// 排课总览页生成器（渲染模块，数据由调用方传入）
//
// 导出 renderSchedulePage({schedules, courses, month, makeup?, outFile?, titleOverride?})，
// 由 MCP server 的 index.js 取数后调用（复用其 apiRequest 鉴权）。
// HTML 输出到本文件所在目录（mcp-server），返回 { file, summary }。
//
// 请假判定：同班型内，该班型有课但该学员缺席的日期，自动标为「请假」，无需手工传入。

import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))

// ========== 渲染（纯函数：不取数，数据由调用方传入） ==========
// 返回 { file: 输出文件绝对路径, summary: 统计摘要文本 }
export function renderSchedulePage({ schedules, courses, month, makeup = [], outFile, titleOverride }) {
  const makeupSet = new Set(makeup)
  const [year, mon] = month.split('-').map(Number)

  // ---------- 颜色 ----------
  const COLOR_HEX = {
    blue: { fill: '#E6F1FB', stroke: '#185FA5', text: '#0C447C' },
    green: { fill: '#EAF3DE', stroke: '#3B6D11', text: '#27500A' },
    purple: { fill: '#EEEDFE', stroke: '#534AB7', text: '#3C3489' },
    teal: { fill: '#E1F5EE', stroke: '#0F6E56', text: '#085041' },
    coral: { fill: '#FAECE7', stroke: '#993C1D', text: '#712B13' },
    pink: { fill: '#FBEAF0', stroke: '#993556', text: '#72243E' },
    amber: { fill: '#FAEEDA', stroke: '#854F0B', text: '#633806' },
    red: { fill: '#FCEBEB', stroke: '#A32D2D', text: '#791F1F' },
    gray: { fill: '#F1EFE8', stroke: '#5F5E5A', text: '#444441' },
  }
  const colorOf = (key) => COLOR_HEX[key] || COLOR_HEX.gray

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
      courseMeta[s.courseName] = COLOR_HEX.gray
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

  // 请假 = 班型有课但该学员缺席
  const leaveOf = {}
  for (const st of studentList) {
    const own = new Set(schedules.filter((s) => s.studentName === st.name).map((s) => s.date))
    leaveOf[st.name] = [...datesOfCourse[st.course]].filter((d) => !own.has(d)).sort()
  }

  const totalLeave = Object.values(leaveOf).reduce((n, v) => n + v.length, 0)
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
    const own = new Set(schedules.filter((s) => s.studentName === st.name).map((s) => s.date))
    const m = courseMeta[st.course]
    const cells = dates.map((d) => {
      if (own.has(d)) return `<td style="text-align:center;padding:7px 4px;border-bottom:1px solid #F2F1EC;color:${m.text};">●</td>`
      if (datesOfCourse[st.course].has(d)) return `<td style="text-align:center;padding:7px 4px;border-bottom:1px solid #F2F1EC;color:#D8B4A0;" title="请假">✕</td>`
      return `<td style="text-align:center;padding:7px 4px;border-bottom:1px solid #F2F1EC;color:#C9C7BF;">–</td>`
    }).join('')
    const total = datesOfCourse[st.course].size
    const leave = leaveOf[st.name].length
    return `<tr>
    <td style="padding:7px 10px 7px 0;border-bottom:1px solid #F2F1EC;white-space:nowrap;">${st.name}</td>
    ${cells}
    <td style="padding:7px 0 7px 10px;border-bottom:1px solid #F2F1EC;color:#7A7973;font-size:12px;white-space:nowrap;">${own.size}/${total}${leave ? `　请假${leave}` : ''}</td>
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
    border: 0.5px solid #E3E2DC; border-radius: 12px; padding: 8px 14px; font-size: 13px; }
  th { font-weight: 500; font-size: 12px; color: #7A7973; padding: 8px 4px; text-align: center; white-space: nowrap; }
  th:first-child { text-align: left; }
  .legend { display: flex; flex-wrap: wrap; gap: 14px; margin: 0 0 12px; font-size: 12px; color: #5F5E5A; }
  .legend span { display: flex; align-items: center; gap: 6px; }
  .dot { width: 10px; height: 10px; border-radius: 3px; }
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
${courseOrder.map((cn) => `<span><i class="dot" style="background:${courseMeta[cn].stroke}"></i>${cn}</span>`).join('\n')}
    <span style="color:#A9A79F;">✕ 请假未排</span>
  </div>
  <table>
    <thead><tr><th style="text-align:left;padding-left:0;">学员</th>${dates.map((d) => `<th>${mdFmt(d)}</th>`).join('')}<th>合计</th></tr></thead>
    <tbody>
${matrixRows}
    </tbody>
  </table>
</div>
</body>
</html>`

  const file = join(MODULE_DIR, fileName)
  writeFileSync(file, html, 'utf8')

  const summaryLines = [
    `已生成 ${file}　${month}　排课 ${schedules.length} 条 / ${dates.length} 个日期 / ${studentList.length} 名学员 / ${courseOrder.length} 个班型`,
  ]
  if (totalLeave) summaryLines.push(`请假 ${totalLeave} 人次（同班型有课但缺席，自动识别）`)
  return { file, summary: summaryLines.join('\n') }
}
