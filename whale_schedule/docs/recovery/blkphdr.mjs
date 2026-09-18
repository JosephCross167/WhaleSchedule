// 暴力确定块头布局：找出让解压成功且大小合理的「长度字段宽度 + 类型字节位置」组合
import { readFileSync } from "node:fs";
import { zstdDecompressSync, inflateSync } from "node:zlib";

const SRC = process.argv[2];
const buf = readFileSync(SRC);
console.log("文件:", SRC, (buf.length / 1048576).toFixed(2), "MB");

function trySnappy(src) {
  let p = 0, ulen = 0, shift = 0;
  for (;;) { const c = src[p++]; ulen |= (c & 0x7f) << shift; if (!(c & 0x80)) break; shift += 7; if (shift > 35) return null; }
  if (ulen > 8 * 1024 * 1024) return null;
  const dst = Buffer.alloc(ulen);
  let d = 0;
  while (p < src.length) {
    const tag = src[p++], t = tag & 3;
    if (t === 0) {
      let len = tag >> 2;
      if (len < 60) len += 1;
      else { const nb = len - 59; len = 0; for (let i = 0; i < nb; i++) len |= src[p + i] << (8 * i); p += nb; len += 1; }
      if (p + len > src.length || d + len > ulen) return null;
      src.copy(dst, d, p, p + len); p += len; d += len;
    } else {
      let len, off;
      if (t === 1) { len = ((tag >> 2) & 0x7) + 4; off = ((tag >> 5) << 8) | src[p++]; }
      else if (t === 2) { len = (tag >> 2) + 1; off = src[p] | (src[p + 1] << 8); p += 2; }
      else { len = (tag >> 2) + 1; off = src[p] | (src[p + 1] << 8) | (src[p + 2] << 16) | (src[p + 3] << 24); p += 4; }
      if (off <= 0 || off > d) return null;
      for (let i = 0; i < len; i++) { dst[d] = dst[d - off]; d++; }
    }
  }
  return d === ulen ? dst : null;
}

console.log("\n=== 探测文件开头的块头 ===");
const head = buf.subarray(0, 32);
console.log("前 32 字节:", [...head].map((v) => v.toString(16).padStart(2, "0")).join(" "));

const results = [];
for (let magic = 0; magic < Math.min(buf.length - 20, 200000); magic++) {
  // 尝试：在 magic 处是「块数据末尾」，其后是 header
  for (let hdrLen = 8; hdrLen <= 14; hdrLen++) {
    const h = magic + hdrLen;
    if (h + 8 > buf.length) continue;
    // 头部里前 4 字节小端长度
    const len = buf.readUInt32LE(magic);
    if (len < 16 || len > 8 * 1024 * 1024) continue;
    if (magic + len > buf.length) continue;
    for (const typePos of [magic + 8, magic + hdrLen - 1, magic + 7]) {
      if (typePos >= buf.length) continue;
      const tb = buf[typePos];
      const type = tb & 0x07;
      const payloadStart = typePos + 1;
      const payload = buf.subarray(payloadStart, magic + len);
      if (payload.length < 8) continue;
      let out = null, how = "";
      try { if (type === 4) { out = zstdDecompressSync(payload); how = "zstd"; } } catch { }
      if (!out && payload.length > 2 && payload[0] === 0x28 && payload[1] === 0xb5) {
        try { out = zstdDecompressSync(payload); how = "zstd-magic"; } catch { }
      }
      if (!out) { try { out = trySnappy(payload); if (out) how = "snappy"; } catch { } }
      if (!out) { try { out = inflateSync(payload); how = "zlib"; } catch { } }
      if (out && out.length > 64) {
        results.push({ magic, hdrLen, len, typePos, type, tb, how, outLen: out.length, out });
      }
    }
  }
  if (results.length > 0) break;   // 只找第一个块
}

if (!results.length) {
  console.log("没找到可解压的块（可能块头更特殊）");
} else {
  const r = results[0];
  console.log(`\n✓ 找到块！`);
  console.log(`   长度字段位置=${r.magic} 值=${r.len}`);
  console.log(`   类型字节位置=${r.typePos} 值=0x${r.tb.toString(16)} (type=${r.type})`);
  console.log(`   载荷起点=${r.typePos + 1}  解压方式=${r.how}  解压后=${r.outLen} 字节`);
  console.log(`   下一个块应从 ${r.magic + r.len} 开始`);
  const nb = r.magic + r.len;
  if (nb + 16 <= buf.length) {
    console.log(`   下一块前 16 字节:`, [...buf.subarray(nb, nb + 16)].map((v) => v.toString(16).padStart(2, "0")).join(" "));
  }
  // 打印解压后开头，确认是 KV 数据
  console.log(`   解压后前 200 字节(可见):`);
  console.log("   " + r.out.subarray(0, 200).toString("latin1").replace(/[^\x20-\x7e]/g, "."));
}
