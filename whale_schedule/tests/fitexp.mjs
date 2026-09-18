// 决定性实验：fitColumns 在缩放后把「视觉宽度」当成容器宽度了吗？
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { spawn } from "node:child_process";

import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/[\\/]+$/, "").replace(/\//g, "\\");  // 仓库根（本脚本在 whale_schedule/<子目录>/ 下）
const DOCROOT = join(ROOT, "whale_schedule", "main");
const PORT = 8827;
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
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9375",
  `--user-data-dir=${join(ROOT, "_tmp_verify", "chrome-profile-fit")}`,
  "--no-first-run", "--disable-extensions", "--hide-scrollbars", "--mute-audio",
  "--window-size=1920,1080", "--force-device-scale-factor=1", "about:blank"], { stdio: "ignore" });
for (let i = 0; i < 100; i++) { try { if ((await fetch("http://127.0.0.1:9375/json/version")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const tgt = await (await fetch("http://127.0.0.1:9375/json/new?about:blank", { method: "PUT" })).json();
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

/* 用 10 列数据 */
await ev(`document.getElementById('btn-import').click(); return 1;`);
await sleep(200);
const JSONFILE = join(ROOT, "whale_schedule", "data", "表格数据_恢复_20260917.json").replace(/\//g, "\\");
let doc = await send("DOM.getDocument", { depth: -1 });
let node = await send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: "#json-file" });
await send("DOM.setFileInputFiles", { nodeId: node.nodeId, files: [JSONFILE] });
await ev(`document.getElementById('json-file').dispatchEvent(new Event('change', { bubbles: true })); return 1;`);
await sleep(2500);

const SNAP = `
  var A = window.__courseApp;
  var ct = document.getElementById('course-table');
  var holder = document.querySelector('#course-table .tabulator-tableholder');
  var cols = document.querySelectorAll('#course-table .tabulator-col');
  var w = [];
  for (var i=0;i<cols.length;i++) w.push(cols[i].offsetWidth);
  var total = w.reduce(function(a,b){return a+b;},0);
  var scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-scale')) || 1;
  return {
    scale: scale,
    ctClientW: ct.clientWidth,
    ctOffsetW: ct.offsetWidth,
    ctRectW: Math.round(ct.getBoundingClientRect().width),
    holderClientW: holder.clientWidth,
    holderRectW: Math.round(holder.getBoundingClientRect().width),
    colTotal: total,
    scrollW: holder.scrollWidth,
    hasHScroll: holder.scrollWidth > holder.clientWidth + 1
  };
`;
async function snap(label) {
  const s = await ev(SNAP);
  console.log(`  [${label}] scale=${s.scale} #course-table client=${s.ctClientW} offset=${s.ctOffsetW} rect=${s.ctRectW} | holder client=${s.holderClientW} rect=${s.holderRectW} | 列总宽=${s.colTotal} scrollW=${s.scrollW} ${s.hasHScroll ? "✗横向滚动" : "✓无横向滚动"}`);
  return s;
}

console.log("=== 关键对照：clientWidth（不含 transform） vs getBoundingClientRect（含 transform）===");
await ev(`document.documentElement.style.setProperty('--panel-scale','1'); window.__courseApp.refreshHeight(); return 1;`);
await sleep(800);
const s1 = await snap("scale=1");

await ev(`document.documentElement.style.setProperty('--panel-scale','1.5'); window.__courseApp.refreshHeight(); return 1;`);
await sleep(900);
const s2 = await snap("scale=1.5（只改缩放）");

console.log(`\n  → rect/client 比值: scale=1 时 ${(s1.ctRectW / s1.ctClientW).toFixed(3)}，scale=1.5 时 ${(s2.ctRectW / s2.ctClientW).toFixed(3)}`);
console.log(`  → 列总宽/容器client: scale=1 时 ${(s1.colTotal / s1.ctClientW).toFixed(3)}，scale=1.5 时 ${(s2.colTotal / s2.ctClientW).toFixed(3)}`);
console.log(`  → 结论：${(s2.colTotal / s2.ctClientW).toFixed(2)} ≈ scale，说明列宽是按「视觉宽度」算的`);

console.log("=== 修复验证：按真实路径改缩放，列宽应保持布局宽（无横向滚动）===");
for (const pct of [100, 120, 130, 140, 150, 110, 100, 60]) {
  await ev(`
    window.__courseApp.state.layout.scale = ${pct / 100};
    window.__courseApp.applyLayout();
    return 1;
  `);
  await sleep(1000);
  const s = await ev(SNAP);
  const ok = !s.hasHScroll;
  console.log(`  ${String(pct).padStart(3)}%: scale=${s.scale} client=${s.ctClientW} 列总宽=${String(s.colTotal).padStart(4)} scrollW=${String(s.scrollW).padStart(4)} ${s.hasHScroll ? "✗横向滚动(超 " + (s.scrollW - s.holderClientW) + "px)" : "✓无横向滚动"}  ${ok ? "✓" : "✗"}`);
}

console.log("\n=== 顺带验证：切换工作区（对 10 列数据）列宽是否仍然正确 ===");
await ev(`window.__courseApp.state.layout.scale = 1.5; window.__courseApp.applyLayout(); return 1;`);
await sleep(1600);
await ev(`window.__courseApp.createWorkspace(); return 1;`);
await sleep(1500);
const w1 = await ev(SNAP);
console.log(`  新建工作区(1列) scale=${w1.scale}: 列总宽=${w1.colTotal} client=${w1.ctClientW} ${w1.hasHScroll ? "✗横向滚动" : "✓无横向滚动"}`);
await ev(`var A=window.__courseApp; A.switchWorkspace(Object.keys(A.state.workspaces)[0]); return 1;`);
await sleep(1800);
const w2 = await ev(SNAP);
console.log(`  切回 10 列工作区 scale=${w2.scale}: 列总宽=${w2.colTotal} client=${w2.ctClientW} ${w2.hasHScroll ? "✗横向滚动" : "✓无横向滚动"}`);

console.log("\n=== 兜底验证：面板不会卡在 1 倍（缩放值应已恢复）===");
const fin = await ev(`return { scaleVar: getComputedStyle(document.documentElement).getPropertyValue('--panel-scale').trim(), rectW: Math.round(document.getElementById('course-table').getBoundingClientRect().width), clientW: document.getElementById('course-table').clientWidth };`);
console.log(`  --panel-scale=${fin.scaleVar}  #course-table 视觉宽=${fin.rectW} 布局宽=${fin.clientW}  视觉/布局=${(fin.rectW / fin.clientW).toFixed(2)}`);

ws.close(); chrome.kill(); server.close();
