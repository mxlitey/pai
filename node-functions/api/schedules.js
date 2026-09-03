// 薄路由层：业务逻辑在 _lib/h-schedules.js（/api/mcp 云端 MCP 复用同一实现，避免 bundle 内函数名冲突）
import { handleSchedulesGet } from '../_lib/h-schedules.js'
export default async function onRequestGet(context) { return handleSchedulesGet(context) }
