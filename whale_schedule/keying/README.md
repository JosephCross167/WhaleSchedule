# 抠像录屏版 · Excel 课程表壁纸

这是主版本 `whale_schedule/main/` 的**录屏抠像专用副本**：背景换成一块纯色，去掉了背景图和飘雪动画。

## 为什么另开一份

主版本的背景是 `image/background.png`（3840×2160 的插画）+ 一层飘雪 canvas，抠图时这两个都会干扰。这份副本里：

| 项 | 主版本 | 本副本 |
|---|---|---|
| 背景 | 插画 + 飘雪动画 | **一块纯色**（默认广播绿 `#00B140`），无动画 |
| 面板背景 | 半透明白 + 毛玻璃模糊 | 默认相同；加 `?opaque=1` 变纯白不透明 |
| 其它（表格 / 工作区 / 模板 / 软键盘 / 大肥鱼） | — | **完全一致**，未做任何改动 |

改法很克制：只删了 `.bg-layer` 里的背景图、删了飘雪 `<canvas>`，其余一行没动。新增的纯色逻辑单独放在 `</body>` 前的一段独立 `<script>` 里，**所以以后从主版本同步代码不会冲突**。

## 怎么用

直接双击 `index.html`，或在 Wallpaper Engine 里指向它。

### URL 参数

| 参数 | 作用 |
|---|---|
| （不加） | 绿幕 `#00B140`，面板半透明（和原版一致） |
| `?bg=blue` | 蓝幕 `#0047BB` |
| `?bg=black` | 黑场 `#000000` |
| `?bg=white` | 白场 `#FFFFFF` |
| `?bg=%2312AB34` | 自定义颜色（`#` 要写成 `%23`） |
| `?opaque=1` | **面板改纯白不透明**（抠图推荐，见下） |
| `?still=1` | 把大肥鱼定在走动区中间，不再来回走（取静态帧用） |

可以组合：`index.html?bg=blue&opaque=1`

> 在 Wallpaper Engine 里加参数：壁纸属性一般不方便加 URL 参数，建议**先改文件默认值**——把 `index.html` 末尾那段脚本里的 `PRESET.green` 改成你要的颜色，或直接改 `readChrom()` 的默认返回值。

### 抠图设置建议

- **绿幕**比蓝幕更适合这个壁纸：面板是靛蓝/白色系，蓝色元素多，用蓝幕容易把界面里的蓝色一起抠掉。面板主色是 `#3A49A5`，和广播蓝 `#0047BB` 很近——**强烈建议用绿幕**。
- **一定要加 `?opaque=1`**。不加的话面板是 `rgba(255,255,255,0.72)` + `backdrop-filter: blur()`，纯色背景会透过来：绿幕下实测面板内部被染成 `#B8EAC9`（应为 `#FFFFFF`）。这会让抠图在面板边缘留一圈绿边，或者在"同时抠掉背景和面板内部"时出错。
- 加了 `?opaque=1` 后，面板内部是纯白 `#FFFFFF`，绿幕是纯色 `#00B140`，两者色相差距极大，键控很干净。

### 抠像参数参考

绿幕 `#00B140` 上抠白底面板，AE/Premiere 的 Keylight 大概这样起步：

| 参数 | 建议值 |
|---|---|
| Screen Colour | `#00B140` |
| Screen Matte → Clip Black | 15–25 |
| Screen Matte → Clip White | 80–90 |
| Screen Balance | 50 |
| 去溢色 | Advanced Spill Suppressor，或 Keylight 的 Despill Bias 取面板主色 `#3A49A5` |

面板是硬边圆角矩形，如果只是要"把界面抠出来"，**其实用矩形遮罩比键控更干净**——这版纯色背景主要是给"要不要抠掉某部分"留余地的。

## 维护说明

- 这份副本**不会自动跟随主版本更新**。主版本改了功能、以后要重新录屏的话，需要重新复制一次，然后重新套用下面这 3 处改动。
- 相对主版本 `index.html` 的全部改动就 3 处，都在注释里标了「抠像」：
  1. `.bg-layer` 的 CSS：删掉 `background-image` / `background-size` / `background-position` / `background-repeat`，改成 `background: var(--chroma, #00B140)`
  2. 删掉 `.snow-layer` 的 CSS 块 + `<canvas class="snow-layer" id="snow-layer">` 元素
  3. 文件末尾新增一段独立 `<script>`（读 URL 参数、写 `--chroma`、设 `data-panel`）
  4. 另加一条 CSS 规则 `html[data-panel="opaque"] .table-panel{...}`

- 录屏建议 1920×1080 或 3840×2160。面板在 1080p 下默认占左侧约 1133×767，别的位置可以用壁纸属性里的 `table_x` / `table_y` / `table_width` / `table_height` 调。
- 这份副本里的数据（表格内容、工作区）用的是 `localStorage`，**和主版本共用同一个域名/路径时可能互相覆盖**。如果发现内容串了，在浏览器里单独清一下这个页面的存储。
