// 逐帧渲染：headless Chrome + CDP，按确定时间轴 seek 后截屏
// 用法: node _tmp_verify/prender.mjs <startSec> <endSec> <fps> <outDir>
// 时间轴是 t 的纯函数，所以任意帧都能独立、可复现地渲染（便于断点续渲）
import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { spawn } from "node:child_process";

import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/[\\/]+$/, "").replace(/\//g, "\\");  // 仓库根（本脚本在 whale_schedule/<子目录>/ 下）
const DOCROOT = join(ROOT, "whale_schedule", "main");
const PORT = 8783;

const T0 = Number(process.argv[2] ?? 0);
const T1 = Number(process.argv[3] ?? 32);
const FPS = Number(process.argv[4] ?? 30);
const OUT = process.argv[5] || join(ROOT, "_tmp_verify", "render");

const MIME = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".js": "text/javascript", ".css": "text/css" };
const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split("?")[0]);
    const file = normalize(join(DOCROOT, p));
    if (!file.startsWith(normalize(DOCROOT))) { res.writeHead(403); return res.end(); }
    const buf = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
    res.end(buf);
  } catch { res.writeHead(404); res.end("404"); }
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  (process.env.LOCALAPPDATA || "") + "/Google/Chrome/Application/chrome.exe"].find((c) => existsSync(c));
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9335",
  `--user-data-dir=${join(ROOT, "_tmp_verify", "chrome-profile-r")}`,
  "--no-first-run", "--no-default-browser-check", "--disable-extensions",
  "--disable-background-networking", "--disable-sync", "--mute-audio",
  "--hide-scrollbars", "--force-device-scale-factor=1",
  "--window-size=1920,1080", "--js-flags=--max-old-space-size=256", "about:blank"], { stdio: "ignore" });

for (let i = 0; i < 100; i++) { try { if ((await fetch("http://127.0.0.1:9335/json/version")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }

const tgt = await (await fetch("http://127.0.0.1:9335/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(tgt.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const waits = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waits.has(m.id)) { const w = waits.get(m.id); waits.delete(m.id); m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result); }
};
const send = (method, params = {}, to = 60000) => new Promise((res, rej) => {
  const i = ++id; waits.set(i, { res, rej });
  ws.send(JSON.stringify({ id: i, method, params }));
  setTimeout(() => { if (waits.has(i)) { waits.delete(i); rej(new Error("timeout " + method)); } }, to);
});
const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: `(function(){ ${expr} })()`, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception));
  return r.result.value;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/anim/promo.html` });

let ready = false;
for (let i = 0; i < 150; i++) {
  await new Promise((r) => setTimeout(r, 200));
  try { if (await ev("return !!(window.__anim) && !!document.querySelector('.grid-head');")) { ready = true; break; } } catch {}
}
if (!ready) { console.error("PAGE NOT READY"); ws.close(); chrome.kill(); server.close(); process.exit(1); }
console.log("page ready");

await mkdir(OUT, { recursive: true });
const nFrames = Math.round((T1 - T0) * FPS);
console.log(`rendering ${nFrames} frames  ${T0}s → ${T1}s @ ${FPS}fps  →  ${OUT}`);

const t0 = Date.now();
let written = 0, bytes = 0, failed = [];
for (let i = 0; i < nFrames; i++) {
  const t = T0 + i / FPS;
  const file = join(OUT, String(i).padStart(5, "0") + ".jpg");
  let ok = false;
  for (let attempt = 0; attempt < 2 && !ok; attempt++) {
    try {
      await ev(`window.__anim.seek(${t.toFixed(5)}); return 1;`);
      // 截图给足超时：个别帧（状态切换瞬间）会明显变慢
      const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: 92, captureBeyondViewport: false }, 150000);
      const buf = Buffer.from(shot.data, "base64");
      await writeFile(file, buf);
      written++; bytes += buf.length; ok = true;
    } catch (e) {
      if (attempt === 1) { failed.push([i, t.toFixed(2), e.message.slice(0, 60)]); }
      else { await new Promise((r) => setTimeout(r, 1500)); }
    }
  }
  if (i % 30 === 0 || i === nFrames - 1) {
    const el = (Date.now() - t0) / 1000;
    const eta = el / (i + 1) * (nFrames - i - 1);
    console.log(`  ${String(i + 1).padStart(4)}/${nFrames}  t=${t.toFixed(2)}s  ` +
      `${(bytes / 1048576).toFixed(0)}MB  ${(el).toFixed(0)}s elapsed  ETA ${eta.toFixed(0)}s` +
      (failed.length ? `  失败=${failed.length}` : ""));
  }
}
console.log(`done: ${written}/${nFrames} frames, ${(bytes / 1048576).toFixed(1)} MB, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
if (failed.length) console.log("失败帧:", JSON.stringify(failed.slice(0, 20)));
ws.close(); chrome.kill(); server.close();
