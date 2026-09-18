"""由 kMandarin.txt 生成壁纸用拼音候选字典。
数据：mozillazg/pinyin-data 的 kMandarin.txt（Unicode 官方单字读音，带声调）
字表：GB2312 一级汉字 3755 个（Python 内置 codec 枚举，无需联网）
输出：excelwallpaper/data/pinyin.N.js 分片 + pinyin.meta.js
"""
import json
import os
import re
import sys
import io
import unicodedata
from collections import Counter

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

TMP = r"D:\桌面\py\deepseek_v4\workflow\_tmp_verify\pindata"
OUT_DIR = r"D:\桌面\py\deepseek_v4\workflow\excelwallpaper\data"
os.makedirs(OUT_DIR, exist_ok=True)
LOG = open(os.path.join(TMP, "gen.log"), "w", encoding="utf-8")


def log(*a):
    s = " ".join(str(x) for x in a)
    LOG.write(s + "\n")
    print(s)


def tone_off(py):
    """qiū → qiu，lǜ → lv；去掉声调并转 ASCII。"""
    py = py.replace("ü", "v").replace("Ü", "v")
    py = unicodedata.normalize("NFD", py)
    py = "".join(c for c in py if unicodedata.category(c) != "Mn")
    return "".join(c for c in py.lower() if "a" <= c <= "z")


# ---------- 1. 读主读音 ----------
LINE = re.compile(r"^U\+([0-9A-Fa-f]+):\s*([^\s#]+)\s*#?")
pin_of = {}
bad = 0
with open(os.path.join(TMP, "kMandarin.txt"), encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = LINE.match(line)
        if not m:
            bad += 1
            continue
        py = tone_off(m.group(2))
        if py:
            pin_of[chr(int(m.group(1), 16))] = py
log("kMandarin 主读音:", len(pin_of), "条；未匹配", bad)

# ---------- 2. 读全部读音（多音字） ----------
multi = {}
with open(os.path.join(TMP, "pinyin_all.txt"), encoding="utf-8") as f:
    for line in f:
        m = LINE.match(line.strip())
        if not m:
            continue
        ch = chr(int(m.group(1), 16))
        if ch not in pin_of:
            continue
        for py in [tone_off(p) for p in m.group(2).split(",")]:
            if py and py != pin_of[ch] and py not in multi.get(ch, []):
                multi.setdefault(ch, []).append(py)
log("多音字条目:", len(multi))

# ---------- 3. GB2312 一级汉字（常用字表） ----------
common = []
for hi in range(0xB0, 0xD8):
    for lo in range(0xA1, 0xFF):
        try:
            common.append(bytes([hi, lo]).decode("gb2312"))
        except UnicodeDecodeError:
            pass
log("GB2312 一级汉字:", len(common))

# ---------- 4. 组装 音节 → 候选 ----------
# 多音字补充：pinyin.txt 的第一个读音是该字的主读音，取它作为「第二读音」的判据。
# 不能直接用全部读音（会把「呆乃奇」当成 ai、把「堤郝赫舍」塞进 shi）；
# 也不能用 kMandarin（它对部分字给的不是最常用读音）。
primary2 = {}
with open(os.path.join(TMP, "pinyin_all.txt"), encoding="utf-8") as f:
    for line in f:
        m = LINE.match(line.strip())
        if not m:
            continue
        ch = chr(int(m.group(1), 16))
        if ch not in pin_of:
            continue
        if ch in primary2:
            continue
        first = tone_off(m.group(2).split(",")[0])
        if first:
            primary2[ch] = first
log("pinyin.txt 主读音:", len(primary2))

syll = {}
missing = []
for ch in common:
    py = primary2.get(ch) or pin_of.get(ch)
    if not py:
        missing.append(ch)
        continue
    syll.setdefault(py, []).append(ch)

# 额外读音：只在「该音节本身足够常用」且「是该字真实读音」时补充
support = Counter((primary2.get(c) or pin_of.get(c)) for c in common if (primary2.get(c) or pin_of.get(c)))
MIN_SUPPORT = 6
added = 0
for ch in common:
    for alt in multi.get(ch, []):
        if support.get(alt, 0) < MIN_SUPPORT:
            continue
        # 排除「与主读音同音不同调」的重复项已由 tone_off 处理；
        # 其余作为多音字候选补入（放在主读音候选之后，不影响首选）
        if ch not in syll.setdefault(alt, []):
            syll[alt].append(ch)
            added += 1
log("无拼音字数:", len(missing), "| 多音字补充通过:", added)
log("音节数:", len(syll))

# ---------- 5. 校验（这些若不对说明数据源或映射有问题） ----------
checks = {
    "zhong": "中", "guo": "国", "ke": "课", "cheng": "程",
    "biao": "表", "xue": "学", "shi": "是", "de": "的",
}
for k, expect in checks.items():
    got = "".join(syll.get(k, []))
    log("  校验 %-6s 含「%s」: %s   前 16 字: %s" % (k, expect, "是" if expect in got else "否", got[:16]))

# ---------- 6. 输出分片 ----------
data = [[py, "".join(syll[py][:24])] for py in sorted(syll)]
log("候选总字数(含重复):", sum(len(c) for _, c in data))

CHUNK = 400
parts = [data[i:i + CHUNK] for i in range(0, len(data), CHUNK)]
size = 0
for idx, part in enumerate(parts):
    body = json.dumps(part, ensure_ascii=False, separators=(",", ":"))
    txt = ("/* 拼音候选字典 分片 %d/%d —— 数据源：mozillazg/pinyin-data kMandarin.txt；"
           "字表：GB2312 一级汉字 3755 字 */\nwindow.PINYIN_CHUNK(%d, %s);\n"
           % (idx + 1, len(parts), idx, body))
    fp = os.path.join(OUT_DIR, "pinyin.%d.js" % (idx + 1))
    with open(fp, "w", encoding="utf-8") as f:
        f.write(txt)
    size += os.path.getsize(fp)
    log("  写出 pinyin.%d.js  %.1f KB" % (idx + 1, os.path.getsize(fp) / 1024))

with open(os.path.join(OUT_DIR, "pinyin.meta.js"), "w", encoding="utf-8") as f:
    f.write("window.PINYIN_META = %s;\n" % json.dumps({
        "chunks": len(parts), "syllables": len(data), "chars": len(common),
        "perSyllableMax": 24,
        "source": "mozillazg/pinyin-data kMandarin.txt + GB2312 L1 (3755)",
    }, ensure_ascii=False))
log("总计 %.1f KB" % (size / 1024))
LOG.close()
