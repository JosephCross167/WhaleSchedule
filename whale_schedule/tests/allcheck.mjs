// 浏览器端全量验证（重写版；旧文件被 PowerShell 双重编码毁掉了）
// 组 1 软键盘浮动窗 / 组 2 对话框输入+Shift+布局 / 组 3 端到端冒烟
// 组 5 等比缩放+显示开关
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PAGE = 'file:///D:/%E6%A1%8C%E9%9D%A2/py/deepseek_v4/workflow/whale_schedule/main/index.html';
const BASE_PORT = 9600;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (n, c, d) => {
  if (c) pass++; else fail++;
  console.log((c ? '  OK   ' : '  FAIL ') + n + (d ? '   [' + d + ']' : ''));
};

async function wsUrl(port) {
  for (let i = 0; i < 50; i++) {
    try {
      const j = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch (e) { }
    await sleep(300);
  }
  throw new Error('CDP 未就绪 port=' + port);
}

async function openSession(port) {
  const PROFILE = 'D:\\桌面\\py\\deepseek_v4\\workflow\\_tmp_verify\\cprof_r_' + port;
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-crash-reporter',
    '--disable-breakpad', '--remote-debugging-port=' + port, '--user-data-dir=' + PROFILE,
    '--window-size=1920,1080', '--allow-file-access-from-files', '--no-first-run',
    '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });

  const ws = new WebSocket(await wsUrl(port));
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  let id = 0; const waits = new Map(); const exc = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); }
    else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      exc.push(((d.exception && d.exception.description) || d.text || '').split('\n')[0]);
    }
  });
  const send = (m, p = {}, sid) => new Promise(r => { const i = ++id; waits.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p, sessionId: sid })); });
  const { result: t } = await send('Target.createTarget', { url: 'about:blank' });
  const { result: at } = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  const sid = at.sessionId;
  await send('Runtime.enable', {}, sid);
  await send('Page.enable', {}, sid);
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false }, sid);
  await send('Page.navigate', { url: PAGE }, sid);
  await sleep(4500);

  // awaitPromise 必须有：async 表达式返回 Promise，不开这项拿到的是 Promise 对象
  const evl = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, sid);
    return r.result?.result?.value;
  };
  const clickAt = async (x, y, settle) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 }, sid);
    await sleep(40);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 }, sid);
    await sleep(settle === undefined ? 210 : settle);
  };
  const rect = async (sel) => JSON.parse(await evl("(()=>{const e=document.querySelector(" + JSON.stringify(sel) + ");if(!e)return 'null';const b=e.getBoundingClientRect();return JSON.stringify([Math.round(b.left),Math.round(b.top),Math.round(b.right),Math.round(b.bottom)]);})()") || 'null');
  const clickSel = async (sel) => {
    const r = await rect(sel); if (!r) return false;
    await clickAt(Math.round((r[0] + r[2]) / 2), Math.round((r[1] + r[3]) / 2)); return true;
  };
  const clickKey = async (label, settle) => {
    const r = await evl("(()=>{const bs=document.querySelectorAll('#skb-keys .skb-key');for(const b of bs){if(b.textContent===" + JSON.stringify(label) + "){const q=b.getBoundingClientRect();return JSON.stringify({x:Math.round(q.left+q.width/2),y:Math.round(q.top+q.height/2)});}}return 'null';})()");
    if (!r || r === 'null') return false;
    const p = JSON.parse(r); await clickAt(p.x, p.y, settle); return true;
  };
  const drag = async (x1, y1, x2, y2, steps) => {
    const n = steps || 8;
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y: y1, button: 'left', clickCount: 1, buttons: 1 }, sid);
    await sleep(70);
    for (let i = 1; i <= n; i++) {
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: Math.round(x1 + (x2 - x1) * i / n), y: Math.round(y1 + (y2 - y1) * i / n),
        button: 'left', buttons: 1
      }, sid);
      await sleep(40);
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, button: 'left', clickCount: 1, buttons: 0 }, sid);
    await sleep(300);
  };
  const setProp = async (props) => {
    await evl("window.wallpaperPropertyListener.applyUserProperties(" + JSON.stringify(props) + ")");
    await sleep(500);
  };

  return { ws, chrome, evl, clickAt, clickSel, clickKey, rect, drag, setProp, exc, sid, send };
}

const firstLetter = (S) => S.evl("(()=>{const b=Array.from(document.querySelectorAll('#skb-keys .skb-key')).find(k=>/^[A-Za-z]$/.test(k.textContent));return b?b.textContent:'?';})()");
const inputVal = (S) => S.evl("(document.querySelector('#course-table .tabulator-editing input')||{}).value");
const tplNames = (S) => S.evl("(JSON.parse(localStorage.getItem('courseWallpaper.templates.v1')||'[]')||[]).map(t=>t.name).join(',')");

