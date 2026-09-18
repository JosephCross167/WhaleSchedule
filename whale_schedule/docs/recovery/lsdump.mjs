// 只读恢复：解 snappy → 解析 LevelDB 表/日志 → 抽出 localStorage 键值
// 绝不写入任何浏览器数据，只读文件 + 另存 JSON 到 whale_schedule/build/recover
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = process.argv[2];
const OUTDIR = process.argv[3] || "whale_schedule/build/recover";
const WANT = process.argv.slice(4);
if (!DIR) { console.error("usage: node lsdump.mjs <leveldb-dir> [outdir] [key...]"); process.exit(2); }

/* ---------------- snappy block 格式解压 ---------------- */
function snappyUncompress(src) {
  let p = 0;
  // 前导 varint：解压后长度
  let ulen = 0, shift = 0;
  for (;;) {
    const c = src[p++];
    ulen |= (c & 0x7f) << shift;
    if (!(c & 0x80)) break;
    shift += 7;
    if (shift > 35) throw new Error("bad varint");
  }
  const dst = Buffer.alloc(ulen);
  let d = 0;
  while (p < src.length) {
    const tag = src[p++];
    const t = tag & 3;
    if (t === 0) {
      // literal
      let len = tag >> 2;
      if (len < 60) { len = len + 1; }
      else {
        const nb = len - 59;              // 1..4 字节长度
        len = 0;
        for (let i = 0; i < nb; i++) len |= src[p + i] << (8 * i);
        p += nb;
        len = len + 1;
      }
      if (p + len > src.length || d + len > ulen) throw new Error("literal overrun");
      src.copy(dst, d, p, p + len);
      p += len; d += len;
    } else {
      let len, off;
      if (t === 1) {
        len = ((tag >> 2) & 0x7) + 4;
        off = ((tag >> 5) << 8) | src[p++];
      } else if (t === 2) {
        len = (tag >> 2) + 1;
        off = src[p] | (src[p + 1] << 8); p += 2;
      } else {
        len = (tag >> 2) + 1;
        off = src[p] | (src[p + 1] << 8) | (src[p + 2] << 16) | (src[p + 3] << 24); p += 4;
      }
      if (off <= 0 || off > d) throw new Error("bad offset");
      if (d + len > ulen) throw new Error("copy overrun");
      // 逐字节拷贝（offset 可能小于 len，必须按序复制）
      for (let i = 0; i < len; i++) { dst[d] = dst[d - off]; d++; }
    }
  }
  if (d !== ulen) throw new Error("length mismatch " + d + "/" + ulen);
  return dst;
}

/* ---------------- LevelDB 表块解析 ---------------- */
function readVarint(b, p) {
  let shift = 0, v = 0;
  while (p < b.length) {
    const c = b[p++];
    v |= (c & 0x7f) << shift;
    if (!(c & 0x80)) return [v >>> 0, p];
    shift += 7;
    if (shift > 28) break;
  }
  return [v >>> 0, p];
}
function parseBlockEntries(blk) {
  if (blk.length < 5) return [];
  const numRestarts = blk.readUInt32LE(blk.length - 4);
  if (numRestarts < 1 || numRestarts > 200000) return [];
  const entriesEnd = blk.length - 4 - numRestarts * 4;
  if (entriesEnd <= 0) return [];
  const out = [];
  let p = 0, prevKey = Buffer.alloc(0);
  while (p < entriesEnd) {
    let shared, nonShared, valLen;
    [shared, p] = readVarint(blk, p);
    [nonShared, p] = readVarint(blk, p);
    [valLen, p] = readVarint(blk, p);
    if (shared > prevKey.length || p + nonShared + valLen > blk.length) break;
    const key = Buffer.concat([prevKey.subarray(0, shared), blk.subarray(p, p + nonShared)]);
    p += nonShared;
    const value = blk.subarray(p, p + valLen);
    p += valLen;
    prevKey = key;
    out.push({ key, value });
  }
  return out;
}

/** 读一个 .ldb 表文件，返回所有 kv（含未压缩的数据块） */
function readTable(file) {
  const buf = readFileSync(file);
  const kvs = [];
  const FOOTER = 48;
  if (buf.length < FOOTER) return kvs;
  let blockCount = 0, snappyCount = 0;
  for (let off = 0; off + 5 <= buf.length - FOOTER; off += 4096) {
    const raw = buf.subarray(off, Math.min(off + 4096, buf.length - FOOTER));
    if (raw.length < 5) break;
    const method = raw[raw.length - 5];
    const len = raw.readUInt32LE(raw.length - 4);
    if (len <= 0 || len > raw.length - 5) continue;
    let blk = raw.subarray(0, len);
    if (method === 1) {
      try { blk = snappyUncompress(blk); snappyCount++; } catch { continue; }
    } else if (method !== 0) continue;
    else blockCount++;
    const es = parseBlockEntries(blk);
    for (const e of es) kvs.push(e);
  }
  return { kvs, blockCount, snappyCount };
}

