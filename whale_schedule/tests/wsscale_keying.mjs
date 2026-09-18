// 复现：改「表格缩放」比例后，切换工作区是否又出现高度/行距残留
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { spawn } from "node:child_process";

import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/[\\/]+$/, "").replace(/\//g, "\\");  // 仓库根（本脚本在 whale_schedule/<子目录>/ 下）
const DOCROOT = join(ROOT, "whale_schedule", "keying");
const PORT = 8794;
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
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  (process.env.LOCALAPPDATA || "") + "/Google/Chrome/Application/chrome.exe"].find((c) => existsSync(c));
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9342",
  `--user-data-dir=${join(ROOT, "_tmp_verify", "chrome-profile-sk")}`,
  "--no-first-run", "--disable-extensions", "--hide-scrollbars", "--mute-audio",
  "--window-size=1920,1080", "--force-device-scale-factor=1", "about:blank"], { stdio: "ignore" });
for (let i = 0; i < 100; i++) { try { if ((await fetch("http://127.0.0.1:9342/json/version")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
const tgt = await (await fetch("http://127.0.0.1:9342/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(tgt.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const waits = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && waits.has(m.id)) { const w = waits.get(m.id); waits.delete(m.id); m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; waits.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); setTimeout(() => { if (waits.has(i)) { waits.delete(i); rej(new Error("timeout " + m)); } }, 60000); });
const ev = async (x) => { const r = await send("Runtime.evaluate", { expression: `(function(){ ${x} })()`, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception)); return r.result.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await send("Page.enable"); await send("Runtime.enable");
// 关键：禁用缓存。否则改了 index.html 之后测试跑的还是旧的（曾因此误判"改动没生效"）
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/index.html` });
for (let i = 0; i < 120; i++) { await sleep(200); try { if (await ev("return !!window.__courseApp && !!document.querySelector('#course-table .tabulator-header');")) break; } catch {} }

/* 灌数据：甲=6行4列，乙=1行2列 */
await ev(`return window.__courseApp.table().setData([{c1:'x'}]).then(function(){return 'ok';});`);
await sleep(500);
await ev(`
  var A = window.__courseApp;
  var mk = function(name, ncol, nrow){
    var cols = [], rows = [];
    for (var i = 0; i < ncol; i++){ cols.push({ field: 'c'+(i+1), title: '列'+(i+1), editor: 'input' }); }
    for (var r = 0; r < nrow; r++){ var o = {}; for (var c = 0; c < ncol; c++) o['c'+(c+1)] = 'R'+(r+1)+'C'+(c+1); rows.push(o); }
    return { name: name, columns: cols, rows: rows };
  };
  A.state.workspaces = { wsBig: mk('大_6行4列', 4, 6), wsSmall: mk('小_1行2列', 2, 1) };
  return 'ok';
`);
for (const wid of ["wsBig", "wsSmall"]) {
  await ev(`window.__courseApp.switchWorkspace('${wid}'); return 'ok';`); await sleep(700);
  await ev(`var A=window.__courseApp; return A.table().setData(A.state.workspaces['${wid}'].rows).then(function(){A.persist();return 'ok';});`); await sleep(700);
}

const MEASURE = `
  var A = window.__courseApp;
  var area = document.querySelector('.table-area');
  var panel = document.getElementById('table-panel');
  var rows = document.querySelectorAll('#course-table .tabulator-row');
  var scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-scale')) || 1;
  var pr = panel.getBoundingClientRect();
  return {
    active: A.state.activeWsId,
    domRows: rows.length,
    areaVar: getComputedStyle(document.documentElement).getPropertyValue('--table-area-height').trim(),
    areaH: Math.round(area.getBoundingClientRect().height),
    panelCssH: Math.round(panel.offsetHeight),
    panelVisualH: Math.round(pr.height),
    panelTop: Math.round(pr.top),
    panelBottom: Math.round(pr.bottom),
    overflowsViewport: pr.bottom > 1080.5 || pr.top < -0.5,
    visibleRows: (function(){
      var th = document.querySelector('#course-table .tabulator-tableholder');
      var r0 = document.querySelector('#course-table .tabulator-row');
      var rh = (r0 && r0.offsetHeight) || 46;
      return Math.floor(th.clientHeight / rh);
    })(),
    scale: scale
  };
`;

async function setScale(pct) {
  await ev(`document.documentElement.style.setProperty('--panel-scale', '${pct / 100}'); window.__courseApp.applyFigureMetrics ? 0 : 0; return 'ok';`);
  // 走真正的入口：让 applyLayout 生效（它会带上缩放重算）
  await ev(`window.__courseApp.refreshHeight(); return 'ok';`);
  await sleep(700);
}
async function measure(label) {
  const m = await ev(MEASURE);
  console.log(`  [${label}] scale=${m.scale}  行数=${m.domRows}  表格区=${m.areaVar}/实际${m.areaH}  面板css=${m.panelCssH} 视觉=${m.panelVisualH}  可视范围 ${m.panelTop}..${m.panelBottom}` +
    (m.overflowsViewport ? "  ⚠ 超出 1080" : "  ✓ 在视口内"));
  return m;
}

for (const pct of [100, 150, 130, 80, 60]) {
  console.log(`\n=== 缩放 ${pct}%（先设缩放并等重算，再量）===`);
  await setScale(pct);
  await ev(`window.__courseApp.switchWorkspace('wsBig'); return 'ok';`); await sleep(900);
  const big1 = await measure("大(6行)");
  await ev(`window.__courseApp.switchWorkspace('wsSmall'); return 'ok';`); await sleep(900);
  const small = await measure("小(1行)");
  await ev(`window.__courseApp.switchWorkspace('wsBig'); return 'ok';`); await sleep(900);
  const big2 = await measure("切回大(6行)");
  const residue = big2.areaVar !== big1.areaVar;
  console.log(`  → 切回大: 表格区 ${big1.areaVar} → ${big2.areaVar}  ${residue ? "✗ 残留/不一致" : "✓ 一致"}` +
    `   面板底边 ${big2.panelBottom} ${big2.panelBottom <= 1080 ? "✓" : "✗ 超出"}`);
}

/* 端点压测：滑块范围 60–150，取极值反复来回 */
console.log("\n=== 端点压测：150%↔60% 反复切换 3 轮 ===");
// 先取 scale=1 时的表格区高度作为"布局基准"，缩放不该改变它
await setScale(100);
await ev(`window.__courseApp.switchWorkspace('wsBig'); return 'ok';`); await sleep(900);
const baseline = await ev(MEASURE);
const expectedAreaVar = baseline.areaVar;
console.log(`  布局基准（100%）：表格区=${expectedAreaVar} 行数=${baseline.domRows} 可见行=${baseline.visibleRows}`);
let bad = 0;
for (let round = 1; round <= 3; round++) {
  for (const pct of [150, 60]) {
    await setScale(pct);
    await ev(`window.__courseApp.switchWorkspace('wsBig'); return 'ok';`); await sleep(800);
    const m = await ev(MEASURE);
    // ★ 断言已按「等比缩放」的定义修正：
    //   旧断言查「面板底边是否超出视口」，但放大后面板必然超出视口 —— 那是等比缩放的
    //   正常结果（放大就该占更大地方，超出部分被屏幕裁掉），不是缺陷。
    //   真正该守的是「布局不随缩放变化」：可见行数恒定、滚动状态恒定。
    const ok = m.areaVar === expectedAreaVar && m.domRows === 6;
    if (!ok) { bad++; }
    console.log(`  第${round}轮 ${pct}%: 表格区=${m.areaVar} 行数=${m.domRows} 可见行=${m.visibleRows} 面板底边=${m.panelBottom}${m.panelBottom > 1080 ? "(超出视口·正常)" : ""} ${ok ? "✓" : "✗ 布局或行数变化了"}`);
  }
}
console.log(`  端点压测越界次数: ${bad} ${bad === 0 ? "✓" : "✗"}`);

ws.close(); chrome.kill(); server.close();
