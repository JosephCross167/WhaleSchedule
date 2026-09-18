// 抓页面真实运行时报错（含堆栈与行号）
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { spawn } from "node:child_process";

import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/[\\/]+$/, "").replace(/\//g, "\\");  // 仓库根（本脚本在 whale_schedule/<子目录>/ 下）
const DOCROOT = join(ROOT, "whale_schedule", "main");
const PORT = 8819;
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
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9367",
  `--user-data-dir=${join(ROOT, "_tmp_verify", "chrome-profile-err")}`,
  "--no-first-run", "--disable-extensions", "--hide-scrollbars", "--mute-audio",
  "--window-size=1920,1080", "--force-device-scale-factor=1", "about:blank"], { stdio: "ignore" });
for (let i = 0; i < 100; i++) { try { if ((await fetch("http://127.0.0.1:9367/json/version")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const tgt = await (await fetch("http://127.0.0.1:9367/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(tgt.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const waits = new Map(); const errs = []; const logs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waits.has(m.id)) { const w = waits.get(m.id); waits.delete(m.id); m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result); }
  else if (m.method === "Runtime.exceptionThrown") {
    const d = m.params.exceptionDetails;
    errs.push({ text: d.text, desc: (d.exception && d.exception.description) || "", line: d.lineNumber, col: d.columnNumber, url: d.url });
  } else if (m.method === "Runtime.consoleAPICalled" && (m.params.type === "error" || m.params.type === "warning")) {
    logs.push(m.params.type + ": " + m.params.args.map((a) => a.value || a.description || "").join(" ").slice(0, 200));
  }
};
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; waits.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); setTimeout(() => { if (waits.has(i)) { waits.delete(i); rej(new Error("timeout " + m)); } }, 30000); });
const ev = async (x) => { const r = await send("Runtime.evaluate", { expression: `(function(){ ${x} })()`, returnByValue: true }); if (r.exceptionDetails) return { __err: JSON.stringify(r.exceptionDetails.exception) }; return r.result.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send("Page.enable"); await send("Runtime.enable");
await send("Network.enable"); await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/index.html?nc=${Date.now()}` });
await sleep(5000);

console.log("=== 页面未捕获异常 ===");
if (!errs.length) console.log("  （无）");
for (const e of errs) {
  console.log("  " + e.text);
  if (e.desc) console.log("    " + e.desc.split("\n").slice(0, 6).join("\n    "));
  console.log("    位置: 行 " + e.line + " 列 " + e.col + "  " + (e.url || ""));
}
console.log("\n=== console.error / warning ===");
if (!logs.length) console.log("  （无）");
for (const l of logs.slice(0, 10)) console.log("  " + l);

const st = await ev(`return {
  hasApp: !!window.__courseApp,
  hasTable: !!(window.__courseApp && window.__courseApp.table && window.__courseApp.table()),
  tableHeader: !!document.querySelector('#course-table .tabulator-header'),
  laneVar: getComputedStyle(document.documentElement).getPropertyValue('--lane-h').trim(),
  areaVar: getComputedStyle(document.documentElement).getPropertyValue('--table-area-height').trim(),
  bodyText: (document.body.innerText || '').slice(0, 120)
};`);
console.log("\n=== 页面状态 ===");
console.log("  " + JSON.stringify(st));

ws.close(); chrome.kill(); server.close();
