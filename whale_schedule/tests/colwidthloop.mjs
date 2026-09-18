// 实验：缩放后连续多次 refreshHeight，列宽是「一次定住」还是「持续放大」？
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { spawn } from "node:child_process";

import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/[\\/]+$/, "").replace(/\//g, "\\");  // 仓库根（本脚本在 whale_schedule/<子目录>/ 下）
const DOCROOT = join(ROOT, "whale_schedule", "main");
const PORT = 8825;
const MIME = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".js": "text/javascript", ".css": "text/css" };
const server = http.createServer(async (req, res) => {
  try {
    const file = normalize(join(DOCROOT, decodeURIComponent(req.url.split("?")[0])));
    const buf = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(buf);
  } catch { res.writeHead(404); res.end("404"); }
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  (process.env.LOCALAPPDATA || "") + "/Google/Chrome/Application/chrome.exe"].find((c) => existsSync(c));
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9373",
  `--user-data-dir=${join(ROOT, "_tmp_verify", "chrome-profile-loop")}`,
  "--no-first-run", "--disable-extensions", "--hide-scrollbars", "--mute-audio",
  "--window-size=1920,1080", "--force-device-scale-factor=1", "about:blank"], { stdio: "ignore" });
for (let i = 0; i < 100; i++) { try { if ((await fetch("http://127.0.0.1:9373/json/version")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const tgt = await (await fetch("http://127.0.0.1:9373/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(tgt.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const waits = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && waits.has(m.id)) { const w = waits.get(m.id); waits.delete(m.id); m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; waits.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); setTimeout(() => { if (waits.has(i)) { waits.delete(i); rej(new Error("timeout " + m)); } }, 60000); });
const ev = async (x) => { const r = await send("Runtime.evaluate", { expression: `(function(){ ${x} })()`, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception)); return r.result.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await send("Page.enable"); await send("Runtime.enable"); await send("DOM.enable");
await send("Network.enable"); await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/index.html?nc=${Date.now()}` });
for (let i = 0; i < 120; i++) { await sleep(200); try { if (await ev("return !!window.__courseApp && !!document.querySelector('#course-table .tabulator-header');")) break; } catch {} }

const WIDTHS = `
  var cols = document.querySelectorAll('#course-table .tabulator-col');
  var w = [];
  for (var i = 0; i < cols.length; i++) w.push(cols[i].offsetWidth);
  var th = document.querySelector('#course-table .tabulator-tableholder');
  return { w: w, total: w.reduce(function(a,b){return a+b;},0), holder: th.clientWidth, scrollW: th.scrollWidth };
`;

console.log("=== 实验 A：多次 redraw 后列宽是否持续增长（scale=1.5 不变）===");
await ev(`document.documentElement.style.setProperty('--panel-scale','1.5'); window.__courseApp.refreshHeight(); return 1;`);
await sleep(900);
for (let k = 1; k <= 5; k++) {
  const m = await ev(WIDTHS);
  console.log(`  第${k}次: 列总宽=${String(m.total).padStart(5)} holder=${m.holder} scrollW=${m.scrollW}  列宽[0..3]=${m.w.slice(0,4).join(",")}`);
  await ev(`window.__courseApp.refreshHeight(); return 1;`);
  await sleep(500);
}

console.log("\n=== 实验 B：直接调 Tabulator 重算列宽（不经过我的函数）===");
const b = await ev(`
  var A = window.__courseApp;
  var before = [];
  var cols = document.querySelectorAll('#course-table .tabulator-col');
  for (var i=0;i<cols.length;i++) before.push(cols[i].offsetWidth);
  A.table().redraw(true);
  return { before: before.reduce(function(a,c){return a+c;},0) };
`);
await sleep(800);
const afterB = await ev(WIDTHS);
console.log(`  redraw 前总宽=${b.before}  redraw 后总宽=${afterB.total}  holder=${afterB.holder}`);

console.log("\n=== 实验 C：scale 不动，只改 table-area 高度，列宽会不会变 ===");
await ev(`document.documentElement.style.setProperty('--panel-scale','1'); window.__courseApp.refreshHeight(); return 1;`);
await sleep(800);
const c1 = await ev(WIDTHS);
await ev(`document.documentElement.style.setProperty('--panel-scale','1.5'); window.__courseApp.refreshHeight(); return 1;`);
await sleep(800);
const c2 = await ev(WIDTHS);
await ev(`document.documentElement.style.setProperty('--panel-scale','1'); window.__courseApp.refreshHeight(); return 1;`);
await sleep(800);
const c3 = await ev(WIDTHS);
console.log(`  100%→150%→100% 列总宽: ${c1.total} → ${c2.total} → ${c3.total}`);
console.log(`  恢复后是否等于原值: ${c3.total === c1.total ? "✓ 是" : "✗ 否（差 " + (c3.total - c1.total) + "px）"}`);

console.log("\n=== 实验 D：列宽是否被写进了 columnConfig（持久化）===");
const d = await ev(`
  var A = window.__courseApp;
  return { colConfig: A.state.columnConfig, sample: JSON.stringify(A.state.columnConfig[1]) };
`);
console.log(`  第2列配置: ${d.sample}`);
console.log(`  配置里是否含 width 字段: ${/\"width\"/.test(d.sample) ? "是" : "否"}`);

ws.close(); chrome.kill(); server.close();
