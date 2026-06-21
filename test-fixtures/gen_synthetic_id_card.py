#!/usr/bin/env python3
"""Synthetic Ukrainian ID-CARD JPEG (machine-printed plastic). No real PII."""
from PIL import Image, ImageDraw, ImageFont
import os
W, H = 1600, 1000
img = Image.new('RGB', (W, H), (215, 228, 235))
d = ImageDraw.Draw(img)
def font(sz):
    for p in ('/System/Library/Fonts/Supplemental/Arial Unicode.ttf','/System/Library/Fonts/Helvetica.ttc'):
        try: return ImageFont.truetype(p, sz)
        except Exception: pass
    return ImageFont.load_default()
F_H, F_L, F_V = font(40), font(24), font(36)
d.rounded_rectangle([40,40,W-40,H-40], radius=40, outline=(70,100,130), width=4)
d.text((W//2,90),'УКРАЇНА · UKRAINE — ПАСПОРТ ГРОМАДЯНИНА (ID)',font=F_H,fill=(30,60,100),anchor='mm')
d.text((W//2,140),'(SYNTHETIC TEST DOCUMENT)',font=F_L,fill=(150,60,60),anchor='mm')
rows=[('Прізвище / Surname','ІВАНЕНКО / IVANENKO'),("Ім'я / Given name",'ТАРАС / TARAS'),
      ('По батькові','ПЕТРОВИЧ'),('Дата народження / DOB','01 01 1990'),
      ('Номер документа / No.','000111222')]
y=210
for label,val in rows:
    d.text((90,y),label,font=F_L,fill=(70,95,120))
    d.text((90,y+30),val,font=F_V,fill=(20,20,60))
    y+=130
out=os.path.join(os.path.dirname(os.path.abspath(__file__)),'synthetic-id-card.jpg')
img.save(out,quality=92)
print(f'Generated: {out} ({os.path.getsize(out)} bytes)')
