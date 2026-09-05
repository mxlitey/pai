# 点名功能实施计划

## 概述

为排课系统增加点名（到课状态）功能：

- **数据模型**：排课记录（Schedule）新增 `attendance` 可选字段，三态：`attended`=到课、`absent`=缺勤、字段缺省=未点名（向后兼容历史数据，无需迁移）
- **后台管理**：新增「点名管理」入口与页面（URL hash `#admin/attendance`），含日期选择器（默认当天）
- **平铺分块**：单页展示，每门课程一个卡片块（网格平铺、滚动浏览，无翻页控件）；卡片内按上课时间升序列出该课程全部时段分块
- **批量操作**：每个时段提供「全部到课」一键全员标记
- **状态展示**：排课管理列表加状态徽章；家长端日历卡片与详情弹窗显示到课状态
- **MCP**：云端 MCP Server 新增 `set_attendance` 工具（16→17 个）

## 现状分析（基于代码探索）

| 事实 | 位置 | 对本功能的意义 |
|------|------|----------------|
| 后端为 EdgeOne 边缘函数：`api/*.js` 薄路由（default export `onRequestPut` 等按函数名路由）→ `_lib/h-*.js` 业务 → `store.js` 存储 | `node-functions/` | 新接口必须遵循「薄路由 + h-* 业务」模式，REST 与 MCP 复用同一 h-* 实现 |
| 排课按 `schedules/{studentId}/{yyyy-MM}.json` 存储，写锁 key 为 `schedule:{studentId}:{month}`，多锁用 `withWriteLocks`（字典序防死锁） | [store.js](file:///workspace/node-functions/_lib/store.js) | 点名写入需按 学员+月份 分组加锁，同组一次读改写 |
| `searchSchedules({startDate, endDate})`（鉴权）可查指定日期全部排课，返回原始记录（新字段自动透出） | [h-schedules-search.js](file:///workspace/node-functions/_lib/h-schedules-search.js) | 点名页数据源直接复用，后端查询无需改动 |
| 后台子页面：`SubPage` 联合类型 + URL hash 路由 + 主页入口卡片 + 条件渲染 | [AdminPanel.tsx](file:///workspace/src/components/Admin/AdminPanel.tsx#L33-L60) | 新增 `'attendance'` 子页按同模式接入 |
| MCP Server 在 `TOOLS` 数组注册工具，`callApi(handler, {method, path, body}, ctx)` 内部直调 h-* | [mcp.js](file:///workspace/node-functions/api/mcp.js#L159) | 新工具同模式注册，写操作需 `needToken(ctx)` |
| `ScheduleEditor` 的表单由原记录展开（`createForm(schedule)`），更新时 `{...newSchedule}` 整体透传 | [ScheduleEditor.tsx](file:///workspace/src/components/Admin/ScheduleEditor.tsx#L16-L29) | `attendance` 字段在编辑/迁移排课时自动保留，无需改编辑器 |
| 前端 strict TS（`noUnusedLocals` 等），`@/` 别名指向 `src/`，构建 `npm run build`（vite，不含 tsc） | [tsconfig.json](file:///workspace/tsconfig.json), [vite.config.ts](file:///workspace/vite.config.ts) | 验证用 `npx tsc --noEmit` + `npm run build`；dev 代理 `/api`→localhost:8788（本地无 EdgeOne 运行时，E2E 联调需部署后进行） |

## 数据模型设计

```ts
// src/types/index.ts
export type AttendanceStatus = 'attended' | 'absent'

export interface Schedule {
  // ...现有字段不变
  attendance?: AttendanceStatus // 点名状态：attended=到课 / absent=缺勤；缺省（含历史数据）= 未点名
}

// 点名更新项（API 请求体）；'none' 表示清除标记，回到未点名
export interface AttendanceUpdate {
  id: string
  studentId: string
  date: string
  attendance: AttendanceStatus | 'none'
}
```

**决策**：不存储显式 `'pending'` 值。未点名 = 字段不存在，历史数据与「清除标记」后的记录天然回到未点名，零迁移。

## API 设计

### 新增 REST 接口：`PUT /api/schedule-attendance`（鉴权）

请求体：`{ updates: AttendanceUpdate[] }`（1~100 条，单条与批量统一走数组）

响应：`{ code: 0, message: 'ok', data: { updatedCount: number, notFound: { id, studentId, date }[] } }`

- 校验失败（格式/枚举/超量）→ 400 + 明确 message
- 记录不存在不报错，计入 `notFound`（部分成功语义，前端按 `updatedCount` 判断成败）

### 新增 MCP 工具：`set_attendance`（需管理密码）

单条四参数（id/studentId/date/attendance），handler 内包装为 `updates:[1条]` 调用同一 h-* 实现；`attendance` 枚举 `attended|absent|none`。描述中提示先用 `search_schedules` 查排课 id。

## 改动方案（按文件）

### 后端

**1. [store.js](file:///workspace/node-functions/_lib/store.js) — 新增 `setScheduleAttendance(updates)`（批量）**

```js
// 批量设置排课点名状态
// updates: [{ id, studentId, date, attendance }]，attendance: 'attended' | 'absent' | 'none'（none 清除标记）
// 按 学员+月份 分组加锁，每组一次读改写；返回 { updatedCount, notFound }
export async function setScheduleAttendance(updates) {
  if (!Array.isArray(updates) || updates.length === 0) throw new Error('updates 不能为空')
  for (const u of updates) {
    validateStorageId(u.id, 'id')
    validateStorageId(u.studentId, 'studentId')
    validateDate(u.date, 'date')
    if (!['attended', 'absent', 'none'].includes(u.attendance)) {
      throw new Error('attendance 取值应为 attended / absent / none')
    }
  }
  const groups = new Map() // key: `${studentId}|${month}`
  for (const u of updates) {
    const key = `${u.studentId}|${u.date.slice(0, 7)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(u)
  }
  const lockKeys = [...groups.keys()].map((k) => `schedule:${k.split('|')[0]}:${k.split('|')[1]}`)
  return withWriteLocks(lockKeys, async () => {
    let updatedCount = 0
    const notFound = []
    for (const [key, groupUpdates] of groups) {
      const [studentId, month] = key.split('|')
      const list = await getSchedulesByMonth(studentId, month)
      let changed = false
      for (const u of groupUpdates) {
        const idx = list.findIndex((s) => s.id === u.id)
        if (idx === -1) {
          notFound.push({ id: u.id, studentId: u.studentId, date: u.date })
          continue
        }
        if (u.attendance === 'none') delete list[idx].attendance
        else list[idx].attendance = u.attendance
        updatedCount++
        changed = true
      }
      if (changed) await saveSchedulesByMonth(studentId, month, list)
    }
    return { updatedCount, notFound }
  })
}
```

同批重复 id 时后者覆盖前者（前端不会发送重复项，可接受）。

**2. 新建 `node-functions/_lib/h-schedule-attendance.js`**（仿 [h-schedule-update.js](file:///workspace/node-functions/_lib/h-schedule-update.js) 模式）

- `requireAuth` 鉴权 → 读 body → 校验 `updates` 为非空数组且 ≤100 条 → 调 `setScheduleAttendance` → `{ code:0, data }`
- 复用各 h-* 文件一致的 `readBody` 帮助函数

**3. 新建 `node-functions/api/schedule-attendance.js`**（薄路由，仿 [schedule-update.js](file:///workspace/node-functions/api/schedule-update.js)）

```js
import { handleScheduleAttendance } from '../_lib/h-schedule-attendance.js'
export default async function onRequestPut(context) { return handleScheduleAttendance(context) }
```

**4. [mcp.js](file:///workspace/node-functions/api/mcp.js) — 注册 `set_attendance` 工具**

- 顶部 import `handleScheduleAttendance as scheduleAttendanceApi`
- `TOOLS` 数组（`update_schedule` 之后）新增：

```js
{
  name: 'set_attendance',
  title: '点名（设置到课状态）',
  description:
    '为一条排课记录设置点名状态。可先用 search_schedules / get_schedules 查询排课 id。需管理密码。',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: '排课记录 ID' },
      studentId: studentIdSchema,
      date: dateSchema,
      attendance: { type: 'string', enum: ['attended', 'absent', 'none'], description: 'attended=到课，absent=缺勤，none=清除标记（回到未点名）' },
    },
    required: ['id', 'studentId', 'date', 'attendance'],
  },
  handler: async (a, ctx) => {
    needToken(ctx)
    return apiResultToTool(
      await callApi(
        scheduleAttendanceApi,
        { method: 'PUT', path: '/api/schedule-attendance', body: { updates: [{ ...a }] } },
        ctx,
      ),
    )
  },
},
```

**5. [h-schedule-add.js](file:///workspace/node-functions/_lib/h-schedule-add.js) — 新增排课剥离 attendance**

`finalSchedule` 构造时排除传入的 `attendance`（新增排课一律从未点名开始）：构造前 `delete schedule.attendance` 或解构剔除。`h-schedule-add-batch.js` 从零构建记录，无需改动。

### 前端

**6. [types/index.ts](file:///workspace/src/types/index.ts)** — 增加 `AttendanceStatus`、`Schedule.attendance`、`AttendanceUpdate`（见上文数据模型）

**7. [admin.ts](file:///workspace/src/api/admin.ts) — 新增 `setAttendanceBatch`**

```ts
export async function setAttendanceBatch(
  updates: AttendanceUpdate[],
): Promise<ApiResult<{ updatedCount: number; notFound: { id: string; studentId: string; date: string }[] }>> {
  return request(`${API_BASE}/schedule-attendance`, {
    method: 'PUT',
    body: JSON.stringify({ updates }),
  })
}
```

单个点名 = 传长度 1 的数组；「全部到课」= 传整时段数组。

**8. 新建 `src/components/Admin/AttendanceAdmin.tsx`（点名页）**

Props：`{ onBack: () => void; onToast: (type, message) => void }`（与 [ScheduleAdmin](file:///workspace/src/components/Admin/ScheduleAdmin.tsx#L8-L14) 一致；排课记录自带 courseName/studentName/color，无需 students/courses props）

状态：`selectedDate`（初始 `formatDate(new Date())`，来自 `@/utils/date`）、`schedules`、`loading`、`busyIds: Set<string>`（行级防重复点击）；无翻页相关状态

数据流与分组（`useMemo`）：

```
searchSchedules({ startDate: selectedDate, endDate: selectedDate })  // 日期变化时请求
→ 按 courseKey = s.courseId || `name:${s.courseName}` 分组为课程组（CourseGroup）
→ 课程组按组内最早时段 startTime 升序（次按 courseName 排序）
→ 组内按 sessionKey = `${startTime}|${endTime}` 分时段（SessionGroup），startTime 升序、空时间排最前
→ 时段内学员按 studentName.localeCompare(…, 'zh') 排序
```

页面结构（复用其他子页的 header/card 样式）：

- 顶部栏：「← 返回后台 / 点名管理」+ 当日总人数
- 筛选区（card）：`<input type="date">` 日期选择器（默认当天）+「今天」快捷按钮
- **课程卡片平铺**：`grid md:grid-cols-2 gap-4`（移动端单列），当日全部课程卡片一次平铺、滚动浏览，无任何翻页控件
- **课程卡片**：头部 = 课程色点（`getCourseDotClass`）+ 课程名 + 「当日 3 个时段 · 共 12 人」；卡片体 = 该课程全部时段纵向分块
  - **时段块**（按 startTime 升序，空时间排最前）：标题「09:00-10:00」（空时间显示「时间未标注」）+ 统计行「到课 8 · 缺勤 1 · 未点名 1」+「全部到课」按钮（全员设为 attended，含覆盖缺勤；全员已到课时禁用）+ 学员名单
- **学员行**：姓名（左）+ 三态分段按钮组（右）：`未点名`（灰，当前态高亮）/ `到课`（绿）/ `缺勤`（红）；点击调 `setAttendanceBatch`（单条），成功后本地更新该记录；行级 busy 禁点；失败 toast 不更新
- 空态：当日无排课 → 「该日期暂无排课」；加载中 → spinner（复用现有样式）
- notFound 处理：`updatedCount === 0` 且有 notFound → toast「排课不存在（可能已被删除）」并重新拉取当日数据

**9. [AdminPanel.tsx](file:///workspace/src/components/Admin/AdminPanel.tsx)** — 接入点名子页

- `SubPage` 类型与 `readSubPageFromHash` 的 valid 数组加 `'attendance'`
- 主页在「排课管理」卡片之后新增「点名管理」入口卡片（按日期点名，三态标记到课/缺勤）
- 条件渲染：`<AttendanceAdmin onBack={() => goSubPage(null)} onToast={showToast} />` + ToastView

**10. [ScheduleAdmin.tsx](file:///workspace/src/components/Admin/ScheduleAdmin.tsx) — 列表加状态徽章**

表格在「时间」与「操作」之间加「状态」列：到课 = 绿色小徽章、缺勤 = 红色小徽章、未点名 = 灰色小徽章（`rounded-full px-2 py-0.5 text-xs` 三色样式）

**11. 家长端展示**

- [ScheduleDetail.tsx](file:///workspace/src/components/ScheduleDetail.tsx)：`fields` 数组「时间」之后加 `{ label: '到课状态', value: '到课' | '缺勤' | '未点名' }`（按 `schedule.attendance` 判断）
- [ScheduleCard.tsx](file:///workspace/src/components/ScheduleCard.tsx)：
  - 周/日视图完整卡片：右上角加小徽章（`✓ 到课` 绿 / `✕ 缺勤` 红），仅已标记时显示
  - 月视图 compact 卡片：已标记时在时间前加 `✓`/`✕` 前缀符号（卡片为浅色底深色字，符号可读）
- 家长端组件直接读字段渲染，公开 API `/api/schedules` 返回原始记录自动带出，**后端公开接口零改动**；家长仅能查自己孩子，无越权泄露

### 文档

**12. [README.md](file:///workspace/README.md)** — 同步更新（均为编辑现有章节）

- 「功能特性 → 后台管理」加点名管理条目（按日期点名、课程×时段平铺分块、三态标记、一键全部到课）
- 「API 一览」加 `PUT /api/schedule-attendance` 行（鉴权；批量设置点名状态，单次最多 100 条）
- 「数据结构 → Schedule」表加 `attendance` 字段行（可选；缺省视为未点名）
- 「MCP Server → 可用工具」16→17，加 `set_attendance` 行
- 「项目结构」树补 `AttendanceAdmin.tsx`、`h-schedule-attendance.js`、`schedule-attendance.js` 三行

## 边界情况与失败处理

| 场景 | 处理 |
|------|------|
| 历史数据无 `attendance` | 缺省即未点名，零迁移 |
| 历史数据 `startTime` 为空串 | 时段 key `\|`，排序最前，时段标题显示「时间未标注」 |
| 历史数据 `courseId` 为空 | 按 `name:${courseName}` 分组，展示不受影响 |
| 编辑排课（改日期/学员/时间） | `attendance` 随记录整体迁移保留（编辑器展开原记录 + update 整体透传，现有逻辑天然支持） |
| 点名时排课已被他人删除 | 返回 notFound，前端 toast 提示并刷新当日数据 |
| 快速双击/并发点名同一学员 | 行级 busy 禁点 + 后端同月文件写锁串行化 |
| 批量中部分记录缺失 | 部分成功语义：成功的生效，缺失计入 notFound 回显 |
| 「全部到课」覆盖已标缺勤 | 有意设计（老师先全到再改缺勤的工作流）；按钮仅在该时段学员未全为到课时可用 |

## 假设与决策

1. `attendance` 缺省 = 未点名（不存 `'pending'`），新旧数据统一
2. REST 接口为批量式 `{ updates: [...] }`（单条即长度 1 数组），单次上限 100 条
3. 点名页为同页平铺分块：课程卡片网格平铺 + 卡片内全部时段纵向分块，无翻页控件；当日课程多时网格自动换行，靠滚动浏览
4. 「全部到课」为该时段全员置为到课（覆盖缺勤）
5. MCP 工具为单条参数模式，与 `update_schedule` 等单条工具风格一致
6. 家长端公开展示点名状态（仅自己孩子的记录，安全模型不变）
7. 点名状态不进入排课新增/编辑表单（新增从未点名开始；编辑器透传保留）

## 验证步骤

```bash
npx tsc --noEmit                 # 前端类型检查（strict + noUnusedLocals）
npm run build                    # 生产构建
node --check node-functions/_lib/store.js
node --check node-functions/_lib/h-schedule-attendance.js
node --check node-functions/api/schedule-attendance.js
node --check node-functions/api/mcp.js
node --check node-functions/_lib/h-schedule-add.js
```

- 代码审查核对：AdminPanel hash 路由（`#admin/attendance` 刷新可恢复）、分组排序逻辑（空时间/空 courseId）、store 写锁分组正确性
- 本地无 Edgeone 运行时（dev 代理指向 localhost:8788），完整 E2E 需推送 Git 后在 EdgeOne Makers 预览环境按 README 验证流程走查：登录后台 → 点名管理 → 切日期 → 滚动浏览课程×时段分块 → 三态点名/全部到课 → 排课管理徽章 → 家长端卡片/详情 → MCP `set_attendance` 工具

## 实施顺序

1. 后端：store.js `setScheduleAttendance` + h-schedule-attendance.js + api/schedule-attendance.js + h-schedule-add.js 剥离 attendance
2. 后端：mcp.js 注册 `set_attendance`（16→17）
3. 前端：types + admin.ts API
4. 前端：AttendanceAdmin.tsx 点名页 + AdminPanel 入口接入
5. 前端：ScheduleAdmin 徽章列 + ScheduleCard / ScheduleDetail 家长端展示
6. 文档：README 四处章节同步
7. 验证：tsc / build / node --check 全绿
