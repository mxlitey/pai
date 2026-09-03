---
name: "schedule-assistant"
description: "排课日历管理助手：通过 pai-schedule MCP 工具完成排课查询、新增、批量排课、学员课程管理。当用户要求查课/排课/调课/删课/管理学员课程公告时调用。Invoke when user asks about schedules, students, courses, announcements or batch scheduling."
---

# 排课助手（Schedule Assistant）

通过云端 `pai-schedule` MCP server（`https://<域名>/api/mcp`，配置请求头 `X-Admin-Password`）提供的 16 个工具管理排课日历系统，配合本 skill 自带的本地脚本（签到表解析、看板生成）。本 skill 定义标准工作流、字段规范与安全边界。

## 可用工具一览

**只读（无鉴权）**：
- `list_students(q?)` — 搜索学员（id 或姓名，精确+模糊）
- `get_schedules({studentId?|studentName?, startDate?, endDate?})` — 按学员查排课
- `get_announcement()` — 读公告

**鉴权读**：
- `search_schedules({startDate?, endDate?, courseId?, studentId?})` — 跨学员搜索排课
- `list_courses()` — 课程列表（含颜色、默认时间）

**写操作**：
- `add_schedule({schedule})` — 新增单条排课（startTime/endTime 必填；courseName 由后端根据 courseId 自动补全）
- `batch_add_schedules({courseId, dates[], startTime?, endTime?, color?, note?, studentIds[]})` — 多学员×多日期批量排课（courseName 后端自动补全；时间缺省时 MCP 层自动取课程默认时间，课程未配置默认时间则报错；**业务级去重：同学员+同日+同 courseId+同时段已存在时自动跳过并计入 skipped**）
- `update_schedule({old, new})` — 修改排课（id 必须一致，支持跨学员/跨月迁移）
- `delete_schedule({confirm, id, studentId, date})` — 删单条排课
- `add_student({name})` / `update_student({id, name})` / `delete_student({confirm, studentId})`
- `add_course({name, defaultStartTime, defaultEndTime, color?})` — 新增课程（默认上下课时间必填；id 后端自动生成）/ `update_course({id, name, defaultStartTime, defaultEndTime, color?})` / `delete_course({confirm, courseId})`
- `save_announcement({content})` — 保存公告（Markdown，上限 5000 字，空串=清空）

## 本地脚本（RunCommand 执行，位于本 skill 的 `scripts/` 目录）

依赖本地文件系统，不属于云端 MCP，用终端命令执行。首次使用前需安装依赖：`cd .trae/skills/schedule-assistant/scripts && npm install`。

**签到表解析（解析结果写入 <同目录>/docx-parsed.txt 或 xlsx-parsed.txt）**：
```bash
node .trae/skills/schedule-assistant/scripts/parse-docx.mjs <docx文件绝对路径>
node .trae/skills/schedule-assistant/scripts/parse-xlsx.mjs <xlsx文件绝对路径>
```
- docx 返回正文段落 + 全部表格文本（单元格用 `|` 分隔）；xlsx 返回全部工作表（支持合并单元格、日期、数字）
- 纯本地解析，不连后端，无需环境变量

**排课总览看板生成（纯渲染，数据由 MCP 工具获取后传入）**：
1. 先调 MCP 工具取数：`search_schedules({startDate: 月初, endDate: 月末})` 拿排课 + `list_courses()` 拿课程
2. 用 Write 工具把数据组装为 JSON 文件（如 `schedules-data.json`），格式：`{ "schedules": [...], "courses": [...] }`（直接使用工具返回的数组）
3. 执行：`node .trae/skills/schedule-assistant/scripts/build-schedule-page.mjs --month 2026-09 --data schedules-data.json`
   - 也支持管道：`node build-schedule-page.mjs --month 2026-09 < schedules-data.json`
   - `--month` 缺省为当前月；`--makeup 2026-08-13,2026-08-28` 标记补课日期；`--out`/`--title` 可覆盖输出文件名与主标题
4. 自动统计：排课条数/训练日期/学员/班型；请假自动识别（同班型有课但该学员缺席 → ✕）
5. 生成后把输出中的完整文件路径告知用户（HTML 输出到当前工作目录）
6. 生成后可删除临时 JSON 数据文件

## 字段规范（严格遵守）

