// 音频分析：时长 / BPM / 节拍网格 / 段落能量
// 用法: node analyze.mjs <raw.s16le> [srcLabel]
// 前置: tools\ffmpeg.exe -v error -i <audio> -ac 1 -ar 44100 -f s16le -y <raw>
// 说明: 沙箱下 node 不能 spawn 管道，所以解码与计算分离，只读文件。
import { existsSync, statSync, readFileSync } from "node:fs";

const RAW = process.argv[2];
if (!RAW) {
  console.error("usage: node analyze.mjs <raw.s16le> [label]");
  process.exit(2);
}
if (!existsSync(RAW)) {
  console.error("NOT FOUND:", RAW);
  process.exit(1);
}
console.log("raw:", RAW, (statSync(RAW).size / 1048576).toFixed(1), "MB",
  "label:", process.argv[3] || "-");

const SR = 44100;
const HOP = 512;
const N = 2048;

// s16le -> float32
const buf = readFileSync(RAW);
const nSamp = Math.floor(buf.length / 2);
const pcm = new Float32Array(nSamp);
for (let i = 0; i < nSamp; i++) pcm[i] = buf.readInt16LE(i * 2) / 32768;

const dur = pcm.length / SR;
console.log("duration:", dur.toFixed(3), "s =", Math.floor(dur / 60) + ":" + String(Math.floor(dur % 60)).padStart(2, "0"));
console.log("samples:", pcm.length);

// ---------- 短时能量 (RMS per hop) ----------
const nFrames = Math.floor((pcm.length - N) / HOP) + 1;
const rms = new Float32Array(nFrames);
for (let i = 0; i < nFrames; i++) {
  const o = i * HOP;
  let s = 0;
  for (let j = 0; j < N; j++) { const v = pcm[o + j]; s += v * v; }
  rms[i] = Math.sqrt(s / N);
}
const db = (v) => 20 * Math.log10(v + 1e-9);

// ---------- 频谱通量 onset envelope ----------
// 简化 DFT：对每个帧取若干频带能量。用 Goertzel 太重，改用 16 个频段的滑动能量
// 这里用一阶差分能量包络 + 半波整流，足够做节拍检测
const flux = new Float32Array(nFrames);
for (let i = 1; i < nFrames; i++) {
  const d = rms[i] - rms[i - 1];
  flux[i] = d > 0 ? d : 0;
}
// 去均值 + 归一化
let m = 0;
for (let i = 0; i < nFrames; i++) m += flux[i];
m /= nFrames;
let vmax = 0;
for (let i = 0; i < nFrames; i++) { flux[i] = Math.max(0, flux[i] - m); if (flux[i] > vmax) vmax = flux[i]; }
if (vmax > 0) for (let i = 0; i < nFrames; i++) flux[i] /= vmax;

const fps = SR / HOP; // ~86.13 frames/s

// ---------- BPM: 自相关 ----------
const minBpm = 60, maxBpm = 200;
const lagMin = Math.round((60 / maxBpm) * fps);
const lagMax = Math.round((60 / minBpm) * fps);
const ac = new Float32Array(lagMax + 1);
for (let lag = lagMin; lag <= lagMax; lag++) {
  let s = 0, n = 0;
  for (let i = 0; i + lag < nFrames; i++) { s += flux[i] * flux[i + lag]; n++; }
  ac[lag] = n ? s / n : 0;
}
// 找峰值
const cands = [];
for (let lag = lagMin + 1; lag < lagMax; lag++) {
  if (ac[lag] > ac[lag - 1] && ac[lag] >= ac[lag + 1]) {
    cands.push({ lag, bpm: (60 * fps) / lag, score: ac[lag] });
  }
}
cands.sort((a, b) => b.score - a.score);
console.log("\n=== BPM candidates (raw) ===");
for (const c of cands.slice(0, 8)) {
  console.log(`  ${c.bpm.toFixed(2)} BPM  lag=${c.lag}  score=${c.score.toFixed(4)}`);
}

