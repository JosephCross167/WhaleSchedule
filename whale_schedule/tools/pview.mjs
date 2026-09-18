// 从成片抽帧的 raw 灰度数据打印 ASCII 缩略图（先由 PowerShell 抽帧落盘）
// 用法: node _tmp_verify/pview.mjs <t1> <t2> ...
import { readFileSync, existsSync } from "node:fs";

const W = 96, H = 30;
const TIMES = process.argv.slice(2).map(Number);
const RAMP = " .:-=+*#%@";

for (const t of TIMES) {
  const f = `_tmp_verify/_thumb_${String(t).replace(".", "_")}.raw`;
  if (!existsSync(f)) { console.log(`t=${t}s  缺文件 ${f}`); continue; }
  const buf = readFileSync(f);
  if (buf.length < W * H) { console.log(`t=${t}s  数据不足: ${buf.length}/${W * H}`); continue; }
  let min = 255, max = 0, sum = 0;
  const px = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { const v = buf[i]; px[i] = v; sum += v; if (v < min) min = v; if (v > max) max = v; }
  const mean = sum / (W * H);
  let v2 = 0;
  for (let i = 0; i < W * H; i++) { const d = px[i] - mean; v2 += d * d; }
  const sd = Math.sqrt(v2 / (W * H));
  const lo = mean - 2.0 * sd, hi = mean + 2.0 * sd;
  console.log(`\n=== t=${t}s  亮度 min=${min} mean=${mean.toFixed(0)} max=${max} sd=${sd.toFixed(0)} ===`);
  for (let y = 0; y < H; y += 2) {
    let line = "";
    for (let x = 0; x < W; x++) {
      const v = px[y * W + x];
      const k = Math.max(0, Math.min(1, (v - lo) / Math.max(1, hi - lo)));
      line += RAMP[Math.round(k * (RAMP.length - 1))];
    }
    console.log("  " + line);
  }
}
