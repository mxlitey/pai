// id 生成器：时间戳 + 进程内自增计数器 + 随机后缀
// 计数器保证同进程同毫秒内生成的 id 绝对不重复
// 跨请求/跨实例的极小概率碰撞由存储层在写入前重生成兜底
// ID 只允许系统自动生成，客户端传入的 id 一律忽略
let idCounter = 0

function genId(prefix) {
  idCounter = (idCounter + 1) % 0x1000000 // 24 位循环计数
  const ts = Date.now().toString(36)
  const seq = idCounter.toString(36).padStart(4, '0')
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}${ts}${seq}${rand}`
}

// 排课 id
export function genScheduleId() {
  return genId('s_')
}

// 学员 id
export function genStudentId() {
  return genId('stu_')
}

// 课程 id
export function genCourseId() {
  return genId('c_')
}
