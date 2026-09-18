// 从 Edge 的 Local Storage LevelDB 里捞出 courseWallpaper 数据
// LevelDB 的 .ldb 是「前缀压缩的块 + 可选 snappy 压缩」，这里只做无压缩块的解析，
// 并同时用「原文扫描」兜底，尽量多捞回一些内容。
import { readFileSync, writeFileSync } from "node:fs";

const SRC = process.argv[2];
const OUTDIR = process.argv[3] || "whale_schedule/build/recover";
if (!SRC) { console.error("usage: node lsrecover.mjs <leveldb-file> [outdir]"); process.exit(2); }

const buf = readFileSync(SRC);
console.log("file:", SRC, (buf.length / 1024 / 1024).toFixed(1), "MB");

/* ---------- 1. 原始扫描：找所有形如 { ... } 的 JSON 片段 ---------- */
function scanJsonCandidates(b) {
  const out = [];
  const s = b.toString("latin1");
  // courseWallpaper 相关键名附近找找
  const keys = ["courseWallpaper", "columnConfig", "workspaces", "activeWsId", "course_name", "课程名称"];
  const idxs = [];
  for (const k of keys) {
    let i = -1;
    while ((i = s.indexOf(k, i + 1)) !== -1) idxs.push(i);
  }
  // 从每个出现的 '{' 开始尝试配平大括号
  const startIdxs = new Set();
  for (const i of idxs) {
    // 往前找最近的 '{'
    for (let j = i; j >= Math.max(0, i - 200000); j--) {
      if (s[j] === "{") { startIdxs.add(j); break; }
    }
  }
  for (const st of [...startIdxs].sort((a, b2) => a - b2)) {
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let j = st; j < Math.min(s.length, st + 900000); j++) {
      const c = s[j];
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) { end = j; break; } }
    }
    if (end > 0) {
      const chunk = s.slice(st, end + 1);
      try {
        const obj = JSON.parse(chunk);
        out.push({ start: st, len: chunk.length, obj });
      } catch { /* 不是完整 JSON，忽略 */ }
    }
  }
  // 去重（按 start）
  const seen = new Set();
  return out.filter((o) => (seen.has(o.start) ? false : (seen.add(o.start), true)));
}

/* ---------- 2. LevelDB 块解析（仅无压缩块） ---------- */
const BLOCK_SIZE = 4096;
function crcMasked(crc) {
  // LevelDB 的 crc32c 掩码（只用于判断，不校验）
  return (((crc >> 15) | (crc << 17)) + 0xa282ead8) >>> 0;
}
function readVarint(b, p) {
  let shift = 0, v = 0;
  while (p < b.length) {
    const c = b[p++];
    v |= (c & 0x7f) << shift;
    if (!(c & 0x80)) return [v >>> 0, p];
    shift += 7;
    if (shift > 28) return [v >>> 0, p];
  }
  return [v >>> 0, p];
}
function parseBlock(blk) {
  if (blk.length < 5) return [];
  const numRestarts = blk.readUInt32LE(blk.length - 4);
  if (numRestarts < 1 || numRestarts > 100000) return [];
  const end = blk.length - 4 - numRestarts * 4;
  if (end <= 0) return [];
  const entries = [];
  let p = 0;
  while (p < end) {
    let shared, nonShared, valLen;
    try {
      [shared, p] = readVarint(blk, p);
      [nonShared, p] = readVarint(blk, p);
      [valLen, p] = readVarint(blk, p);
    } catch { break; }
    if (p + nonShared + valLen > blk.length) break;
    entries.push({
      shared,
      key: blk.subarray(p, p + nonShared).toString("latin1"),
      value: blk.subarray(p + nonShared, p + nonShared + valLen),
    });
    p += nonShared + valLen;
  }
  return entries;
}

const blocks = [];
let okBlocks = 0, badBlocks = 0;
for (let off = 0; off + 5 <= buf.length; off += BLOCK_SIZE) {
  const raw = buf.subarray(off, Math.min(off + BLOCK_SIZE, buf.length));
  if (raw.length < 5) break;
  const method = raw[raw.length - 5];
  const len = raw.readUInt32LE(raw.length - 4);
  if (method === 0 && len > 0 && len <= raw.length - 5) {
    // 无压缩块
    const blk = raw.subarray(0, len);
    const es = parseBlock(blk);
    if (es.length) { blocks.push(...es); okBlocks++; continue; }
  }
  if (method === 1) badBlocks++; // snappy，跳过
}
console.log(`LevelDB 块：解析成功 ${okBlocks}，snappy(跳过) ${badBlocks}`);
const interested = blocks.filter((e) => /courseWallpaper/.test(e.key) || /columnConfig|workspaces/.test(e.value.toString("latin1").slice(0, 200)));
console.log(`命中 courseWallpaper 的条目：${interested.length}`);
for (const e of interested) {
  console.log(`  键=${JSON.stringify(e.key)}  值长度=${e.value.length}`);
}

/* ---------- 3. 汇总候选 ---------- */
const cands = scanJsonCandidates(buf);
console.log(`\n原始扫描到 ${cands.length} 个可解析 JSON 片段`);
// 只看像工作区数据的
const useful = cands.filter((c) => c.obj && (c.obj.workspaces || c.obj.columnConfig || c.obj.rows));
console.log(`其中像壁纸数据的：${useful.length}`);
useful.sort((a, b) => (b.obj.rows ? b.obj.rows.length : 0) - (a.obj.rows ? a.obj.rows.length : 0));

import { mkdirSync } from "node:fs";
mkdirSync(OUTDIR, { recursive: true });
let n = 0;
for (const c of useful) {
  const wsCount = c.obj.workspaces ? Object.keys(c.obj.workspaces).length : 0;
  const rowCount = Array.isArray(c.obj.rows) ? c.obj.rows.length : 0;
  const wsRows = c.obj.workspaces
    ? Object.values(c.obj.workspaces).reduce((s, w) => s + (w.rows ? w.rows.length : 0), 0)
    : 0;
  const tag = `ws${wsCount}_rows${rowCount}_wsrows${wsRows}`;
  const f = `${OUTDIR}/cand_${String(n).padStart(2, "0")}_${tag}.json`;
  writeFileSync(f, JSON.stringify(c.obj, null, 2), "utf8");
  console.log(`  [${n}] ${tag}  JSON长度=${c.len}  → ${f}`);
  n++;
}
console.log(`\n共导出 ${n} 个候选到 ${OUTDIR}`);
