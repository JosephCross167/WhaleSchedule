from PIL import Image

im = Image.open('intro_decoded.png').convert('RGB')
W, H = im.size
px = im.load()


def white(c, t=232):
    return c[0] >= t and c[1] >= t and c[2] >= t


def light(c):
    return sum(c) > 330


# ---------- 1. bottom-of-character: lowest light pixel per row, x 200..900 ----------
print('=== rows y=880..1080, light-pixel count in x 200..900 (foot search) ===')
for y in range(880, 1080, 4):
    xs = [x for x in range(200, 900) if light(px[x, y])]
    if xs:
        print('  y=%4d n=%3d x %d-%d  sample=%s' % (y, len(xs), min(xs), max(xs), px[xs[len(xs) // 2], y]))
print('  (blank rows omitted)')

# ---------- 2. top watermark / faint bottom text ----------
print('\n=== faint content near bottom edge (y 1000..1079), non-bg runs ===')
for y in range(1000, 1080, 2):
    xs = [x for x in range(W) if sum(px[x, y]) > 240]
    if len(xs) > 5:
        print('  y=%4d n=%3d x %d-%d' % (y, len(xs), min(xs), max(xs)))

# ---------- 3. title / subtitle white-text bboxes ----------
print('\n=== title block white text bands (row-wise, x 300..1700) ===')
prev = 0
for y in range(60, 440):
    n = sum(1 for x in range(300, 1700, 2) if white(px[x, y]))
    if n > 3 and prev <= 3:
        print('  band start y=%d' % y)
    if n <= 3 and prev > 3:
        print('  band end   y=%d' % (y - 1))
    prev = n

# title text bbox (x range of white pixels in y 140..260)
minx, maxx = W, -1
for y in range(140, 260, 2):
    for x in range(200, 1750, 2):
        if white(px[x, y]):
            minx = min(minx, x); maxx = max(maxx, x)
print('  main title x %d-%d  width=%d  center=%.0f' % (minx, maxx, maxx - minx, (minx + maxx) / 2))

# subtitle: yellowish text -> high R,G low B
def yellow(c):
    return c[0] > 200 and c[1] > 180 and c[2] < 170
minx, maxx, miny, maxy = W, -1, 10**9, -1
for y in range(260, 420):
    for x in range(200, 1750, 2):
        if yellow(px[x, y]):
            minx = min(minx, x); maxx = max(maxx, x)
            miny = min(miny, y); maxy = max(maxy, y)
print('  subtitle(yellow) x %d-%d w=%d y %d-%d center=%.0f' % (minx, maxx, maxx - minx, miny, maxy, (minx + maxx) / 2))

# ---------- 4. card rect ----------
print('\n=== card rect from near-white column/row profiles ===')
colw = [sum(1 for y in range(430, 940, 3) if white(px[x, y])) for x in range(W)]
roww = [sum(1 for x in range(400, 1600, 3) if white(px[x, y])) for y in range(H)]
cs = [x for x in range(W) if colw[x] > 40]
rs = [y for y in range(H) if roww[y] > 100]
# largest contiguous
def span(idx):
    best = (0, 0); s = None; p = None
    for i in idx:
        if s is None: s = i
        elif i != p + 1:
            if p - s > best[1] - best[0]: best = (s, p)
            s = i
        p = i
    if s is not None and p - s > best[1] - best[0]: best = (s, p)
    return best
cx0, cx1 = span(cs)
cy0, cy1 = span(rs)
print('  card approx x %d-%d (w=%d)  y %d-%d (h=%d)' % (cx0, cx1, cx1 - cx0, cy0, cy1, cy1 - cy0))
print('  margins: left=%d right=%d top=%d bottom=%d' % (cx0, W - 1 - cx1, cy0, H - 1 - cy1))

# ---------- 5. card interior content rows ----------
print('\n=== card interior non-white bands (bars / checkboxes) ===')
prev = 0
for y in range(cy0, cy1 + 1):
    n = sum(1 for x in range(cx0 + 6, cx1 - 6, 2) if not white(px[x, y], 225))
    if n > 4 and prev <= 4:
        st = y
    if n <= 4 and prev > 4:
        cnt = sum(1 for x in range(cx0 + 6, cx1 - 6, 2) if not white(px[x, y - 1], 225))
        print('  band y %4d-%4d h=%2d  npx=%d' % (st, y - 1, y - st, cnt))
    prev = n
