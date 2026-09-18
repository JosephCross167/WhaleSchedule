"""由 kMandarin.txt + Jun Da 字频表生成壁纸用拼音候选字典（按字频排序）。

数据源：
  读音：mozillazg/pinyin-data  kMandarin.txt / pinyin.txt（已下载到 pindata/）
  字表：GB2312 一级汉字 3755 个（Python 内置 codec 枚举，无需联网）
  频率：ruddfawcett/hanziDB.csv（Jun Da《现代汉语字频表》简体版，frequency_rank 越小越常用）
       网址 https://raw.githubusercontent.com/ruddfawcett/hanziDB.csv/master/data/hanziDB.csv

输出：excelwallpaper/data/pinyin.N.js 分片 + pinyin.meta.js
每个音节内的候选按字频升序排列，未收录频次的字排在最后（再按 GB2312 顺序）。
"""
import json
import os
import re
import sys
import io
import unicodedata
import urllib.request
from collections import Counter

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

TMP = r"D:\桌面\py\deepseek_v4\workflow\_tmp_verify\pindata"
OUT_DIR = r"D:\桌面\py\deepseek_v4\workflow\excelwallpaper\data"
os.makedirs(OUT_DIR, exist_ok=True)
LOG = open(os.path.join(TMP, "gen_freq.log"), "w", encoding="utf-8")

PER_SYLLABLE = 40


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


LINE = re.compile(r"^U\+([0-9A-Fa-f]+):\s*([^\s#]+)\s*#?")

