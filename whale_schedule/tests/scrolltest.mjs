// 实测：高缩放（表格区被压缩）时，表格内部还能不能滚动 / 行能不能滚到
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { spawn } from "node:child_process";

import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/[\\/]+$/, "").replace(/\//g, "\\");  // 仓库根（本脚本在 whale_schedule/<子目录>/ 下）
const DOCROOT = join(ROOT, "whale_schedule", "main");
const JSONFILE = join(ROOT, "whale_schedule", "data", "表格数据_恢复_20260917.json");
const PORT = 8811;
const MIME = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".js": "text/javascript", ".css": "text/css" };
const server = http.createServer(async (req, res) => {
  try {
    const file = normalize(join(DOCROOT, decodeURIComponent(req.url.split("?")[0])));
    const buf = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
    res.end(buf);
  } catch { res.writeHead(404); res.end("404"); }
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
const raw = (await readFile(JSONFILE, "utf8")).trim();

const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  (process.env.LOCALAPPDATA || "") + "/Google/Chrome/Application/chrome.exe"].find((c) => existsSync(c));
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9359",
  `--user-data-dir=${join(ROOT, "_tmp_verify", "chrome-profile-scroll")}`,
  "--no-first-run", "--disable-extensions", "--hide-scrollbars", "--mute-audio",
  "--window-size=1920,1080", "--force-device-scale-factor=1", "about:blank"], { stdio: "ignore" });
for (let i = 0; i < 100; i++) { try { if ((await fetch("http://127.0.0.1:9359/json/version")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const tgt = await (await fetch("http://127.0.0.1:9359/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(tgt.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const waits = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && waits.has(m.id)) { const w = waits.get(m.id); waits.delete(m.id); m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; waits.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); setTimeout(() => { if (waits.has(i)) { waits.delete(i); rej(new Error("timeout " + m)); } }, 60000); });
const ev = async (x) => { const r = await send("Runtime.evaluate", { expression: `(function(){ ${x} })()`, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception)); return r.result.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send("Page.enable"); await send("Runtime.enable"); await send("DOM.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });   // 否则改完代码测的还是旧页面
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/index.html` });
for (let i = 0; i < 120; i++) { await sleep(200); try { if (await ev("return !!window.__courseApp && !!document.querySelector('#course-table .tabulator-header');")) break; } catch {} }

/* 用那份 10 行的恢复数据 */
await ev(`document.getElementById('btn-import').click(); return 1;`);
await sleep(200);
let doc = await send("DOM.getDocument", { depth: -1 });
let node = await send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: "#json-file" });
await send("DOM.setFileInputFiles", { nodeId: node.nodeId, files: [JSONFILE.replace(/\//g, "\\")] });
await ev(`document.getElementById('json-file').dispatchEvent(new Event('change', { bubbles: true })); return 1;`);
await sleep(2500);
const imported = await ev(`return { rows: window.__courseApp.table().getRows().length, cols: window.__courseApp.state.columnConfig.length };`);
console.log("导入数据:", JSON.stringify(imported));

const PROBE = `
  var A = window.__courseApp;
  var th = document.querySelector('#course-table .tabulator-tableholder');
  var area = document.querySelector('.table-area');
  var scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-scale')) || 1;
  return {
    scale: scale,
    rows: A.table().getRows().length,
    areaCssH: Math.round(area.getBoundingClientRect().height / scale),
    thClientH: th ? th.clientHeight : -1,
    thScrollH: th ? th.scrollHeight : -1,
    canScroll: th ? (th.scrollHeight > th.clientHeight + 1) : false,
    scrollTop: th ? th.scrollTop : -1,
    overflowY: th ? getComputedStyle(th).overflowY : null,
    lastRowVisible: (function(){
      var rows = document.querySelectorAll('#course-table .tabulator-row');
      if (!rows.length || !th) return null;
      var last = rows[rows.length - 1];
      var lr = last.getBoundingClientRect(), tr = th.getBoundingClientRect();
      return { inView: lr.bottom <= tr.bottom + 1 && lr.top >= tr.top - 1,
               rowText: (last.textContent || '').trim().slice(0, 12) };
    })()
  };
`;

for (const pct of [100, 130, 150]) {
  await ev(`document.documentElement.style.setProperty('--panel-scale','${pct/100}'); window.__courseApp.refreshHeight(); return 1;`);
  await sleep(700);
  const p = await ev(PROBE);
  console.log(`\n=== 缩放 ${pct}% ===`);
  console.log(`  表格区CSS高=${p.areaCssH}  tableholder client=${p.thClientH} scroll=${p.thScrollH} overflowY=${p.overflowY}`);
  console.log(`  能滚动=${p.canScroll ? "✓ 是" : "✗ 否（内容全装得下）"}   scrollTop=${p.scrollTop}`);
  console.log(`  最后一行的可见性: ${p.lastRowVisible ? (p.lastRowVisible.inView ? "✓ 已可见" : "✗ 在视野外（需滚动）") + "  「" + p.lastRowVisible.rowText + "」" : "取不到"}`);

  if (p.canScroll) {
    // ① 直接设 scrollTop 验证可滚性
    const scrolled = await ev(`
      var th = document.querySelector('#course-table .tabulator-tableholder');
      var before = th.scrollTop;
      th.scrollTop = th.scrollHeight;
      var afterDirect = th.scrollTop;
      th.scrollTop = 0;
      return { before: before, afterDirect: afterDirect };
    `);
    console.log(`  直接设 scrollTop: ${scrolled.before} → ${scrolled.afterDirect} ${scrolled.afterDirect > scrolled.before ? "✓ 可滚" : "✗ 滚不动"}`);

    // ② CDP 发「真实」滚轮事件（isTrusted=true，走浏览器真实输入管线）
    const box = await ev(`
      var th = document.querySelector('#course-table .tabulator-tableholder');
      var r = th.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    `);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y, button: "none" });
    for (let k = 0; k < 4; k++) {
      await send("Input.dispatchMouseEvent", {
        type: "mouseWheel", x: box.x, y: box.y, deltaX: 0, deltaY: 120,
        button: "none", modifiers: 0,
      });
      await sleep(120);
    }
    await sleep(400);
    const afterWheel = await ev(`return document.querySelector('#course-table .tabulator-tableholder').scrollTop;`);
    console.log(`  CDP 真实滚轮 ×4 后 scrollTop = ${afterWheel} ${afterWheel > 0 ? "✓ 滚轮有效" : "✗ 滚轮无效"}`);

    await sleep(300);
    const after = await ev(PROBE);
    console.log(`  滚到底后最后一行: ${after.lastRowVisible && after.lastRowVisible.inView ? "✓ 可见" : "✗ 仍不可见"}`);
  }
}

ws.close(); chrome.kill(); server.close();