// 谐波消歧：把候选折叠到常见区间，偏好 70-160
const scored = cands.map((c) => {
  let bpm = c.bpm;
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  // 折叠后与原速的倍率关系，倍数越"整"越可信
  const ratio = bpm / c.bpm;
  const roundness = 1 / (1 + Math.abs(Math.log2(ratio) - Math.round(Math.log2(ratio))));
  return { ...c, folded: bpm, adj: c.score * (0.6 + 0.4 * roundness) };
});
scored.sort((a, b) => b.adj - a.adj);
const bpm = scored[0].folded;
console.log("\n=== chosen BPM ===");
console.log("  ", bpm.toFixed(2), "(from raw", scored[0].bpm.toFixed(2) + ")");
console.log("  runner-ups:", scored.slice(1, 4).map((s) => s.folded.toFixed(2)).join(", "));

// ---------- 拍点相位：用 chosen BPM 在 onset envelope 上找最佳偏移 ----------
const period = (60 / bpm) * fps; // frames per beat
let bestOff = 0, bestSum = -1;
const steps = Math.round(period * 4); // 1/4 拍精度
for (let s = 0; s < steps; s++) {
  const off = (s / steps) * period;
  let sum = 0, cnt = 0;
  for (let t = off; t < nFrames; t += period) {
    // 在拍点附近 ±2 帧取最大
    const i = Math.round(t);
    let mx = 0;
    for (let k = -2; k <= 2; k++) { const j = i + k; if (j >= 0 && j < nFrames) mx = Math.max(mx, flux[j]); }
    sum += mx; cnt++;
  }
  if (cnt && sum / cnt > bestSum) { bestSum = sum / cnt; bestOff = off; }
}
const phaseSec = bestOff / fps;
const beatSec = 60 / bpm;
console.log("\n=== beat grid ===");
console.log("  period:", beatSec.toFixed(4), "s   phase:", phaseSec.toFixed(3), "s");
const beats = [];
for (let t = phaseSec; t < dur; t += beatSec) beats.push(+t.toFixed(3));
console.log("  beats:", beats.length);

// ---------- 段落结构：每 2 秒的能量(dB) ----------
console.log("\n=== energy envelope (per 2s, dB) ===");
const win = Math.round(2 * fps);
const rows = [];
for (let i = 0; i + win < nFrames; i += win) {
  let s = 0;
  for (let j = 0; j < win; j++) s += rms[i + j] * rms[i + j];
  const e = db(Math.sqrt(s / win));
  rows.push({ t: +(i / fps).toFixed(1), db: +e.toFixed(1) });
}
// 压缩成一行条形图
const minDb = Math.min(...rows.map((r) => r.db));
const maxDb = Math.max(...rows.map((r) => r.db));
const bar = rows.map((r) => {
  const k = (r.db - minDb) / Math.max(0.001, maxDb - minDb);
  return "▁▂▃▄▅▆▇█"[Math.min(7, Math.floor(k * 8))];
}).join("");
console.log("  " + bar);
console.log("  range:", minDb.toFixed(1), "..", maxDb.toFixed(1), "dB");

// 静音/淡出定位
const thresh = minDb + (maxDb - minDb) * 0.12;
const quiet = rows.filter((r) => r.db < thresh).map((r) => r.t);
console.log("  quiet段(前10):", quiet.slice(0, 10).join(", ") || "无");
const lastLoud = [...rows].reverse().find((r) => r.db >= thresh);
console.log("  last loud at:", lastLoud ? lastLoud.t + "s" : "?");

console.log("\n=== JSON ===");
console.log(JSON.stringify({ dur: +dur.toFixed(3), bpm: +bpm.toFixed(2), beatSec: +beatSec.toFixed(4), phaseSec: +phaseSec.toFixed(3), beats: beats.slice(0, 400) }));
