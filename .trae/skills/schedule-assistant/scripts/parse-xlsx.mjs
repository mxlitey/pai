// 通用 xlsx 解析器：提取全部工作表为文本表格（跨平台）
// 用法1（CLI）: node parse-xlsx.mjs <xlsx路径>   → 生成 <同目录>/xlsx-parsed.txt
// 用法2（模块）: import { parseXlsx } from './parse-xlsx.mjs'
// 基于 SheetJS（xlsx 包）：支持多工作表、合并单元格、日期、数字格式
import { writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'

// 解析 xlsx，返回 UTF-8 文本（每个工作表一张表格，单元格用 | 分隔）
export function parseXlsx(file) {
  // ESM 入口无 readFile（依赖 fs），改用 read + Buffer
  const wb = XLSX.read(readFileSync(file), { cellDates: true })

  const lines = []
  lines.push(`=== 工作簿（共 ${wb.SheetNames.length} 个工作表）===`)

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false, raw: false })
    lines.push(`\n--- 工作表「${name}」（${rows.length} 行）---`)
    for (const row of rows) {
      // 单元格值转字符串，去除首尾空白；单元格间用 | 分隔
      lines.push(row.map((c) => String(c ?? '').trim()).join(' | '))
    }
  }
  return lines.join('\n')
}

// ===== CLI 入口：直接运行时执行（node parse-xlsx.mjs <xlsx路径>）=====
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const file = process.argv[2]
  if (!file) {
    console.error('用法: node parse-xlsx.mjs <xlsx路径>')
    process.exit(1)
  }
  const text = parseXlsx(file)
  const outPath = join(dirname(file), 'xlsx-parsed.txt')
  writeFileSync(outPath, text, 'utf-8')
  console.log(`已写入: ${outPath}`)
}
