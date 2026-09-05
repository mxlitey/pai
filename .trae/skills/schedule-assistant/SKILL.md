---
name: "schedule-assistant"
description: "排课日历管理助手：通过 pai-schedule MCP 工具完成排课查询、新增、批量排课、学员课程管理、点名考勤、考勤表统计。当用户要求查课/排课/调课/删课/点名/考勤表/管理学员课程公告时调用。Invoke when user asks about schedules, students, courses, attendance, attendance sheets, announcements or batch scheduling."
---

# 排课助手（Schedule Assistant）

通过云端 `pai-schedule` MCP server（`https://<域名>/api/mcp`，写操作需在请求头配置 `X-Admin-Password`）的 17 个工具管理排课日历系统。排课数据全部经 MCP 工具读写；签到表解析与看板渲染由本 skill 自带本地脚本完成。本文档定义字段规范、标准工作流与安全边界。

## 工具清单

**只读（无鉴权）**
- `list_students(q?)` — 按 id 或姓名搜索学员（精确+模糊）
- `get_schedules({studentId?|studentName?, startDate?, endDate?})` — 查询某学员排课
- `get_announcement()` — 读取公告

**鉴权读**
- `search_schedules({startDate?, endDate?, courseId?, studentId?})` — 跨学员搜索排课
- `list_courses()` — 课程列表（含颜色、默认上下课时间）

**写操作（需鉴权）**
- `add_schedule({schedule})` — 新增单条排课（startTime/endTime 必填）
- `batch_add_schedules({courseId, dates[], studentIds[], startTime?, endTime?, note?})` — 多学员×多日期批量排课；时间缺省自动取课程默认时间，课程无默认时间则报错；业务级去重：同学员+同日+同 courseId+同时段已存在时自动跳过并计入 `skipped`
- `update_schedule({old, new})` — 修改排课（old 为原完整记录，new 为修改后完整记录，id 必须一致；支持跨学员/跨月迁移）
- `set_attendance({id, studentId, date, attendance})` — 点名：attended=到课 / absent=缺勤 / none=清除回到未点名
- `delete_schedule({confirm, id, studentId, date})` — 删单条排课
- `add_student({name})` / `update_student({id, name})` / `delete_student({confirm, studentId})` — 学员管理
- `add_course({name, defaultStartTime, defaultEndTime, color?})` / `update_course({id, name, defaultStartTime, defaultEndTime, color?})` / `delete_course({confirm, courseId})` — 课程管理
- `save_announcement({content})` — 保存公告（Markdown，上限 5000 字，空串=清空）

## 字段规范

| 字段 | 格式 | 示例 |
|---|---|---|
| `date` | `yyyy-MM-dd` | `2026-09-15` |
| `startTime`/`endTime` | `HH:mm`（24 小时制） | `09:00` |
| `studentId`/`courseId` | `[A-Za-z0-9_-]{1,64}` | `s001` |
| `month` | `yyyy-MM` | `2026-09` |

- `Schedule` 对象：`id?`, `studentId`(必填), `studentName`(后端补全), `courseId`(必填), `courseName`(后端根据 courseId 补全，不采信传入值), `date`, `startTime`/`endTime`(写操作必填), `note?`, `color?`(缺省取课程颜色), `attendance?`(attended=到课 / absent=缺勤，缺省=未点名；由 `set_attendance` 设置，新增/修改排课时不传)
- 用户说"下周三"等相对日期时，先换算为绝对日期再调用工具

## 标准工作流

### 1. 查询排课
用户问"张伟下周有什么课"：
1. `list_students({q: "张伟"})` 确认学员 id（重名时向用户澄清）
2. `get_schedules({studentId, startDate, endDate})` 查询
3. 按日期分组，用表格呈现：日期 | 时间 | 课程 | 备注

