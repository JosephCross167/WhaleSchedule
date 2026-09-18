from PIL import Image

im = Image.open('intro_decoded.png').convert('RGB')
W, H = im.size
px = im.load()

X0, X1, Y0, Y1, S = 380, 820, 420, 884, 5
print('=== FINE MAP x %d-%d  y %d-%d  cell=%dpx ===' % (X0, X1, Y0, Y1, S))
print('  legend: "#"=avg<100(dark)  "o"=100-179  "."=180-231  " "=>=232(white/light)  "@"=gold(216,167,82)')
print('   card top gold line at y=482, card left edge x=449')
print('     ' + ''.join([str((X0 + i * S) // 10 % 10) for i in range((X1 - X0) // S)]))
for gy in range(Y0, Y1, S):
    line = ''
    for gx in range(X0, X1, S):
        r = g = b = n = 0
        for y in range(gy, min(gy + S, Y1)):
            for x in range(gx, min(gx + S, X1)):
                c = px[x, y]; r += c[0]; g += c[1]; b += c[2]; n += 1
        r //= n; g //= n; b //= n
        a = (r + g + b) // 3
        if r > 175 and 130 < g < 205 and b < 140: line += '@'
        elif a < 100: line += '#'
        elif a < 180: line += 'o'
        elif a < 232: line += '.'
        else: line += ' '
    print('%4d|%s|' % (gy, line))

print('\n=== colours along y=700, x 400..700 (step 10) ===')
print('  ' + ' '.join('%d:%s' % (x, px[x, 700]) for x in range(400, 710, 10)))
print('\n=== colours along y=600, x 400..700 ===')
print('  ' + ' '.join('%d:%s' % (x, px[x, 600]) for x in range(400, 710, 10)))
print('\n=== colours along y=820, x 400..700 ===')
print('  ' + ' '.join('%d:%s' % (x, px[x, 820]) for x in range(400, 710, 10)))
print('\n=== vertical trace at x=460, 470, 480, 500 (is x just right of card edge white?) ===')
for X in (452, 460, 470, 480, 500, 520):
    seq = []
    prev = None
    for y in range(486, 850, 2):
        c = px[X, y]
        k = 'W' if min(c) >= 236 else ('B' if c[2] - c[0] > 20 else ('D' if sum(c) < 330 else 'M'))
        if k != prev:
            seq.append('%d:%s%s' % (y, k, c))
            prev = k
    print('  x=%d  %s' % (X, ' | '.join(seq[:22])))
