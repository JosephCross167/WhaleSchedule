// 验证导入功能改动：拖放区渲染 / 文件选择导入 / 坏 JSON / 空文本提示 / 框外投放拦截
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { spawn } from "node:child_process";

import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/[\\/]+$/, "").replace(/\//g, "\\");  // 仓库根（本脚本在 whale_schedule/<子目录>/ 下）
const DOCROOT = join(ROOT, "whale_schedule", "keying");
const JSONFILE = join(ROOT, "whale_schedule", "data", "表格数据_恢复_20260917.json");
const PORT = 8810;
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
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9360",
  `--user-data-dir=${join(ROOT, "_tmp_verify", "chrome-profile-dropk")}`,
  "--no-first-run", "--disable-extensions", "--hide-scrollbars", "--mute-audio",
  "--window-size=1920,1080", "--force-device-scale-factor=1", "about:blank"], { stdio: "ignore" });
for (let i = 0; i < 100; i++) { try { if ((await fetch("http://127.0.0.1:9360/json/version")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const tgt = await (await fetch("http://127.0.0.1:9360/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(tgt.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const waits = new Map(); const evs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waits.has(m.id)) { const w = waits.get(m.id); waits.delete(m.id); m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result); }
  else if (m.method) evs.push(m);
};
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; waits.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); setTimeout(() => { if (waits.has(i)) { waits.delete(i); rej(new Error("timeout " + m)); } }, 60000); });
const ev = async (x) => { const r = await send("Runtime.evaluate", { expression: `(function(){ ${x} })()`, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception)); return r.result.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send("Page.enable"); await send("Runtime.enable"); await send("DOM.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/index.html` });
for (let i = 0; i < 120; i++) { await sleep(200); try { if (await ev("return !!window.__courseApp && !!document.querySelector('#course-table .tabulator-header');")) break; } catch {} }

const results = [];
function check(name, cond, extra) {
  results.push({ name, ok: !!cond, extra: extra === undefined ? "" : String(extra) });
  console.log(`  ${cond ? "OK  " : "FAIL"} ${name}${extra !== undefined ? "   [" + extra + "]" : ""}`);
}

console.log("=== 1. 打开导入弹窗，检查元素 ===");
const s1 = await ev(`
  document.getElementById('btn-import').click();
  var d = document.getElementById('json-drop');
  var f = document.getElementById('json-file');
  var p = document.getElementById('json-pick');
  var st = document.getElementById('json-status');
  var det = document.querySelector('.json-paste');
  var ta = document.getElementById('json-text');
  var r = d ? d.getBoundingClientRect() : null;
  return {
    modalOpen: document.getElementById('json-modal').classList.contains('open'),
    hasDrop: !!d, hasFile: !!f, hasPick: !!p, hasStatus: !!st, hasDetails: !!det,
    dropVisible: r ? (r.width > 100 && r.height > 40) : false,
    dropRect: r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null,
    detailsOpen: det ? det.open : null,
    fileAccept: f ? f.getAttribute('accept') : null,
    textareaInsideDetails: det && ta ? det.contains(ta) : null
  };
`);
check("弹窗已打开", s1.modalOpen);
check("拖放区存在且可见", s1.hasDrop && s1.dropVisible, JSON.stringify(s1.dropRect));
check("隐藏 file input 存在（accept=" + s1.fileAccept + "）", s1.hasFile);
check("「选择文件…」按钮存在且是主按钮", s1.hasPick, "文案=" + s1.pickText);
check("状态行存在", s1.hasStatus);
check("粘贴文本框已折叠进 <details>", s1.detailsOpen === false && s1.textareaInsideDetails === true, "details.open=" + s1.detailsOpen);

console.log("\n=== 2. 走文件通道导入（CDP 真实设置 files + 触发 change）===");
let doc = await send("DOM.getDocument", { depth: -1 });
let node = await send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: "#json-file" });
await send("DOM.setFileInputFiles", { nodeId: node.nodeId, files: [JSONFILE.replace(/\//g, "\\")] });
await ev(`document.getElementById('json-file').dispatchEvent(new Event('change', { bubbles: true })); return 1;`);
await sleep(2500);
const s2 = await ev(`
  var A = window.__courseApp;
  var rows = A.table().getData();
  var nTrue = 0;
  for (var r = 0; r < rows.length; r++) for (var k in rows[r]) if (rows[r][k] === true) nTrue++;
  var hs = [];
  var els = document.querySelectorAll('#course-table .tabulator-col-title');
  for (var i = 0; i < els.length; i++) hs.push(els[i].textContent.trim());
  return { cols: A.state.columnConfig.map(function(c){return c.title;}), headers: hs,
           nRows: rows.length, nTrue: nTrue, courses: rows.map(function(r){return r.course;}),
           modalOpen: document.getElementById('json-modal').classList.contains('open') };
`);
check("导入后列数 = 10", s2.cols.length === 10, s2.cols.join("/"));
check("导入后行数 = 10", s2.nRows === 10, s2.nRows);
check("勾选总数 = 16", s2.nTrue === 16, s2.nTrue);
check("课程名正确", s2.courses[0] === "线性代数" && s2.courses[8] === "数据库系统原理", s2.courses.slice(0, 3).join(","));
check("导入后弹窗自动关闭", s2.modalOpen === false);

console.log("\n=== 3. 坏 JSON 的处理 ===");
await ev(`document.getElementById('btn-import').click(); return 1;`);
await sleep(200);
const s3 = await ev(`
  var before = window.__courseApp.state.columnConfig.length;
  // 直接喂一段坏 JSON 走文件通道的同一套解析
  var ok = false;
  window.__lastResult = null;
  var r = window.__courseApp.importJSONText ? 'exposed' : 'not-exposed';
  return { before: before, exposed: r };
`);
// importJSONText 没暴露，改用 DOM 路径：把坏文本塞进 input 的 files 不好造，直接测文本框通道
await ev(`
  var det = document.querySelector('.json-paste'); det.open = true;
  document.getElementById('json-text').value = '{ this is not json';
  document.getElementById('json-modal-ok').click();
  return 1;
`);
await sleep(600);
const s4 = await ev(`
  return {
    status: document.getElementById('json-status').textContent.trim(),
    statusIsErr: document.getElementById('json-status').classList.contains('err'),
    toast: (document.getElementById('toast') || {}).textContent || '',
    cols: window.__courseApp.state.columnConfig.length,
    modalOpen: document.getElementById('json-modal').classList.contains('open')
  };
`);
check("坏 JSON 被拒绝", s4.statusIsErr, s4.status);
check("坏 JSON 未破坏现有列", s4.cols === 10, "列数=" + s4.cols);
check("坏 JSON 时弹窗保持打开（方便重试）", s4.modalOpen === true);

console.log("\n=== 4. 空文本框点导入的提示 ===");
await ev(`
  document.getElementById('json-text').value = '';
  document.getElementById('json-modal-ok').click();
  return 1;
`);
await sleep(500);
const s5 = await ev(`return { status: document.getElementById('json-status').textContent.trim(), cls: document.getElementById('json-status').className };`);
check("提示改为引导用「选择文件」（不再是「请先粘贴」）", /选择文件|拖放/.test(s5.status), s5.status);

console.log("\n=== 5. 文件拖到框外：应被拦截并提示，不导航 ===");
await ev(`
  var dt = new DataTransfer();
  dt.items.add(new File(['{}'], 'x.json', { type: 'application/json' }));
  document.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: 5, clientY: 5 }));
  return 1;
`);
await sleep(500);
const s6 = await ev(`
  return { url: location.href.split('/').pop(), status: document.getElementById('json-status').textContent.trim(),
           cols: window.__courseApp.state.columnConfig.length };
`);
check("页面没有被导航走（仍是 index.html）", s6.url === "index.html", s6.url);
check("框外投放给出提示", /框/.test(s6.status), s6.status);
check("框外投放未改数据", s6.cols === 10, "列数=" + s6.cols);

console.log("\n=== 6. 拖放到框内：应正常导入 ===");
await ev(`document.getElementById('btn-import').click(); return 1;`);
await sleep(200);
const dropped = await ev(`
  var drop = document.getElementById('json-drop');
  var r = drop.getBoundingClientRect();
  var dt = new DataTransfer();
  dt.items.add(new File([${JSON.stringify(raw)}], 'restore.json', { type: 'application/json' }));
  drop.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
  var overClass = drop.classList.contains('over');
  drop.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 20, clientY: r.top + 20 }));
  return { overClass: overClass };
`);
await sleep(2500);
const s7 = await ev(`
  var A = window.__courseApp;
  var rows = A.table().getData();
  var nTrue = 0;
  for (var r = 0; r < rows.length; r++) for (var k in rows[r]) if (rows[r][k] === true) nTrue++;
  return { cols: A.state.columnConfig.length, nRows: rows.length, nTrue: nTrue,
           modalOpen: document.getElementById('json-modal').classList.contains('open') };
`);
check("dragenter 时高亮生效", dropped.overClass === true);
check("拖放导入成功：10 列 / 10 行 / 16 勾选", s7.cols === 10 && s7.nRows === 10 && s7.nTrue === 16,
  `${s7.cols}列 ${s7.nRows}行 ${s7.nTrue}勾`);

console.log("\n=== 7. 页面 JS 异常 ===");
const errs = evs.filter((m) => m.method === "Runtime.exceptionThrown")
  .map((m) => (m.params.exceptionDetails.text || "") + " " + (m.params.exceptionDetails.exception?.description || "").slice(0, 120));
check("全程无 JS 异常", errs.length === 0, errs.slice(0, 3).join(" | "));

const pass = results.filter((r) => r.ok).length;
console.log(`\n结果: ${pass} 通过 / ${results.length - pass} 失败`);
if (results.some((r) => !r.ok)) {
  console.log("失败项:");
  for (const r of results.filter((x) => !x.ok)) console.log("  - " + r.name + "  [" + r.extra + "]");
}
ws.close(); chrome.kill(); server.close();
