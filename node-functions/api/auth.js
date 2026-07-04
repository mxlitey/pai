// 登录验证 API
// POST /api/auth  body: { password: string }
// 验证通过返回 token，后续管理请求需携带 Authorization: Bearer <token>
import { signToken, verifyPassword } from '../_lib/auth.js'
import { json } from '../_lib/store.js'

async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

export default async function onRequestPost(context) {
  try {
    const { request, env } = context
    // 兼容多种环境变量访问方式
    const password = env?.ADMIN_PASSWORD || context.ADMIN_PASSWORD

    if (!password) {
      return json(
        { code: 1, message: '服务端未配置管理密码（ADMIN_PASSWORD 环境变量）', data: null },
        500,
      )
    }

    const body = await readBody(request)
    const { password: input } = body

    if (!input) {
      return json({ code: 1, message: '请输入密码', data: null }, 400)
    }

    // 恒定时间比较，防止时序侧信道
    if (!verifyPassword(input, password)) {
      return json({ code: 1, message: '密码错误', data: null }, 401)
    }

    const token = await signToken(password)
    return json({
      code: 0,
      message: '登录成功',
      data: { token },
    })
  } catch (e) {
    return json(
      { code: 1, message: '服务器错误：' + (e?.message || String(e)), data: null },
      500,
    )
  }
}
