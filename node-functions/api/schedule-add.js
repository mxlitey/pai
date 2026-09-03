// 薄路由层：业务逻辑在 _lib/h-schedule-add.js（/api/mcp 云端 MCP 复用同一实现，避免 bundle 内函数名冲突）
import { handleScheduleAdd } from '../_lib/h-schedule-add.js'
export default async function onRequestPost(context) { return handleScheduleAdd(context) }
