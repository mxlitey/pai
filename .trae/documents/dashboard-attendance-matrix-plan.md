# 看板考勤矩阵改用真实点名数据 — 实施计划

## 一、需求与已确认决策

**目标**：排课看板生成脚本的考勤矩阵从「有排课记录=到课」的代理推断，改为使用排课记录的真实 `attendance` 字段渲染；同时删除「预测有课」推断功能。

| 项 | 决策（用户已确认） |
|---|---|
| 到课 | 班型色实心圆 ● + **浅色背景底**（课程 fill 色 + 发丝描边，与每日安排班型徽章同一设计语言） |
| 缺勤 | 红色 ✕（`#A32D2D`，与前端 ScheduleCard 的 ✕ 一致） |
| 未点名 | 班型色实心圆 ●，**无底色**（与到课仅靠「有无浅色底」区分） |
| 无排课 | `-` 浅灰（原样式不变） |
| 合计列 | 三态分列「X到·Y缺·Z未」 |
| 预测有课 | **整体删除**（红空心 ○ 及其推断逻辑） |
| 每日安排卡片 | 不改，仍只列学员名 |
| 旧数据兼容 | 无 `attendance` 字段的记录一律按「未点名」处理，不报错 |

## 二、现状分析（Phase 1 探索结论）

**数据链路已打通，后端零改动**：[store.js:412](../../node-functions/_lib/store.js) 的 `searchSchedules` 返回原始存储对象，`attendance` 字段随 MCP `search_schedules` 原样透传到看板 JSON。脚本只需读 `s.attendance`。

**待改文件只有一个代码文件**：[build-schedule-page.mjs](../skills/schedule-assistant/scripts/build-schedule-page.mjs)（359 行，无第三方依赖）。现有矩阵是代理推断，涉及：

- 第 9 行：头部注释描述旧逻辑（到课 ● / 预测有课 ○）
- 61-65 行 `datesOfCourse`：班型全部课日集合（预测依据，**删**）
- 77-82 行 `coursesOf`：学员报名课程（预测依据，**删**）
- 84-89 行 `attendedOf`：有记录即到课的 Set（代理推断，**删**）
- 91-99 行 `dueOf`：应排数（预测口径分母，**删**）
- 133-153 行：矩阵单元格渲染（● / 红 ○，**重写**）
- 220-224 行：图例含「○ 预测有课」（**替换**）

**保持不动**：`studentList`（67-75）、`courseOrder`/`courseMeta`（37-51，含历史无 courseId 的 slate 兜底）、每日安排卡片（105-131）、顶部统计卡、`.mark` 点击高亮 JS（234-279，三种标记统一带 `data-course`，交互无需改）、CLI 入口（293-359）。

**文档同步**：仅 [SKILL.md:49](../skills/schedule-assistant/SKILL.md)（第 5 节第 4 步）描述了矩阵逻辑。README 只在文件树/工具表提到脚本存在，无需改。

## 三、改动方案

### 文件 1：`.trae/skills/schedule-assistant/scripts/build-schedule-page.mjs`（核心，唯一代码改动）

#### 3.1 头部注释（第 9 行）

```
// 考勤矩阵（真实点名数据 attendance 字段）：到课 ● 班型色+浅色底；缺勤 ✕ 红；未点名 ● 班型色无底（旧数据无 attendance 字段按未点名）；无排课 -。
```

#### 3.2 聚合结构：删 4 个推断结构，新增 `attendanceOf`

删除 `datesOfCourse`、`coursesOf`、`attendedOf`、`dueOf` 四段，在 `studentList` 之后新增：

```js
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
```

要点：粒度仍是 `courseName|date`（与旧版 Set 折叠行为一致，同班型同日多条只出 1 个标记）；未知值兜底为 `pending`。

#### 3.3 矩阵单元格重写（替换 133-153 行的 cells 逻辑）

每个学员 × 日期：按 `courseOrder` 顺序查 `attendanceOf`，命中即渲染对应标记，一个不中 → `-`：

```js
const cells = dates.map((d) => {
  const marks = []
  for (const cn of courseOrder) {
    const status = attendanceOf[st.name].get(`${cn}|${d}`)
    if (!status) continue
    const m = courseMeta[cn]
    if (status === 'attended') {
      // 到课：班型色 ● + 浅色底（课程 fill + 发丝描边，与每日安排班型徽章同一设计语言）
      marks.push(`<span class="mark" data-course="${escAttr(cn)}" style="background:${m.fill};border:0.5px solid ${m.stroke};border-radius:4px;padding:0 3px;font-size:12px;line-height:1.5;color:${m.stroke};">●</span>`)
    } else if (status === 'absent') {
      // 缺勤：红色 ✕
      marks.push(`<span class="mark" data-course="${escAttr(cn)}" style="color:#A32D2D;font-size:14px;">✕</span>`)
    } else {
      // 未点名：班型色 ●，无底色
      marks.push(`<span class="mark" data-course="${escAttr(cn)}" style="color:${m.stroke};font-size:14px;">●</span>`)
    }
  }
  if (!marks.length) return `<td style="text-align:center;padding:7px 4px;border-bottom:1px solid #F2F1EC;color:#DDDAD2;">-</td>`
  return `<td style="text-align:center;padding:7px 4px;border-bottom:1px solid #F2F1EC;">
    <div style="display:flex;justify-content:center;gap:3px;white-space:nowrap;">${marks.join('')}</div>
  </td>`
}).join('')
```

