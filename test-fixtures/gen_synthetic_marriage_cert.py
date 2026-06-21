#!/usr/bin/env python3
"""
Generate a synthetic Ukrainian MARRIAGE CERTIFICATE JPEG. No real PII.
Output: synthetic-marriage-cert.jpg.
"""
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 2600, 1750
img = Image.new('RGB', (W, H), (242, 236, 230))
d = ImageDraw.Draw(img)

def font(sz):
    for p in ('/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
              '/System/Library/Fonts/Helvetica.ttc'):
        try: return ImageFont.truetype(p, sz)
        except Exception: pass
    return ImageFont.load_default()

F_H, F_L, F_V = font(42), font(26), font(34)
d.rectangle([30, 30, W-30, H-30], outline=(130, 100, 100), width=3)
d.text((W//2, 70), 'СВІДОЦТВО ПРО ШЛЮБ', font=F_H, fill=(80, 40, 50), anchor='mm')
d.text((W//2, 118), '(SYNTHETIC TEST DOCUMENT — NOT A REAL CERTIFICATE)', font=F_L, fill=(150, 60, 60), anchor='mm')

rows = [
    ('Він', 'ІВАНЕНКО ТАРАС ПЕТРОВИЧ'),
    ('Вона', 'ШЕВЧЕНКО ОЛЕНА ІВАНІВНА'),
    ('Дата реєстрації шлюбу', '14 лютого 2015'),
    ('Актовий запис №', '456'),
    ('Орган реєстрації', 'Вінницький міський відділ ДРАЦС'),
    ('Дата видачі', '14 лютого 2015'),
]
y = 200
for label, val in rows:
    d.text((80, y), f'{label}:', font=F_L, fill=(100, 70, 70))
    d.text((520, y-4), val, font=F_V, fill=(25, 25, 70))
    d.line([(520, y+34), (W-80, y+34)], fill=(160, 130, 130), width=1)
    y += 92

# paper-grain noise → JPEG past the 300KB apostille quality gate
import random
random.seed(42)
px = img.load()
for _ in range(int(W*H*0.30)):
    x, y = random.randrange(W), random.randrange(H)
    r, g, b = px[x, y]
    dd = random.randint(-16, 16)
    px[x, y] = (max(0,min(255,r+dd)), max(0,min(255,g+dd)), max(0,min(255,b+dd)))

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'synthetic-marriage-cert.jpg')
img.save(out, quality=97)
print(f'Generated: {out} ({os.path.getsize(out)} bytes)')
