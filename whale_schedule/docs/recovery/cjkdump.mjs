// 1) 把 UTF-16LE 视角下所有中文文本串提取出来（判断到底有哪些课程）
// 2) 扫描 RocksDB WAL(.log)，找出 courseWallpaper 的写入/删除记录（删除记录里带旧值）
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const DIR = process.argv[2];
const OUTDIR = process.argv[3] || "whale_schedule/build/recover";
mkdirSync(OUTDIR, { recursive: true });

/* ---------------- A. UTF-16LE 文本串提取 ---------------- */
const isCJK = (c) => (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3000 && c <= 0x303f) || (c >= 0xff00 && c <= 0xffef);
const isUseful = (c) => isCJK(c) || (c >= 0x20 && c <= 0x7e);

function extractRuns(text, minLen) {
  const runs = [];
  let cur = "";
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (isUseful(c)) cur += text[i];
    else { if (cur.length >= minLen) runs.push(cur); cur = ""; }
  }
  if (cur.length >= minLen) runs.push(cur);
  return runs;
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".ldb")).sort();
console.log("=== A. 各 ldb 里的中文文本串 ===");
for (const f of files) {
  const buf = readFileSync(join(DIR, f));
  // 两个字节相位都试（UTF-16LE 可能从奇数偏移开始）
  const all = [];
  for (const shift of [0, 1]) {
    const t = buf.subarray(shift).toString("utf16le");
    for (const r of extractRuns(t, 3)) {
      if (/[\u4e00-\u9fff]/.test(r)) all.push(r);
    }
  }
  // 去重 + 只留有中文的
  const uniq = [...new Set(all)].filter((s) => /[\u4e00-\u9fff]/.test(s));
  // 只挑像「文字内容」的（排除超长乱串）
  const good = uniq.filter((s) => s.length <= 40);
  if (!good.length) { console.log(`  ${f}: 无中文串`); continue; }
  console.log(`\n★ ${f}: ${good.length} 条中文串`);
  // 排序：先按长度，再按字典
  good.sort((a, b) => a.localeCompare(b, "zh"));
  for (const s of good.slice(0, 120)) console.log(`    ${s}`);
  if (good.length > 120) console.log(`    ...共 ${good.length} 条`);
  writeFileSync(join(OUTDIR, `cjk_${f.replace(/\W/g, "")}.txt`), good.join("\n"), "utf8");
}

/* ---------------- B. RocksDB WAL 扫描 ---------------- */
console.log("\n\n=== B. RocksDB WAL(.log) 里的记录 ===");
function readVarint(b, p) {
  let shift = 0, v = 0;
  while (p < b.length) { const c = b[p++]; v |= (c & 0x7f) << shift; if (!(c & 0x80)) return [v >>> 0, p]; shift += 7; if (shift > 28) break; }
  return [v >>> 0, p];
}
function decodeVal(v) {
  if (!v || !v.length) return null;
  if (v[0] === 0x00) return v.subarray(1).toString("utf16le").replace(/\0+$/, "");
  if (v[0] === 0x01) return v.subarray(1).toString("utf8").replace(/\0+$/, "");
  return null;
}
for (const f of readdirSync(DIR).filter((x) => x.endsWith(".log"))) {
  const buf = readFileSync(join(DIR, f));
  console.log(`\n--- ${f}  ${buf.length} 字节 ---`);
  let p = 0, recs = 0;
  while (p + 12 <= buf.length) {
    // RocksDB WAL 记录：crc(4) len(2) type(1) data(len)
    const len = buf.readUInt16LE(p + 4);
    const type = buf[p + 6];
    if (len === 0 || p + 7 + len > buf.length) { p++; continue; }   // 失步就滑动
    const data = buf.subarray(p + 7, p + 7 + len);
    if (type === 1) {
      // 整条记录：WriteBatch
      if (data.length >= 12) {
        let q = 8;
        const count = data.readUInt32LE(q); q += 4;
        if (count > 0 && count < 10000) {
          for (let i = 0; i < count; i++) {
            if (q >= data.length) break;
            const t = data[q++];
            let kl; [kl, q] = readVarint(data, q);
            const key = data.subarray(q, q + kl); q += kl;
            let val = null;
            if (t === 1) { let vl; [vl, q] = readVarint(data, q); val = data.subarray(q, q + vl); q += vl; }
            const ks = key.toString("utf8");
            if (!/courseWallpaper/.test(ks)) continue;
            const text = decodeVal(val);
            console.log(`  ${t === 1 ? "写入" : "删除"} key=${JSON.stringify(ks.slice(ks.lastIndexOf("\x00") + 1))} 值=${text ? text.length + "字符" : "(无)"}`);
            if (text) {
              console.log(`     前 300 字: ${text.slice(0, 300).replace(/\n/g, " ")}`);
              writeFileSync(join(OUTDIR, `wal_${f.replace(/\W/g, "")}_${recs}.txt`), text, "utf8");
            }
            recs++;
          }
          p += 7 + len;
          continue;
        }
      }
    }
    p += 7 + len;
  }
  if (!recs) console.log("  （没有 courseWallpaper 记录）");
}
