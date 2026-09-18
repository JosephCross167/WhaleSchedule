// 列出 Edge Local Storage WAL 里的全部键，看 courseWallpaper 是否还在
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = process.argv[2];
const onlyCourse = process.argv[3] !== "all";

function readVarint(b, p) {
  let shift = 0, v = 0;
  while (p < b.length) { const c = b[p++]; v |= (c & 0x7f) << shift; if (!(c & 0x80)) return [v >>> 0, p]; shift += 7; if (shift > 28) break; }
  return [v >>> 0, p];
}
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
    if (t === 1) { let vlen; [vlen, p] = readVarint(b, p); const value = b.subarray(p, p + vlen); p += vlen; out.push({ t, key, value }); }
    else out.push({ t, key, value: null });
  }
  return out;
}
function readLog(file) {
  const buf = readFileSync(file);
  const recs = [];
  let p = 0, pending = [];
  while (p + 7 <= buf.length) {
    const len = buf.readUInt16LE(p + 4), type = buf[p + 6];
    const data = buf.subarray(p + 7, p + 7 + len);
    p += 7 + len;
    if (len === 0) break;
    if (type === 1) { const m = parseWriteBatch(data); if (m) recs.push(...m); pending = []; }
    else if (type === 2) pending = [data];
    else if (type === 3) pending.push(data);
    else if (type === 4) { pending.push(data); const m = parseWriteBatch(Buffer.concat(pending)); if (m) recs.push(...m); pending = []; }
  }
  return recs;
}

function decodeLSValue(v) {
  if (!v || v.length < 1) return null;
  const k = v[0];
  if (k === 0x00) return v.subarray(1).toString("utf16le").replace(/\0+$/, "");
  if (k === 0x01) return v.subarray(1).toString("utf8").replace(/\0+$/, "");
  return null;
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".log"));
for (const f of files) {
  const recs = readLog(join(DIR, f));
  console.log(`\n===== ${f}  共 ${recs.length} 条 =====`);
  for (const r of recs) {
    const raw = r.key.toString("latin1");
    const idx = raw.lastIndexOf("\x00");
    const origin = idx >= 0 ? raw.slice(0, idx) : "(无origin)";
    const name = idx >= 0 ? raw.slice(idx + 1) : raw;
    const isCourse = /courseWallpaper/i.test(name);
    if (onlyCourse && !isCourse) {
      // 仍然打印非目标键的短名，方便判断
      console.log(`  [其它] ${origin}  ${name.slice(0, 60)}  ${r.t === 1 ? (r.value ? decodeLSValue(r.value)?.length ?? "?" : "?") + " 字符" : "删除"}`);
      continue;
    }
    const text = r.t === 1 ? decodeLSValue(r.value) : null;
    console.log(`  ★ ${r.t === 1 ? "写入" : "删除"}  origin=${origin}  key=${name}`);
    if (text) {
      console.log(`      长度 ${text.length} 字符，前 120 字：`);
      console.log(`      ${text.slice(0, 120).replace(/\n/g, " ")}`);
    }
  }
}
