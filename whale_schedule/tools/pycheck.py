import importlib, sys, os, glob
print("python:", sys.version.split()[0], sys.executable)
found = []
for m in ['pypinyin', 'pinyin', 'xpinyin', 'jieba', 'zhon', 'chinese_converter', 'unihan_etl', 'pinyin_pro']:
    try:
        mod = importlib.import_module(m)
        found.append((m, getattr(mod, '__version__', '?'), getattr(mod, '__file__', '?')))
        print("  OK ", m, getattr(mod, '__version__', '?'))
    except Exception as e:
        print("  -- ", m, type(e).__name__)
print("\nfound:", [f[0] for f in found])

# 顺带看看 pip 缓存里是否有 pypinyin 的 wheel（离线可装）
cands = []
for base in [os.path.expanduser('~/AppData/Local/pip/cache'), os.path.expanduser('~/pip/cache')]:
    if os.path.isdir(base):
        cands += glob.glob(base + '/**/*pypinyin*', recursive=True)[:5]
print("pip 缓存中的 pypinyin:", cands[:5])

# 看看 site-packages 里有没有任何带“拼音表”的数据文件
sp = os.path.dirname(os.__file__).replace('Lib\\os.py', '') + 'Lib\\site-packages'
hits = []
for pat in ['**/*pinyin*', '**/*Pinyin*']:
    hits += glob.glob(os.path.join(sp, pat), recursive=True)[:10]
print("site-packages 内 pinyin 相关:", hits[:10])