（✕ 用 U+2715，与前端 ScheduleCard 一致；外层 td/flex 容器样式沿用原实现。）

#### 3.4 合计列：三态分列（替换原 `${attended}/${total}` td）

```js
const cnt = { attended: 0, absent: 0, pending: 0 }
for (const v of attendanceOf[st.name].values()) cnt[v]++
// td 内容：${cnt.attended}到·${cnt.absent}缺·${cnt.pending}未
```

td 样式沿用原合计列（`text-align:center; padding:7px 14px; border-bottom:1px solid #F2F1EC; color:#7A7973; font-size:12px; white-space:nowrap;`）。计数与矩阵同粒度（班型×日期聚合后），保证单元格与合计一致。

#### 3.5 图例替换（220-224 行区域）

删除「○ 预测有课」，班型徽章列表保留，其后追加四个状态项（示例用中性色，不暗示某个具体班型）：

```html
    <span><span style="display:inline-block;background:#EFEFEA;border:0.5px solid #DDDAD2;border-radius:4px;padding:0 3px;font-size:12px;line-height:1.5;color:#5F5E5A;">●</span> 到课</span>
    <span style="color:#A32D2D;">✕ 缺勤</span>
    <span style="color:#7A7973;">● 未点名</span>
    <span style="color:#A9A79F;">- 无课</span>
```

### 文件 2：`.trae/skills/schedule-assistant/SKILL.md`（第 49 行，文档同步）

```
4. 自动统计：排课条数/训练日期/学员/班型；考勤矩阵（真实点名数据 attendance 字段）：到课 ● 班型色+浅色底 / 缺勤 ✕ 红 / 未点名 ● 班型色无底（旧数据无 attendance 字段按未点名），合计列三态分列「X到·Y缺·Z未」；每日安排按开始时间升序
```

## 四、边界与兼容

1. **旧数据**：无 `attendance` 字段 → `pending`（无底 ●）；复用旧 JSON 数据文件同样兼容，脚本不报错。历史月份从未点名 → 矩阵全为无底 ●、合计 `0到·0缺·N未`，如实反映。
2. **同班型同日多条**（补课双时段）：聚合优先级 到课 > 缺勤 > 未点名，矩阵与合计均为「班型×日期」单标记。
3. **同日多门课**：标记按 `courseOrder` 顺序并排（沿用 flex gap 3px）。
4. **学员当天无排课记录**：显示 `-`，**不再**推断「该班型有课」（预测功能删除后的预期行为）。
5. **历史无 courseId 的排课**：`courseMeta` slate 兜底逻辑不动，矩阵照常渲染。
6. **点击高亮交互**：三态标记统一带 `data-course`，现有 `.mark` 点击/高亮/暗化 JS 无需改动。
7. **旧 HTML 文件**：已生成的看板是静态独立文件，不追溯。

## 五、验证步骤

1. **语法**：`node --check .trae/skills/schedule-assistant/scripts/build-schedule-page.mjs`
2. **功能夹具**（`test-files/` 已被 .gitignore，不入库）：构造 JSON 覆盖——到课 / 缺勤 / 未点名（无字段）/ 学员某日无课 / 同日两门课 / 同班型同日两条记录（1 到 1 缺 → 应聚合为到课）：
   ```bash
   node .trae/skills/schedule-assistant/scripts/build-schedule-page.mjs --month 2026-09 --data test-files/attendance-fixture.json --out test-files/board-new.html
   ```
3. **断言（grep 生成的 HTML）**：
   - 出现到课 chip（`background:#EFF6FF` 等课程 fill 色）
   - 出现 `✕`（缺勤）与无底 ●（未点名 mark 无 `background:` 内联样式）
   - **不出现** `预测有课`、不出现 `○`
   - 合计列出现 `到·` `缺·` `未` 三态分列
   - 学员无课日显示 `-`
4. **旧格式兼容用例**：同一夹具去掉全部 attendance 字段再跑一次 → 全部无底 ●、合计 `0到·0缺·N未`、退出码 0。
5. **收尾**：删除测试夹具与输出 HTML（或留在 test-files/ 不入库）。

## 六、不做清单（out of scope）

- 每日安排卡片不加点名状态（用户已确认不改）
- 顶部统计卡 / 脚本 summary 摘要行不加点名统计
- 后端、MCP、前端一律不动（数据链路已透传 attendance）
- README 不动（未描述矩阵细节）
