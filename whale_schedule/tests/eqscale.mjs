// 核心验收：等比缩放 = 布局不变 → 可见行数应【恒定】，不因缩放而凭空出现滚动
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { spawn } from "node:child_process";

import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/[\\/]+$/, "").replace(/\//g, "\\");  // 仓库根（本脚本在 whale_schedule/<子目录>/ 下）
const DOCROOT = join(ROOT, "whale_schedule", "main");
const PORT = 8831;
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
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9379",
  `--user-data-dir=${join(ROOT, "_tmp_verify", "chrome-profile-eq")}`,
  "--no-first-run", "--disable-extensions", "--hide-scrollbars", "--mute-audio",
  "--window-size=1920,1080", "--force-device-scale-factor=1", "about:blank"], { stdio: "ignore" });
for (let i = 0; i < 100; i++) { try { if ((await fetch("http://127.0.0.1:9379/json/version")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const tgt = await (await fetch("http://127.0.0.1:9379/json/new?about:blank", { method: "PUT" })).json();
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

/* 导入 10 行 10 列 */
await ev(`document.getElementById('btn-import').click(); return 1;`);
await sleep(200);
const JSONFILE = join(ROOT, "whale_schedule", "data", "表格数据_恢复_20260917.json").replace(/\//g, "\\");
let doc = await send("DOM.getDocument", { depth: -1 });
let node = await send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: "#json-file" });
await send("DOM.setFileInputFiles", { nodeId: node.nodeId, files: [JSONFILE] });
await ev(`document.getElementById('json-file').dispatchEvent(new Event('change', { bubbles: true })); return 1;`);
await sleep(2500);

/* 再加一个 4 行的工作区，测「本来不用滚的」 */
await ev(`
  var A = window.__courseApp;
  A.state.workspaces.wsShort = { name: '短', columns: [{field:'c1',title:'课程名称',editor:'input'}], rows: [{c1:'甲'},{c1:'乙'},{c1:'丙'}] };
  return 'ok';
`);

const M = `
  var A = window.__courseApp;
  var th = document.querySelector('#course-table .tabulator-tableholder');
  var area = document.querySelector('.table-area');
  var scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-scale')) || 1;
  var rows = document.querySelectorAll('#course-table .tabulator-row');
  // ★ 关键：必须用同一坐标系比较。
  //   offsetHeight 是【布局高度】（不含 transform），getBoundingClientRect 是【视觉高度】（含 transform）。
  //   之前混用两者算"可见行数"，得到的数字没有意义（这是测量错误，不是产品问题）。
  //   布局高度在缩放前后恒定 → 能完整放下的行数也应该恒定。
  var rowH = (rows[0] && rows[0].offsetHeight) || 46;
  var full = Math.floor(th.clientHeight / rowH);
  var panel = document.getElementById('table-panel');
  var pr = panel.getBoundingClientRect();
  return {
    scale: scale, dataRows: A.table().getRows().length,
    areaCss: area.offsetHeight,
    holderClientCss: th.clientHeight,
    rowHCss: rowH,
    scrollCss: th.scrollHeight,
    hasVScroll: th.scrollHeight > th.clientHeight + 1,
    visibleRowsCss: full,
    panelVisualH: Math.round(pr.height), panelBottom: Math.round(pr.bottom)
  };
`;

async function run(label, wid) {
  console.log(`\n=== ${label} ===`);
  const results = [];
  for (const pct of [100, 110, 120, 130, 150, 80, 60]) {
    await ev(`window.__courseApp.switchWorkspace('${wid}'); return 1;`);
    await sleep(900);
    await ev(`window.__courseApp.state.layout.scale = ${pct / 100}; window.__courseApp.applyLayout(); return 1;`);
    await sleep(900);
    const m = await ev(M);
    results.push({ pct, ...m });
    console.log(`  ${String(pct).padStart(3)}%: 表格区=${String(m.areaCss).padStart(4)} 体高=${String(m.holderClientCss).padStart(4)} 可见行=${String(m.visibleRowsCss).padStart(2)} 纵向滚动=${m.hasVScroll ? "有" : "无 "} 面板视觉高=${String(m.panelVisualH).padStart(4)} 底边=${String(m.panelBottom).padStart(4)}${m.panelBottom > 1080 ? " (超出视口)" : ""}`);
  }
  const rowsSet = new Set(results.map((r) => r.visibleRowsCss));
  console.log(`  → 可见行数集合: {${[...rowsSet].sort((a, b) => a - b).join(", ")}}  ${rowsSet.size === 1 ? "✓ 恒定（布局不变的直接证据）" : "✗ 随缩放变化"}`);
  const scrollSet = new Set(results.map((r) => r.hasVScroll));
  console.log(`  → 纵向滚动: ${[...scrollSet].map((v) => (v ? "有" : "无")).join("/")}  ${scrollSet.size === 1 ? "✓ 恒定（你要的：原来要滚的缩放后还要滚，原来不用滚的缩放后也不用滚）" : "✗ 随缩放翻转"}`);
  return results;
}

await run("10 行工作区", Object.keys(await ev("return window.__courseApp.state.workspaces"))[0]);
await run("3 行工作区（本来不该滚）", "wsShort");

ws.close(); chrome.kill(); server.close();
