// 看板 HTML 生成器：将当前筛选范围内的排课数据渲染成自包含单文件 HTML
// 内联 CSS + 预渲染标记 + 内联 JS（保留班型高亮交互、点击空白恢复）
import type { Course, Schedule } from '@/types'

interface BuildOptions {
  schedules: Schedule[]
  courses: Course[]
  title?: string // 顶部标题，默认「排课总览」
  subtitle?: string // 顶部副标题，展示筛选范围
}

// 颜色：与 DashboardAdmin / build-schedule-page.mjs 对齐
const COLOR_HEX: Record<string, { stroke: string; fill: string; text: string }> = {
  blue: { stroke: '#3B82F6', fill: '#EFF6FF', text: '#1D4ED8' },
  green: { stroke: '#22C55E', fill: '#F0FDF4', text: '#15803D' },
  purple: { stroke: '#A855F7', fill: '#FAF5FF', text: '#7E22CE' },
  orange: { stroke: '#F97316', fill: '#FFF7ED', text: '#C2410C' },
  rose: { stroke: '#F43F5E', fill: '#FFF1F2', text: '#BE123C' },
  teal: { stroke: '#14B8A6', fill: '#F0FDFA', text: '#0F766E' },
  amber: { stroke: '#F59E0B', fill: '#FFFBEB', text: '#B45309' },
  indigo: { stroke: '#6366F1', fill: '#EEF2FF', text: '#4338CA' },
  cyan: { stroke: '#06B6D4', fill: '#ECFEFF', text: '#0E7490' },
  pink: { stroke: '#EC4899', fill: '#FDF2F8', text: '#BE185D' },
  slate: { stroke: '#94A3B8', fill: '#F8FAFC', text: '#475569' },
}
const colorOf = (key?: string) => COLOR_HEX[key || ''] || COLOR_HEX.slate

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const weekdayOf = (d: string) => WEEKDAYS[new Date(`${d}T00:00:00`).getDay()]
const mdFmt = (d: string) => {
  const [, m, dd] = d.split('-')
  return `${+m}/${+dd}`
}
const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

