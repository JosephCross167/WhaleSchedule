from PIL import Image, ImageFilter, ImageChops
import numpy as np

im = Image.open('intro_decoded.png').convert('RGB')
W, H = im.size
blur = im.filter(ImageFilter.GaussianBlur(20))
g = np.asarray(im, dtype=np.int16)
gb = np.asarray(blur, dtype=np.int16)
d = np.abs(g - gb).sum(axis=2)          # high-frequency energy
mask = d > 30                            # detail pixels

# downsample x4 (any hit)
m4 = mask[:H // 4 * 4, :W // 4 * 4].reshape(H // 4, 4, W // 4, 4).max(axis=(1, 3))
print('mask px', int(mask.sum()), 'downsampled', m4.shape, int(m4.sum()))

# connected components (4-neighbour) BFS
lab = np.zeros(m4.shape, dtype=np.int32)
cur = 0
comps = []
Hh, Ww = m4.shape
from collections import deque
for y0 in range(Hh):
    for x0 in range(Ww):
        if m4[y0, x0] and lab[y0, x0] == 0:
            cur += 1
            q = deque([(y0, x0)]); lab[y0, x0] = cur
            n = 0
            minx = maxx = x0; miny = maxy = y0
            while q:
                y, x = q.popleft(); n += 1
                if x < minx: minx = x
                if x > maxx: maxx = x
                if y < miny: miny = y
                if y > maxy: maxy = y
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < Hh and 0 <= xx < Ww and m4[yy, xx] and lab[yy, xx] == 0:
                        lab[yy, xx] = cur; q.append((yy, xx))
            comps.append((n, minx * 4, maxx * 4 + 3, miny * 4, maxy * 4 + 3))

comps.sort(reverse=True)
print('\n=== top 14 connected detail components (area >= 40 cells) ===')
for n, x0, x1, y0, y1 in comps[:14]:
    print('  area=%6d  x %4d-%4d (w=%4d)  y %4d-%4d (h=%4d)' % (n, x0, x1, x1 - x0, y0, y1, y1 - y0))

print('\n=== ALL components with x1 < 760 (left-side objects) ===')
for n, x0, x1, y0, y1 in comps:
    if n >= 40 and x0 < 760:
        print('  area=%6d  x %4d-%4d (w=%4d)  y %4d-%4d (h=%4d)' % (n, x0, x1, x1 - x0, y0, y1, y1 - y0))