// ---------------------------------------------------------------------------
async function group1() {
  console.log('\n===== 组 1：软键盘浮动窗 =====');
  const S = await openSession(BASE_PORT);
  const { evl, rect, drag, clickSel, exc } = S;

  await evl("document.getElementById('btn-skb').click()"); await sleep(700);
  ok('键盘已打开', await evl("document.getElementById('skb').classList.contains('open')"));
  ok('键盘挂在 body 下', (await evl("document.getElementById('skb').parentElement.tagName")) === 'BODY');
  const r0 = await rect('#skb');
  ok('键盘完整在视口内', r0[0] >= 0 && r0[1] >= 0 && r0[2] <= 1920 && r0[3] <= 1080, JSON.stringify(r0));

  const bar = await rect('#skb-bar');
  await drag(Math.round((bar[0] + bar[2]) / 2), Math.round((bar[1] + bar[3]) / 2),
    Math.round((bar[0] + bar[2]) / 2) - 300, Math.round((bar[1] + bar[3]) / 2) - 200);
  const r1 = await rect('#skb');
  ok('拖动标题栏能移动键盘', Math.abs(r1[0] - r0[0]) > 100 && Math.abs(r1[1] - r0[1]) > 80,
    'dx=' + (r1[0] - r0[0]) + ' dy=' + (r1[1] - r0[1]));
  const saved = JSON.parse(await evl("localStorage.getItem('courseWallpaper.keyboard.v1')||'null'"));
  ok('位置写入 localStorage', !!saved && typeof saved.left === 'number', JSON.stringify(saved));
  await evl("location.reload()"); await sleep(4500);
  await evl("document.getElementById('btn-skb').click()"); await sleep(700);
  const r2 = await rect('#skb');
  ok('重载后恢复拖动位置', Math.abs(r2[0] - r1[0]) <= 2 && Math.abs(r2[1] - r1[1]) <= 2, JSON.stringify(r1) + ' -> ' + JSON.stringify(r2));

  await evl("document.getElementById('col-modal').classList.add('open')"); await sleep(250);
  const z = JSON.parse(await evl("JSON.stringify({kb:+getComputedStyle(document.getElementById('skb')).zIndex, mask:+getComputedStyle(document.getElementById('col-modal')).zIndex})"));
  ok('键盘 z-index 高于遮罩', z.kb > z.mask, JSON.stringify(z));
  ok('对话框打开时键盘仍可点', (await evl("(()=>{const k=document.getElementById('skb').getBoundingClientRect();const e=document.elementFromPoint(Math.round(k.left+k.width/2),Math.round(k.top+12));return e?(e.closest('#skb')?'skb':'other'):'null';})()")) === 'skb');
  ok('对话框自身仍可点', (await evl("(()=>{const m=document.querySelector('#col-modal .modal').getBoundingClientRect();const e=document.elementFromPoint(Math.round(m.left+m.width/2),Math.round(m.top+12));return e?(e.closest('.modal')?'modal':'other'):'null';})()")) === 'modal');
  await evl("document.getElementById('col-modal').classList.remove('open')"); await sleep(250);

  // 新模型初始是空工作区（单列「内容」），没有勾选列 —— 先套模板再测勾选
  await seedStudy(S);
  const before = await evl("window.__courseApp.table().getRows()[0].getData().yuketang");
  await clickSel('#course-table .tabulator-row .tabulator-cell.chk-cell');
  const after = await evl("window.__courseApp.table().getRows()[0].getData().yuketang");
  ok('勾选框单击直接切换', after === !before, String(before) + ' -> ' + String(after));
  const lane = await rect('#walker-lane'), box = await rect('#walker-box');
  ok('走动区未被折叠', (lane[3] - lane[1]) > 100, '高=' + (lane[3] - lane[1]));
  ok('小人在走动区内', box[1] >= lane[1] - 1 && box[3] <= lane[3] + 1, 'box=' + JSON.stringify(box));

  ok('组 1 无 JS 异常', exc.length === 0, exc.slice(0, 3).join(' | '));
  S.ws.close(); S.chrome.kill();
}

