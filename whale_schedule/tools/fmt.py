import io, os
TMP = r"D:\桌面\py\deepseek_v4\workflow\_tmp_verify\pindata"
p = os.path.join(TMP, "kMandarin.txt")
raw = open(p, "rb").read(400)
out = open(os.path.join(TMP, "fmt.log"), "w", encoding="utf-8")
out.write("前 200 字节 hex:\n")
out.write(raw[:200].hex(" ") + "\n\n")
out.write("前 200 字节 repr(utf-8 尝试):\n")
try:
    out.write(repr(raw[:200].decode("utf-8", errors="replace")) + "\n")
except Exception as e:
    out.write("err " + str(e) + "\n")
out.write("\n前 200 字节 repr(utf-16 尝试):\n")
try:
    out.write(repr(raw[:200].decode("utf-16", errors="replace")) + "\n")
except Exception as e:
    out.write("err " + str(e) + "\n")

# 用 utf-8-sig 读若干行看真实内容
txt = open(p, encoding="utf-8-sig", errors="replace").read()
lines = txt.split("\n")
out.write("\n按 utf-8-sig 读，总行数 %d\n" % len(lines))
for l in lines[:6]:
    out.write(repr(l) + "\n")
# 找中文行
for l in lines:
    if "中" in l or "国" in l:
        out.write("样例中文行: " + repr(l) + "\n")
        break
# 统计形如 U+XXXX:
import re
c1 = sum(1 for l in lines if re.match(r"^U\+[0-9A-Fa-f]{4,5}:", l.strip()))
c2 = sum(1 for l in lines if ":" in l)
out.write("\n以 U+XXXX: 开头行数=%d  含冒号行数=%d\n" % (c1, c2))
out.close()
print("done")
