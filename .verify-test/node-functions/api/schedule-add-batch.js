// 薄路由层：业务逻辑在 _lib/h-schedule-add-batch.js（/api/mcp 云端 MCP 复用同一实现，避免 bundle 内函数名冲突）
import { handleScheduleAddBatch } from '../_lib/h-schedule-add-batch.js'
export default async function onRequestPost(context) { return handleScheduleAddBatch(context) }
