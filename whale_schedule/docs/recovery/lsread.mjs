// 用 headless 加载「复制的」Local Storage 目录，让浏览器自己解码 localStorage
// 安全性：只读原目录，复制到 _tmp_verify 下操作；绝不写回用户的 Edge 数据
import { cpSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, normalize } from "node:path";

import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/[\\/]+$/, "").replace(/\//g, "\\");  // 仓库根（本脚本在 whale_schedule/<子目录>/ 下）
const SRC_PROFILE = "C:/Users/13311/AppData/Local/Microsoft/Edge/User Data";
const TMP_PROFILE = join(ROOT, "_tmp_verify", "edge-profile-copy");
const DOCROOT = join(ROOT, "whale_schedule", "main");
const OUTDIR = join(ROOT, "_tmp_verify", "recover");
const PORT = 8797;

/* 1. 复制存储目录（只复制 Local Storage + 必要文件） */
rmSync(TMP_PROFILE, { recursive: true, force: true });
mkdirSync(join(TMP_PROFILE, "Default"), { recursive: true });
const copies = [
  ["Default/Local Storage", "Default/Local Storage"],
  ["Local State", "Local State"],
  ["Default/Preferences", "Default/Preferences"],
];
for (const [from, to] of copies) {
  const s = join(SRC_PROFILE, from), d = join(TMP_PROFILE, to);
  if (!existsSync(s)) { console.log("跳过(不存在):", from); continue; }
  try {
    cpSync(s, d, { recursive: true });
    console.log("已复制:", from);
  } catch (e) { console.log("复制失败:", from, e.message); }
}

/* 2. 起本地服务 */
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

/* 3. headless 打开这个副本 profile，先访问 file:// 页面读 localStorage */
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  (process.env.LOCALAPPDATA || "") + "/Google/Chrome/Application/chrome.exe"].find((c) => existsSync(c));
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9345",
  `--user-data-dir=${TMP_PROFILE}`,
  "--no-first-run", "--no-default-browser-check", "--disable-extensions",
  "--allow-file-access-from-files", "--hide-scrollbars", "--mute-audio",
  "--window-size=1280,720", "about:blank"], { stdio: "ignore" });
for (let i = 0; i < 100; i++) { try { if ((await fetch("http://127.0.0.1:9345/json/version")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }

const tgt = await (await fetch("http://127.0.0.1:9345/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(tgt.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const waits = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && waits.has(m.id)) { const w = waits.get(m.id); waits.delete(m.id); m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; waits.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); setTimeout(() => { if (waits.has(i)) { waits.delete(i); rej(new Error("timeout " + m)); } }, 30000); });
const ev = async (x) => { const r = await send("Runtime.evaluate", { expression: `(function(){ ${x} })()`, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception)); return r.result.value; };
await send("Page.enable"); await send("Runtime.enable");

const fileUrl = "file:///D:/%E6%A1%8C%E9%9D%A2/py/deepseek_v4/workflow/whale_schedule/main/index.html";
await send("Page.navigate", { url: fileUrl });
await new Promise((r) => setTimeout(r, 3000));

mkdirSync(OUTDIR, { recursive: true });
const dump = await ev(`
  var out = { origin: location.origin, keys: [], data: {} };
  for (var i = 0; i < localStorage.length; i++) out.keys.push(localStorage.key(i));
  var names = ["courseWallpaper.data.v1","courseWallpaper.layout.v1","courseWallpaper.templates.v1","courseWallpaper.keyboard.v1"];
  for (var j = 0; j < names.length; j++) out.data[names[j]] = localStorage.getItem(names[j]);
  return out;
`);
console.log("\n=== file:// origin:", dump.origin, "===");
console.log("localStorage 键:", JSON.stringify(dump.keys));
for (const [k, v] of Object.entries(dump.data)) {
  if (!v) { console.log(`  ${k}: (空)`); continue; }
  console.log(`  ${k}: ${v.length} 字符`);
  try {
    const obj = JSON.parse(v);
    const out = join(OUTDIR, `recovered_${k.replace(/\W/g, "_")}.json`);
    writeFileSync(out, JSON.stringify(obj, null, 2), "utf8");
    const wsInfo = obj.workspaces ? Object.entries(obj.workspaces).map(([id, w]) =>
      `${w.name || id}(列${w.columns ? w.columns.length : 0}/行${w.rows ? w.rows.length : 0})`).join("  ") : "(无 workspaces)";
    console.log(`     ✓ version=${obj.version}  活动=${obj.activeWsId || "-"}`);
    console.log(`     工作区: ${wsInfo}`);
    console.log(`     → ${out}`);
  } catch (e) { console.log(`     ✗ 解析失败: ${e.message.slice(0, 60)}`); }
}
ws.close(); chrome.kill(); server.close();