| 字段 | 格式 | 示例 |
|---|---|---|
| `date` | `yyyy-MM-dd` | `2026-09-15` |
| `startTime`/`endTime` | `HH:mm`（24小时制） | `09:00` |
| `studentId`/`courseId` | `[A-Za-z0-9_-]{1,64}` | `s001` |
| `month` | `yyyy-MM` | `2026-09` |

- 用户说"下周三"等相对日期时，先换算为绝对日期再调用工具
- `Schedule` 对象字段：`id?`, `studentId`, `studentName`(后端补全), `courseId`(必填), `courseName`(后端根据 courseId 补全，不采信传入值), `date`, `startTime`/`endTime`(写操作必填), `note?`, `color?`(缺省取课程颜色)

## 标准工作流

### 1. 查询排课
用户问"张伟下周有什么课"：
1. `list_students({q: "张伟"})` 确认学员 ID（重名时向用户澄清选哪个）
2. `get_schedules({studentId, startDate, endDate})` 查询
3. 按日期分组汇总，用表格呈现：日期 | 时间 | 课程 | 备注

### 2. 批量排课（最常用）
用户说"给张伟和李娜排下周二、周四的数学课"：
1. `list_students` 拿准确 studentId。**注意逐行核对 id 与姓名的对应关系**：列表中相邻两行最容易看串行（历史事故：把 A 学员的课挂到了 B 的 ID 上）；搜索命中多条时（返回 `ambiguous: true`）必须按 id 精确确认，不要凭姓名猜选
2. `list_courses` 确认课程存在，取 courseId、courseName、color、默认时间
3. 换算相对日期为绝对日期列表
4. **排课前查重**：`search_schedules({startDate: 最早日期, endDate: 最晚日期, courseId})` 拉取该课程区间内已有排课，比对 (studentId, date) 组合，把已存在的组合从待提交列表中剔除并向用户说明"这些已排过，跳过"。导入签到表等批量场景尤其必须执行此步
5. `batch_add_schedules({courseId, dates, studentIds, startTime?, endTime?})` — 时间缺省时 MCP 层自动用课程默认时间；课程未配置默认时间时需显式传入
6. **写后立即核对返回明细（强制，防张冠李戴）**：返回的 message 和 `data.students` 会列出实际写入的学员姓名。逐个比对 `data.students` 里的姓名与用户要求的学员名单，**不一致时立即停止并向用户报告错排详情**（用 `update_schedule` 或 `delete_schedule` 修正后再继续），禁止带错继续。同时向用户报告 `{created, skipped, errors}`；skipped/errors 非零时逐条解释（后端也有业务级去重兜底：同学员+同日+同courseId+同时段自动跳过，双保险）
7. `search_schedules({startDate, endDate})` 复核结果并展示
8. **批量排课完成后执行看板脚本生成总览页**（见第 5 节），把生成的 HTML 文件路径告知用户

### 3. 调课（update）
用户说"把张伟周二的课挪到周五 15:00"：
1. `get_schedules` 找到原记录（完整保留为 `old`）
2. 修改字段生成 `new`（**id 必须不变**）
3. `update_schedule({old, new})`
4. 后端自动处理跨月/跨学员迁移，返回 `moved` 标记

### 4. 新增学员/课程后立即排课
- 新增学员 → `add_student({name})`（后端自动生成 ID，传入 ID 会被忽略）→ **`list_students` 回读一次拿真实 studentId** → 再进入批量排课流程。
- 新增课程 → `add_course`（后端自动生成 `c_xxx` 格式的 ID，传入 ID 会被忽略）→ **必须重新 `list_courses` 回读一次拿到真实 courseId** → 再进入排课流程。新建后直接用传入的 ID 排课会全部落空。

### 5. 生成排课看板（HTML 总览页）
触发时机：**批量排课完成后**；或用户要求"看某月排课/看板/总览/导出排课表"时。
1. `search_schedules({startDate, endDate})` 拉取当月排课 + `list_courses()` 拉取课程列表
2. 用 Write 工具把两组数据组装为 JSON 文件 `{ "schedules": [...], "courses": [...] }`（直接使用工具返回的数组）
3. 执行本地脚本（详见「本地脚本」章节）：`node .trae/skills/schedule-assistant/scripts/build-schedule-page.mjs --month 2026-09 --data schedules-data.json`（用户说"这个月/8月"等时换算为 yyyy-MM 传入；数据也可用管道 stdin 传入）
4. 用户提到补课日期时加 `--makeup`；用户指定输出文件名时加 `--out`
5. **不要传 `--title`**：默认标题与文件名均为「{yyyy}年{M}月排课看板」（如 2026年8月排课看板），不要加"艺术体操/集训"等业务前缀，仅当用户明确要求自定义标题时才覆盖
6. 脚本输出统计摘要（排课条数/日期/学员/班型/请假人次），如实转述；生成后删除临时 JSON 数据文件
7. HTML 文件生成在当前工作目录，把完整文件路径告知用户，可直接用浏览器打开或打印

