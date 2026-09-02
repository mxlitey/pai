// 解析 docx：解压 word/document.xml，提取段落与表格结构
// 用法：node parse-docx.mjs <docx路径>
// 实现：复制为项目内 .zip（规避 Expand-Archive 后缀限制与沙箱临时目录限制）
import { execSync } from 'node:child_process'
import { readFileSync, rmSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'

const file = process.argv[2]
if (!file) {
  console.error('用法: node parse-docx.mjs <docx路径>')
  process.exit(1)
}

const workDir = join(dirname(file), '.docx-tmp')
const zipPath = join(workDir, 'doc.zip')
mkdirSync(workDir, { recursive: true })

try {
  // 1. 复制为 .zip
  execSync(`Copy-Item -Path "${file}" -Destination "${zipPath}" -Force`, { shell: 'powershell.exe' })
  // 2. 解压到项目内目录
  execSync(`Expand-Archive -Path "${zipPath}" -DestinationPath "${workDir}\\extract" -Force`, { shell: 'powershell.exe' })
} catch (e) {
  console.error('解压失败，请确认是有效的 docx 文件:', e.message)
  rmSync(workDir, { recursive: true, force: true })
  process.exit(1)
}

let xml
try {
  xml = readFileSync(join(workDir, 'extract', 'word', 'document.xml'), 'utf-8')
} finally {
  rmSync(workDir, { recursive: true, force: true })
}

// 提取表格：每个 <w:tbl> → 行 → 单元格文本
function extractTexts(fragment) {
  const texts = []
  const tRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g
  let t
  while ((t = tRe.exec(fragment)) !== null) texts.push(t[1])
  return texts.join('').trim()
}

const tables = []
const tblRe = /<w:tbl>[\s\S]*?<\/w:tbl>/g
let tblMatch
while ((tblMatch = tblRe.exec(xml)) !== null) {
  const rows = []
  const trRe = /<w:tr[ >][\s\S]*?<\/w:tr>/g
  let trMatch
  while ((trMatch = trRe.exec(tblMatch[0])) !== null) {
    const cells = []
    const tcRe = /<w:tc>([\s\S]*?)<\/w:tc>/g
    let tcMatch
    while ((tcMatch = tcRe.exec(trMatch[0])) !== null) {
      cells.push(extractTexts(tcMatch[1]))
    }
    rows.push(cells)
  }
  tables.push(rows)
}

// 提取表格外的正文段落
const bodyTexts = []
const xmlNoTbl = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, '')
const pRe = /<w:p[ >][\s\S]*?<\/w:p>/g
let pMatch
while ((pMatch = pRe.exec(xmlNoTbl)) !== null) {
  const line = extractTexts(pMatch[0])
  if (line) bodyTexts.push(line)
}

// 输出（写 UTF-8 文件，规避控制台 GBK 乱码）
import { writeFileSync } from 'node:fs'
const lines = []
lines.push('=== 正文段落 ===')
for (const line of bodyTexts) lines.push(line)
lines.push(`\n=== 表格（共 ${tables.length} 个）===`)
tables.forEach((rows, i) => {
  lines.push(`\n--- 表格 ${i + 1}（${rows.length} 行）---`)
  for (const cells of rows) lines.push(cells.join(' | '))
})
const outPath = join(dirname(file), 'docx-parsed.txt')
writeFileSync(outPath, lines.join('\n'), 'utf-8')
console.log(`已写入: ${outPath}`)