// ---------------------------------------------------------------------------
async function group2() {
  console.log('\n===== 组 2：对话框输入 / Shift / 布局 =====');
  const S = await openSession(BASE_PORT + 1);
  const { evl, rect, drag, clickSel, clickKey, exc } = S;

  await evl("document.getElementById('btn-skb').click()"); await sleep(600);
  const bar = await rect('#skb-bar');
  await drag(Math.round((bar[0] + bar[2]) / 2), Math.round((bar[1] + bar[3]) / 2), 1560, 900);

  await evl("document.getElementById('btn-add-col').click()"); await sleep(700);
  ok('添加列对话框已打开', await evl("document.getElementById('col-modal').classList.contains('open')"));
  ok('键盘自动保持打开', await evl("document.getElementById('skb').classList.contains('open')"));
  ok('键盘按键可点（未被遮罩挡）', (await evl("(()=>{const b=Array.from(document.querySelectorAll('#skb-keys .skb-key')).find(k=>k.textContent==='a');const q=b.getBoundingClientRect();const e=document.elementFromPoint(Math.round(q.left+q.width/2),Math.round(q.top+q.height/2));return e?(e===b||b.contains(e)?'self':'blocked'):'null';})()")) === 'self');
  ok('输入目标是对话框输入框', (await evl("(document.activeElement||{}).id")) === 'col-name');
  await clickKey('a'); await clickKey('b'); await clickKey('c');
  ok('对话框里拼音缓冲正常', (await evl("document.getElementById('skb-buf').textContent")) === 'abc');
  if ((await evl("document.querySelectorAll('.skb-cand-btn').length")) > 0) await clickSel('.skb-cand-btn');
  const typed = await evl("document.getElementById('col-name').value");
  ok('软键盘文字进入对话框输入框', (typed || '').length > 0, JSON.stringify(typed));
  await clickKey('n'); await clickKey('i');
  const cands = await evl("Array.from(document.querySelectorAll('.skb-cand-btn')).map(b=>b.textContent).join('')");
  ok('对话框里能出中文候选', (cands || '').indexOf('你') >= 0, 'ni 候选=' + cands);
  if (cands) await clickSel('.skb-cand-btn');
  const named = await evl("document.getElementById('col-name').value");
  const c0 = await evl("window.__courseApp.state.columnConfig.length");
  await clickKey('确定'); await sleep(700);
  const c1 = await evl("window.__courseApp.state.columnConfig.length");
  const title = await evl("window.__courseApp.state.columnConfig[window.__courseApp.state.columnConfig.length-1].title");
  ok('「确定」提交了对话框（新增一列）', c1 === c0 + 1, c0 + ' -> ' + c1);
  ok('新列名 = 软键盘输入的内容', title === named, '输入=' + JSON.stringify(named) + ' 列名=' + JSON.stringify(title));
  ok('对话框已关闭', !(await evl("document.getElementById('col-modal').classList.contains('open')")));

  await clickSel('#course-table .tabulator-row .tabulator-cell.tabulator-editable');
  ok('单元格编辑器打开', await evl("!!document.querySelector('#course-table .tabulator-editing input')"));
  ok('初始字母小写', (await firstLetter(S)) === 'q', await firstLetter(S));
  await clickKey('Shift', 130);
  ok('单击 Shift -> 字母显示大写', (await firstLetter(S)) === 'Q', await firstLetter(S));
  ok('Shift 键高亮', await evl("!!document.querySelector('#skb-keys .skb-key.shift.on')"));
  await clickKey('W', 130);
  ok('Shift 生效：字母大写上屏', /W/.test((await inputVal(S)) || ''), JSON.stringify(await inputVal(S)));
  ok('一次 Shift 用完自动取消', !(await evl("!!document.querySelector('#skb-keys .skb-key.shift.on')")));
  await clickKey('Shift', 130); await clickKey('Shift', 130);
  ok('连续两次点击 -> 大写锁定', await evl("!!document.querySelector('#skb-keys .skb-key.shift.lock')"));
  await clickKey('A', 130); await clickKey('B', 130);
  ok('锁定后连续字母都大写', /AB/.test((await inputVal(S)) || ''), JSON.stringify(await inputVal(S)));
  ok('锁定时不会自动取消', await evl("!!document.querySelector('#skb-keys .skb-key.shift.lock')"));
  await clickKey('Shift', 130);
  ok('锁定态点一下即解锁', !(await evl("!!document.querySelector('#skb-keys .skb-key.shift.lock')")));
  ok('解锁后字母恢复小写', (await firstLetter(S)) === 'q', await firstLetter(S));

  const geo = JSON.parse(await evl([
    "(()=>{const rows=Array.from(document.querySelectorAll('#skb-keys .skb-row'));",
    "const g=e=>{const b=e.getBoundingClientRect();return [Math.round(b.left),Math.round(b.right)];};",
    "return JSON.stringify(rows.map(r=>{const ls=Array.from(r.querySelectorAll('.skb-key')).filter(k=>/^[A-Za-z0-9]$/.test(k.textContent));",
    "return {row:g(r),first:ls.length?g(ls[0]):null,keys:r.querySelectorAll('.skb-key').length};}));})()"
  ].join('\n')));
  const w = geo.slice(0, 3).map(r => r.row[1] - r.row[0]);
  ok('前三排行宽一致', Math.max(...w) - Math.min(...w) <= 1, JSON.stringify(w));
  ok('前三排首键错位递增', geo[0].first[0] < geo[1].first[0] && Math.abs(geo[1].first[0] - geo[2].first[0]) <= 2,
    geo[0].first[0] + '/' + geo[1].first[0] + '/' + geo[2].first[0]);
  ok('字母数 10/10/7', geo.slice(0, 3).map(r => r.keys).join('/') === '10/10/7', geo.slice(0, 3).map(r => r.keys).join('/'));
  ok('第 4 排含功能键', geo[3].keys >= 9, '键数=' + geo[3].keys);
  ok('空格键左右对称居中', String(await evl("(()=>{const r=document.querySelectorAll('#skb-keys .skb-row')[3];const s=r.querySelector('.skb-key.space').getBoundingClientRect();const ks=Array.from(r.querySelectorAll('.skb-key')).filter(k=>!k.classList.contains('space'));const L=ks.filter(k=>k.getBoundingClientRect().right<=s.left+1).pop();const R=ks.filter(k=>k.getBoundingClientRect().left>=s.right-1)[0];if(!L||!R)return 'no';const dl=Math.round(s.left-L.getBoundingClientRect().right),dr=Math.round(R.getBoundingClientRect().left-s.right);return Math.abs(dl-dr)<=6?'ok':'off';})()")) === 'ok');

  await clickKey('h'); await clickKey('a');
  const cg = JSON.parse(await evl([
    "(()=>{const bar=document.querySelector('.skb-cand').getBoundingClientRect();",
    "const cands=document.getElementById('skb-cands').getBoundingClientRect();",
    "const clr=document.getElementById('skb-clear').getBoundingClientRect();",
    "return JSON.stringify({bar:[Math.round(bar.left),Math.round(bar.right)],cands:[Math.round(cands.left),Math.round(cands.right)],clr:[Math.round(clr.left),Math.round(clr.right)]});})()"
  ].join('\n')));
  ok('清除键在候选区右侧', cg.clr[0] >= cg.cands[1] - 2, '清除键左=' + cg.clr[0] + ' 候选区右=' + cg.cands[1]);
  ok('清除键贴候选栏右端', cg.bar[1] - cg.clr[1] <= 24, '距右端=' + (cg.bar[1] - cg.clr[1]));
  // 先清掉前面残留的拼音缓冲（否则会和 hao 接成 hahao），再拼 hao 断言候选顺序
  await clickSel('#skb-clear');
  await clickKey('h'); await clickKey('a'); await clickKey('o');
  const haoBuf = await evl("document.getElementById('skb-buf').textContent");
  const haoCands = await evl("Array.from(document.querySelectorAll('.skb-cand-btn')).map(b=>b.textContent).join('')");
  console.log('   hao 缓冲=' + JSON.stringify(haoBuf) + ' 候选=' + JSON.stringify(haoCands));
  ok('hao 首选是「好」', haoCands[0] === '好', 'buf=' + JSON.stringify(haoBuf) + ' cands=' + haoCands);  await clickSel('#skb-clear');
  ok('点清除键清空拼音缓冲', (await evl("document.getElementById('skb-buf').textContent")) === '');
  ok('清除后编辑器仍开着', await evl("!!document.querySelector('#course-table .tabulator-editing input')"));

  ok('组 2 无 JS 异常', exc.length === 0, exc.slice(0, 3).join(' | '));
  S.ws.close(); S.chrome.kill();
}

