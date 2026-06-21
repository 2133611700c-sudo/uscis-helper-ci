#!/usr/bin/env python3
"""Synthetic Ukrainian DIVORCE CERTIFICATE JPEG. No real PII."""
from PIL import Image, ImageDraw, ImageFont
import os
W, H = 2600, 1750
img = Image.new('RGB', (W, H), (238, 236, 244))
d = ImageDraw.Draw(img)
def font(sz):
    for p in ('/System/Library/Fonts/Supplemental/Arial Unicode.ttf','/System/Library/Fonts/Helvetica.ttc'):
        try: return ImageFont.truetype(p, sz)
        except Exception: pass
    return ImageFont.load_default()
F_H, F_L, F_V = font(42), font(26), font(34)
d.rectangle([30,30,W-30,H-30], outline=(100,100,130), width=3)
d.text((W//2,70),'СВІДОЦТВО ПРО РОЗІРВАННЯ ШЛЮБУ',font=F_H,fill=(50,50,80),anchor='mm')
d.text((W//2,118),'(SYNTHETIC TEST DOCUMENT)',font=F_L,fill=(150,60,60),anchor='mm')
rows=[('Він','ІВАНЕНКО ТАРАС ПЕТРОВИЧ'),('Вона','ШЕВЧЕНКО ОЛЕНА ІВАНІВНА'),
      ('Дата розірвання шлюбу','20 березня 2020'),('Актовий запис №','789'),
      ('Орган реєстрації','Вінницький міський відділ ДРАЦС')]
y=200
for label,val in rows:
    d.text((80,y),f'{label}:',font=F_L,fill=(80,80,110))
    d.text((560,y-4),val,font=F_V,fill=(25,25,70))
    d.line([(560,y+34),(W-80,y+34)],fill=(140,140,170),width=1)
    y+=100

# subtle paper-grain noise so the JPEG lands past the 300KB apostille quality gate
import random
random.seed(42)
px = img.load()
for _ in range(int(W*H*0.06)):
    x, y = random.randrange(W), random.randrange(H)
    r, g, b = px[x, y]
    d = random.randint(-14, 14)
    px[x, y] = (max(0,min(255,r+d)), max(0,min(255,g+d)), max(0,min(255,b+d)))

out=os.path.join(os.path.dirname(os.path.abspath(__file__)),'synthetic-divorce-cert.jpg')
img.save(out,quality=97)
print(f'Generated: {out} ({os.path.getsize(out)} bytes)')
