// 查：缩放/切换工作区后，表格的滚动位置是否残留、内容是否被顶出视野
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { spawn } from "node:child_process";

import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/[\\/]+$/, "").replace(/\//g, "\\");  // 仓库根（本脚本在 whale_schedule/<子目录>/ 下）
const DOCROOT = join(ROOT, "whale_schedule", "main");
const PORT = 8817;
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
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9365",
  `--user-data-dir=${join(ROOT, "_tmp_verify", "chrome-profile-scrollpos")}`,
  "--no-first-run", "--disable-extensions", "--hide-scrollbars", "--mute-audio",
  "--window-size=1920,1080", "--force-device-scale-factor=1", "about:blank"], { stdio: "ignore" });
for (let i = 0; i < 100; i++) { try { if ((await fetch("http://127.0.0.1:9365/json/version")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const tgt = await (await fetch("http://127.0.0.1:9365/json/new?about:blank", { method: "PUT" })).json();
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

/* 造两个工作区：长(14行，必须滚) 和 短(3行，不该滚) */
await ev(`
  var A = window.__courseApp;
  A.table().setData([{c1:'x'}]);
  return 'ok';
`);
await sleep(500);
await ev(`
  var A = window.__courseApp;
  var mk = function(ncol, nrow, prefix){
    var cols = [], rows = [];
    for (var i=0;i<ncol;i++) cols.push({field:'c'+(i+1),title:'列'+(i+1),editor:'input'});
    for (var r=0;r<nrow;r++){ var o={}; for (var c=0;c<ncol;c++) o['c'+(c+1)]=prefix+(r+1); rows.push(o); }
    return {columns:cols, rows:rows};
  };
  A.state.workspaces = { wsLong: mk(4,14,'长'), wsShort: mk(4,3,'短') };
  return 'ok';
`);
for (const wid of ["wsLong", "wsShort"]) {
  await ev(`window.__courseApp.switchWorkspace('${wid}'); return 'ok';`); await sleep(700);
  await ev(`var A=window.__courseApp; return A.table().setData(A.state.workspaces['${wid}'].rows).then(function(){A.persist();return 'ok';});`); await sleep(700);
}

const INFO = `
  var A = window.__courseApp;
  var th = document.querySelector('#course-table .tabulator-tableholder');
  var area = document.querySelector('.table-area');
  var lane = document.getElementById('walker-lane');
  var panel = document.getElementById('table-panel');
  var scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-scale')) || 1;
  var rows = document.querySelectorAll('#course-table .tabulator-row');
  var thRect = th.getBoundingClientRect();
  var fullyVisible = 0;
  for (var i=0;i<rows.length;i++){
    var r = rows[i].getBoundingClientRect();
    if (r.top >= thRect.top - 1 && r.bottom <= thRect.bottom + 1) fullyVisible++;
  }
  var pr = panel.getBoundingClientRect();
  return {
    ws: A.state.activeWsId,
    scale: scale,
    rowCount: A.table().getRows().length,
    laneVar: getComputedStyle(document.documentElement).getPropertyValue('--lane-h').trim(),
    laneOffsetH: lane.offsetHeight,
    laneVisualH: Math.round(lane.getBoundingClientRect().height),
    areaCssH: Math.round(area.getBoundingClientRect().height / scale),
    holderClient: th.clientHeight,
    holderScroll: th.scrollHeight,
    scrollTop: Math.round(th.scrollTop),
    maxScroll: Math.max(0, th.scrollHeight - th.clientHeight),
    hasScrollbar: th.scrollHeight > th.clientHeight + 1,
    fullyVisibleRows: fullyVisible,
    panelBottom: Math.round(pr.bottom),
    inViewport: pr.bottom <= 1080.5 && pr.top >= -0.5
  };
`;
async function info(label) {
  const i = await ev(INFO);
  console.log(`  [${label}] ws=${i.ws} scale=${i.scale} 行=${i.rowCount} 走动区=${i.laneVar}/${i.laneOffsetH} 表格区=${i.areaCssH} holder=${i.holderClient}/${i.holderScroll} 可见行=${i.fullyVisibleRows} 滚动条=${i.hasScrollbar ? "有" : "无"} 面板底=${i.panelBottom} ${i.inViewport ? "✓在屏内" : "✗越界"}`);
  return i;
}

console.log("=== 场景 1：走动区是否会自我递减（连续多次刷新高度）===");
await ev(`window.__courseApp.switchWorkspace('wsLong'); return 1;`); await sleep(800);
await ev(`document.documentElement.style.setProperty('--panel-scale','1.5'); window.__courseApp.refreshHeight(); return 1;`);
await sleep(600);
for (let k = 1; k <= 5; k++) {
  const i = await info(`150% 第${k}次 refreshHeight`);
  await ev(`window.__courseApp.refreshHeight(); return 1;`);
  await sleep(500);
}

console.log("\n=== 场景 2：缩放 → 可见行数（长表格 14 行）===");
for (const pct of [100, 110, 120, 130, 140, 150]) {
  await ev(`document.documentElement.style.setProperty('--panel-scale','${pct/100}'); window.__courseApp.refreshHeight(); return 1;`);
  await sleep(800);
  await info(`长表格 ${pct}%`);
}

console.log("\n=== 场景 3：缩放 → 回到 100% 是否恢复原状 ===");
await ev(`document.documentElement.style.setProperty('--panel-scale','1'); window.__courseApp.refreshHeight(); return 1;`);
await sleep(800);
await info("回到 100%");

ws.close(); chrome.kill(); server.close();
