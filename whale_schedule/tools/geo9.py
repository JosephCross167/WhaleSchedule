from PIL import Image

im = Image.open('intro_decoded.png').convert('RGB')
W, H = im.size
px = im.load()

# character mask: illustration detail = strong local colour variation / dark outlines
# card base is a near-uniform (240..248) neutral; any pixel markedly darker or tinted is content
X0, X1, Y0, Y1, S = 449, 1471, 484, 849, 8
print('=== FULL CARD INTERIOR MAP x %d-%d y %d-%d cell=%d (cols are x/10) ===' % (X0, X1, Y0, Y1, S))
print('  legend  "B"=blue-tinted(b-r>12)  "#"=dark(avg<170)  "."=tinted/light-content  " "=plain card white')
print('      ' + ''.join([str((X0 + i * S) // 10 % 10) for i in range((X1 - X0) // S)]))
for gy in range(Y0, Y1, S):
    line = ''
    for gx in range(X0, X1, S):
        r = g = b = n = 0
        for y in range(gy, min(gy + S, Y1)):
            for x in range(gx, min(gx + S, X1)):
                c = px[x, y]; r += c[0]; g += c[1]; b += c[2]; n += 1
        r //= n; g //= n; b //= n
        a = (r + g + b) // 3
        if a < 170: line += '#'
        elif b - r > 12: line += 'B'
        elif a < 238: line += '.'
        else: line += ' '
    print('%4d|%s|' % (gy, line))

# ---- top chip row: exact blue-block spans at y=506 ----
print('\n=== blue chip spans at y=506 (b-r>12) ===')
y = 506
runs = []
st = None
for x in range(X0, X1):
    c = px[x, y]
    if c[2] - c[0] > 12:
        if st is None: st = x
    else:
        if st is not None and x - st >= 8: runs.append((st, x - 1, x - st))
        st = None
if st: runs.append((st, X1 - 1, X1 - st))
print('  %d chips: %s' % (len(runs), runs))

# ---- checkbox rows: blue blocks in x 1400..1460 ----
print('\n=== checkbox rows (blue b-r>12 in x 1400..1460) ===')
runs = []
st = None
for y in range(490, 850):
    hit = any(px[x, y][2] - px[x, y][0] > 12 for x in range(1400, 1460))
    if hit and st is None: st = y
    elif not hit and st is not None:
        runs.append((st, y - 1, y - st)); st = None
if st: runs.append((st, 849, 850 - st))
print('  %d boxes: %s' % (len(runs), runs))

# ---- left-hand light bars inside card (x 470..640 avoided: character) use x 700..1380 ----
print('\n=== faint row stripes across card (sampled x=820..1300 mean colour per y) ===')
prev = None
for y in range(484, 849):
    r = g = b = n = 0
    for x in range(820, 1300, 10):
        c = px[x, y]; r += c[0]; g += c[1]; b += c[2]; n += 1
    r //= n; g //= n; b //= n
    k = (r // 2, g // 2, b // 2)
    if k != prev:
        print('   y=%4d mean=(%d,%d,%d)' % (y, r, g, b))
        prev = k
