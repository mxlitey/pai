// HTTP 工具：请求体解析与统一 JSON 响应

// 解析请求体 JSON；解析失败或为空时返回 {}
export async function readBody(request) {
  try {
    return (await request.json()) || {}
  } catch {
    return {}
  }
}

// JSON 响应工具
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
