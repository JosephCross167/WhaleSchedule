from PIL import Image, ImageFilter, ImageChops

im = Image.open('intro_decoded.png').convert('RGB')
W, H = im.size
blur = im.filter(ImageFilter.GaussianBlur(22))
diff = ImageChops.difference(im, blur).convert('L')
dp = diff.load()
px = im.load()

# content = local high-frequency detail (edges). Blur of 22 kills the smooth gradient.
def is_content(x, y, t=14):
    return dp[x, y] > t

# --- ASCII map with high-pass mask, merge neighbours with dilation ---
GX, GY = 96, 54
cw, ch = W // GX, H // GY
print('=== HIGH-PASS content map (%dx%d cells of %dx%d px) ===' % (GX, GY, cw, ch))
for gy in range(GY):
    line = ''
    for gx in range(GX):
        n = 0; tot = 0
        for y in range(gy * ch, gy * ch + ch, 2):
            for x in range(gx * cw, gx * cw + cw, 2):
                tot += 1
                if is_content(x, y):
                    n += 1
        r = n / tot
        line += '#' if r > 0.5 else ('+' if r > 0.22 else ('.' if r > 0.07 else ' '))
    print('%02d|%s|' % (gy, line))

# --- precise bboxes of content in given windows ---
def bbox(x0, x1, y0, y1, t=14, minrun=8):
    minx, maxx, miny, maxy = 10**9, -1, 10**9, -1
    for y in range(y0, y1):
        st = None; runs = []
        for x in range(x0, x1):
            if is_content(x, y, t):
                if st is None: st = x
            else:
                if st is not None and x - st >= minrun: runs.append((st, x - 1))
                st = None
        if st is not None and x1 - st >= minrun: runs.append((st, x1 - 1))
        for (a, b) in runs:
            minx = min(minx, a); maxx = max(maxx, b)
            miny = min(miny, y); maxy = max(maxy, y)
    return (minx, maxx, miny, maxy)

print('\n=== bboxes (high-pass, runs>=8) ===')
for name, win in [('FULL', (0, W, 0, H)),
                  ('character(x<700)', (0, 700, 0, H)),
                  ('card zone', (600, 1550, 400, 950)),
                  ('top zone', (0, W, 0, 300))]:
    print('  %-18s %s' % (name, bbox(*win)))

# --- character feet: bottom-most content in x 300..700 ---
print('\n=== bottom-most content rows in x 300..700 (feet) ===')
found = []
for y in range(H - 1, 600, -1):
    st = None; runs = []
    for x in range(300, 700):
        if is_content(x, y):
            if st is None: st = x
        else:
            if st is not None and x - st >= 8: runs.append((st, x - 1))
            st = None
    if st is not None and 700 - st >= 8: runs.append((st, 699))
    if runs:
        found.append((y, runs))
    if len(found) >= 4:
        break
for y, r in found:
    print('  y=%4d runs=%s colors=%s' % (y, r, [px[(a + b) // 2, y] for a, b in r]))
print('  => feet bottom y = %d, gap to bottom edge = %d px' % (found[0][0], H - 1 - found[0][0]))

# --- top-most content rows ---
print('\n=== top-most content rows (any x) ===')
f2 = []
for y in range(0, 400):
    st = None; runs = []
    for x in range(0, W):
        if is_content(x, y):
            if st is None: st = x
        else:
            if st is not None and x - st >= 8: runs.append((st, x - 1))
            st = None
    if st is not None and W - st >= 8: runs.append((st, W - 1))
    if runs:
        f2.append((y, runs))
    if len(f2) >= 4:
        break
for y, r in f2:
    print('  y=%4d runs=%s colors=%s' % (y, r, [px[(a + b) // 2, y] for a, b in r]))
print('  => top content y = %d, gap to top edge = %d px' % (f2[0][0], f2[0][0]))

# --- card bbox (near-white blob) ---
print('\n=== white card bbox (pixels >=232 on all channels) ===')
minx, maxx, miny, maxy = 10**9, -1, 10**9, -1
for y in range(400, 950, 2):
    for x in range(500, 1600, 2):
        c = px[x, y]
        if c[0] >= 232 and c[1] >= 232 and c[2] >= 232:
            minx = min(minx, x); maxx = max(maxx, x)
            miny = min(miny, y); maxy = max(maxy, y)
print('  card bbox x %d-%d (w=%d) y %d-%d (h=%d)' % (minx, maxx, maxx - minx, miny, maxy, maxy - miny))
print('  left gap  card.left - W/2 = %d' % (minx - W // 2))

# --- crops for close-up vision review ---
im.crop((280, 760, 780, 1000)).save('crop_feet.png')
im.crop((280, 420, 780, 760)).save('crop_head.png')
im.crop((620, 460, 1500, 880)).save('crop_card.png')
im.crop((600, 100, 1350, 500)).save('crop_top.png')
print('\ncrops written')
