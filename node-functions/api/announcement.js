// 薄路由层：业务逻辑在 _lib/h-announcement.js（/api/mcp 云端 MCP 复用同一实现，避免 bundle 内函数名冲突）
import { handleAnnouncement } from '../_lib/h-announcement.js'
export default async function onRequest(context) { return handleAnnouncement(context) }
