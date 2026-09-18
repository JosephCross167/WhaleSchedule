// 测一下 PNG / JPEG / WebP 三种截图的耗时与体积
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { spawn } from "node:child_process";

import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/[\\/]+$/, "").replace(/\//g, "\\");  // 仓库根（本脚本在 whale_schedule/<子目录>/ 下）
const DOCROOT = join(ROOT, "whale_schedule", "main");
const PORT = 8784;
const MIME = { ".html": "text/html; charset=utf-8", ".png": "image/png" };
const server = http.createServer(async (req, res) => {
  try {
    const file = normalize(join(DOCROOT, decodeURIComponent(req.url.split("?")[0])));
    const buf = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
    res.end(buf);
  } catch { res.writeHead(404); res.end("404"); }
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  (process.env.LOCALAPPDATA || "") + "/Google/Chrome/Application/chrome.exe"].find((c) => existsSync(c));
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9336",
  `--user-data-dir=${join(ROOT, "_tmp_verify", "chrome-profile-t")}`,
  "--no-first-run", "--disable-extensions", "--hide-scrollbars",
  "--window-size=1920,1080", "--force-device-scale-factor=1", "about:blank"], { stdio: "ignore" });
for (let i = 0; i < 100; i++) { try { if ((await fetch("http://127.0.0.1:9336/json/version")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const tgt = await (await fetch("http://127.0.0.1:9336/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(tgt.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const waits = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && waits.has(m.id)) { const w = waits.get(m.id); waits.delete(m.id); m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result); } };
const send = (method, params = {}, to = 60000) => new Promise((res, rej) => { const i = ++id; waits.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (waits.has(i)) { waits.delete(i); rej(new Error("timeout")); } }, to); });
const ev = async (x) => { const r = await send("Runtime.evaluate", { expression: `(function(){ ${x} })()`, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception)); return r.result.value; };
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/anim/promo.html` });
for (let i = 0; i < 100; i++) { await new Promise((r) => setTimeout(r, 200)); try { if (await ev("return !!window.__anim;")) break; } catch {} }

const formats = [
  { name: "png", params: { format: "png" } },
  { name: "jpeg-q95", params: { format: "jpeg", quality: 95 } },
  { name: "jpeg-q90", params: { format: "jpeg", quality: 90 } },
  { name: "webp-lossless", params: { format: "webp", quality: 100 } },
  { name: "webp-q90", params: { format: "webp", quality: 90 } },
];
const N = 8;
for (const f of formats) {
  // 预热一帧
  await ev("window.__anim.seek(10.0); return 1;");
  await send("Page.captureScreenshot", f.params);
  const t0 = Date.now(); let bytes = 0;
  for (let i = 0; i < N; i++) {
    await ev(`window.__anim.seek(${(5 + i * 0.5).toFixed(2)}); return 1;`);
    const shot = await send("Page.captureScreenshot", f.params);
    bytes += Buffer.from(shot.data, "base64").length;
  }
  const ms = (Date.now() - t0) / N;
  const mb = bytes / N / 1048576;
  console.log(`${f.name.padEnd(14)} ${ms.toFixed(0).padStart(5)} ms/帧   ${mb.toFixed(2)} MB/帧   ` +
    `960帧≈${(ms * 960 / 1000 / 60).toFixed(1)}分钟 ${(mb * 960).toFixed(0)}MB`);
}
ws.close(); chrome.kill(); server.close();
