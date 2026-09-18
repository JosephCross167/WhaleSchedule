// RocksDB 表扫描：块头 = CRC(4) + 长度(2,LE) + 类型(1)，块数据紧接其后
// 同时做「内容搜索」：把每个数据块解压后搜课程名，不管版本顺序
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { zstdDecompressSync, inflateSync } from "node:zlib";

const DIR = process.argv[2];
const OUTDIR = process.argv[3] || "whale_schedule/build/recover";
const SEARCH = (process.argv[4] || "工科物理,物理化学,高等数学,课程").split(",");
mkdirSync(OUTDIR, { recursive: true });

/* ---- snappy ---- */
function snappy(src) {
  let p = 0, ulen = 0, shift = 0;
  for (;;) { const c = src[p++]; ulen |= (c & 0x7f) << shift; if (!(c & 0x80)) break; shift += 7; if (shift > 35) throw new Error("v"); }
  if (ulen > 16 * 1024 * 1024) throw new Error("big");
  const dst = Buffer.alloc(ulen);
  let d = 0;
  while (p < src.length) {
    const tag = src[p++], t = tag & 3;
    if (t === 0) {
      let len = tag >> 2;
      if (len < 60) len += 1;
      else { const nb = len - 59; len = 0; for (let i = 0; i < nb; i++) len |= src[p + i] << (8 * i); p += nb; len += 1; }
      if (p + len > src.length || d + len > ulen) throw new Error("l");
      src.copy(dst, d, p, p + len); p += len; d += len;
    } else {
      let len, off;
      if (t === 1) { len = ((tag >> 2) & 0x7) + 4; off = ((tag >> 5) << 8) | src[p++]; }
      else if (t === 2) { len = (tag >> 2) + 1; off = src[p] | (src[p + 1] << 8); p += 2; }
      else { len = (tag >> 2) + 1; off = src[p] | (src[p + 1] << 8) | (src[p + 2] << 16) | (src[p + 3] << 24); p += 4; }
      if (off <= 0 || off > d) throw new Error("o");
      for (let i = 0; i < len; i++) { dst[d] = dst[d - off]; d++; }
    }
  }
  return dst;
}

function decompress(type, blk) {
  if (type === 0) return blk;
  if (type === 1) return snappy(blk);
  if (type === 2) return inflateSync(blk);
  if (type === 4 || type === 5) return zstdDecompressSync(blk);
  throw new Error("type" + type);
}
/** 类型字节可能含高位标志，逐个候选试 */
function decompressSmart(tb, blk) {
  const cands = [tb & 0x07, tb & 0x0f, tb, tb >> 4];
  let last;
  for (const t of cands) {
    try { return { data: decompress(t, blk), used: t }; } catch (e) { last = e; }
  }
  throw last;
}

/* ---- 遍历块 ---- */
function readBlocks(file) {
  const buf = readFileSync(file);
  const blocks = [];
  let off = 0;
  while (off + 7 <= buf.length) {
    const len = buf.readUInt16LE(off + 4);
    if (len <= 0) break;
    const tb = buf[off + 6];
    const start = off + 7;
    if (start + len > buf.length) break;
    const raw = buf.subarray(start, start + len);
    // 先按「未压缩」直接看，再按类型解压
    let data = raw, used = 0;
    try { const r = decompressSmart(tb, raw); data = r.data; used = r.used; } catch { data = raw; used = -1; }
    blocks.push({ off, len, tb, used, data });
    off = start + len;
  }
  return { buf, blocks };
}

function readVarint(b, p) {
  let shift = 0, v = 0;
  while (p < b.length) { const c = b[p++]; v |= (c & 0x7f) << shift; if (!(c & 0x80)) return [v >>> 0, p]; shift += 7; if (shift > 28) break; }
  return [v >>> 0, p];
}
function parseEntries(blk) {
  if (blk.length < 5) return [];
  const nr = blk.readUInt32LE(blk.length - 4);
  if (nr < 1 || nr > 500000) return [];
  const end = blk.length - 4 - nr * 4;
  if (end <= 0) return [];
  const out = [];
  let p = 0, prev = Buffer.alloc(0);
  while (p < end) {
    let sh, ns, vl;
    [sh, p] = readVarint(blk, p);
    [ns, p] = readVarint(blk, p);
    [vl, p] = readVarint(blk, p);
    if (sh > prev.length || ns > 100000 || p + ns + vl > blk.length) break;
    const key = Buffer.concat([prev.subarray(0, sh), blk.subarray(p, p + ns)]);
    p += ns;
    const value = blk.subarray(p, p + vl);
    p += vl;
    prev = key;
    out.push({ key, value });
  }
  return out;
}

