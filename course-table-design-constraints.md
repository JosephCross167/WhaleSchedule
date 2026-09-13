# 课程管理表格壁纸 · CSS 设计约束（浅色主题）

> 适用场景：1920×1080 横版壁纸。白色底图 + 右侧全身立绘 + 四角 Q 版贴纸 + 左侧半透明课表面板。
> 所有色值均提取自角色素材（靛蓝头发 / 藏青裙 / 金色刺绣 / 表情包符号），**不得引入新色相**（唯一例外：`--danger`）。

## 1. 设计令牌（Design Tokens）

```css
:root {
  /* —— 主色：靛蓝（取自角色发色/裙色）—— */
  --primary:         #3A49A5;  /* 主靛蓝：表头渐变亮端、主按钮 */
  --primary-dark:    #2A3578;  /* 深靛蓝：表头渐变深端、标题、强调文字 */
  --primary-light:   #8FA3EA;  /* 浅靛蓝（发梢色）：渐变过渡、装饰点 */
  --accent:          #4C7BE0;  /* 强调蓝（蝴蝶结色）：链接、焦点环、选中描边、“今天” */

  /* —— 辅助色 —— */
  --gold:            #D8A752;  /* 金（裙上金饰）：分隔金线、完成/重要标记 */
  --gold-bright:     #EFCB7C;  /* 亮金：hover 金线、进度条 */
  --urgent:          #F7CA4A;  /* 黄（表情包符号）：仅作 Deadline 标签底色，禁止当文字色 */
  --danger:          #C25450;  /* 唯一功能红：仅限删除确认按钮文字，禁止大面积使用 */

  /* —— 背景与线条 —— */
  --bg-page:         #FFFFFF;
  --row-stripe:      rgba(238, 242, 251, 0.90); /* #EEF2FB 隔行条纹（半透明以适配面板） */
  --border:          #C9D4EE;
  --border-soft:     rgba(201, 212, 238, 0.75);

  /* —— 表格半透明面板层 —— */
  --panel-bg:        rgba(255, 255, 255, 0.72); /* 锁定 0.70–0.78，勿更低 */
  --panel-blur:      10px;
  --panel-shadow:    0 8px 28px rgba(42, 53, 120, 0.10);

  /* —— 文字 —— */
  --text-title:      #2A3578;
  --text-body:       #3A4160;
  --text-secondary:  #6E789E;
  --text-disabled:   #B6BDD6;
  --text-placeholder:#A6AECB;
  --text-on-primary: #FFFFFF;
  --text-warning:    #7A5600;  /* 黄底标签上的深字（保证对比度） */
  --link:            #4C7BE0;
}
```

## 2. 组件颜色

### 表头（不透明）
```css
.table-header {
  background: linear-gradient(135deg, var(--primary-dark), var(--primary));
  color: var(--text-on-primary);
  border-bottom: 2px solid var(--gold);  /* 金线，呼应服装刺绣 */
}
```
- 表头不使用面板透明度，高度 48–56px，圆角只留面板顶部两个角（12px）

### 行状态
```css
.row:hover    { background: #EDF2FC; }
.row.selected { background: #DCE6FA; box-shadow: inset 3px 0 0 var(--accent); }
.row.today    { background: rgba(76, 123, 224, 0.08); }
```
- 优先级：selected > today > stripe，selected 覆盖条纹色
- 选中行的课程名加粗并改用 `--text-title`

### 编辑中单元格
```css
.cell.editing {
  background: #FFFFFF;
  border: 2px solid var(--accent);
  box-shadow: 0 0 0 3px rgba(76, 123, 224, 0.18);  /* 焦点光晕 */
}
.cell.dirty {  /* 已修改未保存 */
  background: #FFF6E3;
  box-shadow: inset 2px 0 0 var(--gold);
}
```

### 半透明面板层
```css
.table-panel {
  background: var(--panel-bg);                       /* rgba(255,255,255,0.72) */
  backdrop-filter: blur(var(--panel-blur)) saturate(1.05);
  border: 1px solid var(--border-soft);
  border-radius: 16px;
  box-shadow: var(--panel-shadow);
}
```
- 透明度范围 0.70–0.78；若面板覆盖到人物/立绘区域，提高到 ≥ 0.85
- 不支持 backdrop-filter 的环境回退纯白 `#FFFFFF`

## 3. 字体

```css
body { font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif; }
```

| 层级 | 字号 / 字重 | 颜色 |
|---|---|---|
| 页面标题 | 28–32px / 700 | `--text-title` |
| 表头 | 15–16px / 600 | `#FFFFFF` |
| 课程名 | 14–15px / 500 | `--text-body` |
| 教师 / 教室 / 周次 | 12–13px / 400 | `--text-secondary` |
| Deadline 标签 | 12px / 600 | `#7A5600` 文字 + `rgba(247,202,74,0.22)` 底 |
| 链接 / “今天” | 14px / 500 | `--link`（仅用于 ≥14px 加粗或非正文，白底对比约 3.9:1） |
| 禁用 / 占位 | — | `--text-disabled` / `--text-placeholder` |

- 正文禁用纯黑 `#000000`，行高 1.5
- 破坏性操作（删除确认）文字用 `--danger`，其余一律蓝金体系

## 4. 布局与装饰约束（硬性规则）

- z-index 层级：背景立绘 0 → 半透明面板 1 → 表格 2 → Q 版贴纸 3
- 立绘：右侧 x≈64%–96%，底部对齐，高约 90%；面板：左侧 x≈3%–62%
- **人物头部区域禁止放置任何文字**
- 四角 Q 版（用硬边白描边贴纸版素材，黑底已抠除）：
  - 左上 微笑 90×90（趴边框上沿露头式）
  - 右上 思考 100×100（问号朝表内）
  - 左下 开心 130×130（可压底边框一半）
  - 右下 惊讶 130×130（若右下有按钮则横移 24px 避开）
- Q 版只允许压面板边框与留白，距最近单元格文字 ≥ 24px；标题文字左右各留 110px
- 交互反馈：新增行 → 左下开心弹跳；删除行 → 右下惊讶弹跳；悬停行/切换视图 → 右上思考弹跳
  - 动画：scale 1 → 1.12 → 1，380ms ease；同一时刻只触发一只
- 金色仅用于“重要 / 完成 / 装饰线”；黄色仅作标签底色；两者都不得做长文文字色
