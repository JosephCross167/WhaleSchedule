// 量列宽基准：在 scale=1 下两列工作区的宽列/窄列各多宽？宽度够不够撑住显式宽度？
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { spawn } from "node:child_process";

import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/[\\/]+$/, "").replace(/\//g, "\\");  // 仓库根（本脚本在 whale_schedule/<子目录>/ 下）
const DOCROOT = join(ROOT, "whale_schedule", "main");
const PORT = 8829;
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
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9377",
  `--user-data-dir=${join(ROOT, "_tmp_verify", "chrome-profile-meas")}`,
  "--no-first-run", "--disable-extensions", "--hide-scrollbars", "--mute-audio",
  "--window-size=1920,1080", "--force-device-scale-factor=1", "about:blank"], { stdio: "ignore" });
for (let i = 0; i < 100; i++) { try { if ((await fetch("http://127.0.0.1:9377/json/version")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const tgt = await (await fetch("http://127.0.0.1:9377/json/new?about:blank", { method: "PUT" })).json();
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

/* 导入 10 列数据 */
await ev(`document.getElementById('btn-import').click(); return 1;`);
await sleep(200);
const JSONFILE = join(ROOT, "whale_schedule", "data", "表格数据_恢复_20260917.json").replace(/\//g, "\\");
let doc = await send("DOM.getDocument", { depth: -1 });
let node = await send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: "#json-file" });
await send("DOM.setFileInputFiles", { nodeId: node.nodeId, files: [JSONFILE] });
await ev(`document.getElementById('json-file').dispatchEvent(new Event('change', { bubbles: true })); return 1;`);
await sleep(2500);

/* 把缩放清掉，量 scale=1 的真实列宽 */
await ev(`document.documentElement.style.removeProperty('--panel-scale'); window.__courseApp.refreshHeight(); return 1;`);
await sleep(900);
const m = await ev(`
  var A = window.__courseApp;
  var cols = A.table().getColumns();
  var defs = cols.map(function(c){
    var d = c.getDefinition();
    return { field: d.field, title: d.title, type: (d.editor === 'tickCross' ? 'tick' : 'text'),
             widthGrow: d.widthGrow, minWidth: d.minWidth, curW: Math.round(c.getWidth()) };
  });
  var th = document.querySelector('#course-table .tabulator-tableholder');
  return { defs: defs, holderW: th.clientWidth, ctableW: document.getElementById('course-table').clientWidth };
`);
console.log("=== scale=1 下的列宽基准 ===");
console.log(`  容器宽: #course-table=${m.ctableW}  tableholder=${m.holderW}`);
for (const d of m.defs) {
  console.log(`  ${d.title.padEnd(10)} type=${d.type.padEnd(4)} widthGrow=${String(d.widthGrow).padEnd(4)} minWidth=${String(d.minWidth).padEnd(4)} 实际宽=${d.curW}`);
}
const tickW = m.defs.find((d) => d.type === "tick").curW;
const textW = m.defs.find((d) => d.type === "text" && d.widthGrow === 1) ? m.defs.filter((d) => d.type === "text")[1] : null;
console.log(`\n  窄列(勾选框)实际宽 = ${tickW}px`);
console.log(`  列数 = ${m.defs.length}`);

/* 验证：显式写宽度是否被尊重（会不会被 fitColumns 覆盖）*/
const test = await ev(`
  var A = window.__courseApp;
  A.table().setColumns(A.table().getColumns().map(function(c){
    var d = c.getDefinition();
    d.width = (d.editor === 'tickCross') ? 90 : undefined;
    d.minWidth = 60;
    delete d.widthGrow;
    return d;
  }));
  return 'ok';
`);
await sleep(1200);
const after = await ev(`
  var cols = document.querySelectorAll('#course-table .tabulator-col');
  var w = []; for (var i=0;i<cols.length;i++) w.push(cols[i].offsetWidth);
  var th = document.querySelector('#course-table .tabulator-tableholder');
  return { w: w, total: w.reduce(function(a,b){return a+b;},0), holder: th.clientWidth, scrollW: th.scrollWidth };
`);
console.log("\n=== 显式设窄列 width=90 之后 ===");
console.log(`  各列宽: ${after.w.join(", ")}`);
console.log(`  列总宽=${after.total} holder=${after.holder} scrollW=${after.scrollW} ${after.scrollW > after.holder + 1 ? "✗仍有横向滚动" : "✓无横向滚动"}`);
console.log(`  窄列是否真的变成 90: ${after.w[2] === 90 || Math.abs(after.w[2] - 90) < 3 ? "✓ 是" : "✗ 否（" + after.w[2] + "）"}`);

ws.close(); chrome.kill(); server.close();
