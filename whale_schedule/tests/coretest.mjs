// 确认新模型下核心功能是否仍然正常（勾选、文本输入提交）
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PAGE = 'file:///D:/%E6%A1%8C%E9%9D%A2/py/deepseek_v4/workflow/whale_schedule/main/index.html';
const PORT = 9985, PROFILE = 'D:\\桌面\\py\\deepseek_v4\\workflow\\_tmp_verify\\cprof_core';
fs.rmSync(PROFILE, { recursive: true, force: true });
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-crash-reporter',
  '--disable-breakpad', '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--window-size=1920,1080',
  '--allow-file-access-from-files', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--disable-background-networking', '--js-flags=--max-old-space-size=192',
  'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function wsUrl() { for (let i = 0; i < 50; i++) { try { const j = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch (e) { } await sleep(300); } throw new Error('CDP'); }

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) pass++; else fail++; console.log((c ? '  OK   ' : '  FAIL ') + n + (d ? '   [' + d + ']' : '')); };

const run = async () => {
  const ws = new WebSocket(await wsUrl());
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  let id = 0; const waits = new Map(); const exc = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); }
    else if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; exc.push(((d.exception && d.exception.description) || d.text || '').split('\n')[0]); }
  });
  const send = (m, p = {}, sid) => new Promise(r => { const i = ++id; waits.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p, sessionId: sid })); });
  const { result: t } = await send('Target.createTarget', { url: 'about:blank' });
  const { result: at } = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  const sid = at.sessionId;
  await send('Runtime.enable', {}, sid); await send('Page.enable', {}, sid);
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false }, sid);
  await send('Page.navigate', { url: PAGE }, sid);
  await sleep(5000);
  const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, sid); return r.result?.result?.value; };

  const clickSel = async (sel) => {
    const r = await evl("(()=>{const e=document.querySelector(" + JSON.stringify(sel) + ");if(!e)return null;const b=e.getBoundingClientRect();return JSON.stringify({x:Math.round(b.left+b.width/2),y:Math.round(b.top+b.height/2)});})()");
    if (!r) return false;
    const p = JSON.parse(r);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1, buttons: 1 }, sid);
    await sleep(40);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1, buttons: 0 }, sid);
    await sleep(250); return true;
  };

  console.log('=== 在新模型下确认核心功能 ===');
  console.log('初始列 = ' + await evl("window.__courseApp.state.columnConfig.map(c=>c.title).join('/')"));

  // 用调试接口跳过弹窗，把「学习」模板套进当前工作区（模拟用户点确认后的状态）
  await evl("(function(){var A=window.__courseApp;A.applyTemplateToWorkspace('study',[{field:'course',title:'课程名称',editor:'input'},{field:'yuketang',title:'雨课堂',editor:'tickCross'},{field:'remark',title:'备注',editor:'input'}]);return 'ok';})()");
  await sleep(1200);
  console.log('套模板后列 = ' + await evl("window.__courseApp.state.columnConfig.map(c=>c.title).join('/')"));
  ok('模板套用后列结构正确',
    (await evl("window.__courseApp.state.columnConfig.map(c=>c.title).join('/')")) === '课程名称/雨课堂/备注',
    await evl("window.__courseApp.state.columnConfig.map(c=>c.title).join('/')"));

  console.log('\n--- A. 勾选框单击直接切换 ---');
  await evl("(function(){var A=window.__courseApp;A.table().setData([{course:'高等数学',yuketang:true,remark:'周一'}]).then(function(){A.persist();});return 'ok';})()");
  await sleep(1000);
  const before = await evl("window.__courseApp.table().getRows()[0].getData().yuketang");
  await clickSel('#course-table .tabulator-row .tabulator-cell.chk-cell');
  const after = await evl("window.__courseApp.table().getRows()[0].getData().yuketang");
  console.log('   勾选前=' + before + ' 勾选后=' + after);
  ok('勾选框单击直接切换', after === !before, String(before) + ' -> ' + String(after));

  console.log('\n--- B. 点击单元格 → 输入 → 回车提交 ---');
  await clickSel('#course-table .tabulator-row .tabulator-cell.tabulator-editable');
  ok('点击后编辑器打开', await evl("!!document.querySelector('#course-table .tabulator-editing input')"));
  await send('Input.insertText', { text: '数据结构' }, sid); await sleep(300);
  ok('文字进入输入框',
    (await evl("(document.querySelector('#course-table .tabulator-editing input')||{}).value")) === '数据结构',
    await evl("(document.querySelector('#course-table .tabulator-editing input')||{}).value"));
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }, sid);
  await send('Input.dispatchKeyEvent', { type: 'char', text: '\r' }, sid);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }, sid);
  await sleep(600);
  const cell = await evl("window.__courseApp.table().getRows()[0].getData().course");
  console.log('   提交后单元格 = ' + JSON.stringify(cell));
  ok('回车后提交到数据', cell === '数据结构', cell);
  const ls = await evl("(function(){var d=JSON.parse(localStorage.getItem('courseWallpaper.data.v1')||'{}');var w=d.workspaces[d.activeWsId];return w&&w.rows&&w.rows[0]?w.rows[0].course:'(找不到)';})()");
  console.log('   localStorage 里 = ' + JSON.stringify(ls));
  ok('已写入 localStorage', ls === '数据结构', ls);

  console.log('\n--- C. 工作区隔离仍然成立 ---');
  const ws1 = await evl("window.__courseApp.state.activeWsId");
  await evl("document.getElementById('ws-add').click()"); await sleep(1200);
  const ws2 = await evl("window.__courseApp.state.activeWsId");
  ok('新工作区是独立的空表',
    (await evl("window.__courseApp.state.columnConfig.map(c=>c.title).join('/')")) === '内容',
    await evl("window.__courseApp.state.columnConfig.map(c=>c.title).join('/')"));
  await evl("window.__courseApp.switchWorkspace('" + ws1 + "')"); await sleep(1200);
  ok('切回后数据仍在这一个工作区',
    (await evl("window.__courseApp.table().getRows()[0].getData().course")) === '数据结构',
    await evl("window.__courseApp.table().getRows()[0].getData().course"));
  ok('两个工作区确实不同', ws1 !== ws2, ws1 + ' vs ' + ws2);

  ok('无 JS 异常', exc.length === 0, exc.slice(0, 3).join(' | '));
  console.log('\n结果: ' + pass + ' 通过 / ' + fail + ' 失败');
  ws.close(); chrome.kill(); process.exit(fail ? 1 : 0);
};
run().catch(e => { console.error('FAILED', e.message); try { chrome.kill(); } catch (_) { } process.exit(1); });
