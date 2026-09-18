// 工作区功能验证：新建/切换/实时保存/重命名/关闭/载入模板弹窗/迁移
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PAGE = 'file:///D:/%E6%A1%8C%E9%9D%A2/py/deepseek_v4/workflow/whale_schedule/main/index.html';
const PORT = 9980, PROFILE = 'D:\\桌面\\py\\deepseek_v4\\workflow\\_tmp_verify\\cprof_ws';
fs.rmSync(PROFILE, { recursive: true, force: true });
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-crash-reporter',
  '--disable-breakpad', '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--window-size=1920,1080',
  '--allow-file-access-from-files', '--no-first-run', '--no-default-browser-check',
  // 限制资源占用：系统刚发生过非正常重启，测试期间尽量轻量
  '--disable-extensions', '--disable-background-networking', '--disable-sync',
  '--disable-default-apps', '--js-flags=--max-old-space-size=192',
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

  const wsInfo = async () => JSON.parse(await evl([
    "(()=>{const A=window.__courseApp;return JSON.stringify({",
    "  active:String(A.state.activeWsId),",
    "  count:Object.keys(A.state.workspaces).length,",
    "  names:Object.keys(A.state.workspaces).map(k=>A.state.workspaces[k].name).join(','),",
    "  tabs:Array.from(document.querySelectorAll('#ws-strip .ws-tab')).map(t=>t.querySelector('.ws-name').textContent+(t.classList.contains('on')?'*':'')).join(','),",
    "  cols:A.state.columnConfig.map(c=>c.title).join('/'),",
    "  first:A.table().getData().map(r=>{const k=A.state.columnConfig[0].field;return r[k];}).join(' | ')",
    "});})()"
  ].join('\n')));

  console.log('=== ① 初始状态 ===');
  let s = await wsInfo();
  console.log('   工作区数=' + s.count + ' 名称=' + s.names + ' 标签=' + s.tabs);
  console.log('   当前列=' + s.cols + '  首列值=' + JSON.stringify(s.first));
  ok('初始有 1 个工作区', s.count === 1, 'count=' + s.count);
  ok('标签页已渲染且当前项高亮', s.tabs.indexOf('*') >= 0, s.tabs);
  ok('初始为单列「内容」空工作区（未自动套预设）', s.cols === '内容', s.cols);

  console.log('\n=== ② 点「学习」预设 → 应弹窗确认 ===');
  await evl("document.querySelector('#template-row .tpl-btn[data-preset=study]').click()");
  await sleep(600);
  const dlg = JSON.parse(await evl([
    "(()=>{return JSON.stringify({",
    "  open:document.getElementById('confirm-modal').classList.contains('open'),",
    "  title:document.getElementById('confirm-title').textContent,",
    "  text:document.getElementById('confirm-text').textContent.slice(0,120),",
    "  okText:document.getElementById('confirm-ok').textContent",
    "});})()"
  ].join('\n')));
  console.log('   弹窗标题=' + JSON.stringify(dlg.title));
  console.log('   弹窗正文=' + JSON.stringify(dlg.text));
  ok('载入模板弹出确认窗', dlg.open);
  ok('弹窗说明会覆盖当前工作区', dlg.text.indexOf('覆盖') >= 0, dlg.text);

  console.log('\n=== ③ 确认后模板生效 ===');
  await evl("document.getElementById('confirm-ok').click()"); await sleep(1200);
  s = await wsInfo();
  console.log('   当前列=' + s.cols);
  ok('学习模板已套用到当前工作区', s.cols.indexOf('课程名称') >= 0 && s.cols.indexOf('雨课堂') >= 0, s.cols);
  ok('工作区数量没变（模板不是新工作区）', s.count === 1, 'count=' + s.count);

  console.log('\n=== ④ 填数据 → 新建工作区 → 内容应各自独立 ===');
  await evl("window.__courseApp.table().setData([{course:'高等数学',yuketang:true,remark:'学习备注'}]);'ok'");
  await sleep(700); await evl("window.__courseApp.persist()"); await sleep(400);
  await evl("document.getElementById('ws-add').click()"); await sleep(1200);
  s = await wsInfo();
  console.log('   新工作区：数=' + s.count + ' 名称=' + s.names + ' 列=' + s.cols + ' 首列=' + JSON.stringify(s.first));
  ok('新建后工作区数+1', s.count === 2, 'count=' + s.count);
  ok('新工作区是空的（单列 + 空值）', s.cols === '内容' && s.first.trim() === '', s.cols + ' | ' + s.first);
  ok('新工作区有独立标签', s.tabs.split(',').length === 2, s.tabs);

  console.log('\n=== ⑤ 切回第一个工作区，数据应还在（实时保存）===');
  const firstId = await evl("Object.keys(window.__courseApp.state.workspaces)[0]");
  await evl("window.__courseApp.switchWorkspace('" + firstId + "')"); await sleep(1200);
  s = await wsInfo();
  console.log('   切回后：列=' + s.cols + ' 首列=' + JSON.stringify(s.first));
  ok('切回后列结构恢复（课程表）', s.cols.indexOf('课程名称') >= 0, s.cols);
  ok('切回后数据还在（实时保存生效）', s.first === '高等数学', s.first);
  const remark = await evl("window.__courseApp.table().getData().map(r=>r.remark).join('|')");
  ok('切回后备注还在', remark === '学习备注', remark);

  console.log('\n=== ⑥ 跨重载：两个工作区都要记住 ===');
  await evl("location.reload()"); await sleep(5000);
  s = await wsInfo();
  console.log('   重载后：数=' + s.count + ' 标签=' + s.tabs + ' 列=' + s.cols + ' 首列=' + JSON.stringify(s.first));
  ok('重载后工作区数保持', s.count === 2, 'count=' + s.count);
  ok('重载后回到离开时的工作区', s.first === '高等数学', s.first);

  console.log('\n=== ⑦ 重命名工作区 ===');
  const wsId = await evl("window.__courseApp.state.activeWsId");
  await evl("window.__courseApp.renameWorkspace('" + wsId + "')"); await sleep(500);
  await evl("document.getElementById('name-input').value='本学期'");
  await evl("document.getElementById('name-modal-ok').click()"); await sleep(800);
  s = await wsInfo();
  console.log('   标签=' + s.tabs);
  ok('重命名生效', s.names.indexOf('本学期') >= 0, s.names);

  console.log('\n=== ⑧ 关闭有内容的工作区 → 应弹窗；空工作区直接关 ===');
  const ids = JSON.parse(await evl("JSON.stringify(Object.keys(window.__courseApp.state.workspaces))"));
  const fullId = await evl("(function(){var A=window.__courseApp;return Object.keys(A.state.workspaces).find(k=>A.workspaceHasContent(k));})()");
  const emptyId = await evl("(function(){var A=window.__courseApp;return Object.keys(A.state.workspaces).find(k=>!A.workspaceHasContent(k));})()");
  console.log('   有内容的工作区=' + fullId + '  空工作区=' + emptyId);
  await evl("window.__courseApp.closeWorkspace('" + fullId + "')"); await sleep(600);
  const closeDlg = await evl("document.getElementById('confirm-modal').classList.contains('open')");
  ok('关闭有内容的工作区会弹窗', closeDlg === true);
  await evl("document.getElementById('confirm-cancel').click()"); await sleep(400);
  const stillThere = await evl("!!window.__courseApp.state.workspaces['" + fullId + "']");
  ok('取消后工作区还在', stillThere === true);

  console.log('\n=== ⑨ 不能关掉最后一个工作区 ===');
  // 先都关到只剩一个
  await evl("(function(){var A=window.__courseApp;var ks=Object.keys(A.state.workspaces);for(var i=1;i<ks.length;i++){delete A.state.workspaces[ks[i]];}A.persist();return 'ok';})()");
  await sleep(400);
  const lastId = await evl("Object.keys(window.__courseApp.state.workspaces)[0]");
  await evl("window.__courseApp.closeWorkspace('" + lastId + "')"); await sleep(600);
  ok('最后一个工作区不会被关掉', (await evl("Object.keys(window.__courseApp.state.workspaces).length")) === 1,
    'count=' + await evl("Object.keys(window.__courseApp.state.workspaces).length"));
  ok('并给出提示', (await evl("document.getElementById('toast').textContent")).indexOf('至少要保留') >= 0,
    await evl("document.getElementById('toast').textContent"));

  console.log('\n=== ⑩ 迁移：v1 旧数据（单表格）不能丢 ===');
  await evl([
    "(function(){",
    "  localStorage.setItem('courseWallpaper.data.v1', JSON.stringify({",
    "    columnConfig:[{field:'course',title:'课程名称',editor:'input'},{field:'remark',title:'备注',editor:'input'}],",
    "    rows:[{course:'旧版高数',remark:'旧版备注'}]",
    "  }));",
    "  return 'ok';",
    "})()"
  ].join('\n'));
  await evl("location.reload()"); await sleep(5000);
  s = await wsInfo();
  console.log('   迁移后：工作区数=' + s.count + ' 列=' + s.cols + ' 首列=' + JSON.stringify(s.first));
  ok('v1 旧数据被迁移进工作区且没丢', s.first === '旧版高数', s.first);
  ok('迁移后列结构保留', s.cols.indexOf('课程名称') >= 0, s.cols);

  ok('全程无 JS 异常', exc.length === 0, exc.slice(0, 3).join(' | '));
  console.log('\n结果: ' + pass + ' 通过 / ' + fail + ' 失败');
  ws.close(); chrome.kill(); process.exit(fail ? 1 : 0);
};
run().catch(e => { console.error('FAILED', e.message); try { chrome.kill(); } catch (_) { } process.exit(1); });
