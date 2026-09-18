// 重新审视：缩放后【水平方向】面板到底有没有出界（我之前只测了垂直）
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { spawn } from "node:child_process";

import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/[\\/]+$/, "").replace(/\//g, "\\");  // 仓库根（本脚本在 whale_schedule/<子目录>/ 下）
const DOCROOT = join(ROOT, "whale_schedule", "main");
const PORT = 8821;
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
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9369",
  `--user-data-dir=${join(ROOT, "_tmp_verify", "chrome-profile-horiz")}`,
  "--no-first-run", "--disable-extensions", "--hide-scrollbars", "--mute-audio",
  "--window-size=1920,1080", "--force-device-scale-factor=1", "about:blank"], { stdio: "ignore" });
for (let i = 0; i < 100; i++) { try { if ((await fetch("http://127.0.0.1:9369/json/version")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const tgt = await (await fetch("http://127.0.0.1:9369/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(tgt.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const waits = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && waits.has(m.id)) { const w = waits.get(m.id); waits.delete(m.id); m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; waits.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); setTimeout(() => { if (waits.has(i)) { waits.delete(i); rej(new Error("timeout " + m)); } }, 60000); });
const ev = async (x) => { const r = await send("Runtime.evaluate", { expression: `(function(){ ${x} })()`, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception)); return r.result.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await send("Page.enable"); await send("Runtime.enable");
await send("Network.enable"); await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/index.html?nc=${Date.now()}` });
for (let i = 0; i < 120; i++) { await sleep(200); try { if (await ev("return !!window.__courseApp && !!document.querySelector('#course-table .tabulator-header');")) break; } catch {} }

const M = `
  var panel = document.getElementById('table-panel');
  var pr = panel.getBoundingClientRect();
  var root = getComputedStyle(document.documentElement);
  var scale = parseFloat(root.getPropertyValue('--panel-scale')) || 1;
  var tw = root.getPropertyValue('--table-width').trim();
  var tx = root.getPropertyValue('--table-x').trim();
  var ty = root.getPropertyValue('--table-y').trim();
  return {
    scale: scale,
    tx: tx, ty: ty, tw: tw,
    panelLeft: Math.round(pr.left), panelRight: Math.round(pr.right),
    panelTop: Math.round(pr.top), panelBottom: Math.round(pr.bottom),
    panelW: Math.round(pr.width), panelH: Math.round(pr.height),
    vw: window.innerWidth, vh: window.innerHeight,
    hOut: Math.max(0, -pr.left, pr.right - window.innerWidth),
    vOut: Math.max(0, -pr.top, pr.bottom - window.innerHeight),
    panelCssW: panel.offsetWidth
  };
`;
console.log("=== 水平/垂直出界检查（视口 1920×1080）===");
console.log("  缩放 | --table-width | 面板视觉范围 l..r (宽) | t..b | 水平出界 | 垂直出界");
for (const pct of [100, 110, 120, 130, 140, 150, 60]) {
  await ev(`document.documentElement.style.setProperty('--panel-scale','${pct/100}'); window.__courseApp.refreshHeight(); return 1;`);
  await sleep(700);
  const m = await ev(M);
  console.log(`  ${String(pct).padStart(3)}% | ${m.tw.padStart(6)} | ${String(m.panelLeft).padStart(5)}..${String(m.panelRight).padStart(5)} (${String(m.panelW).padStart(4)}) | ${String(m.panelTop).padStart(4)}..${String(m.panelBottom).padStart(4)} | ${m.hOut > 0 ? "✗ " + m.hOut + "px" : "✓"} | ${m.vOut > 0 ? "✗ " + m.vOut + "px" : "✓"}`);
}
const last = await ev(M);
console.log(`\n  面板 CSS 宽=${last.panelCssW}px  --table-x=${last.tx}  --table-y=${last.ty}`);

console.log("\n=== 表格内部：水平是否出现滚动条（列被挤出可视区）===");
for (const pct of [100, 130, 150]) {
  await ev(`document.documentElement.style.setProperty('--panel-scale','${pct/100}'); window.__courseApp.refreshHeight(); return 1;`);
  await sleep(700);
  const h = await ev(`
    var th = document.querySelector('#course-table .tabulator-tableholder');
    var cols = document.querySelectorAll('#course-table .tabulator-col');
    var widths = [];
    for (var i = 0; i < cols.length; i++) widths.push(Math.round(cols[i].getBoundingClientRect().width));
    var total = widths.reduce(function(a,b){return a+b;},0);
    return { holderW: th.clientWidth, scrollW: th.scrollWidth, totalColW: total, cols: cols.length,
             hasHScroll: th.scrollWidth > th.clientWidth + 1, widths: widths };
  `);
  console.log(`  ${pct}%: holderW=${h.holderW} scrollW=${h.scrollW} 列总宽=${h.totalColW} 列数=${h.cols} 横向滚动=${h.hasHScroll ? "✗ 有（列被挤出）" : "✓ 无"}`);
  console.log(`       列宽: ${h.widths.join(", ")}`);
}

ws.close(); chrome.kill(); server.close();