# ---------- 1. 读主读音 ----------
pin_of = {}
with open(os.path.join(TMP, "kMandarin.txt"), encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = LINE.match(line)
        if not m:
            continue
        py = tone_off(m.group(2))
        if py:
            pin_of[chr(int(m.group(1), 16))] = py
log("kMandarin 主读音:", len(pin_of), "条")

# ---------- 2. 读全部读音（多音字） ----------
multi = {}
primary2 = {}
with open(os.path.join(TMP, "pinyin_all.txt"), encoding="utf-8") as f:
    for line in f:
        m = LINE.match(line.strip())
        if not m:
            continue
        ch = chr(int(m.group(1), 16))
        if ch not in pin_of:
            continue
        first = tone_off(m.group(2).split(",")[0])
        if first and ch not in primary2:
            primary2[ch] = first
        for py in [tone_off(p) for p in m.group(2).split(",")]:
            if py and py != pin_of[ch] and py not in multi.get(ch, []):
                multi.setdefault(ch, []).append(py)
log("pinyin.txt 主读音:", len(primary2), "| 多音字条目:", len(multi))

# ---------- 3. GB2312 一级汉字 ----------
common = []
for hi in range(0xB0, 0xD8):
    for lo in range(0xA1, 0xFF):
        try:
            common.append(bytes([hi, lo]).decode("gb2312"))
        except UnicodeDecodeError:
            pass
log("GB2312 一级汉字:", len(common))

# ---------- 4. 字频表（本地缓存，缺了才联网） ----------
FREQ_FILE = os.path.join(TMP, "hanziDB.csv")
FREQ_URL = "https://raw.githubusercontent.com/ruddfawcett/hanziDB.csv/master/data/hanziDB.csv"
if not os.path.exists(FREQ_FILE):
    log("下载字频表:", FREQ_URL)
    req = urllib.request.Request(FREQ_URL, headers={"User-Agent": "dsh-gen"})
    with urllib.request.urlopen(req, timeout=60) as resp, open(FREQ_FILE, "wb") as out:
        out.write(resp.read())
rank = {}
with open(FREQ_FILE, encoding="utf-8") as f:
    header = f.readline()
    for line in f:
        parts = line.split(",")
        if len(parts) < 2:
            continue
        try:
            r = int(parts[0])
        except ValueError:
            continue
        ch = parts[1]
        if ch and ch not in rank:
            rank[ch] = r
log("字频条目:", len(rank), "| 表头:", header.strip()[:60])

# ---------- 5. 组装 音节 → 候选（按频率排序） ----------
syll = {}
missing = []
for ch in common:
    py = primary2.get(ch) or pin_of.get(ch)
    if not py:
        missing.append(ch)
        continue
    syll.setdefault(py, []).append(ch)

support = Counter((primary2.get(c) or pin_of.get(c)) for c in common if (primary2.get(c) or pin_of.get(c)))
MIN_SUPPORT = 6
added = 0
for ch in common:
    for alt in multi.get(ch, []):
        if support.get(alt, 0) < MIN_SUPPORT:
            continue
        if ch not in syll.setdefault(alt, []):
            syll[alt].append(ch)
            added += 1
log("无拼音字数:", len(missing), "| 多音字补充通过:", added, "| 音节数:", len(syll))

# 排序：有频次的按频次升序；没频次的排最后，保持 GB2312 原始顺序（稳定排序）
UNRANKED = 10 ** 7
in_gb_order = {ch: i for i, ch in enumerate(common)}
for py in syll:
    syll[py].sort(key=lambda c: (rank.get(c, UNRANKED), in_gb_order.get(c, 0)))

# ---------- 6. 校验：常见音节的首选必须是常用字 ----------
checks = {
    "de": "的", "yi": "一", "shi": "是", "bu": "不", "le": "了",
    "ren": "人", "hao": "好", "zhong": "中", "guo": "国", "xue": "学",
    "ke": "可", "cheng": "成", "ai": "爱", "ni": "你", "wo": "我",
}
fail = 0
for k, expect in checks.items():
    lst = syll.get(k, [])
    got = lst[0] if lst else "(空)"
    flag = "OK " if got == expect else "!! "
    if got != expect:
        fail += 1
    log("  %s %-6s 首选=%s  前 12: %s" % (flag, k, got, "".join(lst[:12])))
log("首选校验失败数:", fail)

# ---------- 7. 输出分片 ----------
data = [[py, "".join(syll[py][:PER_SYLLABLE])] for py in sorted(syll)]
log("候选总字数(含重复):", sum(len(c) for _, c in data))

CHUNK = 400
parts = [data[i:i + CHUNK] for i in range(0, len(data), CHUNK)]
size = 0
for idx, part in enumerate(parts):
    body = json.dumps(part, ensure_ascii=False, separators=(",", ":"))
    txt = ("/* 拼音候选字典 分片 %d/%d —— 读音：mozillazg/pinyin-data；"
           "字表：GB2312 一级汉字 3755 字；候选按 Jun Da 字频排序 */\n"
           "window.PINYIN_CHUNK(%d, %s);\n" % (idx + 1, len(parts), idx, body))
    fp = os.path.join(OUT_DIR, "pinyin.%d.js" % (idx + 1))
    with open(fp, "w", encoding="utf-8") as f:
        f.write(txt)
    size += os.path.getsize(fp)
    log("  写出 pinyin.%d.js  %.1f KB" % (idx + 1, os.path.getsize(fp) / 1024))

# 清理多余旧分片（避免浏览器加载到上一版的残留）
for old in os.listdir(OUT_DIR):
    m = re.match(r"^pinyin\.(\d+)\.js$", old)
    if m and int(m.group(1)) > len(parts):
        os.remove(os.path.join(OUT_DIR, old))
        log("  删除多余分片:", old)

with open(os.path.join(OUT_DIR, "pinyin.meta.js"), "w", encoding="utf-8") as f:
    f.write("window.PINYIN_META = %s;\n" % json.dumps({
        "chunks": len(parts), "syllables": len(data), "chars": len(common),
        "perSyllableMax": PER_SYLLABLE,
        "sortedBy": "Jun Da 现代汉语字频",
        "source": "mozillazg/pinyin-data kMandarin.txt + GB2312 L1 (3755) + hanziDB.csv(Jun Da)",
    }, ensure_ascii=False))
log("总计 %.1f KB" % (size / 1024))
LOG.close()