// ---------------------------------------------------------------------------
// 新模型前置：初始是「空工作区（单列 内容）」，不再自动套学习模板。
// 需要课程名/勾选框那几列的用例，先套一次模板 + 造两行数据。
// 用 applyTemplateToWorkspace 跳过确认弹窗（弹窗本身由 wstest.mjs 专门验证）。
async function seedStudy(S) {
  await S.evl([
    "(function(){",
    "  var A=window.__courseApp;",
    "  A.applyTemplateToWorkspace('study',[",
    "    {field:'course',title:'课程名称',editor:'input'},",
    "    {field:'yuketang',title:'雨课堂',editor:'tickCross'},",
    "    {field:'remark',title:'备注',editor:'input'}",
    "  ]);",
    "  return 'ok';",
    "})()"
  ].join('\n'));
  await new Promise(r => setTimeout(r, 1200));
  await S.evl("(function(){var A=window.__courseApp;A.table().setData([{course:'高等数学',yuketang:true,remark:'周一 1-2 节'}]).then(function(){A.persist();});return 'ok';})()");
  await new Promise(r => setTimeout(r, 1000));
}

// ---------------------------------------------------------------------------
async function group3() {
  console.log('\n===== 组 3：端到端与全功能冒烟 =====');
  const S = await openSession(BASE_PORT + 2);
  const { evl, clickSel, clickAt, exc, sid, send } = S;
  await seedStudy(S);

  await evl("(()=>{const b=document.getElementById('btn-skb');if(document.getElementById('skb').classList.contains('open'))b.click();})()");
  await sleep(400);

  await clickSel('#course-table .tabulator-row .tabulator-cell.tabulator-editable');
  ok('点击后编辑器保持打开', await evl("!!document.querySelector('#course-table .tabulator-editing input')"));
  await send('Input.insertText', { text: '数据结构' }, sid); await sleep(250);
  ok('文字进入输入框', (await inputVal(S)) === '数据结构');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }, sid);
  await send('Input.dispatchKeyEvent', { type: 'char', text: '\r' }, sid);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }, sid);
  await sleep(500);
  ok('回车后提交到数据', (await evl("window.__courseTable.getRows()[0].getData().course")) === '数据结构');
  ok('已写入 localStorage', (await evl("JSON.parse(localStorage.getItem('courseWallpaper.data.v1')).rows[0].course")) === '数据结构');
  ok('编辑器已关闭', !(await evl("!!document.querySelector('#course-table .tabulator-editing input')")));

  const n0 = await evl("window.__courseApp.table().getRows().length");
  await evl("window.__courseApp.addRow()"); await sleep(500);
  ok('增行生效', (await evl("window.__courseApp.table().getRows().length")) === n0 + 1);
  const c0 = await evl("window.__courseApp.state.columnConfig.length");
  await evl("window.__courseApp.state.columnConfig.push({field:'t_a',title:'教师',editor:'input'});window.__courseApp.table().addColumn({field:'t_a',title:'教师',editor:'input',editable:true});");
  await sleep(500);
  ok('增列生效', (await evl("window.__courseApp.state.columnConfig.length")) === c0 + 1);
  await evl("window.__courseApp.setColumnType('t_a','tickCross')"); await sleep(400);
  ok('改列类型生效', (await evl("window.__courseApp.state.columnConfig.find(c=>c.field==='t_a').editor")) === 'tickCross');
  await evl("window.__courseApp.walker.tempExpr=null;window.__courseApp.walker.tempUntil=0;'r'");
  await evl("window.__courseApp.deleteColumn('t_a')"); await sleep(400);
  ok('删列生效', (await evl("window.__courseApp.state.columnConfig.length")) === c0);
  ok('删列触发惊讶表情', (await evl("String(window.__courseApp.walker.tempExpr)")) === 'shock', await evl("String(window.__courseApp.walker.tempExpr)"));
  await evl("window.__courseApp.walker.tempExpr=null;window.__courseApp.walker.tempUntil=0;'r'");
  await evl("window.__courseApp.addRow()"); await sleep(600);
  ok('增行仍为开心', (await evl("String(window.__courseApp.walker.tempExpr)")) === 'happy');

  await evl("document.getElementById('btn-save-template').click()"); await sleep(400);
  await evl("document.getElementById('name-input').value='回归模板'");
  await evl("document.getElementById('name-modal-ok').click()"); await sleep(700);
  ok('自定义模板已保存', (await tplNames(S)).indexOf('回归模板') >= 0, await tplNames(S));
  await evl("window.__courseApp.loadTemplate('study')"); await sleep(600);
  ok('载入预设模板生效', (await evl("window.__courseApp.state.columnConfig.length")) > 0);
  ok('模板上有可见删除叉', await evl("(()=>{const c=Array.from(document.querySelectorAll('#custom-row .tpl-chip')).find(x=>x.textContent.indexOf('回归模板')>=0);return !!(c&&c.querySelector('.tpl-del'));})()"));
  const delRect = JSON.parse(await evl("(()=>{const c=Array.from(document.querySelectorAll('#custom-row .tpl-chip')).find(x=>x.textContent.indexOf('回归模板')>=0);const d=c.querySelector('.tpl-del').getBoundingClientRect();return JSON.stringify([Math.round(d.left),Math.round(d.top),Math.round(d.right),Math.round(d.bottom)]);})()"));
  await clickAt(Math.round((delRect[0] + delRect[2]) / 2), Math.round((delRect[1] + delRect[3]) / 2)); await sleep(400);
  ok('点叉弹出删除确认', await evl("document.getElementById('confirm-modal').classList.contains('open')"));
  if (await evl("document.getElementById('confirm-modal').classList.contains('open')")) { await evl("document.getElementById('confirm-ok').click()"); await sleep(500); }
  ok('点叉能删除模板', (await tplNames(S)).indexOf('回归模板') < 0, '剩余=' + await tplNames(S));

  const hintTxt = await evl("document.getElementById('hint-text').textContent");
  const byTxt = await evl("document.getElementById('quote-by').textContent");
  const stateTxt = await evl("document.getElementById('kbd-state').textContent");
  console.log('   名句=' + JSON.stringify(hintTxt) + ' 出处=' + JSON.stringify(byTxt) + ' 状态=' + JSON.stringify(stateTxt));
  ok('底部显示名言', hintTxt.indexOf('Play in Window') < 0 && hintTxt.length > 4, hintTxt);
  ok('名句后没有追加用法提示', hintTxt.indexOf('软键盘') < 0, hintTxt);
  ok('出处带破折号与全名', /^—— .+/.test(byTxt) && byTxt.indexOf('爱因斯坦') > 0, byTxt);
  ok('左侧引号装饰已移除', (await evl("String(document.querySelector('.panel-hint .bulb'))")) === 'null');
  ok('右侧状态为常驻固定文案', stateTxt === '输入请用「⌨ 软键盘」', stateTxt);

  ok('组 3 无 JS 异常', exc.length === 0, exc.slice(0, 3).join(' | '));
  S.ws.close(); S.chrome.kill();
}

