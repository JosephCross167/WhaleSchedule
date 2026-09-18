"""由 kMandarin.txt 生成壁纸用拼音候选字典（输出到文件，避免控制台编码问题）。
字表：GB2312 一级汉字 3755 个（Python 内置 codec 枚举，无需联网）。
数据：mozillazg/pinyin-data 的 kMandarin.txt（Unicode 官方单字读音）。
"""
import json
import os
import re
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

TMP = r"D:\桌面\py\deepseek_v4\workflow\_tmp_verify\pindata"
OUT_DIR = r"D:\桌面\py\deepseek_v4\workflow\excelwallpaper\data"
os.makedirs(OUT_DIR, exist_ok=True)
LOG = open(os.path.join(TMP, "gen.log"), "w", encoding="utf-8")


def log(*a):
    s = " ".join(str(x) for x in a)
    LOG.write(s + "\n")
    print(s)


# ---------- 1. 读 kMandarin 与 pinyin.txt ----------
# 注意：数据里的拼音带声调（qiū / zhōng / lǜ），必须先做 Unicode 分解去掉声调
# 再转成 ASCII（ü → v），否则绝大多数行都匹配不上。
import unicodedata


def tone_off(py):
    py = py.replace("ü", "v").replace("Ü", "v")
    py = unicodedata.normalize("NFD", py)
    py = "".join(c for c in py if unicodedata.category(c) != "Mn")
    return "".join(c for c in py.lower() if "a" <= c <= "z" or c == "v")


LINE = re.compile(r"^U\+([0-9A-Fa-f]+):\s*([^\s#]+)\s*#?")

pin_of = {}
bad = 0
with open(os.path.join(TMP, "kMandarin.txt"), encoding="utf-8") as f:
    for line in f:
        line = line.rstrip("\n")
        if not line or line.startswith("#"):
            continue
        m = LINE.match(line.strip())
        if not m:
            bad += 1
            continue
        py = tone_off(m.group(2))
        if py:
            pin_of[chr(int(m.group(1), 16))] = py
log("kMandarin 解析:", len(pin_of), "条；未匹配", bad)

multi = {}
LINE2 = re.compile(r"^U\+([0-9A-Fa-f]+):\s*([^\s#]+)\s*#?")
with open(os.path.join(TMP, "pinyin_all.txt"), encoding="utf-8") as f:
    for line in f:
        m = LINE2.match(line.strip())
        if not m:
            continue
        ch = chr(int(m.group(1), 16))
        if ch not in pin_of:
            continue
        for py in [tone_off(p) for p in m.group(2).split(",")]:
            if py and py != pin_of[ch]:
                multi.setdefault(ch, []).append(py)
log("多音字补充(原始):", len(multi), "个")

# 地板校验：某个读音若在「主要读音」里出现次数过少，说明它是生僻异读，
# 补进候选会污染常用字列表（曾把「登底地」塞进 de、「堤郝赫舍」塞进 shi）。
# 只保留至少 MIN_SUPPORT 个字以此为主要读音的音节。
from collections import Counter
support = Counter(pin_of.values())
MIN_SUPPORT = 3

# 主读音里出现过多音字错误的少数情况：用白名单外的人工黑名单兜底
BLOCK = {
    "de": set("登底地得德"),
    "shi": set("堤郝赫舍"),
}

syll = {}
for ch in common:
    py = pin_of.get(ch)
    if not py:
        missing.append(ch)
        continue
    syll.setdefault(py, []).append(ch)

added = 0
for ch in common:
    for alt in multi.get(ch, []):
        if support[alt] < MIN_SUPPORT:
            continue                      # 生僻异读：丢弃
        if alt in BLOCK and ch in BLOCK[alt]:
            continue                      # 已知误归属：丢弃
        if ch not in syll.setdefault(alt, []):
            syll[alt].append(ch)
            added += 1
log("多音字补充(通过校验):", added, "条")

# ---------- 2. GB2312 一级汉字 ----------
common = []
for hi in range(0xB0, 0xD8):
    for lo in range(0xA1, 0xFF):
        try:
            common.append(bytes([hi, lo]).decode("gb2312"))
        except UnicodeDecodeError:
            pass
log("GB2312 一级汉字:", len(common))

# ---------- 3. 组装 音节 → 候选 ----------
syll = {}
missing = []
for ch in common:
    py = pin_of.get(ch)
    if not py:
        missing.append(ch)
        continue
    py = py.replace("ü", "v")
    syll.setdefault(py, []).append(ch)
    for alt in multi.get(ch, []):
        a = alt.replace("ü", "v")
        if ch not in syll.setdefault(a, []):
            syll[a].append(ch)

log("无拼音的字数:", len(missing), "样例:", "".join(missing[:20]))
log("音节数:", len(syll))
for k in ["zhong", "guo", "de", "shi", "ke", "cheng", "biao"]:
    log("  校验 %-6s → %s" % (k, "".join(syll.get(k, []))[:20]))

# ---------- 4. 输出 ----------
data = [[py, "".join(syll[py][:24])] for py in sorted(syll)]
total = sum(len(c) for _, c in data)
log("总候选字次数:", total)

CHUNK = 400
parts = [data[i:i + CHUNK] for i in range(0, len(data), CHUNK)]
size = 0
for idx, part in enumerate(parts):
    body = json.dumps(part, ensure_ascii=False, separators=(",", ":"))
    txt = ("/* 拼音候选字典 分片 %d/%d\n"
           "   数据来源：mozillazg/pinyin-data 的 kMandarin.txt（Unicode 官方读音）\n"
           "   字表：GB2312 一级汉字共 3755 字 */\n"
           "window.PINYIN_CHUNK(%d, %s);\n" % (idx + 1, len(parts), idx, body))
    fp = os.path.join(OUT_DIR, "pinyin.%d.js" % (idx + 1))
    with open(fp, "w", encoding="utf-8") as f:
        f.write(txt)
    size += os.path.getsize(fp)
    log("  写出 pinyin.%d.js  %.1f KB" % (idx + 1, os.path.getsize(fp) / 1024))

with open(os.path.join(OUT_DIR, "pinyin.meta.js"), "w", encoding="utf-8") as f:
    f.write("window.PINYIN_META = %s;\n" % json.dumps({
        "chunks": len(parts), "syllables": len(data),
        "chars": len(common), "perSyllableMax": 24,
        "source": "mozillazg/pinyin-data kMandarin.txt + GB2312 L1 (3755)",
    }, ensure_ascii=False))
log("总计 %.1f KB" % (size / 1024))
LOG.close()
