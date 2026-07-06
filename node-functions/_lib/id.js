// 排课 id 生成器：时间戳 + 进程内自增计数器 + 随机后缀
// 计数器保证同进程同毫秒内生成的 id 绝对不重复
// 跨请求/跨实例的极小概率碰撞由存储层 batchAddSchedules 在写入前重生成兜底
let idCounter = 0
export function genScheduleId() {
  idCounter = (idCounter + 1) % 0x1000000 // 24 位循环计数
  const ts = Date.now().toString(36)
  const seq = idCounter.toString(36).padStart(4, '0')
  const rand = Math.random().toString(36).slice(2, 8)
  return `s_${ts}${seq}${rand}`
}
