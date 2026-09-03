// 薄路由层：业务逻辑在 _lib/h-student-update.js（/api/mcp 云端 MCP 复用同一实现，避免 bundle 内函数名冲突）
import { handleStudentUpdate } from '../_lib/h-student-update.js'
export default async function onRequestPut(context) { return handleStudentUpdate(context) }
