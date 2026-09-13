# WhaleSchedule · 智能课程表壁纸

> 一个跑在 Wallpaper Engine 里的可编辑课程表壁纸。纯 HTML / CSS / 原生 JS，**无 CDN、运行时零网络请求**。

<p>
  <img alt="license" src="https://img.shields.io/badge/license-MIT-blue">
  <img alt="platform" src="https://img.shields.io/badge/platform-Wallpaper%20Engine-1a1a2e">
  <img alt="offline" src="https://img.shields.io/badge/runtime-100%25%20offline-success">
</p>

**简体中文** | [English](#english)

---

## 简介

WhaleSchedule 把课程表做成壁纸：直接点单元格就能改内容，增删行列、切换列类型、存模板、导入导出 JSON，数据自动保存在本地。表格旁边有位会来回走动的**鲸鱼娘**（也叫「大肥鱼」，其实就是本项目的娘化形象），编辑时她会思考、增删行时会惊讶。

**全部美术素材与代码均由 AI 生成**，详见 [素材与 AI 生成说明](#素材与-ai-生成说明)。

### 截图

**整体效果** —— 表格面板浮在壁纸上，右侧是鲸鱼娘（大肥鱼）：

![整体效果](excelwallpaper/assets/preview-1.png)

**输入状态** —— 点击单元格后弹出的软键盘（可拖动），候选栏带拼音与翻页：

![输入状态](excelwallpaper/assets/preview-2.png)

---

## 功能

**表格**
- 点击单元格即编辑；**勾选框单击直接切换**，不需要先选中格子
- 任意增删行列；首列（课程名称）受保护不可删
- 每列可独立设类型：**文本框** 或 **勾选框**
- 行首操作列：显示序号 + 删除按钮（带二次确认）

**模板**
- 内置三套预设：学习 / 工作 / 生活
- 可把当前列结构「保存为模板」，右键或点 ✕ 删除；载入模板时**保留能对应的数据**

**数据**
- 自动存 localStorage，刷新不丢
- 导入 / 导出 JSON

**鲸鱼娘（大肥鱼）**
- 就是本项目的娘化形象，4 个表情：微笑 / 开心 / 惊讶 / 思考
- 沿面板底部来回走，到边缘自动转身；编辑时思考，增删行时给出反应

**桌面端输入**（见下方专节）
- 内置**可拖动软键盘**，支持拼音输入中文，候选按字频排序

---

## 桌面端输入说明（重要）

Wallpaper Engine 在桌面模式下**不会把键盘事件投递给壁纸页面**（按键都给了桌面图标），所以在壁纸上直接敲键盘是没有反应的。

**本壁纸的解决方案：内置软键盘。**

- 点击单元格或对话框输入框时，软键盘会自动弹出
- **按住标题栏可把它拖到任意位置**，位置会记住
- 支持拼音输入：点字母拼出音节 → 候选栏点字上屏（如 `hao` → 好 / 号 / 毫 …）
- 候选**按 Jun Da 现代汉语字频排序**，常用字排在最前
- 每个音节最多 40 个候选，候选栏用 `‹ ›` **翻页**查看后面的字
- Shift：单击大写一次；连点两下锁定大写
- 候选栏最右侧的 ✕ 可清除已拼拼音（没有拼音时则清空输入框）

> **已知限制**：候选栏也支持滚轮（滚到尽头自动翻页），但实测 **Wallpaper Engine 的 webview 似乎不向壁纸转发滚轮事件**，所以滚轮在壁纸里通常无效 —— 请用 `‹ ›` 翻页按钮。

> **关于粘贴**：`navigator.clipboard.readText()` 在壁纸里会因权限被拒（`file://` 虽是安全上下文，但权限状态为 `prompt`，而 WE 的 webview 没有权限弹窗），Ctrl+V 的 `paste` 事件实测也未被转发。因此**壁纸内不支持粘贴**，相关代码已移除。

---

## 自定义（Wallpaper Engine 用户属性）

在 Wallpaper Engine 里选中本壁纸后，右侧「属性」面板可调：

| 属性 | 类型 | 范围 / 默认 | 说明 |
|---|---|---|---|
| `table_x` | slider | 0–100%，默认 3% | 面板水平位置 |
| `table_y` | slider | 0–100%，默认 20% | 面板垂直位置 |
| `table_width` | slider | 400–1400 px | 面板宽度 |
| `table_height` | slider | 300–900 px | 面板高度上限 |
| `table_scale` | slider | 60–150%，默认 100% | **整体等比缩放**（缩放整张卡片，含边框与鲸鱼娘） |
| `table_visible` | checkbox | 默认开 | 取消勾选即隐藏整个表格 |

**优先级：用户属性 > localStorage > 默认值。**
面板也可以直接在壁纸上**拖动工具栏**移动，拖完会记住位置。

---

## 安装

1. 下载 / clone 本仓库
2. 打开 Wallpaper Engine → 「创建壁纸」→ 「打开文件夹」
3. 选择本仓库中的 **`excelwallpaper`** 目录（即含 `index.html` 的那一层）
4. 应用壁纸即可

> 也可以直接把 `excelwallpaper` 整个目录拷进 WE 的 projects 目录后刷新。

---

## 目录结构

```
.
├── README.md
├── LICENSE
├── .gitignore
└── excelwallpaper/             # ← 壁纸本体，WE 里选这个目录
    ├── index.html              # 全部逻辑与样式（单文件）
    ├── assets/                 # README 用的截图
    ├── data/
    │   ├── pinyin.1.js         # 拼音字典（394 音节 / 3755 常用字，按字频排序）
    │   └── pinyin.meta.js      # 字典元信息
    ├── image/
    │   ├── background.png      # 背景（3840×2160，精确 16:9）
    │   ├── chibi-smile.png     # 鲸鱼娘：微笑
    │   ├── chibi-happy.png     # 鲸鱼娘：开心
    │   ├── chibi-shock.png     # 鲸鱼娘：惊讶
    │   └── chibi-think.png     # 鲸鱼娘：思考
    └── lib/
        ├── tabulator.min.js    # Tabulator 5.6.1
        ├── tabulator.min.css
        └── LICENSE.tabulator.txt
```

---

## 技术说明

- **纯前端、零构建**：一个 `index.html` 搞定，没有打包步骤
- **完全离线**：Tabulator、拼音字典、全部图片都随仓库分发，**运行时不发起任何网络请求**（不使用 CDN）
- **不使用 iframe / 远程资源**，符合 Wallpaper Engine Web 壁纸的限制
- 数据持久化用 `localStorage`

---

## 参与贡献

**欢迎 PR 和 Issue，非常欢迎。** 这是一个个人小项目，任何形式的反馈我都会看。

### 提 Issue

- **Bug**：请写明 Wallpaper Engine 版本、你的屏幕分辨率、复现步骤，以及期望结果和实际结果
- **功能建议**：说清使用场景即可，不必先写代码
- **界面 / 素材问题**：欢迎直接贴截图

### 提 PR

- 小改动（文案、样式微调、bug 修复）直接提 PR 就行
- 大改动建议**先开 Issue 聊一下**，避免方向不一致白做工
- 请保持**纯前端 + 离线**这两条底线：不引入 CDN、不引入构建工具、不新增运行时网络请求
- 新增第三方资源请注明来源与许可证，并把 license 文件一起放进 `lib/`

### 开发方式

没有构建步骤，改完 `index.html` 直接用浏览器打开预览即可。建议用浏览器的设备模拟设成 **1920×1080** 查看效果。Wallpaper Engine 的 `wallpaperPropertyListener` 在浏览器里不会触发，可以打开控制台手动调用来测试：

```js
window.wallpaperPropertyListener.applyUserProperties({
  table_scale: { value: 120 },
  table_visible: { value: true }
});
```

---

## 素材与 AI 生成说明

**本项目的全部美术素材与代码均由 AI 生成**（背景图、鲸鱼娘（大肥鱼）的四个表情，以及全部 HTML / CSS / JavaScript）。

- 背景图与鲸鱼娘立绘由 AI 图像模型生成，再经放大与裁切处理（已裁为精确 16:9）
- 代码由 AI 编写，作者负责需求定义、验证与取舍

因此：
- 素材**不涉及任何第三方版权图库**，可随 MIT 许可证一同分发
- 但请注意 **AI 生成内容在不同司法辖区的版权状态可能不同**，商用前建议自行确认
- 如果你打算把这些素材用于本仓库之外的地方，请自行判断是否合适

仓库中**唯一**的第三方代码是 Tabulator（MIT），已在 `lib/LICENSE.tabulator.txt` 附上许可证。

---

## 致谢

- [Tabulator](https://tabulator.info/) —— 表格组件（MIT）
- [mozillazg/pinyin-data](https://github.com/mozillazg/pinyin-data) —— 汉字读音数据（MIT）
- [Jun Da 现代汉语字频表](https://github.com/ruddfawcett/hanziDB.csv) —— 候选字排序依据
- GB2312 一级汉字表 —— 拼音字典字表来源（3755 字）

## 许可证

[MIT](LICENSE)

---

<h2 id="english">English</h2>

**WhaleSchedule** — an editable course-schedule wallpaper for Wallpaper Engine.

Pure HTML / CSS / vanilla JavaScript. **No CDN, no network requests at runtime** — everything (Tabulator, the pinyin dictionary, all images) ships with the repo.

**Highlights**

- Click any cell to edit; checkboxes toggle with a single click
- Add / remove rows and columns; per-column type (text or checkbox)
- Three built-in presets plus your own saved templates
- Auto-saves to `localStorage`; JSON import / export
- The project's mascot, **Whale-chan** (aka "Big Fat Fish"), walks along the panel and reacts to your actions
- **Built-in draggable soft keyboard** with pinyin input (candidates sorted by character frequency) — because Wallpaper Engine does not deliver keyboard events to the wallpaper in desktop mode
- Adjustable via Wallpaper Engine user properties: position, size, overall scale, and a show/hide toggle

**Install**: Wallpaper Engine → Create Wallpaper → Open Folder → select the `excelwallpaper` directory.

**Note on assets**: all artwork and code in this project were **generated by AI**. The only third-party code is Tabulator (MIT).

**Contributions**: PRs and issues are very welcome. Please keep the project build-free and fully offline.

Licensed under the [MIT License](LICENSE).
