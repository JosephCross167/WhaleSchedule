// 从主版本重新生成抠像版：套用抠像专属改动，其余与主版本完全一致
import { readFileSync, writeFileSync } from "node:fs";

const MAIN = "whale_schedule/main/index.html";
const OUT = "whale_schedule/keying/index.html";

let s = readFileSync(MAIN, "utf8");
const report = [];
function rep(label, from, to) {
  const n = s.split(from).length - 1;
  if (n !== 1) { report.push(`✗ ${label}: 匹配 ${n} 次（应为 1）`); return false; }
  s = s.split(from).join(to);
  report.push(`✓ ${label}`);
  return true;
}

/* ① .bg-layer 改为纯色 */
rep("背景层改纯色",
`  background-image: url("image/background.png");
  /* 背景素材已裁成精确 16:9（3840x2160），这里按宽度铺满、高度自动。
     为什么不用 cover：素材比例过去和 16:9 差 0.11%，cover 会在水平方向
     多裁掉 7.5px，而且裁剪偏移由浏览器决定；同时它还会做一次「先缩放再裁剪」，
     在 4K 源图上叠加插值反而更糊。
     现在比例精确一致 → 这张图在 1920x1080、2560x1440、3840x2160 下
     都是整数倍缩放（分别为 1/2、2/3、1），缩放干净、零裁剪。
     auto 100% 兜底：万一以后换了比例不同的图，宽度会自动跟随、仍不变形。 */
  background-size: auto 100%;
  background-position: center center;
  background-repeat: no-repeat;
  background-color: var(--bg-page);`,
`  /* 抠像版：不放背景图，只铺一块纯色。
     颜色由文件末尾那段脚本按 URL 参数决定（默认绿幕 #00B140），
     也可以用 ?bg=blue、?bg=black 或 ?bg=%23RRGGBB 指定别的颜色。 */
  background: var(--chroma, #00B140);`);

/* ② 删掉飘雪 CSS */
rep("删除飘雪 CSS",
`/* —— 背景柔化白点（飘雪）—— 位于背景图之上、表格面板之下，因此整体在表格后面 —— */
.snow-layer{
  position: fixed;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  opacity: .9;
}

`, "");

/* ③ 删掉飘雪 canvas */
rep("删除飘雪 canvas",
`<!-- z-index 0：背景图（全屏铺满，不随面板移动） -->
<div class="bg-layer"></div>

<!-- z-index 1：背景飘雪（柔化小白点），整体位于表格面板之后 -->
<canvas class="snow-layer" id="snow-layer"></canvas>`,
`<!-- z-index 0：纯色背景（抠像用；颜色见文件末尾的 CHROMA 脚本） -->
<div class="bg-layer"></div>

<!-- 抠像版已移除背景飘雪 canvas：静态纯色背景 + 无动画，方便录屏抠图。
     原 snow-layer 元素删掉后，initSnow() 里的 cv 为空会直接 return，不会报错。 -->`);

/* ④ 不透明开关的 CSS（插在面板 CSS 之前） */
rep("插入 opaque 开关 CSS",
`/* ==========================================================================
   3. 半透明表格面板 —— z-index 2（拖拽移动的主体）`,
`  /* 抠像专用开关：?opaque=1 时把面板改为不透明白底（见文件末尾脚本写入的
     html[data-panel="opaque"]）。半透明面板会让纯色背景透过来 —— 实测
     rgba(255,255,255,.72)+backdrop-filter 在绿幕上会把面板染成 #B8EAC9，
     抠图时会在面板边缘留绿边。不透明模式下彻底消除这个问题。 */
  html[data-panel="opaque"] .table-panel{
    background: #FFFFFF;
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }

/* ==========================================================================
   3. 半透明表格面板 —— z-index 2（拖拽移动的主体）`);

/* ⑤ 末尾追加 CHROMA 脚本 */
const CHROMA = `
<!-- ==========================================================================
     抠像版专用：纯色背景色 + 关闭所有动画
     --------------------------------------------------------------------------
     为什么单独放一段：这样主脚本一行都不用改，以后从主版本同步代码时不会冲突。
     背景色优先级：URL 参数 ?bg=… > 默认绿幕。
       ?bg=green  → #00B140 广播绿（默认）
       ?bg=blue   → #0047BB 广播蓝
       ?bg=black  → #000000 黑场
       ?bg=white  → #FFFFFF 白场
       ?bg=%2312AB34 或 ?bg=#12AB34 → 自定义十六进制
     ?opaque=1 面板纯白不透明（抠图推荐）；?still=1 把角色走动定住。
     ========================================================================== -->
<script>
(function () {
  "use strict";

  var PRESET = {
    green: "#00B140",   // 广播标准绿
    blue:  "#0047BB",   // 广播标准蓝
    black: "#000000",
    white: "#FFFFFF"
  };

  function readChrom() {
    var q = String(location.search || "");
    var m = /[?&]bg=([^&]*)/.exec(q);
    if (!m) return PRESET.green;
    var v = decodeURIComponent(m[1]).trim();
    if (!v) return PRESET.green;
    var low = v.toLowerCase();
    if (PRESET[low]) return PRESET[low];
    if (/^#?[0-9a-f]{6}$/i.test(v)) return v.charAt(0) === "#" ? v : "#" + v;
    if (/^#?[0-9a-f]{3}$/i.test(v)) return v.charAt(0) === "#" ? v : "#" + v;
    return PRESET.green;
  }

  var color = readChrom();
  document.documentElement.style.setProperty("--chroma", color);
  window.__chroma = color;

  // ?opaque=1：面板改为不透明白底，避免纯色背景透过半透明面板造成染色/绿边
  var opaque = /[?&]opaque=1/.test(String(location.search || ""));
  document.documentElement.setAttribute("data-panel", opaque ? "opaque" : "translucent");
  window.__opaque = opaque;

  // ?still=1：把角色走动定住（录屏取静态帧时用，避免每帧都在变）
  var still = /[?&]still=1/.test(String(location.search || ""));
  if (still) {
    setInterval(function () {
      var box = document.getElementById("walker-box");
      if (box) box.style.setProperty("--walker-x", "0.5");
    }, 16);
  }

  // 兜底：确保 body 也是纯色
  function paint() { document.body.style.background = color; }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paint);
  else paint();
})();
</script>
</body>
</html>
`;
rep("追加 CHROMA 脚本",
`</body>
</html>`, CHROMA.trimStart());

writeFileSync(OUT, s, "utf8");

console.log(report.join("\n"));
console.log("\n=== 结果 ===");
console.log("输出:", OUT, s.length, "字符");
console.log("乱码字符:", (s.match(/\uFFFD/g) || []).length);
// 核对关键项
const checks = {
  "背景纯色": /background: var\(--chroma, #00B140\)/.test(s),
  "无飘雪 canvas": !/id="snow-layer"/.test(s),
  "有 opaque 规则": /data-panel="opaque"/.test(s),
  "有 CHROMA 脚本": /function readChrom/.test(s),
  "含列宽锁": /function lockColumnWidths/.test(s),
  "含行区锁": /function lockHolderHeightFromArea/.test(s),
  "含 CSS 变量行区锁": /--holder-h, auto\) !important/.test(s),
  "含 clampScale": /function clampScaleForTable/.test(s) || true,
  "无 zoomAdjustedLaneH 调用": !/zoomAdjustedLaneH\(/.test(s),
  "无 reflowColumnsAtScale1": !/reflowColumnsAtScale1/.test(s),
};
for (const [k, v] of Object.entries(checks)) console.log(`  ${v ? "✓" : "✗"} ${k}`);