## 安全边界（强制）

1. **删除类工具**（`delete_schedule` / `delete_student` / `delete_course`）：
   - 调用前**必须**先向用户列出将删除的具体内容并等待明确确认
   - `delete_student` 会级联删除该学员**全部排课**；`delete_course` 会级联删除所有关联排课——必须明确告知用户影响范围
   - 确认后才传 `confirm: true` 执行
2. **不代用户猜测**：学员重名、课程名不确定、日期歧义（"周末"是周六还是周日）时，先澄清再操作
3. **写操作前先读**：排课前必须先 `list_students` + `list_courses` 核实 ID，不要凭记忆编造 ID
4. **串行执行写操作**：涉及同一学员或多条写操作时，**禁止并行调用**写工具（含 `update_schedule`、`update_student` 等多人批量修复场景）。后端 Blob 存储为读-改-写模式，并发写同一文件会相互覆盖（竞态丢数据）。必须逐条串行执行：调用一条 → 等返回成功 → 再调下一条。若某条失败，重试该条后再继续
5. **报告结果**：所有写操作完成后主动展示后端返回结果，失败时如实报告，不静默吞错
6. **公告**：修改公告前先 `get_announcement` 展示当前内容，确认用户意图后再保存

## 错误处理

- 工具报"该工具需要管理密码" → 告知用户只读操作可用，写操作需在 MCP 客户端配置的请求头中添加 `X-Admin-Password`（值同后台登录密码）
- 工具报"管理密码错误" → 提示检查 MCP 配置中的 `X-Admin-Password` 是否正确
- 无法连接 MCP 端点 → 检查云端部署状态与 URL 是否正确（`https://<域名>/api/mcp`）
- 看板脚本报"未提供数据"/"数据缺少 schedules 数组" → 未传入或 JSON 格式不对，按第 5 节流程先取数写入 JSON 再执行
- `batch_add_schedules` 返回 errors 时，逐条说明失败原因（如 id 碰撞），建议重试

## 历史数据规范（重要）

- **历史排课记录的 `startTime`/`endTime` 可能为空串**（早期批量导入未写入时间）。修复时用 `update_schedule` 补上正确时间，时间值参考课程默认时间（`list_courses` 查询）
- **`old` 必须原样传读到的完整记录**：不要凭记忆重构、不要省略或"修正"任何字段（包括空串、缺失的 courseId/color），否则后端定位不到记录
- 历史记录可能缺少 `courseId` 或 `color`，属正常现象，不要因此判定数据损坏

## 文件导入（xlsx/docx 签到表）

- 解析文件**优先用本 skill 自带的本地脚本**（见「本地脚本」章节）：`node .trae/skills/schedule-assistant/scripts/parse-docx.mjs <绝对路径>`（或 parse-xlsx.mjs），解析结果写入 `<同目录>/docx-parsed.txt` / `xlsx-parsed.txt`，用 Read 工具读取后再进入导入流程，不要自己写 PowerShell 脚本解析
- 解析 docx 时注意：合并单元格的值只出现在首个单元格，后续行为空（如班型/时间只写在组内第一行）；"请假"标记在对应日期列
- `test-files/` 目录已被 gitignore，测试文件放这里不会推送到远程
- 导入签到表流程：本地脚本解析 → 读取解析结果 → `list_students` + `list_courses` 核对姓名与课程（课程不存在时先向用户确认命名再 `add_course`）→ 请假日期不排课或按用户要求处理 → **查重：`search_schedules` 比对已有排课，剔除已存在的 (学员, 日期) 组合** → `batch_add_schedules` 按班型分批写入（同班型多学员可一次调用；时间用课程默认时间或显式传入）→ `search_schedules` 复核
