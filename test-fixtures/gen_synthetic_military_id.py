#!/usr/bin/env python3
"""
Generate a synthetic Ukrainian MILITARY ID (військовий квиток) page JPEG.
No real PII — hardcoded synthetic identity. Output: synthetic-military-id.jpg.
"""
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1800, 1300
img = Image.new('RGB', (W, H), (228, 232, 224))
d = ImageDraw.Draw(img)

def font(sz):
    for p in ('/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
              '/System/Library/Fonts/Helvetica.ttc'):
        try: return ImageFont.truetype(p, sz)
        except Exception: pass
    return ImageFont.load_default()

F_H, F_L, F_V = font(42), font(26), font(34)
d.rectangle([25, 25, W-25, H-25], outline=(80, 100, 80), width=3)
d.text((W//2, 70), 'ВІЙСЬКОВИЙ КВИТОК', font=F_H, fill=(40, 60, 40), anchor='mm')
d.text((W//2, 118), 'Серія ТС № 000111  (SYNTHETIC TEST DOCUMENT)', font=F_L, fill=(150, 60, 60), anchor='mm')

rows = [
    ('Прізвище', 'ІВАНЕНКО'),
    ("Ім'я", 'ТАРАС'),
    ('По батькові', 'ПЕТРОВИЧ'),
    ('Дата народження', '01.01.1990'),
]
y = 200
for label, val in rows:
    d.text((80, y), f'{label}:', font=F_L, fill=(70, 85, 70))
    d.text((420, y-4), val, font=F_V, fill=(25, 25, 70))
    d.line([(420, y+34), (W-80, y+34)], fill=(140, 150, 130), width=1)
    y += 92

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'synthetic-military-id.jpg')
img.save(out, quality=95)
print(f'Generated: {out} ({os.path.getsize(out)} bytes)')
