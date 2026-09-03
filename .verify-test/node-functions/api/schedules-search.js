// 薄路由层：业务逻辑在 _lib/h-schedules-search.js（/api/mcp 云端 MCP 复用同一实现，避免 bundle 内函数名冲突）
import { handleSchedulesSearchGet } from '../_lib/h-schedules-search.js'
export default async function onRequestGet(context) { return handleSchedulesSearchGet(context) }
