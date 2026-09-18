from PIL import Image

im = Image.open('intro_decoded.png').convert('RGB')
W, H = im.size
px = im.load()

print('=== vertical trace inside card ===')
for X in (760, 900, 1000, 1150, 1300):
    print('--- x=%d ---' % X)
    prev = None
    for y in range(470, 870, 2):
        c = px[X, y]
        key = (c[0] // 6, c[1] // 6, c[2] // 6)
        if key != prev:
            print('   y=%4d %s' % (y, c))
            prev = key

print('\n=== checkbox column scan: x 1320..1440 ===')
for y in range(470, 870, 2):
    xs = [x for x in range(1310, 1450) if px[x, y][2] - px[x, y][0] > 20 or sum(px[x, y]) < 690]
    if xs:
        print('   y=%4d n=%3d x %d-%d mid=%s' % (y, len(xs), min(xs), max(xs), px[(min(xs) + max(xs)) // 2, y]))

print('\n=== per-row card interior start (first x>=580 with 40px straight white) ===')
for y in range(490, 860, 10):
    v = None
    for x in range(580, 1200):
        if all(min(px[x + k, y]) >= 236 for k in range(0, 40, 4)):
            v = x; break
    print('   y=%4d card_interior_starts_x=%s' % (y, v))