/** 解析 WAL(.log)：记录格式为 crc(4) len(2) type(1) data，type=1 整条 / 2 首块 / 3 中块 / 4 末块 */
function readLog(file) {
  const buf = readFileSync(file);
  const kvs = [];
  let p = 0, pending = [];
  while (p + 7 <= buf.length) {
    const len = buf.readUInt16LE(p + 4);
    const type = buf[p + 6];
    const data = buf.subarray(p + 7, p + 7 + len);
    p += 7 + len;
    if (len === 0) break;
    if (type === 1) {
      const m = parseWriteBatch(data);
      if (m) kvs.push(...m);
      pending = [];
    } else if (type === 2) { pending = [data]; }
    else if (type === 3) { pending.push(data); }
    else if (type === 4) { pending.push(data); const m = parseWriteBatch(Buffer.concat(pending)); if (m) kvs.push(...m); pending = []; }
  }
  return kvs;
}
/** WriteBatch: seq(8) count(4) 然后 count 组 [type(1) key(varint+bytes) value(varint+bytes)] */
function parseWriteBatch(b) {
  if (b.length < 12) return null;
  let p = 8;
  const count = b.readUInt32LE(p); p += 4;
  if (count > 100000) return null;
  const out = [];
  for (let i = 0; i < count; i++) {
    if (p >= b.length) break;
    const t = b[p++];
    let klen; [klen, p] = readVarint(b, p);
    const key = b.subarray(p, p + klen); p += klen;
    if (t === 1) {   // kTypeValue
      let vlen; [vlen, p] = readVarint(b, p);
      const value = b.subarray(p, p + vlen); p += vlen;
      out.push({ key, value });
    } else {         // kTypeDeletion
      out.push({ key, value: null });
    }
  }
  return out;
}

/* ---------------- Local Storage 值解码 ---------------- */
function decodeLSValue(v) {
  if (!v || v.length < 1) return null;
  const kind = v[0];
  if (kind === 0x00) return v.subarray(1).toString("utf16le").replace(/\0+$/, "");
  if (kind === 0x01) return v.subarray(1).toString("utf8").replace(/\0+$/, "");
  return null;
}

/* ---------------- 主流程 ---------------- */
mkdirSync(OUTDIR, { recursive: true });
const files = readdirSync(DIR).filter((f) => /\.(ldb|log)$/.test(f)).sort();
console.log("读取目录:", DIR);
console.log("文件:", files.join(", "));

// 收集所有 KV；同键取"最后出现的"（WAL 比表新，同文件内后者更新）
const latest = new Map();
let stats = [];
for (const f of files) {
  const full = join(DIR, f);
  let kvs = [];
  try {
    kvs = f.endsWith(".log") ? readLog(full) : readTable(full).kvs;
    if (!f.endsWith(".log")) {
      const s = readTable(full);
      stats.push(`${f}: 块 ${s.blockCount}+snappy ${s.snappyCount}, kv ${s.kvs.length}`);
    } else {
      stats.push(`${f}(WAL): kv ${kvs.length}`);
    }
  } catch (e) { stats.push(`${f}: 读取失败 ${e.message}`); continue; }
  for (const { key, value } of kvs) {
    let ks;
    try { ks = key.toString("utf8"); } catch { continue; }
    const m = /_([^_]+)\x00(.*)$/.exec(ks) || /^_([^\x00]*)\x00(.*)$/.exec(ks);
    // Chrome 的键形如  _<origin>\x00<key>  或带 META 前缀
    const idx = ks.lastIndexOf("\x00");
    if (idx < 0) continue;
    const origin = ks.slice(0, idx);
    const name = ks.slice(idx + 1);
    if (WANT.length && !WANT.includes(name)) continue;
    if (!/courseWallpaper|^META/.test(name) && !WANT.length) {
      if (!/courseWallpaper/.test(name)) continue;
    }
    latest.set(origin + "|" + name, { origin, name, value, file: f });
  }
}
console.log("\n各文件统计:");
for (const s of stats) console.log("  " + s);

console.log(`\n匹配到的键 ${latest.size} 个:`);
let n = 0;
for (const [, rec] of latest) {
  const text = decodeLSValue(rec.value);
  const preview = text ? text.slice(0, 70).replace(/\s+/g, " ") : "(删除标记)";
  console.log(`  [${rec.origin}] ${rec.name}  来自 ${rec.file}  ${text ? text.length + " 字符" : "已删除"}`);
  console.log(`      ${preview}`);
  if (text) {
    try {
      const obj = JSON.parse(text);
      const ws = obj.workspaces ? Object.keys(obj.workspaces).map((k) =>
        `${obj.workspaces[k].name || k}(列${obj.workspaces[k].columns ? obj.workspaces[k].columns.length : 0}/行${obj.workspaces[k].rows ? obj.workspaces[k].rows.length : 0})`).join(" ") : "";
      const out = join(OUTDIR, `recovered_${rec.name.replace(/\W/g, "_")}_${n}.json`);
      writeFileSync(out, JSON.stringify(obj, null, 2), "utf8");
      console.log(`      ✓ JSON 可解析  version=${obj.version}  工作区: ${ws || "(无)"}`);
      console.log(`      → ${out}`);
      n++;
    } catch (e) {
      const out = join(OUTDIR, `rawtext_${rec.name.replace(/\W/g, "_")}.txt`);
      writeFileSync(out, text, "utf8");
      console.log(`      ✗ JSON 解析失败: ${e.message.slice(0, 70)} → 已存原文 ${out}`);
    }
  }
}
console.log(`\n导出 ${n} 份到 ${OUTDIR}`);
