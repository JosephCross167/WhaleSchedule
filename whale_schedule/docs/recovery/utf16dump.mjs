// 从二进制文件里按 UTF-16LE 解码出文本，并围绕关键词截取上下文
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const SRC = process.argv[2];
const OUTDIR = process.argv[3] || "whale_schedule/build/recover";
const NEEDLES = ["工科物理", "物理化学", "课程名称", "雨课堂", "columnConfig", "courseWallpaper"];
mkdirSync(OUTDIR, { recursive: true });

const buf = readFileSync(SRC);
console.log("文件:", SRC, buf.length, "字节");

/** 把 buffer 按 UTF-16LE 整体解码（保留所有字符，包括奇怪的） */
const text = buf.toString("utf16le");

/** 找关键词出现位置 */
const positions = [];
for (const n of NEEDLES) {
  let i = -1;
  while ((i = text.indexOf(n, i + 1)) !== -1) positions.push({ n, i });
}
positions.sort((a, b) => a.i - b.i);
console.log(`关键词出现 ${positions.length} 次`);
for (const p of positions) console.log(`  @${p.i}  ${p.n}`);

if (!positions.length) process.exit(0);

/* 找到包含所有内容的最大区间 */
const start = Math.max(0, positions[0].i - 4000);
const end = Math.min(text.length, positions[positions.length - 1].i + 12000);
let region = text.slice(start, end);

/* 清理：把控制字符换成可见占位，便于阅读 */
function clean(s) {
  return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "·");
}
const cleaned = clean(region);

const outTxt = join(OUTDIR, `utf16_${SRC.split(/[\\/]/).pop()}.txt`);
writeFileSync(outTxt, cleaned, "utf8");
console.log(`\n已导出 ${cleaned.length} 字符 → ${outTxt}`);

/* 尝试从这段文本里抽出 JSON 对象 */
const jsonCands = [];
let p = 0;
while (p < text.length) {
  const s = text.indexOf("{", p);
  if (s < 0) break;
  let depth = 0, inStr = false, esc = false, e = -1;
  for (let j = s; j < Math.min(text.length, s + 400000); j++) {
    const c = text[j];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { e = j; break; } }
  }
  if (e > 0) {
    const chunk = text.slice(s, e + 1);
    if (/columnConfig|workspaces|工科物理/.test(chunk)) {
      try { jsonCands.push({ s, obj: JSON.parse(chunk) }); } catch { }
    }
    p = e + 1;
  } else p = s + 1;
}
console.log(`\n从 UTF-16 文本里解出 ${jsonCands.length} 个含课程数据的 JSON`);
let n = 0;
for (const c of jsonCands) {
  const obj = c.obj;
  const info = obj.workspaces
    ? Object.entries(obj.workspaces).map(([id, w]) => `${w.name || id}[${w.columns ? w.columns.length : 0}列/${w.rows ? w.rows.length : 0}行]`).join(" ")
    : `rows=${obj.rows ? obj.rows.length : 0} cols=${obj.columnConfig ? obj.columnConfig.length : 0}`;
  console.log(`  [${n}] @${c.s}  ${info}`);
  if (Array.isArray(obj.rows)) {
    for (const r of obj.rows.slice(0, 12)) {
      const vals = Object.values(r).filter((v) => typeof v === "string" && v.trim()).join(" | ");
      if (vals) console.log(`        ${vals}`);
    }
  }
  const out = join(OUTDIR, `json_from_utf16_${n}.json`);
  writeFileSync(out, JSON.stringify(obj, null, 2), "utf8");
  console.log(`      → ${out}`);
  n++;
}
