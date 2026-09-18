# whale_schedule —— 本项目的辅助工程目录

这个目录放的是**壁纸本体之外的所有工程文件**：测试、工具、文档、数据。
壁纸发布本体仍在仓库根目录的 [`whale_schedule/main/`](../excelwallpaper/)，不属于这里。

这样安排的目的：工作区里“每加一个新脚本就得去改 `.gitignore`”这件事不再发生——
工程文件统一进这个目录，需要忽略的东西只有固定的几样（见仓库根 `.gitignore`）。

## 目录结构

| 目录 | 内容 |
|---|---|
| `tests/` | 回归测试与验证脚本。**改完壁纸先跑这里的 `wstest.mjs`。** |
| `tools/` | 音频分析、宣传片渲染、抠像副本生成、数据恢复等工具脚本 |
| `tools/bin/` | ffmpeg / ffprobe 二进制（**已 gitignore**，用 `tools/dl-ffmpeg.mjs` 重新下载） |
| `docs/` | 分镜表、创意工坊文案、旧版素材、宣传片成片 |
| `docs/recovery/` | 从浏览器 LevelDB 里恢复表格数据的脚本与样例 |
| `data/` | 表格数据导入文件、壁纸软键盘用的拼音词库源数据 |
| `keying/` | 录屏抠像专用副本（纯色背景 + 无动画），完整可独立运行 |
| `anim/` | 宣传片动画页面 |
| `build/` | 渲染与构建的中间产物（**已 gitignore**，可随时删） |

## 跑测试

所有测试都用 **无头 Chrome + CDP** 驱动真实页面，不是单元测试替身。

```powershell
node whale_schedule/tests/wstest.mjs        # 工作区/模板/导入导出 主回归（23 项）
node whale_schedule/tests/importtest.mjs    # 导入 JSON 功能（21 项）
node whale_schedule/tests/swscale.mjs       # 切换工作区 × 缩放矩阵（布局守恒验收）
node whale_schedule/tests/eqscale.mjs       # 等比缩放验收（可见行数恒定）
node whale_schedule/tests/fitexp.mjs        # 列宽锁定 / 横向溢出
node whale_schedule/tests/errdbg.mjs        # 页面运行时报错抓取
```

> **沙箱注意**：无头 Chrome 依赖 mojo 命名管道，在受限沙箱下会失败（`devtools not reachable`）。
> 需要在放开管道权限的环境里跑，或用管理员终端。

测试脚本里的 `<name>_keying.mjs` 是同一套用例针对 `keying/` 副本的版本，改完副本要一起跑。

## 几个关键脚本的用途

| 脚本 | 用途 |
|---|---|
| `tools/analyze.mjs` | 输入解码后的 PCM，算 BPM / 节拍网格 / 段落能量（宣传片卡点用） |
| `tools/prender.mjs` | 按确定时间轴逐帧渲染 `anim/` 页面，输出到 `build/frames` |
| `tools/encode_testcut.ps1` | 把帧序列 + BGM 合成为 MP4 |
| `tools/mk_keying.mjs` | 从主版本重新生成 `keying/` 副本（套用抠像专属改动） |
| `docs/recovery/rdbscan.mjs` 等 | 从 Edge/Chrome 的 Local Storage LevelDB 里恢复表格数据 |

## 已知的环境依赖

- **Node 24+**（`zstdDecompressSync`、内建 `WebSocket`、`fetch`）
- **无头 Chrome**：脚本里写的是 `C:/Program Files/Google/Chrome/Application/chrome.exe`
- **ffmpeg**：`tools/bin/ffmpeg.exe`（未入库，见上）
- 测试用的一次性浏览器 profile 落在系统临时目录，不再污染工作区
