from PIL import Image

im = Image.open('intro_decoded.png').convert('RGB')
W, H = im.size
px = im.load()


def is_bg(c):
    return max(c) < 95 and (max(c) - min(c)) < 95


def solid_runs(y, minlen=10):
    """runs of non-background pixels along x, length>=minlen -> kills star dots"""
    out = []
    st = None
    for x in range(W):
        if not is_bg(px[x, y]):
            if st is None:
                st = x
        else:
            if st is not None and x - st >= minlen:
                out.append((st, x - 1))
            st = None
    if st is not None and W - st >= minlen:
        out.append((st, W - 1))
    return out


print('=== vertical profile of SOLID content (runs>=10px) ===')
prev = False
for y in range(H):
    r = solid_runs(y)
    has = len(r) > 0
    if has and not prev:
        print('  START y=%4d  runs=%s' % (y, r[:4]))
    if prev and not has:
        print('  END   y=%4d' % (y - 1))
    prev = has

print('\n=== content bbox (solid, runs>=10) ===')
minx, maxx, miny, maxy = W, -1, H, -1
for y in range(H):
    for (a, b) in solid_runs(y):
        minx = min(minx, a); maxx = max(maxx, b)
        miny = min(miny, y); maxy = max(maxy, y)
print('  bbox x %d-%d y %d-%d' % (minx, maxx, miny, maxy))
print('  TOP margin = %d px (%.1f%% of %d)' % (miny, 100.0 * miny / H, H))
print('  BOTTOM margin = %d px (%.1f%%)' % (H - 1 - maxy, 100.0 * (H - 1 - maxy) / H))

print('\n=== left-column (character) solid bbox, x<1000 ===')
minx, maxx, miny, maxy = W, -1, H, -1
for y in range(H):
    for (a, b) in solid_runs(y):
        if a < 1000:
            a2 = min(a, 999)
            minx = min(minx, a2); maxx = max(maxx, min(a2 + 0, 999))
            miny = min(miny, y); maxy = max(maxy, y)
print('  rough x %d-%d y %d-%d' % (minx, maxx, miny, maxy))

print('\n=== character silhouette width per row (x 250..760 only) ===')
for y in range(430, 1000, 10):
    st = None; runs = []
    for x in range(250, 780):
        if not is_bg(px[x, y]):
            if st is None: st = x
        else:
            if st is not None and x - st >= 8: runs.append((st, x - 1))
            st = None
    if st is not None and 780 - st >= 8: runs.append((st, 779))
    if runs:
        print('  y=%4d %s' % (y, runs))

print('\n=== bottom-most solid content row ===')
for y in range(H - 1, 700, -1):
    r = solid_runs(y)
    if r:
        print('  y=%d runs=%s' % (y, r[:6]))
        break

print('\n=== is card in front of character? sample row across overlap ===')
for y in (640, 700, 760, 820, 860, 880):
    row = []
    for x in range(600, 700, 10):
        row.append('%d:%s' % (x, px[x, y]))
    print('  y=%d %s' % (y, ' '.join(row)))

print('\n=== vertical colors down character center x=470 ===')
for y in range(430, 1000, 30):
    print('  y=%4d %s' % (y, px[470, y]))

print('\n=== colors down x=960 (center) ===')
for y in range(80, 1080, 40):
    print('  y=%4d %s' % (y, px[960, y]))
