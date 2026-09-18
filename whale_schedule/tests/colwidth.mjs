// 精确测：缩放后表格各列宽、内容总宽、可视宽，找出横向溢出的真实构成
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { spawn } from "node:child_process";

import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/[\\/]+$/, "").replace(/\//g, "\\");  // 仓库根（本脚本在 whale_schedule/<子目录>/ 下）
const DOCROOT = join(ROOT, "whale_schedule", "main");
const PORT = 8823;
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
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9371",
  `--user-data-dir=${join(ROOT, "_tmp_verify", "chrome-profile-colw")}`,
  "--no-first-run", "--disable-extensions", "--hide-scrollbars", "--mute-audio",
  "--window-size=1920,1080", "--force-device-scale-factor=1", "about:blank"], { stdio: "ignore" });
for (let i = 0; i < 100; i++) { try { if ((await fetch("http://127.0.0.1:9371/json/version")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const tgt = await (await fetch("http://127.0.0.1:9371/json/new?about:blank", { method: "PUT" })).json();
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

/* 灌入 10 列数据（就是截图那个结构） */
await ev(`document.getElementById('btn-import').click(); return 1;`);
await sleep(200);
const JSONFILE = join(ROOT, "whale_schedule", "data", "表格数据_恢复_20260917.json").replace(/\//g, "\\");
await send("DOM.enable");
let doc = await send("DOM.getDocument", { depth: -1 });
let node = await send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: "#json-file" });
await send("DOM.setFileInputFiles", { nodeId: node.nodeId, files: [JSONFILE] });
await ev(`document.getElementById('json-file').dispatchEvent(new Event('change', { bubbles: true })); return 1;`);
await sleep(2500);
console.log("导入:", JSON.stringify(await ev(`return { rows: window.__courseApp.table().getRows().length, cols: window.__courseApp.state.columnConfig.length };`)));

const M = `
  var th = document.querySelector('#course-table .tabulator-tableholder');
  var scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-scale')) || 1;
  var root = getComputedStyle(document.documentElement);
  var header = document.querySelector('#course-table .tabulator-header');
  var cols = document.querySelectorAll('#course-table .tabulator-col');
  var out = { scale: scale, colCount: cols.length, colWidths: [], colTitles: [] };
  for (var i = 0; i < cols.length; i++) {
    // 用 offsetWidth（布局宽，不受 scale 影响），另给视觉宽做对照
    out.colWidths.push(cols[i].offsetWidth);
    var t = cols[i].querySelector('.tabulator-col-title');
    out.colTitles.push(t ? t.textContent.trim() : '?');
  }
  out.contentLayoutW = out.colWidths.reduce(function(a,b){return a+b;},0);
  out.contentVisualW = Math.round(out.contentLayoutW * scale);
  out.holderLayoutW = th.clientWidth;
  out.holderVisualW = Math.round(th.getBoundingClientRect().width);
  out.panelLayoutW = document.getElementById('table-panel').offsetWidth;
  out.tableWidthVar = root.getPropertyValue('--table-width').trim();
  out.hasHScroll = th.scrollWidth > th.clientWidth + 1;
  out.scrollW = th.scrollWidth;
  out.headerOffsetW = header ? header.offsetWidth : -1;
  return out;
`;

console.log("\n=== 各缩放下的列宽（布局宽，不含 scale）与横向溢出 ===");
for (const pct of [100, 120, 130, 140, 150]) {
  await ev(`document.documentElement.style.setProperty('--panel-scale','${pct/100}'); window.__courseApp.refreshHeight(); return 1;`);
  await sleep(800);
  const m = await ev(M);
  console.log(`\n--- ${pct}% ---`);
  console.log(`  列数=${m.colCount}  面板布局宽=${m.panelLayoutW}  table-width变量=${m.tableWidthVar}`);
  console.log(`  列布局宽合计=${m.contentLayoutW}   holder 布局宽=${m.holderLayoutW}   scrollWidth=${m.scrollW}`);
  console.log(`  列视觉宽合计=${m.contentVisualW}   holder 视觉宽=${m.holderVisualW}`);
  console.log(`  横向滚动=${m.hasHScroll ? "✗ 有（超出 " + (m.scrollW - m.holderLayoutW) + "px）" : "✓ 无"}`);
  console.log(`  各列布局宽: ${m.colWidths.join(", ")}`);
  console.log(`  列名      : ${m.colTitles.join(" | ")}`);
}

ws.close(); chrome.kill(); server.close();
