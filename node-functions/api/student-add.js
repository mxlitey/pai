// 薄路由层：业务逻辑在 _lib/h-student-add.js（/api/mcp 云端 MCP 复用同一实现，避免 bundle 内函数名冲突）
import { handleStudentAdd } from '../_lib/h-student-add.js'
export default async function onRequestPost(context) { return handleStudentAdd(context) }
