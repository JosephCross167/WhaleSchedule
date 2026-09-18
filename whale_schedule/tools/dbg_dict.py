import re, os
TMP = r"D:\桌面\py\deepseek_v4\workflow\_tmp_verify\pindata"
p = os.path.join(TMP, "kMandarin.txt")
with open(p, encoding="utf-8") as f:
    lines = f.read().split("\n")
print("总行数:", len(lines))
print("--- 前 8 行 ---")
for l in lines[:8]:
    print(repr(l))
print("--- 含“中/国/的/是”样例 ---")
for l in lines:
    if "# 中" in l or "# 国" in l or "# 的" in l or "# 是" in l:
        print(repr(l))
        break
# 统计能被我的正则匹配的行数
ok = 0
rx = re.compile(r"U\+([0-9A-Fa-f]+):\s*([a-zü]+)")
for l in lines:
    if rx.match(l.strip()):
        ok += 1
print("我的正则匹配行数:", ok)

# 用更宽松的写法统计
rx2 = re.compile(r"^U\+([0-9A-Fa-f]+):\s*([a-zü]+)\s*#\s*(\S)")
ok2 = 0
sample = []
for l in lines:
    m = rx2.match(l.strip())
    if m:
        ok2 += 1
        if len(sample) < 5: sample.append(m.groups())
print("宽松正则匹配行数:", ok2, sample)

# 检查 GB2312 解码
test = bytes([0xB0, 0xA1]).decode("gb2312")
print("GB2312 B0A1 →", repr(test), "码点:", hex(ord(test)))
print("pin_of 是否含该字:", )
pin_of = {}
for l in lines:
    m = rx2.match(l.strip())
    if m:
        pin_of[chr(int(m.group(1), 16))] = m.group(2)
print("  pin_of 大小:", len(pin_of))
for ch in ["中", "国", "的", "是", "课", "程", "表"]:
    print("   ", ch, "→", pin_of.get(ch))
