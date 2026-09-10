// 薄路由层：业务逻辑在 _lib/students.js（/api/mcp 云端 MCP 复用同一实现，避免 bundle 内函数名冲突）
import { handleStudentDelete } from '../_lib/students.js'
export default async function onRequestDelete(context) { return handleStudentDelete(context) }