// ---------------------------------------------------------------------------
async function group5() {
  console.log('\n===== 组 5：等比缩放 + 显示开关 =====');
  const S = await openSession(BASE_PORT + 4);
  const { evl, rect, clickSel, clickKey, setProp, exc, sid, send } = S;

  const styleOf = async () => JSON.parse(await evl("(()=>{const p=document.getElementById('table-panel');const cs=getComputedStyle(p);const r=p.getBoundingClientRect();return JSON.stringify({transform:cs.transform,origin:cs.transformOrigin,scaleVar:getComputedStyle(document.documentElement).getPropertyValue('--panel-scale').trim(),w:Math.round(r.width),h:Math.round(r.height),left:Math.round(r.left),top:Math.round(r.top),vis:cs.visibility});})()"));
  const panelRect = async () => JSON.parse(await evl("(()=>{const b=document.getElementById('table-panel').getBoundingClientRect();return JSON.stringify([Math.round(b.left),Math.round(b.top),Math.round(b.width),Math.round(b.height)]);})()"));
  // 缩放值统一以 toFixed(3) 写进 CSS 变量，比较要按这个格式
  const isScale = (got, want) => got === want || got === Number(want).toFixed(3);

  const s0 = await styleOf();
  const r0 = await panelRect();
  console.log('   默认 面板=' + JSON.stringify(r0) + ' scaleVar=' + JSON.stringify(s0.scaleVar) + ' origin=' + s0.origin);
  ok('默认缩放为 1', s0.scaleVar === '' || s0.scaleVar === '1', s0.scaleVar);
  ok('transform-origin 是左上角', s0.origin.indexOf('0px 0px') === 0 || s0.origin.indexOf('left top') === 0, s0.origin);

  await setProp({ table_scale: { value: 140 } });
  const s1 = await styleOf();
  const r1 = await panelRect();
  console.log('   140% 面板=' + JSON.stringify(r1) + ' transform=' + s1.transform);
  ok('CSS 变量写入 1.4', isScale(s1.scaleVar, 1.4), s1.scaleVar);
  ok('transform 为 scale(1.4)（方案 A 整卡缩放）', /matrix\(1\.4/.test(s1.transform), s1.transform);
  ok('宽度按 1.4 倍放大', Math.abs(r1[2] - r0[2] * 1.4) <= 2, r0[2] + ' -> ' + r1[2]);
  ok('高度按 1.4 倍放大', Math.abs(r1[3] - r0[3] * 1.4) <= 2, r0[3] + ' -> ' + r1[3]);
  ok('左上角固定不动', Math.abs(r1[0] - r0[0]) <= 1 && Math.abs(r1[1] - r0[1]) <= 1, '(' + r0[0] + ',' + r0[1] + ') -> (' + r1[0] + ',' + r1[1] + ')');
  ok('放大后仍在视口内', r1[0] + r1[2] <= 1920 + 2 && r1[1] + r1[3] <= 1080 + 2, JSON.stringify(r1));

  ok('放大后单元格仍可点（命中自身）', (await evl("(()=>{const c=document.querySelector('#course-table .tabulator-row .tabulator-cell.tabulator-editable');const b=c.getBoundingClientRect();const e=document.elementFromPoint(Math.round(b.left+b.width/2),Math.round(b.top+b.height/2));return e?(e===c||c.contains(e)?'self':'other'):'null';})()")) === 'self');
  await clickSel('#course-table .tabulator-row .tabulator-cell.tabulator-editable');
  ok('放大后能进入编辑', await evl("!!document.querySelector('#course-table .tabulator-editing input')"));
  await clickKey('a'); await clickKey('b');
  ok('放大后软键盘输入照常', (await evl("document.getElementById('skb-buf').textContent")) === 'ab');
  await clickKey('确定'); await sleep(500);

  // 拖拽跟手：埋点抓「真实鼠标位移」与「面板位移」的比值。
  // 注意两点，都是踩过的坑：
  //   ① 只看目标值会被视口夹取误导 —— 必须先确保该方向有足够空间；
  //   ② 面板 left 有 8px 下限，往左上拖容易撞边界，所以这里往「右」拖。
  await evl([
    "window.__dragProbe={down:null,moves:[]};",
    "document.getElementById('toolbar').addEventListener('mousedown', function(e){window.__dragProbe.down={clientX:e.clientX};}, true);",
    "document.addEventListener('mousemove', function(e){if(window.__dragProbe.down)window.__dragProbe.moves.push(e.clientX);}, true);",
    "'ok'"
  ].join('\n'));
  const before = await styleOf();
  // 先把面板往左收到 8px 附近之外的位置，确保右侧有足够空间
  const bar = JSON.parse(await evl("(()=>{const c=document.getElementById('toolbar').getBoundingClientRect();return JSON.stringify([Math.round(c.left+60),Math.round(c.top+10)]);})()"));
  const roomRight = 1900 - before.left - before.w;
  console.log('   面板 left=' + before.left + ' 宽=' + before.w + ' 右侧可用空间=' + Math.round(roomRight) + 'px');
  ok('拖拽测试前右侧空间充足（否则位移会被夹取截断）', roomRight > 200, '可用=' + Math.round(roomRight) + 'px');
  const TARGET = 160, STEPS = 8;
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: bar[0], y: bar[1], button: 'left', clickCount: 1, buttons: 1 }, sid);
  await sleep(70);
  for (let i = 1; i <= STEPS; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(bar[0] + TARGET * i / STEPS), y: bar[1], button: 'left', buttons: 1 }, sid);
    await sleep(45);
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: bar[0] + TARGET, y: bar[1], button: 'left', clickCount: 1, buttons: 0 }, sid);
  await sleep(400);
  const probe = JSON.parse(await evl("JSON.stringify(window.__dragProbe)"));
  const after = await styleOf();
  const rawDelta = probe.moves.length ? (probe.moves[probe.moves.length - 1] - probe.down.clientX) : 0;
  const moved = after.left - before.left;
  console.log('   scale=' + s1.scaleVar + '  真实鼠标位移=' + rawDelta + 'px  面板位移=' + moved + 'px  比值=' + (rawDelta ? (moved / rawDelta).toFixed(3) : 'n/a'));
  ok('放大后拖拽与鼠标 1:1 跟手',
    rawDelta > 40 && Math.abs(moved / rawDelta - 1) <= 0.08,
    '比值=' + (rawDelta ? (moved / rawDelta).toFixed(3) : 'n/a'));

  await setProp({ table_scale: { value: 60 } });
  const s2 = await styleOf(), r2 = await panelRect();
  console.log('   60% 面板=' + JSON.stringify(r2) + ' scaleVar=' + s2.scaleVar);
  ok('宽度按 0.6 缩小', Math.abs(r2[2] - r0[2] * 0.6) <= 3, r0[2] + ' -> ' + r2[2]);
  ok('高度按 0.6 缩小', Math.abs(r2[3] - r0[3] * 0.6) <= 3, r0[3] + ' -> ' + r2[3]);
  ok('缩小后仍可点单元格', (await evl("(()=>{const c=document.querySelector('#course-table .tabulator-row .tabulator-cell.tabulator-editable');const b=c.getBoundingClientRect();const e=document.elementFromPoint(Math.round(b.left+b.width/2),Math.round(b.top+b.height/2));return e?(e===c||c.contains(e)?'self':'other'):'null';})()")) === 'self');

  // 阈值 >10 判百分比：10 及以下当倍率，于是 10 → 夹到下限 1.0（注意 1.0 在
  // 0.6~1.5 区间内、不在区间外，所以这里写 10 会被当成「10 倍」，夹到 1.5）
  await setProp({ table_scale: { value: 10 } });
  ok('倍率写法 10 被夹到上限 1.5', isScale((await styleOf()).scaleVar, 1.5), (await styleOf()).scaleVar);
  await setProp({ table_scale: { value: 9 } });
  ok('倍率写法 9 被夹到上限 1.5（曾经被错算成 0.6）', isScale((await styleOf()).scaleVar, 1.5), (await styleOf()).scaleVar);
  await setProp({ table_scale: { value: 200 } });
  ok('百分比写法 200 被夹到上限 1.5', isScale((await styleOf()).scaleVar, 1.5), (await styleOf()).scaleVar);
  await setProp({ table_scale: { value: 0 } });
  ok('非正数回落到默认 1', isScale((await styleOf()).scaleVar, 1), (await styleOf()).scaleVar);
  await setProp({ table_scale: { value: 5 } });
  ok('超出上限的倍率被夹到 1.5', isScale((await styleOf()).scaleVar, 1.5), (await styleOf()).scaleVar);
  await setProp({ table_scale: { value: 1.2 } });
  ok('小数写法 1.2 生效', isScale((await styleOf()).scaleVar, 1.2), (await styleOf()).scaleVar);
  await setProp({ table_scale: { value: 60 } });
  ok('百分比写法 60 生效', isScale((await styleOf()).scaleVar, 0.6), (await styleOf()).scaleVar);
  await setProp({ table_scale: { value: 0.5 } });
  ok('低于下限的倍率被夹到 0.6', isScale((await styleOf()).scaleVar, 0.6), (await styleOf()).scaleVar);
  await setProp({ table_scale: { value: 130 } });
  ok('已持久化到 localStorage',
    (await evl("String(JSON.parse(localStorage.getItem('courseWallpaper.layout.v1')||'{}').scale)")) === '1.3',
    await evl("String(JSON.parse(localStorage.getItem('courseWallpaper.layout.v1')||'{}').scale)"));
  await evl("location.reload()"); await sleep(4500);
  const afterReload = await styleOf();
  ok('重载后沿用保存的 1.3', isScale(afterReload.scaleVar, 1.3), afterReload.scaleVar);
  await setProp({ table_scale: { value: 80 } });
  ok('用户属性覆盖 localStorage（滑块不被顶回）', isScale((await styleOf()).scaleVar, 0.8), (await styleOf()).scaleVar);

  const visW = (await panelRect())[2];
  await setProp({ table_visible: { value: false } });
  const hid = await styleOf();
  const hidDim = JSON.parse(await evl("(()=>{const p=document.getElementById('table-panel');return JSON.stringify({offW:p.offsetWidth,pe:getComputedStyle(p).pointerEvents});})()"));
  ok('取消勾选后不可见', hid.vis === 'hidden', hid.vis);
  ok('隐藏后不可点击', hidDim.pe === 'none', hidDim.pe);
  ok('用 visibility 而非 display:none（布局盒保留）', hidDim.offW > 0, 'offsetWidth=' + hidDim.offW);
  ok('隐藏时面板区域事件穿透', (await evl("(()=>{const p=document.getElementById('table-panel').getBoundingClientRect();const e=document.elementFromPoint(Math.round(p.left+p.width/2),Math.round(p.top+40));return e?(e.closest('#table-panel')?'panel':'outside'):'null';})()")) === 'outside');
  await setProp({ table_visible: { value: true } });
  ok('重新勾选后恢复可见', (await styleOf()).vis === 'visible');
  ok('恢复后尺寸一致', (await panelRect())[2] === visW, visW + ' -> ' + (await panelRect())[2]);
  ok('显示状态已持久化', (await evl("String(JSON.parse(localStorage.getItem('courseWallpaper.layout.v1')||'{}').visible)")) === 'true');

  await setProp({ table_scale: { value: 120 } }); await sleep(600);
  ok('缩放后小人仍贴合走动区', (await evl("(()=>{const l=document.getElementById('walker-lane').getBoundingClientRect();const b=document.getElementById('walker-box').getBoundingClientRect();return (b.top>=l.top-1&&b.bottom<=l.bottom+1)?'ok':'X';})()")) === 'ok');
  const wb = await rect('#walker-box');
  ok('缩放后走动小人按比例放大', Math.abs((wb[2] - wb[0]) - 145 * 1.2) <= 3, '宽=' + (wb[2] - wb[0]));

  ok('组 5 无 JS 异常', exc.length === 0, exc.slice(0, 3).join(' | '));
  S.ws.close(); S.chrome.kill();
}

(async () => {
  const only = process.argv[2];
  try {
    if (!only || only === '1') await group1();
    if (!only || only === '2') await group2();
    if (!only || only === '3') await group3();
    if (!only || only === '5') await group5();
  } catch (e) {
    console.log('\n[脚本异常] ' + e.message);
    fail++;
  }
  console.log('\n========================================');
  console.log('总计: ' + pass + ' 通过 / ' + fail + ' 失败');
  console.log('========================================');
  process.exit(fail ? 1 : 0);
})();
