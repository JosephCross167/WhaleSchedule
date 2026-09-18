// 纯静态检查（不需要浏览器）：HTML 结构、脚本语法、关键 id 是否都在
import fs from 'node:fs';
const FILE = 'D:\\桌面\\py\\deepseek_v4\\workflow\\whale_schedule\\main\\index.html';
const html = fs.readFileSync(FILE, 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  OK   ' + n + (d ? '   [' + d + ']' : '')); } else { fail++; console.log('  FAIL ' + n + (d ? '   [' + d + ']' : '')); } };

console.log('=== ① 内联脚本语法 ===');
// 取最后一个 <script> ... </script>（主脚本，没有 src）
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
ok('找到内联脚本', scripts.length > 0, '共 ' + scripts.length + ' 段');
const main = scripts[scripts.length - 1];
try {
  new Function(main);
  ok('主脚本语法正确', true, main.split('\n').length + ' 行');
} catch (e) {
  ok('主脚本语法正确', false, e.message);
}

console.log('\n=== ② 关键 id 都存在于 HTML ===');
const ids = [...main.matchAll(/\$\("([a-zA-Z0-9_-]+)"\)/g)].map(m => m[1]);
const need = [...new Set(ids)];
const missing = need.filter(id => !new RegExp('id="' + id + '"').test(html));
ok('脚本引用的 id 全部存在', missing.length === 0, missing.length ? '缺失: ' + missing.join(', ') : '共 ' + need.length + ' 个');

console.log('\n=== ③ 结构配对（只看真正的 HTML 标记，剥掉 script/style） ===');
// 必须剥掉 script：JS 字符串/注释里也会出现 <button 之类的字样，会被误计
const htmlMarkup = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
const count = (re) => (htmlMarkup.match(re) || []).length;
['div', 'button', 'span', 'section', 'label'].forEach(tag => {
  const o = count(new RegExp('<' + tag + '\\b', 'g'));
  const c = count(new RegExp('</' + tag + '>', 'g'));
  ok(tag + ' 开闭配对', o === c, o + ' / ' + c);
});
ok('script 开闭配对', count(/<script\b/g) === count(/<\/script>/g), count(/<script\b/g) + ' / ' + count(/<\/script>/g));

console.log('\n=== ④ 软键盘相关元素齐全 ===');
['skb', 'skb-bar', 'skb-close', 'skb-buf', 'skb-clear', 'skb-cands', 'skb-hint', 'skb-keys', 'btn-skb'].forEach(id => {
  ok('#' + id + ' 存在', new RegExp('id="' + id + '"').test(html));
});

console.log('\n=== ④b 新增功能接线 ===');
ok('清除键有 click 处理', /clearBtn\.addEventListener\("click"/.test(main));
ok('清除键 mousedown 阻止默认（防编辑器失焦）', /clearBtn\.addEventListener\("mousedown"/.test(main));
ok('skbClearBuf 已定义', /function skbClearBuf\s*\(/.test(main));
ok('清除键状态会刷新', /function skbRefreshClear\s*\(/.test(main) && /skbRefreshClear\(\)/.test(main));
ok('自定义模板用 span+role（button 不能套 button）', /chip\.setAttribute\("role",\s*"button"\)/.test(main) && !/createElement\("button"\)[\s\S]{0,120}className = "tpl-chip"/.test(main));
ok('自定义模板有可见删除按钮', /className = "tpl-del"/.test(main));
ok('删除按钮走删除确认', /askDeleteTemplate\(idx\)/.test(main));
ok('CSS 有 .tpl-del 样式', /\.tpl-chip \.tpl-del\{/.test(html));
ok('CSS 有 .skb-clear 样式', /\.skb-clear\{/.test(html));

console.log('\n=== ④d 候选翻页（A+B）===');
['skb-page-prev', 'skb-page-next', 'skb-pageinfo'].forEach(id => {
  ok('#' + id + ' 存在', new RegExp('id="' + id + '"').test(html));
});
ok('定义了每页大小常量', /var SKB_PAGE_SIZE = \d+/.test(main), (main.match(/var SKB_PAGE_SIZE = \d+/) || [''])[0]);
ok('定义了 skbPageCount', /function skbPageCount\s*\(/.test(main));
ok('定义了 skbPageGo', /function skbPageGo\s*\(/.test(main));
ok('定义了 skbRenderPager', /function skbRenderPager\s*\(/.test(main));
ok('翻页按钮已绑定 click', /\[\["skb-page-prev", -1\], \["skb-page-next", 1\]\]/.test(main));
ok('翻页按钮 mousedown 阻止默认', /btn\.addEventListener\("mousedown"/.test(main));
ok('候选栏绑定滚轮横滚', /cands\.addEventListener\("wheel"/.test(main));
ok('滚轮为 passive:false（否则 preventDefault 无效）', /passive: false/.test(main));
ok('滚到尽头时滚轮转为翻页', /atStart[\s\S]{0,200}atEnd[\s\S]{0,200}skbPageGo/.test(main));
ok('每页取候选用绝对位次（多音字排序一致）', /skbCandBtn\(ch, start \+ i\)/.test(main));
ok('按键后页码回到第一页', /if \(key !== "Enter"\) skb\.page = 0;/.test(main));
ok('清除拼音时页码也复位', /skb\.page = 0;\s*\/\/ 候选栏一并回到第一页/.test(main));
ok('翻页后候选栏滚动位置复位', /host\.scrollLeft = 0;/.test(main));
ok('不再硬截断在 12 个', !/list\.length < 12/.test(main));
ok('skb 状态含 page 字段', /page: 0\s+\/\/ 候选栏当前页/.test(main));
ok('CSS 有 .skb-page 样式', /\.skb-page\{/.test(html));
ok('CSS 有 .skb-pageinfo 样式', /\.skb-pageinfo\{/.test(html));
ok('滚动条加粗到 6px 且悬停高亮', /\.skb-cands::-webkit-scrollbar\{ height: 6px/.test(html) && /\.skb-cands:hover::-webkit-scrollbar-thumb/.test(html));

console.log('\n=== ④c 拼音字典已按字频排序 ===');
const dataDir = 'D:\\桌面\\py\\deepseek_v4\\workflow\\whale_schedule\\main\\data';
const meta = fs.readFileSync(dataDir + '\\pinyin.meta.js', 'utf8');
ok('meta 标明按字频排序', /sortedBy/.test(meta) && /Jun Da/.test(meta), meta.trim().slice(0, 160));
const chunks = fs.readdirSync(dataDir).filter(f => /^pinyin\.\d+\.js$/.test(f)).sort();
ok('分片文件存在', chunks.length >= 1, chunks.join(', '));
let dict = {};
for (const f of chunks) {
  const t = fs.readFileSync(dataDir + '\\' + f, 'utf8');
  const m = t.match(/window\.PINYIN_CHUNK\(\d+,\s*(\[[\s\S]*\])\s*\);?\s*$/);
  if (m) for (const [py, chs] of JSON.parse(m[1])) dict[py] = chs;
}
ok('字典可解析出音节', Object.keys(dict).length > 300, Object.keys(dict).length + ' 个音节');
[['hao', '好'], ['de', '的'], ['ping', '平'], ['ni', '你'], ['ke', '课'], ['xue', '学'], ['shu', '数']].forEach(([py, ch]) => {
  const i = (dict[py] || '').indexOf(ch);
  ok(py + ' 的首选/可见候选含「' + ch + '」', i >= 0 && i < 12, '位次=' + (i + 1));
});
ok('同音节内按字频降序（haoz 首选不再是壕）', (dict['hao'] || '')[0] === '好', (dict['hao'] || '').slice(0, 12));

console.log('\n=== ⑤ 删掉的自动定位逻辑不再被引用 ===');
['skbFollow', 'skbRepositionSoon', 'updatePanelMaxForKb', 'skbPosition', 'kb-capped', 'skb-open'].forEach(name => {
  const used = new RegExp('\\b' + name + '\\b').test(main);
  ok('无残留引用: ' + name, !used);
});

console.log('\n=== ⑥ 拖动与位置持久化已接好 ===');
ok('定义了 skbPlace', /function skbPlace\s*\(/.test(main));
ok('定义了 skbRestorePos', /function skbRestorePos\s*\(/.test(main));
ok('定义了 skbSavePos', /function skbSavePos\s*\(/.test(main));
ok('定义了 initSkbDrag', /function initSkbDrag\s*\(/.test(main));
ok('bindUI 里调用了 initSkbDrag', /initSkbDrag\(\);/.test(main));
ok('位置存进 localStorage', /KB_LAYOUT_KEY\s*=\s*"courseWallpaper\.keyboard\.v1"/.test(main));
ok('标题栏 mousedown 阻止默认（避免编辑器失焦关闭）', /bar\.addEventListener\("mousedown"[\s\S]{0,400}e\.preventDefault\(\)/.test(main));

console.log('\n=== ⑦ 已修复的错误不再出现 ===');
ok('无 "Enter" 当文字上屏的兜底分支问题', /skb\.lastShiftTap = 0;/.test(main));
ok('功能键在兜底分支之前拦截', main.indexOf('if (key === "Enter") { skbEnter(); return; }') < main.indexOf('skbInsert(key);'));
ok('skbEnter 会触发对话框自己的提交按钮', /modal\.querySelector\("\.modal-foot \.btn-primary/.test(main));
ok('focusin 自动开键盘', /document\.addEventListener\("focusin"/.test(main));
ok('对话框输入框被识别为输入目标', /skbIsTextInput/.test(main) && /\.modal-mask\.open/.test(main));

console.log('\n=== ⑧ 底部名言行 ===');
ok('HTML 里有 quote-by 出处位', /id="quote-by"/.test(html));
ok('CSS 有 .quote-by 样式', /\.panel-hint \.quote-by\{/.test(html));
ok('左侧引号装饰已移除', !/class="bulb"/.test(html) && !/\.panel-hint \.bulb\{/.test(html));
ok('爱因斯坦原生句已在 HTML 静态兜底', /无论如何，我都确信，上帝不会掷骰子。/.test(html));
ok('QUOTES 表已定义且带出处全名', /var QUOTES = \[/.test(main) && /阿尔伯特·爱因斯坦/.test(main));
ok('有随机换句逻辑', /function pickQuote/.test(main));
ok('renderHint 只写名言与出处（不追加用法）',
  /t\.textContent = quote\.text;/.test(main) && !/quoteWarn/.test(main));
ok('boot 里初始化名言', /quote = pickQuote\(\);/.test(main) && /renderHint\(\);/.test(main));
ok('旧的长篇「Play in Window」提示已删除', !/Play in Window → Full HD Preview，在预览窗口中编辑/.test(html));
ok('粘贴死路代码已清除', !/bindPaste|updatePasteState|pasteSeen|clipboardData/.test(main));
ok('右侧状态标签是常驻固定文案', /id="kbd-state">输入请用「⌨ 软键盘」</.test(html));
ok('状态标签文案不再随检测变化', !/updateKbdState/.test(main) && !/键盘：可用|键盘：请用软键盘|键盘：待检测/.test(main));

console.log('\n结果: ' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
