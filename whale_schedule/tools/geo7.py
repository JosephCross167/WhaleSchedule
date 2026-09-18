from PIL import Image

im = Image.open('intro_decoded.png').convert('RGB')
W, H = im.size
px = im.load()


def gold(c):
    return c[0] > 165 and 120 < c[1] < 205 and c[2] < 135


print('=== GOLD pixel bbox (card border?) ===')
minx, maxx, miny, maxy, n = 10**9, -1, 10**9, -1, 0
for y in range(H):
    for x in range(W):
        if gold(px[x, y]):
            n += 1
            minx = min(minx, x); maxx = max(maxx, x)
            miny = min(miny, y); maxy = max(maxy, y)
print('  bbox x %d-%d  y %d-%d  count=%d' % (minx, maxx, miny, maxy, n))

print('\n=== gold pixels per row (rows with >20) ===')
for y in range(H):
    xs = [x for x in range(W) if gold(px[x, y])]
    if len(xs) > 20:
        print('  y=%4d n=%4d x %d-%d' % (y, len(xs), min(xs), max(xs)))

print('\n=== gold pixels per column (cols with >20) ===')
for x in range(W):
    ys = [y for y in range(H) if gold(px[x, y])]
    if len(ys) > 20:
        print('  x=%4d n=%4d y %d-%d' % (x, len(ys), min(ys), max(ys)))

# ---- saturated (colourful) pixels = character / UI accents, card is neutral ----
print('\n=== per-row max-x of SATURATED pixels (max-min>16) in x 250..1200, y 470..860 ===')
for y in range(470, 865, 10):
    xs = [x for x in range(250, 1200) if (max(px[x, y]) - min(px[x, y])) > 16]
    print('  y=%4d n=%3d  minx=%4d maxx=%4d' % (y, len(xs), min(xs) if xs else -1, max(xs) if xs else -1))

print('\n=== horizontal colour scan at y=482 (gold border) ===')
row = [(x, px[x, 482]) for x in range(300, 1550, 10)]
print('  ' + ' '.join('%d:%s' % (x, c) for x, c in row))
