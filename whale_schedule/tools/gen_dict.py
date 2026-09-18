"""由 kMandarin.txt 生成壁纸用的拼音候选字典。
字表来源：GB2312 一级汉字（3755 个，覆盖日常书写绝大多数用字），
用 Python 内置 codec 枚举，无需联网、无需字表文件。
输出：JS 数据文件，格式 [[音节, "候选字串"], ...]，候选按常用度排序。
"""
import json
import os
import re

TMP = r"D:\桌面\py\deepseek_v4\workflow\_tmp_verify\pindata"
OUT_DIR = r"D:\桌面\py\deepseek_v4\workflow\excelwallpaper\data"
os.makedirs(OUT_DIR, exist_ok=True)

# ---------- 1. 读 kMandarin：U+XXXX: pinyin  # 字 ----------
pin_of = {}
with open(os.path.join(TMP, "kMandarin.txt"), encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = re.match(r"U\+([0-9A-Fa-f]+):\s*([a-zü]+)", line)
        if not m:
            continue
        cp = int(m.group(1), 16)
        py = m.group(2)
        pin_of[chr(cp)] = py

# ---------- 2. 多音字：从 pinyin.txt 收集（同一字的其它读音） ----------
more = {}
with open(os.path.join(TMP, "pinyin_all.txt"), encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = re.match(r"U\+([0-9A-Fa-f]+):\s*([a-zü,\s]+)", line)
        if not m:
            continue
        cp = int(m.group(1), 16)
        ch = chr(cp)
        if ch not in pin_of:
            continue
        for py in [p.strip() for p in m.group(2).split(",") if p.strip()]:
            if py != pin_of[ch]:
                more.setdefault(ch, []).append(py)

# ---------- 3. GB2312 一级汉字（常用字）按序取出 ----------
common = []
for hi in range(0xB0, 0xD8):          # 一级汉字区
    for lo in range(0xA1, 0xFF):
        try:
            ch = bytes([hi, lo]).decode("gb2312")
        except UnicodeDecodeError:
            continue
        common.append(ch)
print("GB2312 一级汉字数量:", len(common))

# ---------- 4. 组装 音节 → 候选字（按出现顺序 = 常用度近似） ----------
syll = {}
for ch in common:
    py = pin_of.get(ch)
    if not py:
        continue
    py = py.replace("ü", "v")
    syll.setdefault(py, []).append(ch)
    for alt in more.get(ch, []):
        a = alt.replace("ü", "v")
        if ch not in syll.setdefault(a, []):
            syll[a].append(ch)

# ---------- 5. 去掉过长尾巴（每音节最多保留 24 个，控制体积） ----------
data = []
for py in sorted(syll):
    chars = "".join(syll[py][:24])
    data.append([py, chars])

total_chars = sum(len(c) for _, c in data)
print("音节数:", len(data), " 覆盖字次数:", total_chars)
print("样例:", json.dumps(data[:6], ensure_ascii=False))

# ---------- 6. 输出为 JS 数据文件（分片，便于浏览器缓存/按需加载） ----------
CHUNK = 400
parts = [data[i:i + CHUNK] for i in range(0, len(data), CHUNK)]
files = []
for idx, part in enumerate(parts):
    name = "pinyin.%d.js" % (idx + 1)
    body = json.dumps(part, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT_DIR, name), "w", encoding="utf-8") as f:
        f.write("/* 拼音候选字典 分片 %d/%d（由 mozillazg/pinyin-data 的 kMandarin.txt 生成，"
                "字表为 GB2312 一级汉字共 3755 字） */\n" % (idx + 1, len(parts)))
        f.write("window.PINYIN_CHUNK(%d, %s);\n" % (idx, body))
    files.append((name, os.path.getsize(os.path.join(OUT_DIR, name))))
    print("  写出", name, "%.1f KB" % (files[-1][1] / 1024))

with open(os.path.join(OUT_DIR, "pinyin.meta.js"), "w", encoding="utf-8") as f:
    f.write("/* 字典元信息 */\nwindow.PINYIN_META = %s;\n" % json.dumps({
        "chunks": len(parts),
        "syllables": len(data),
        "chars": len(common),
        "source": "mozillazg/pinyin-data kMandarin.txt + GB2312 一级汉字",
    }, ensure_ascii=False))
print("  写出 pinyin.meta.js")
print("\n总计 %.1f KB" % (sum(s for _, s in files) / 1024))
