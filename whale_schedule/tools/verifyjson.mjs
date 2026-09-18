// 在一次性 profile 里验证恢复 JSON 能否被壁纸正常导入
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { spawn } from "node:child_process";

import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/[\\/]+$/, "").replace(/\//g, "\\");  // 仓库根（本脚本在 whale_schedule/<子目录>/ 下）
const DOCROOT = join(ROOT, "whale_schedule", "main");
const JSONFILE = join(ROOT, "whale_schedule", "data", "表格数据_恢复_20260917.json");
const PORT = 8799;
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

/* 先离线校验 JSON 结构与内容 */
const raw = await readFile(JSONFILE, "utf8");
const data = JSON.parse(raw);
console.log("=== JSON 结构校验 ===");
console.log("  version:", data.version, " 列数:", data.columnConfig.length, " 行数:", data.rows.length);
console.log("  列:", data.columnConfig.map((c) => `${c.title}(${c.field}:${c.editor === "tickCross" ? "✓" : "T"})`).join(" "));
const bad = [];
data.rows.forEach((r, i) => {
  data.columnConfig.forEach((c) => {
    if (!(c.field in r)) bad.push(`第${i + 1}行缺字段 ${c.field}`);
    else if (c.editor === "tickCross" && typeof r[c.field] !== "boolean") bad.push(`第${i + 1}行 ${c.field} 不是布尔`);
  });
});
console.log("  字段完整性:", bad.length ? "✗ " + bad.slice(0, 5).join("; ") : "✓ 每行都含全部列");

const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  (process.env.LOCALAPPDATA || "") + "/Google/Chrome/Application/chrome.exe"].find((c) => existsSync(c));
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9347",
  `--user-data-dir=${join(ROOT, "_tmp_verify", "chrome-profile-imp")}`,
  "--no-first-run", "--disable-extensions", "--hide-scrollbars", "--mute-audio",
  "--window-size=1920,1080", "--force-device-scale-factor=1", "about:blank"], { stdio: "ignore" });
for (let i = 0; i < 100; i++) { try { if ((await fetch("http://127.0.0.1:9347/json/version")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const tgt = await (await fetch("http://127.0.0.1:9347/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(tgt.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const waits = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && waits.has(m.id)) { const w = waits.get(m.id); waits.delete(m.id); m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; waits.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); setTimeout(() => { if (waits.has(i)) { waits.delete(i); rej(new Error("timeout " + m)); } }, 60000); });
const ev = async (x) => { const r = await send("Runtime.evaluate", { expression: `(function(){ ${x} })()`, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception)); return r.result.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = [];
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.method === "Runtime.exceptionThrown") errs.push((m.params.exceptionDetails.text || "") + " " + (m.params.exceptionDetails.exception?.description || "").slice(0, 100)); });

await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/index.html` });
for (let i = 0; i < 120; i++) { await sleep(200); try { if (await ev("return !!window.__courseApp && !!document.querySelector('#course-table .tabulator-header');")) break; } catch {} }

/* 把 JSON 灌进导入弹窗的文本框，然后调用导入 */
const jsonForJs = JSON.stringify(raw);
const res = await ev(`
  var ta = document.getElementById('json-text');
  if (!ta) return { err: '找不到导入文本框 #json-text' };
  ta.value = ${JSON.stringify(jsonForJs)};
  var A = window.__courseApp;
  A.importJSON();
  return { ok: true };
`);
console.log("\n=== 导入结果 ===");
console.log("  调用:", JSON.stringify(res));
await sleep(1500);

const state = await ev(`
  var A = window.__courseApp;
  var t = A.table();
  var headers = [];
  var hs = document.querySelectorAll('#course-table .tabulator-col-title');
  for (var i = 0; i < hs.length; i++) headers.push(hs[i].textContent.trim());
  var rows = t.getData();
  var first = rows[0] || {};
  var tickCells = document.querySelectorAll('#course-table .tabulator-cell input[type=checkbox], #course-table .tabulator-cell .tabulator-tickCross');
  return {
    colConfig: A.state.columnConfig.map(function(c){ return c.title + ':' + c.editor; }),
    headers: headers,
    rowCount: rows.length,
    tabRows: t.getRows().length,
    firstRow: first,
    checkedCount: document.querySelectorAll('#course-table .tabulator-cell.tabulator-editable span.tabulator-tickCross').length
  };
`);
console.log("  列配置:", JSON.stringify(state.colConfig));
console.log("  表头:", JSON.stringify(state.headers));
console.log("  行数: state=" + state.rowCount + "  tabulator=" + state.tabRows);
console.log("  第一行:", JSON.stringify(state.firstRow));
console.log("  JS 异常:", errs.length ? JSON.stringify(errs.slice(0, 3)) : "无 ✓");

/* 用截图做像素级确认：勾选格数量应等于数据里的 true 总数 */
const expectedTrue = data.rows.reduce((s, r) => s + data.columnConfig.filter((c) => c.editor === "tickCross" && r[c.field] === true).length, 0);
const actualTrue = await ev(`
  var rows = window.__courseApp.table().getData();
  var n = 0;
  for (var i = 0; i < rows.length; i++) {
    for (var k in rows[i]) if (rows[i][k] === true) n++;
  }
  return n;
`);
console.log("\n=== 勾选数核对 ===");
console.log("  JSON 里 true 的总数:", expectedTrue);
console.log("  导入后表格里 true 的总数:", actualTrue, actualTrue === expectedTrue ? "✓" : "✗");

ws.close(); chrome.kill(); server.close();
