#!/usr/bin/env python3
"""
Generate a synthetic Ukrainian BIRTH CERTIFICATE JPEG. No real PII — all values
hardcoded synthetic (IVANENKO TARAS / 1990-01-01 / TESTPLACE family).
Output: test-fixtures/synthetic-birth-cert.jpg (printed-style form: header +
labeled lines). Used by the E2E UI smoke so CI never touches real documents.
"""
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1500, 1050
img = Image.new('RGB', (W, H), (245, 240, 222))
d = ImageDraw.Draw(img)

def font(sz, bold=False):
    for p in ('/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
              '/System/Library/Fonts/Helvetica.ttc'):
        try: return ImageFont.truetype(p, sz)
        except Exception: pass
    return ImageFont.load_default()

F_H, F_L, F_V = font(44), font(26), font(34)
d.rectangle([30, 30, W-30, H-30], outline=(120, 110, 80), width=3)
d.text((W//2, 70), 'СВІДОЦТВО ПРО НАРОДЖЕННЯ', font=F_H, fill=(60, 50, 30), anchor='mm')
d.text((W//2, 120), '(SYNTHETIC TEST DOCUMENT — NOT A REAL CERTIFICATE)', font=F_L, fill=(150, 60, 60), anchor='mm')

rows = [
    ('Прізвище', 'ІВАНЕНКО'),
    ("Ім'я, по батькові", 'ТАРАС ПЕТРОВИЧ'),
    ('Дата народження', '01 січня 1990'),
    ('Місце народження', 'м. Вінниця, Вінницька область'),
    ('Батько', 'ІВАНЕНКО ПЕТРО ІВАНОВИЧ'),
    ('Мати', 'ІВАНЕНКО ОЛЕНА ТАРАСІВНА'),
    ('Актовий запис №', '123'),
    ('Орган реєстрації', 'Вінницький міський відділ ДРАЦС'),
    ('Дата видачі', '15 січня 1990'),
]
y = 190
for label, val in rows:
    d.text((80, y), f'{label}:', font=F_L, fill=(90, 80, 60))
    d.text((480, y-4), val, font=F_V, fill=(25, 25, 70))
    d.line([(480, y+34), (W-80, y+34)], fill=(150, 140, 110), width=1)
    y += 86

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'synthetic-birth-cert.jpg')
img.save(out, quality=88)
print(f'Generated: {out} ({os.path.getsize(out)} bytes)')