function decodeValue(v) {
  if (!v || !v.length) return null;
  const k = v[0];
  if (k === 0x00) return v.subarray(1).toString("utf16le").replace(/\0+$/, "");
  if (k === 0x01) return v.subarray(1).toString("utf8").replace(/\0+$/, "");
  return v.toString("utf8");
}

/* ---- 主流程 ---- */
const files = readdirSync(DIR).filter((f) => f.endsWith(".ldb")).sort();
console.log("扫描文件:", files.length, "个\n");

const found = new Map();   // key -> versions
const contentHits = [];    // 内容搜索命中

for (const f of files) {
  let r;
  try { r = readBlocks(join(DIR, f)); } catch (e) { console.log(`${f}: ${e.message}`); continue; }
  const { blocks } = r;
  let entries = 0, courseBlocks = 0, typeCount = {};
  for (const b of blocks) {
    typeCount[b.tb] = (typeCount[b.tb] || 0) + 1;
    // 内容搜索（在解压后的块里找课程名）
    const text = b.data.toString("utf8");
    for (const s of SEARCH) {
      if (text.includes(s) && !contentHits.some((h) => h.file === f && h.needle === s)) {
        contentHits.push({ file: f, needle: s });
      }
    }
    const es = parseEntries(b.data);
    entries += es.length;
    for (const { key, value } of es) {
      const ks = key.toString("utf8");
      const i = ks.lastIndexOf("\x00");
      const name = i >= 0 ? ks.slice(i + 1) : ks;
      const origin = i >= 0 ? ks.slice(0, i) : "";
      if (!/courseWallpaper/.test(name)) continue;
      courseBlocks++;
      const val = decodeValue(value);
      if (!val) continue;
      const k = origin + "|" + name;
      if (!found.has(k)) found.set(k, []);
      const arr = found.get(k);
      if (!arr.some((x) => x.text === val)) arr.push({ text: val, file: f, len: val.length });
    }
  }
  console.log(`${f}: 块=${blocks.length} 条目=${entries} courseWallpaper条目=${courseBlocks} 类型分布=${JSON.stringify(typeCount)}`);
}

console.log("\n=== 内容搜索命中（课程名出现在块里）===");
if (!contentHits.length) console.log("  无");
for (const h of contentHits) console.log(`  ${h.file}  含「${h.needle}」`);

console.log(`\n=== courseWallpaper 键：${found.size} 个 ===`);
let n = 0;
for (const [k, versions] of found) {
  console.log(`\n★★ ${k}  （${versions.length} 个不同版本）`);
  versions.sort((a, b) => b.len - a.len);
  for (const v of versions) {
    let obj = null, info = "解析失败";
    try { obj = JSON.parse(v.text); } catch { }
    if (obj) {
      info = obj.workspaces
        ? "v" + (obj.version || "?") + " " + Object.entries(obj.workspaces).map(([id, w]) =>
            `${w.name || id}[${w.columns ? w.columns.length : 0}列/${w.rows ? w.rows.length : 0}行]`).join(" ")
        : `v1 rows=${obj.rows ? obj.rows.length : 0} cols=${obj.columnConfig ? obj.columnConfig.length : 0}`;
    }
    console.log(`   ${String(v.len).padStart(6)} 字符  ${v.file}  ${info}`);
    const out = join(OUTDIR, `ver_${String(n).padStart(2, "0")}_${v.len}c_${v.file.replace(/\W/g, "")}.${obj ? "json" : "txt"}`);
    writeFileSync(out, obj ? JSON.stringify(obj, null, 2) : v.text.slice(0, 400000), "utf8");
    if (obj) {
      // 列出所有单元格文本，方便一眼看出有没有课程名
      const cells = new Set();
      if (obj.workspaces) for (const w of Object.values(obj.workspaces)) for (const row of (w.rows || [])) for (const val of Object.values(row)) if (typeof val === "string" && val.trim()) cells.add(val.trim());
      if (Array.isArray(obj.rows)) for (const row of obj.rows) for (const val of Object.values(row)) if (typeof val === "string" && val.trim()) cells.add(val.trim());
      const list = [...cells];
      console.log(`      单元格文本(${list.length}): ${list.slice(0, 24).join(" / ") || "(空)"}`);
    }
    n++;
  }
}
console.log(`\n导出 ${n} 份到 ${OUTDIR}`);
