// 暴力内容恢复：扫描所有 .ldb 里的 zstd/snappy 数据，解压后搜课程名
// 不依赖块头格式 —— 直接找压缩流
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { zstdDecompressSync } from "node:zlib";

const DIR = process.argv[2];
const OUTDIR = process.argv[3] || "whale_schedule/build/recover";
mkdirSync(OUTDIR, { recursive: true });

const NEEDLES = ["工科物理", "物理化学", "高等数学", "课程名称", "雨课堂", "云班课", "备注", "courseWallpaper", "columnConfig", "workspaces"];
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/* snappy 解压（用于非 zstd 的块） */
function snappy(src) {
  let p = 0, ulen = 0, shift = 0;
  for (;;) { const c = src[p++]; ulen |= (c & 0x7f) << shift; if (!(c & 0x80)) break; shift += 7; if (shift > 35) throw new Error("v"); }
  if (ulen > 32 * 1024 * 1024) throw new Error("big");
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

const files = readdirSync(DIR).filter((f) => f.endsWith(".ldb")).sort();
console.log("扫描", files.length, "个 ldb\n");

let totalZstd = 0, okZstd = 0, okSnappy = 0;
const hits = [];        // {file, needle, snippet}
const payloads = [];    // 解压出的、含课程相关文字的完整文本

for (const f of files) {
  const buf = readFileSync(join(DIR, f));
  let z = 0, zok = 0;

  /* --- zstd 帧扫描 --- */
  let pos = 0;
  while (true) {
    const i = buf.indexOf(ZSTD_MAGIC, pos);
    if (i < 0) break;
    pos = i + 4;
    z++;
    // zstd 帧可以从魔数处开始解；解到什么程度由帧自身决定
    for (const end of [buf.length]) {
      try {
        const out = zstdDecompressSync(buf.subarray(i, end));
        zok++; totalZstd++;
        const text = out.toString("utf8");
        for (const n of NEEDLES) {
          if (text.includes(n)) {
            hits.push({ file: f, needle: n, at: i });
            const k = text.indexOf(n);
            payloads.push({ file: f, at: i, needle: n, text });
            console.log(`★ ${f} @${i} zstd解出 ${(out.length / 1024).toFixed(0)}KB 含「${n}」`);
            break;
          }
        }
      } catch { /* 帧不完整，跳过 */ }
      break;
    }
  }

  /* --- 原始明文搜索（未压缩块） --- */
  const raw = buf.toString("utf8");
  for (const n of NEEDLES) {
    const k = raw.indexOf(n);
    if (k >= 0) {
      hits.push({ file: f, needle: n, at: k, plain: true });
      console.log(`★ ${f} @${k} 明文含「${n}」`);
      const st = Math.max(0, k - 400), en = Math.min(raw.length, k + 2500);
      payloads.push({ file: f, plain: true, needle: n, text: raw.slice(st, en) });
      break;
    }
  }

  console.log(`  ${f}: zstd帧=${z} 解出=${zok} 明文命中=${hits.filter((h) => h.file === f).length}`);
}
totalZstd = 0;

console.log(`\n=== 汇总 ===`);
console.log(`命中总数: ${hits.length}`);
const byNeedle = {};
for (const h of hits) byNeedle[h.needle] = (byNeedle[h.needle] || 0) + 1;
console.log("按关键词:", JSON.stringify(byNeedle));

// 把含壁纸数据的载荷存下来
let n = 0;
for (const p of payloads) {
  if (!/courseWallpaper|columnConfig|工科物理|物理化学|课程名称/.test(p.text)) continue;
  const out = join(OUTDIR, `payload_${String(n).padStart(2, "0")}_${p.file.replace(/\W/g, "")}_${p.needle}.txt`);
  writeFileSync(out, p.text.slice(0, 500000), "utf8");
  console.log(`  → ${out}  (${p.text.length} 字符)`);
  n++;
}
console.log(`\n导出 ${n} 个载荷到 ${OUTDIR}`);
