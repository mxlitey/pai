// 薄路由层：业务逻辑在 _lib/h-course-delete.js（/api/mcp 云端 MCP 复用同一实现，避免 bundle 内函数名冲突）
import { handleCourseDelete } from '../_lib/h-course-delete.js'
export default async function onRequestDelete(context) { return handleCourseDelete(context) }