export function buildDashboardHtml({ schedules, courses, title = '排课总览', subtitle = '' }: BuildOptions): string {
  // ---------- 派生数据（与 DashboardAdmin 保持一致） ----------
  const courseOrder: string[] = []
  const courseMeta: Record<string, { stroke: string; fill: string; text: string }> = {}
  for (const c of courses) {
    if (!schedules.some((s) => s.courseId === c.id)) continue
    courseOrder.push(c.name)
    courseMeta[c.name] = colorOf(c.color)
  }
  for (const s of schedules) {
    if (!courseMeta[s.courseName]) {
      courseOrder.push(s.courseName)
      courseMeta[s.courseName] = COLOR_HEX.slate
    }
  }

  const dates = [...new Set(schedules.map((s) => s.date))].sort()

  const studentList: { name: string; course: string }[] = []
  for (const cn of courseOrder) {
    for (const s of schedules) {
      if (s.courseName === cn && !studentList.some((x) => x.name === s.studentName)) {
        studentList.push({ name: s.studentName, course: cn })
      }
    }
  }

  const statusOf: Record<string, Record<string, string>> = {}
  const rank: Record<string, number> = { attended: 2, absent: 1, pending: 0 }
  for (const st of studentList) {
    const seen: Record<string, string> = {}
    for (const s of schedules) {
      if (s.studentName !== st.name) continue
      const status = s.attendance === 'attended' ? 'attended' : s.attendance === 'absent' ? 'absent' : 'pending'
      const key = `${s.courseName}|${s.date}`
      if (!seen[key] || rank[status] > rank[seen[key]]) seen[key] = status
    }
    statusOf[st.name] = seen
  }
  const countOf: Record<string, { attended: number; absent: number; pending: number }> = {}
  for (const st of studentList) {
    const cnt = { attended: 0, absent: 0, pending: 0 }
    for (const v of Object.values(statusOf[st.name])) cnt[v as keyof typeof cnt]++
    countOf[st.name] = cnt
  }

  // 每日安排分组
  const dailyCards: { date: string; blocks: { courseName: string; startTime: string; endTime: string; items: Schedule[] }[] }[] =
    dates.map((d) => {
      const day = schedules.filter((s) => s.date === d)
      const groups = new Map<string, { courseName: string; startTime: string; endTime: string; items: Schedule[] }>()
      for (const s of day) {
        const key = `${s.courseName}|${s.startTime}|${s.endTime}`
        const g = groups.get(key)
        if (g) g.items.push(s)
        else groups.set(key, { courseName: s.courseName, startTime: s.startTime, endTime: s.endTime, items: [s] })
      }
      const blocks = [...groups.values()].sort((a, b) => a.startTime.localeCompare(b.startTime))
      return { date: d, blocks }
    })

  const stats = {
    records: schedules.length,
    days: dates.length,
    students: studentList.length,
    courses: courseOrder.length,
  }

  // ---------- 渲染 ----------
  const statCards = [
    ['排课记录', stats.records],
    ['排课天数', stats.days],
    ['学员', stats.students],
    ['班型', stats.courses],
  ]
    .map(
      ([label, value]) =>
        `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px">
          <div style="font-size:12px;color:#64748b;margin-bottom:4px">${label}</div>
          <div style="font-size:24px;font-weight:600;color:#1e293b;font-variant-numeric:tabular-nums">${value}</div>
        </div>`,
    )
    .join('')

  const dailyHtml = dailyCards
    .map((day) => {
      const blocksHtml = day.blocks
        .map((b) => {
          const m = courseMeta[b.courseName] || COLOR_HEX.slate
          const items = b.items.map((s) => esc(s.studentName)).join('、')
          return `<div style="display:flex;align-items:flex-start;gap:12px;padding:8px 0;border-top:1px solid #f1f5f9">
            <span style="flex:none;font-family:ui-monospace,monospace;font-size:12px;padding-top:2px;font-variant-numeric:tabular-nums;color:${m.text}">${b.startTime}–${b.endTime}</span>
            <span style="flex:1;min-width:0;font-size:14px;line-height:1.6">${items}</span>
            <span style="flex:none;max-width:96px;font-size:12px;text-align:center;border-radius:4px;padding:2px 6px;word-break:break-all;color:${m.text};background:${m.fill};border:0.5px solid ${m.stroke}">${esc(b.courseName)}</span>
          </div>`
        })
        .join('')
      return `<article style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px">
        <div style="font-size:14px;font-weight:500;color:#1e293b;margin-bottom:8px">${mdFmt(day.date)} ${weekdayOf(day.date)}</div>
        ${blocksHtml}
      </article>`
    })
    .join('')

  const legendHtml = courseOrder
    .map(
      (c) =>
        `<button type="button" data-highlight="1" data-course="${esc(c)}" class="legend-chip" title="点击高亮该班型标识，再次点击恢复">
          <i style="width:10px;height:10px;border-radius:2px;display:inline-block;background:${courseMeta[c].stroke}"></i>${esc(c)}
        </button>`,
    )
    .join('') +
    `<span style="display:flex;align-items:center;gap:6px">
      <i style="display:inline-block;border-radius:2px;padding:0 2px;line-height:1.3;background:#EFEFEA;border:0.5px solid #DDDAD2;color:#5F5E5A">●</i>到课
    </span>
    <span style="color:#A32D2D">✕ 缺勤</span>
    <span style="color:#7A7973">● 未点名</span>
    <span style="color:#A9A79F">— 无课</span>`

  // 考勤矩阵表头/数据用到交替背景（i 为奇数用浅底）
  const headerCells = dates
    .map((d, i) => `<th style="font-size:12px;font-weight:500;color:#64748b;padding:12px 8px;text-align:center;white-space:nowrap;border-bottom:1px solid #e2e8f0;background:${i % 2 === 1 ? '#f8fafc' : '#fff'}">${mdFmt(d)}</th>`)
    .join('')
  const matrixRows = studentList
    .map((st) => {
      const cellHtml = dates
        .map((d, i) => {
          const bg = i % 2 === 1 ? '#f8fafc' : ''
          const marks: string[] = []
          for (const cn of courseOrder) {
            const status = statusOf[st.name][`${cn}|${d}`]
            if (!status) continue
            const m = courseMeta[cn]
            if (status === 'attended') {
              marks.push(`<span data-highlight="1" data-course="${esc(cn)}" class="mark cell" style="background:${m.fill};border:0.5px solid ${m.stroke};color:${m.stroke}">●</span>`)
            } else if (status === 'absent') {
              marks.push(`<span data-highlight="1" data-course="${esc(cn)}" class="mark" style="color:${m.stroke}">✕</span>`)
            } else {
              marks.push(`<span data-highlight="1" data-course="${esc(cn)}" class="mark" style="color:${m.stroke}">●</span>`)
            }
          }
          if (!marks.length) return `<td style="text-align:center;padding:8px 4px;color:#cbd5e1;white-space:nowrap;${bg ? `background:${bg}` : ''}">—</td>`
          return `<td style="text-align:center;padding:8px 4px;white-space:nowrap;${bg ? `background:${bg}` : ''}"><div style="display:flex;justify-content:center;gap:2px;white-space:nowrap">${marks.join('')}</div></td>`
        })
        .join('')
      const cnt = countOf[st.name]
      return `<tr style="border-top:1px solid #f1f5f9">
        <td style="padding:8px 14px;text-align:center;color:#334155;font-weight:500;white-space:nowrap;background:#f8fafc">${esc(st.name)}</td>
        ${cellHtml}
        <td style="text-align:center;padding:8px 14px;font-size:12px;color:#64748b;white-space:nowrap;background:#f8fafc">${cnt.attended}到·${cnt.absent}缺·${cnt.pending}未</td>
      </tr>`
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin:0; background:#f8fafc; color:#1e293b; font-family:system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif; }
  .wrap { max-width:1152px; margin:0 auto; padding:24px 16px; }
  .header { display:flex; flex-direction:column; gap:4px; margin-bottom:20px; }
  .header h1 { margin:0; font-size:18px; font-weight:600; color:#1e293b; }
  .header p { margin:0; font-size:12px; color:#64748b; }
  .stats { display:grid; grid-template-columns:repeat(2,1fr); gap:16px; margin-bottom:16px; }
  @media (min-width:1024px){ .stats{ grid-template-columns:repeat(4,1fr); } }
  section { margin-bottom:20px; }
  .sec-title { font-size:14px; font-weight:600; color:#1e293b; margin:0 0 12px; }
  .daily-grid { display:grid; gap:16px; }
  @media (min-width:768px){ .daily-grid{ grid-template-columns:repeat(2,1fr); } }
  .legend { display:flex; flex-wrap:wrap; gap:16px 16px; align-items:center; font-size:12px; color:#64748b; margin-bottom:12px; }
  .legend-chip { display:flex; align-items:center; gap:6px; border:none; background:transparent; cursor:pointer; border-radius:4px; padding:2px 6px; font-size:12px; color:#64748b; transition:background .15s; }
  .legend-chip.active { background:#e2e8f0; box-shadow:0 0 0 1px #cbd5e1; }
  .matrix { background:#fff; border:1px solid #e2e8f0; border-radius:12px; overflow-x:auto; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th, td { vertical-align:middle; }
  .mark { display:inline-block; cursor:pointer; padding:0 4px; border-radius:4px; line-height:1.4; font-variant-numeric:tabular-nums; transition:transform .15s, opacity .15s; }
  .mark.cell { line-height:1.4; }
  .mark.active { transform:scale(1.3); }
  .mark.dim { opacity:.18; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>${esc(title)}</h1>
    ${subtitle ? `<p>${esc(subtitle)}</p>` : ''}
  </div>
  <div class="stats">${statCards}</div>
  <section>
    <h2 class="sec-title">每日安排</h2>
    <div class="daily-grid">${dailyHtml}</div>
  </section>
  <section>
    <h2 class="sec-title">考勤矩阵</h2>
    <div class="legend" id="legend">${legendHtml}</div>
    <div class="matrix">
      <table>
        <thead>
          <tr>
            <th style="font-size:12px;font-weight:500;color:#64748b;padding:12px 14px;text-align:center;white-space:nowrap;background:#f8fafc;border-bottom:1px solid #e2e8f0">学员</th>
            ${headerCells}
            <th style="font-size:12px;font-weight:500;color:#64748b;padding:12px 14px;text-align:center;white-space:nowrap;background:#f8fafc;border-bottom:1px solid #e2e8f0">考勤</th>
          </tr>
        </thead>
        <tbody>${matrixRows}</tbody>
      </table>
    </div>
  </section>
</div>
<script>
(function () {
  var active = new Set();
  function all() { return Array.prototype.slice.call(document.querySelectorAll('[data-course]')); }
  function apply() {
    all().forEach(function (el) {
      var c = el.getAttribute('data-course');
      el.classList.toggle('active', active.has(c));
      el.classList.toggle('dim', active.size > 0 && !active.has(c));
    });
  }
  all().forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      var c = el.getAttribute('data-course');
      if (active.has(c)) active.delete(c); else active.add(c);
      apply();
    });
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('[data-course]')) { active.clear(); apply(); }
  });
})();
</script>
</body>
</html>`
}