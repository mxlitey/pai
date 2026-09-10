// 输入校验：存储标识符、日期时间格式，以及学员 / 课程 / 排课字段校验

export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const MONTH_RE = /^\d{4}-\d{2}$/
export const TIME_RE = /^\d{2}:\d{2}$/

// 所有进入 Blob 存储键的标识符必须通过白名单校验，拒绝 ../ // \ 等可越界的字符
export function validateStorageId(id, name = 'id') {
  if (typeof id !== 'string' || !ID_RE.test(id)) {
    throw new Error(`${name} 含非法字符（仅允许字母、数字、下划线、短横线，长度 1-64）`)
  }
}

export function validateMonth(month, name = 'month') {
  if (typeof month !== 'string' || !MONTH_RE.test(month)) {
    throw new Error(`${name} 格式应为 yyyy-MM`)
  }
}

export function validateDate(date, name = 'date') {
  if (typeof date !== 'string' || !DATE_RE.test(date)) {
    throw new Error(`${name} 格式应为 yyyy-MM-dd`)
  }
}

// 学员字段校验（新增 requireId=false，更新 requireId=true）
export function validateStudent(s, { requireId = false } = {}) {
  if (!s) throw new Error('学员数据不能为空')
  if (requireId) {
    if (!s.id) throw new Error('缺少 id')
    if (typeof s.id !== 'string' || !ID_RE.test(s.id)) {
      throw new Error('id 仅允许字母、数字、下划线、短横线，长度 1-64')
    }
  }
  if (!s.name) throw new Error('缺少 name')
  if (typeof s.name !== 'string' || s.name.length > 32) {
    throw new Error('name 需为 1-32 字符的字符串')
  }
}

// 课程字段校验（新增 requireId=false，更新 requireId=true）
export function validateCourse(c, { requireId = false } = {}) {
  if (!c) throw new Error('课程数据不能为空')
  if (requireId && !c.id) throw new Error('缺少 id')
  if (!c.name) throw new Error('缺少 name')
  if (typeof c.name !== 'string' || c.name.length > 64) {
    throw new Error('name 需为 1-64 字符的字符串')
  }
  if (c.color && typeof c.color !== 'string') throw new Error('color 需为字符串')
  if (!c.defaultStartTime) throw new Error('缺少 defaultStartTime（默认开始时间为必填项）')
  if (!c.defaultEndTime) throw new Error('缺少 defaultEndTime（默认结束时间为必填项）')
  if (!TIME_RE.test(c.defaultStartTime)) throw new Error('defaultStartTime 格式应为 HH:mm')
  if (!TIME_RE.test(c.defaultEndTime)) throw new Error('defaultEndTime 格式应为 HH:mm')
}

// 更新排课校验：历史记录可能无 courseId，故校验 courseName 而非 courseId
export function validateScheduleForUpdate(s, prefix) {
  if (!s) throw new Error(`${prefix}: 数据不能为空`)
  if (!s.id) throw new Error(`${prefix}: 缺少 id`)
  if (!s.studentId) throw new Error(`${prefix}: 缺少 studentId`)
  if (!s.courseName) throw new Error(`${prefix}: 缺少 courseName`)
  if (!s.date) throw new Error(`${prefix}: 缺少 date`)
  if (!DATE_RE.test(s.date)) throw new Error(`${prefix}: date 格式应为 yyyy-MM-dd`)
}

// 点名更新项校验
export function validateAttendanceUpdate(u, index) {
  const prefix = `updates[${index}]`
  if (!u || typeof u !== 'object') throw new Error(`${prefix}: 数据不能为空`)
  if (!u.id) throw new Error(`${prefix}: 缺少 id`)
  if (!u.studentId) throw new Error(`${prefix}: 缺少 studentId`)
  if (!u.date || !DATE_RE.test(u.date)) throw new Error(`${prefix}: date 格式应为 yyyy-MM-dd`)
  if (!['attended', 'absent', 'none'].includes(u.attendance)) {
    throw new Error(`${prefix}: attendance 取值应为 attended / absent / none`)
  }
}
