// 薄路由层：业务逻辑在 _lib/h-course-add.js（/api/mcp 云端 MCP 复用同一实现，避免 bundle 内函数名冲突）
import { handleCourseAdd } from '../_lib/h-course-add.js'
export default async function onRequestPost(context) { return handleCourseAdd(context) }
