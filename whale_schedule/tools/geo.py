from PIL import Image
import sys

im = Image.open('intro_decoded.png').convert('RGB')
W, H = im.size
px = im.load()
print('size', W, H)

def is_white(c):
    return c[0] > 225 and c[1] > 225 and c[2] > 225

def is_bg(c):
    # background is dark navy w/ stars
    return max(c) < 90 and (max(c) - min(c)) < 90

def sat(c):
    return max(c) - min(c)

# ---- 1. horizontal profile of near-white pixels per row ----
print('\n--- rows with white pixel count (sampled every 8px in x) ---')
white_rows = []
for y in range(H):
    n = sum(1 for x in range(0, W, 8) if is_white(px[x, y]))
    white_rows.append(n)
runs = []
inb = False
for y in range(H):
    if white_rows[y] > 2 and not inb:
        inb = True; s = y
    elif white_rows[y] <= 2 and inb:
        inb = False; runs.append((s, y - 1, max(white_rows[s:y])))
if inb: runs.append((s, H - 1, max(white_rows[s:])))
for s, e, m in runs:
    print('  white band y %4d-%4d h=%4d maxwhite=%d' % (s, e, e - s + 1, m))

# ---- 2. largest near-white rectangle (the card) : column profile ----
print('\n--- columns with white pixels (overall) ---')
colw = [sum(1 for y in range(0, H, 8) if is_white(px[x, y])) for x in range(W)]
xs = [x for x in range(W) if colw[x] > 3]
print('  white cols span x', (min(xs), max(xs)) if xs else None)

# card = rows where white count is very large (> 100 of 240 samples)
print('\n--- wide white bands (card body, >100/240 samples) ---')
inb = False
for y in range(H):
    if white_rows[y] > 100 and not inb:
        inb = True; s = y
    elif white_rows[y] <= 100 and inb:
        inb = False; print('  card band y %4d-%4d h=%4d' % (s, y - 1, y - s))
if inb: print('  card band y %4d-%4d' % (s, H - 1))

# ---- 3. character: saturated, non-white pixels in left half below y=450 ----
print('\n--- character-ish pixels (saturated or dark-skin) left of x=900, y>400 ---')
minx, maxx, miny, maxy = W, -1, H, -1
for y in range(400, H, 2):
    for x in range(0, 900, 2):
        c = px[x, y]
        if is_white(c):
            continue
        if sat(c) > 45 and max(c) > 80:
            if x < minx: minx = x
            if x > maxx: maxx = x
            if y < miny: miny = y
            if y > maxy: maxy = y
print('  char bbox x %d-%d  y %d-%d' % (minx, maxx, miny, maxy))

# ---- 4. bottom-edge check: background purity in the last rows ----
print('\n--- bottom rows: non-background pixel runs ---')
for y in [H - 1, H - 2, H - 5, H - 10, H - 20, H - 40, H - 80]:
    runs2 = []
    cur = 0; st = None
    for x in range(W):
        c = px[x, y]
        nb = not is_bg(c)
        if nb:
            if st is None: st = x
            cur += 1
        else:
            if cur >= 6: runs2.append((st, x - 1, cur))
            cur = 0; st = None
    if cur >= 6: runs2.append((st, W - 1, cur))
    big = [r for r in runs2 if r[2] >= 10]
    print('  y=%4d nonbg_total=%4d  wide_runs(>=10px)=%s' % (y, sum(1 for x in range(W) if not is_bg(px[x, y])), big[:6]))

# ---- 5. color samples ----
print('\n--- color samples ---')
pts = [('center', 960, 540), ('title-ish', 960, 200), ('title2', 960, 300),
       ('card_mid', 1100, 700), ('card_top', 1100, 560),
       ('char_head', 480, 620), ('char_mid', 480, 750), ('char_low', 470, 860),
       ('char_bottom', 470, 895), ('below_char', 470, 940), ('bottom_edge', 470, 1075),
       ('top_edge', 960, 5), ('left_edge', 5, 540)]
for name, x, y in pts:
    print('  %-12s (%4d,%4d) = %s' % (name, x, y, px[x, y]))