### 2. 批量排课（最常用）
用户说"给张伟和李娜排下周二、周四的数学课"：
1. `list_students` 拿准确 studentId（逐行核对 id 与姓名对应，`ambiguous: true` 时按 id 精确确认，不凭姓名猜选）
2. `list_courses` 确认课程，取 courseId、默认时间
3. 换算相对日期为绝对日期列表
4. **排课前查重**：`search_schedules({startDate: 最早日期, endDate: 最晚日期, courseId})` 拉取区间内已有排课，剔除已存在的 (studentId, date) 组合，向用户说明"这些已排过，跳过"
5. `batch_add_schedules({courseId, dates, studentIds, startTime?, endTime?})`
6. **写后核对（强制）**：比对返回 `data.students` 中的姓名与用户名单，不一致立即停止并修正；向用户报告 `{created, skipped, errors}`，skipped/errors 非零时逐条解释
7. `search_schedules` 复核并展示
8. 完成后生成看板（见工作流 6）

### 3. 调课
用户说"把张伟周二的课挪到周五 15:00"：
1. `get_schedules` 找到原记录，完整保留为 `old`
2. 修改字段生成 `new`（**id 必须不变**）
3. `update_schedule({old, new})`；返回 `moved` 表示已跨学员/跨月迁移

### 4. 新增学员/课程后立即排课
- 新增学员 → `add_student({name})`（后端生成 id，传入 id 会被忽略）→ `list_students` 回读真实 studentId → 再走批量排课流程
- 新增课程 → `add_course`（后端生成 `c_xxx` 格式 id）→ `list_courses` 回读真实 courseId → 再走批量排课流程

### 5. 点名
用户说"给今天的课点名""张伟昨天缺勤了""改回未点名"：
1. `search_schedules({startDate: 目标日期, endDate: 目标日期, courseId?, studentId?})` 拉取要点名的排课，取每条 `id`/`studentId`/`date`
2. 向用户确认名单与状态（到课/缺勤/清除），逐条 `set_attendance`，**串行执行**（见安全边界 4）
3. 返回 `notFound` 非空时告知"该排课已不存在（可能已被删除）"
4. `search_schedules` 复核 attendance 字段

### 6. 生成排课看板（HTML 总览页）
触发时机：批量排课完成后；或用户要求"看某月排课/看板/总览/导出排课表"。
1. `search_schedules({startDate: 月初, endDate: 月末})` + `list_courses()` 取当月排课与课程
2. 用 Write 组装 JSON 文件 `{ "schedules": [...], "courses": [...] }`。可精简字段省 token：只留 `schedules[].studentName/courseName/date/startTime/endTime/attendance` 与 `courses[].name/color`，按 date 分段、每段按班型分组书写；写完校验「各日期分组条数相加 = 工具返回的 total」
3. 执行本地脚本（先 `cd` 到目标工作目录，HTML 输出在 `process.cwd()`）：
   `node <scripts>/build-schedule-page.mjs --month 2026-09 --data schedules-data.json`（也可管道 stdin 传入）
   - `--makeup 2026-08-13,2026-08-28` 标记补课日期；`--out`/`--title` 覆盖输出文件名与主标题
   - **不要传 `--title`**：默认标题与文件名均为「{yyyy}年{M}月排课看板」，仅当用户明确要求自定义时才覆盖
4. 脚本输出统计摘要（条数/日期/学员/班型），如实转述；把 HTML 完整路径告知用户，可直接浏览器打开或打印
5. 生成后删除临时 JSON 文件

### 7. 导入签到表（xlsx/docx）
1. 本地脚本解析（见「本地脚本」）→ 用 Read 读取解析结果
2. `list_students` + `list_courses` 核对姓名与课程（课程不存在时先向用户确认命名再 `add_course`）
3. 请假日期不排课或按用户要求处理
4. **查重**：`search_schedules` 比对已有排课，剔除已存在的 (学员, 日期) 组合
5. `batch_add_schedules` 按班型分批写入（同班型多学员可一次调用；时间用课程默认时间或显式传入）
6. `search_schedules` 复核
- 解析 docx 时注意：合并单元格的值只出现在首个单元格，后续行为空；"请假"标记在对应日期列
- 不要自己写解析脚本；测试文件放 `test-files/`（已 gitignore，不会推送）

