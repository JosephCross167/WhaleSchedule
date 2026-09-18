from PIL import Image

im = Image.open('intro_decoded.png').convert('RGB')
W, H = im.size
px = im.load()

# ---------- A. card interior map ----------
X0, X1, Y0, Y1 = 615, 1475, 478, 856
S = 6
print('=== CARD INTERIOR MAP  (x %d-%d, y %d-%d, cell=%dpx) ===' % (X0, X1, Y0, Y1, S))
print('    legend: " "=white(>=240)  "."=215-239  "o"=150-214  "#"=<150   "B"=blue-tinted(b-r>14)')
hdr = '     ' + ''.join([str((X0 + i * S) // 100 % 10) for i in range((X1 - X0) // S)])
print(hdr)
for gy in range(Y0, Y1, S):
    line = ''
    for gx in range(X0, X1, S):
        r = g = b = n = 0
        for y in range(gy, min(gy + S, Y1)):
            for x in range(gx, min(gx + S, X1)):
                c = px[x, y]; r += c[0]; g += c[1]; b += c[2]; n += 1
        r //= n; g //= n; b //= n
        a = (r + g + b) // 3
        if b - r > 14 and a < 238:
            line += 'B'
        elif a >= 240: line += ' '
        elif a >= 215: line += '.'
        elif a >= 150: line += 'o'
        else: line += '#'
    print('%4d|%s|' % (gy, line))

# ---------- B. character bbox / occlusion ----------
print('\n=== character extent (non-white, non-bg) in x 250..620 ===')
rows_hit = 0
minx, maxx, miny, maxy = 10**9, -1, 10**9, -1
for y in range(360, 1000):
    xs = []
    for x in range(250, 620):
        c = px[x, y]
        if sum(c) > 700 and min(c) > 225:   # pure white -> likely card/dress white
            continue
        if max(c) < 95 and (max(c) - min(c)) < 95:  # background
            continue
        xs.append(x)
    if len(xs) > 6:
        minx = min(minx, min(xs)); maxx = max(maxx, max(xs))
        miny = min(miny, y); maxy = max(maxy, y)
        if max(xs) >= 616:
            rows_hit += 1
print('  char bbox x %d-%d  y %d-%d' % (minx, maxx, miny, maxy))
print('  rows where char pixels reach the card left edge x>=616 : %d' % rows_hit)

print('\n=== per-row max-x of character pixels (does she run under the card?) ===')
for y in range(380, 1000, 20):
    xs = []
    for x in range(250, 625):
        c = px[x, y]
        if sum(c) > 700 and min(c) > 225:
            continue
        if max(c) < 95 and (max(c) - min(c)) < 95:
            continue
        xs.append(x)
    if xs:
        print('  y=%4d  maxx=%4d  n=%d' % (y, max(xs), len(xs)))

# ---------- C. card left edge column, verify hard vertical boundary ----------
print('\n=== horizontal scan y=700 and y=600, x 590..680 ===')
for y in (600, 700, 800):
    print('  y=%d %s' % (y, ' '.join('%d:%s' % (x, px[x, y]) for x in range(590, 690, 10))))
