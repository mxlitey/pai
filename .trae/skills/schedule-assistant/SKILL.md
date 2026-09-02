---
name: "schedule-assistant"
description: "排课日历管理助手：通过 pai-schedule MCP 工具完成排课查询、新增、批量排课、学员课程管理。当用户要求查课/排课/调课/删课/管理学员课程公告时调用。Invoke when user asks about schedules, students, courses, announcements or batch scheduling."
---

# 排课助手（Schedule Assistant）

通过 `pai-schedule` MCP server 提供的 19 个工具管理排课日历系统。本 skill 定义标准工作流、字段规范与安全边界。

## 可用工具一览

**只读（无鉴权）**：
- `list_students(q?)` — 搜索学员（id 或姓名，精确+模糊）
- `get_schedules({studentId?|studentName?, startDate?, endDate?})` — 按学员查排课
- `get_announcement()` — 读公告

**本地文件解析（无鉴权，无需后端）**：
- `parse_docx({filePath})` — 解析本地 docx，返回正文段落 + 全部表格文本
- `parse_xlsx({filePath})` — 解析本地 xlsx，返回全部工作表文本（支持合并单元格、日期、数字）

**本地脚本（通过 MCP 调用，依赖后端鉴权）**：
- `build_schedule_page({month?, makeup?, out?, title?})` — 排课总览看板生成器，从后端实时拉数据生成 HTML 看板（仅限 MCP 工具调用，无命令行入口）
  - `month` 缺省为当前月；`makeup` 为逗号分隔的补课日期；`out`/`title` 可覆盖输出文件名与主标题
  - 自动统计：排课条数/训练日期/学员/班型；请假自动识别（同班型有课但该学员缺席 → ✕）
  - HTML 输出到当前工作目录，生成后告知用户文件路径

**鉴权读**：
- `search_schedules({startDate?, endDate?, courseId?, studentId?})` — 跨学员搜索排课
- `list_courses()` — 课程列表（含颜色、默认时间）

**写操作**：
- `add_schedule({schedule})` — 新增单条排课
- `batch_add_schedules({courseId, courseName, color?, dates[], startTime?, endTime?, note?, studentIds[]})` — 多学员×多日期批量排课
- `update_schedule({old, new})` — 修改排课（id 必须一致，支持跨学员/跨月迁移）
- `delete_schedule({confirm, id, studentId, date})` — 删单条排课
- `add_student({name})` / `update_student({id, name})` / `delete_student({confirm, studentId})`
- `add_course({name, ...})` / `update_course / delete_course({confirm, courseId})`
- `save_announcement({content})` — 保存公告（Markdown，上限 5000 字，空串=清空）

## 字段规范（严格遵守）

| 字段 | 格式 | 示例 |
|---|---|---|
| `date` | `yyyy-MM-dd` | `2026-09-15` |
| `startTime`/`endTime` | `HH:mm`（24小时制） | `09:00` |
| `studentId`/`courseId` | `[A-Za-z0-9_-]{1,64}` | `s001` |
| `month` | `yyyy-MM` | `2026-09` |

- 用户说"下周三"等相对日期时，先换算为绝对日期再调用工具
- `Schedule` 对象字段：`id?`, `studentId`, `studentName`, `courseId?`, `courseName`, `date`, `startTime`, `endTime`, `note?`, `color?`

## 标准工作流

### 1. 查询排课
用户问"张伟下周有什么课"：
1. `list_students({q: "张伟"})` 确认学员 ID（重名时向用户澄清选哪个）
2. `get_schedules({studentId, startDate, endDate})` 查询
3. 按日期分组汇总，用表格呈现：日期 | 时间 | 课程 | 备注

### 2. 批量排课（最常用）
用户说"给张伟和李娜排下周二、周四的数学课"：
1. `list_students` 拿准确 studentId
2. `list_courses` 确认课程存在，取 courseId、courseName、color、默认时间
3. 换算相对日期为绝对日期列表
4. `batch_add_schedules({courseId, courseName, color, dates, studentIds, startTime?, endTime?})` — 时间缺省时用课程默认时间
5. 向用户报告 `{created, skipped, errors}`；skipped/errors 非零时逐条解释
6. `search_schedules({startDate, endDate})` 复核结果并展示
7. **批量排课完成后调用 `build_schedule_page` 生成看板**（见第 5 节），把生成的 HTML 文件路径告知用户

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
1. 调用 `build_schedule_page({month})`（用户说"这个月/8月"等时换算为 yyyy-MM 传入）
2. 用户提到补课日期时加 `makeup`；用户指定输出名/标题时加 `out` / `title`
3. 工具返回统计摘要（排课条数/日期/学员/班型/请假人次），如实转述
4. HTML 文件生成在工作目录，把完整文件路径告知用户，可直接用浏览器打开或打印

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

- 工具报"未配置 PAI_ADMIN_PASSWORD" → 告知用户只读操作可用，写操作需在 MCP 配置中设置密码
- 工具报"无法连接后端" → 检查 PAI_BASE_URL 与后端部署状态
- 401/登录失败 → 提示检查 PAI_ADMIN_PASSWORD 是否正确（server 会自动重试，连续失败才需人工介入）
- `batch_add_schedules` 返回 errors 时，逐条说明失败原因（如 id 碰撞），建议重试

## 历史数据规范（重要）

- **历史排课记录的 `startTime`/`endTime` 可能为空串**（早期批量导入未写入时间）。修复时用 `update_schedule` 补上正确时间，时间值参考课程默认时间（`list_courses` 查询）
- **`old` 必须原样传读到的完整记录**：不要凭记忆重构、不要省略或"修正"任何字段（包括空串、缺失的 courseId/color），否则后端定位不到记录
- 历史记录可能缺少 `courseId` 或 `color`，属正常现象，不要因此判定数据损坏

## 文件导入（xlsx/docx 签到表）

- 解析文件**优先用 MCP 工具**：`parse_docx({filePath})` / `parse_xlsx({filePath})`，传文件绝对路径，直接返回 UTF-8 文本，不要自己写 PowerShell 脚本解析
- 解析 docx 时注意：合并单元格的值只出现在首个单元格，后续行为空（如班型/时间只写在组内第一行）；"请假"标记在对应日期列
- `test-files/` 目录已被 gitignore，测试文件放这里不会推送到远程
- 导入签到表流程：`parse_docx`/`parse_xlsx` 解析 → `list_students` + `list_courses` 核对姓名与课程（课程不存在时先向用户确认命名再 `add_course`）→ 请假日期不排课或按用户要求处理 → `batch_add_schedules` 按班型分批写入（同班型多学员可一次调用；不传时间则自动用课程默认时间）→ `search_schedules` 复核