### 8. 生成学员考勤表
用户说"我要张伟的考勤表""张伟出勤怎么样"：
1. `list_students({q: "张伟"})` 确认学员 id（重名时向用户澄清）
2. `get_schedules({studentId})` 拉取该学员全部排课记录（用户指定时间范围时传 `startDate`/`endDate`）
3. 按 attendance 字段统计：`attended`=到课 / `absent`=缺勤（请假）/ 缺省=未点名
4. **必须严格按以下格式输出**（存在未点名时插入「未点名」行，位于「实际上课」与「共请假」之间）：

全部已点名时：
```
学员姓名：张伟
共 20 节课
实际上课 15 节
共请假 3 节（2026-09-02、2026-09-09）
```

存在未点名时：
```
学员姓名：张伟
共 20 节课
实际上课 15 节
未点名 2 节课（2026-09-06、2026-09-13）
共请假 3 节（2026-09-02、2026-09-09）
```

- 共多少节课 = 全部排课记录数；实际上课 = attended 数；共请假 = absent 数；未点名 = 无 attendance 标记的记录数；日期均按日期升序排列

## 本地脚本（辅助，非 MCP）

位于本 SKILL.md 同目录的 `scripts/` 子目录（下称 `<scripts>`。Trae：`.trae/skills/schedule-assistant/scripts/`；WorkBuddy：`~/.workbuddy/skills/schedule-assistant/scripts/`；其他 agent 按实际安装目录定位，即 `<SKILL.md所在目录>/scripts/`）。用终端命令执行（Trae 用 RunCommand，其他 agent 用自带 Shell）。首次使用前 `cd <scripts> && npm install`；node 优先用当前环境版本。

- `parse-docx.mjs <绝对路径>` / `parse-xlsx.mjs <绝对路径>` — 签到表解析，纯本地、不连后端，结果写入 `<scripts>/docx-parsed.txt` / `xlsx-parsed.txt`
- `build-schedule-page.mjs` — 看板渲染，零依赖、可直接运行，数据经 JSON 文件或 stdin 传入（用法见工作流 6）

## 安全边界（强制）

1. **删除类工具**（`delete_schedule`/`delete_student`/`delete_course`）：调用前必须列出将删除的具体内容并等待明确确认；`delete_student`/`delete_course` 会级联删除关联**全部排课**，须告知影响范围；确认后才传 `confirm: true`
2. **不代用户猜测**：重名学员、不确定的课程名、日期歧义（"周末"是周六还是周日）先澄清再操作
3. **写操作前先读**：排课前必须先 `list_students` + `list_courses` 核实 id，不凭记忆编造
4. **串行执行写操作**：涉及同一学员或多条写操作时**禁止并行**调用写工具（含 `update_schedule`、`set_attendance`、`update_student` 等批量修复场景）。后端 Blob 存储为读-改-写模式，并发写会互相覆盖丢数据。逐条串行：调用一条 → 等返回成功 → 再下一条；某条失败先重试该条
5. **报告结果**：写操作完成后主动展示后端返回结果，失败时如实报告
6. **公告**：修改前先 `get_announcement` 展示当前内容，确认后再 `save_announcement`

## 错误处理

- "该工具需要管理密码" → 告知用户只读操作可用，写操作需在 MCP 客户端请求头加 `X-Admin-Password`（值同后台登录密码）
- "管理密码错误" → 检查 MCP 配置中的 `X-Admin-Password` 是否正确
- 无法连接 MCP 端点 → 检查云端部署状态与 URL（`https://<域名>/api/mcp`）
- 看板脚本报"未提供数据"/"数据缺少 schedules 数组" → 未传入或 JSON 格式不对，按工作流 6 先取数写入 JSON 再执行
- `batch_add_schedules` 返回 errors → 逐条说明失败原因（如 id 碰撞），建议重试

## 历史数据说明

- 早期批量导入的记录 `startTime`/`endTime` 可能为空串：修复时用 `update_schedule` 补上正确时间（参考 `list_courses` 的课程默认时间）
- `old` 必须原样传读到的完整记录，不要省略或"修正"任何字段（含空串、缺失的 courseId/color），否则后端定位不到
- 历史记录可能缺少 `courseId`/`color`，属正常现象，不代表数据损坏
