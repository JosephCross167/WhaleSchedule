// 验收：切换工作区（行数不同）+ 缩放，行区高度/可见行/滚动状态是否始终跟随工作区自身
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { spawn } from "node:child_process";

import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/[\\/]+$/, "").replace(/\//g, "\\");  // 仓库根（本脚本在 whale_schedule/<子目录>/ 下）
const DOCROOT = join(ROOT, "whale_schedule", "main");
const PORT = 8841;
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
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9389",
  `--user-data-dir=${join(ROOT, "_tmp_verify", "chrome-profile-sw")}`,
  "--no-first-run", "--disable-extensions", "--hide-scrollbars", "--mute-audio",
  "--window-size=1920,1080", "--force-device-scale-factor=1", "about:blank"], { stdio: "ignore" });
for (let i = 0; i < 100; i++) { try { if ((await fetch("http://127.0.0.1:9389/json/version")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const tgt = await (await fetch("http://127.0.0.1:9389/json/new?about:blank", { method: "PUT" })).json();
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

/* 造三个工作区：9 行 / 3 行 / 1 行，列结构不同 */
await ev(`
  var A = window.__courseApp;
  var mk = function(ncol, nrow, p){
    var cols = [], rows = [];
    for (var i=0;i<ncol;i++) cols.push({field:'c'+(i+1),title:'列'+(i+1),editor:'input'});
    for (var r=0;r<nrow;r++){ var o={}; for (var c=0;c<ncol;c++) o['c'+(c+1)]=p+(r+1); rows.push(o); }
    return { name:p, columns:cols, rows:rows };
  };
  A.state.workspaces = { w9: mk(6,9,'九'), w3: mk(3,3,'三'), w1: mk(2,1,'一') };
  return A.table().setData([{c1:'x'}]).then(function(){ return 'ok'; });
`);
await sleep(600);

const M = `
  var A = window.__courseApp;
  var th = document.querySelector('#course-table .tabulator-tableholder');
  var area = document.querySelector('.table-area');
  var root = getComputedStyle(document.documentElement);
  var rows = document.querySelectorAll('#course-table .tabulator-row');
  var rowH = (rows[0] && rows[0].offsetHeight) || 46;
  var cols = document.querySelectorAll('#course-table .tabulator-col');
  var cw = []; for (var i=0;i<cols.length;i++) cw.push(cols[i].offsetWidth);
  return {
    ws: A.state.activeWsId, scale: parseFloat(root.getPropertyValue('--panel-scale')) || 1,
    dataRows: A.table().getRows().length,
    areaH: area.clientHeight,
    holderH: th.clientHeight, scrollH: th.scrollHeight,
    holderVar: root.getPropertyValue('--holder-h').trim(),
    hasVScroll: th.scrollHeight > th.clientHeight + 1,
    visibleRows: Math.floor(th.clientHeight / rowH),
    colTotal: cw.reduce(function(a,b){return a+b;},0)
  };
`;

console.log("=== 切换工作区 × 缩放矩阵（每格：表格区/行区/可见行/纵向滚动/列总宽）===");
for (const wid of ["w9", "w3", "w1"]) {
  // 先切到别的再切回来，确保真的发生切换
  await ev(`var A=window.__courseApp; A.switchWorkspace('w1'); return 1;`); await sleep(700);
  await ev(`window.__courseApp.switchWorkspace('${wid}'); return 1;`); await sleep(1000);
  await ev(`var A=window.__courseApp; return A.table().setData(A.state.workspaces['${wid}'].rows).then(function(){A.persist();return 'ok';});`);
  await sleep(1000);
  console.log(`\n--- ${wid} ---`);
  for (const pct of [100, 130, 150, 60]) {
    await ev(`window.__courseApp.state.layout.scale = ${pct/100}; window.__courseApp.applyLayout(); return 1;`);
    await sleep(900);
    const m = await ev(M);
    console.log(`  ${String(pct).padStart(3)}%: ws=${m.ws} 数据行=${m.dataRows} 表格区=${String(m.areaH).padStart(4)} 行区=${String(m.holderH).padStart(4)} --holder-h=${m.holderVar.padStart(6)} 可见行=${String(m.visibleRows).padStart(2)} 纵向滚动=${m.hasVScroll ? "有" : "无 "} 列总宽=${m.colTotal}`);
  }
}

console.log("\n=== 结论检查 ===");
console.log("  预期：");
console.log("    w9(9行): 行区 437 左右、可见 9 行、纵向滚动=有");
console.log("    w3(3行): 行区 144 左右、可见 3 行、纵向滚动=无");
console.log("    w1(1行): 行区 144(下限) 、可见 3 行(下限 min-height:90)、纵向滚动=无");
console.log("  且每个工作区在 4 个缩放档位下读数应完全一致（这才是等比缩放）");

ws.close(); chrome.kill(); server.close();
