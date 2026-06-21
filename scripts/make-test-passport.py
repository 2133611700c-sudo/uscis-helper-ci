#!/usr/bin/env python3
"""
Synthetic Ukrainian internal passport booklet — page 2 (personal data page).
All 11 critical fields present with proper Ukrainian labels.
Used for production OCR proof (Phase 1). Vision reads real rendered text.
"""
from PIL import Image, ImageDraw, ImageFont
import sys, os

OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/test-passport-ua.jpg"

W, H = 1400, 980   # slightly larger for more text room

img = Image.new("RGB", (W, H), color=(252, 250, 244))
draw = ImageDraw.Draw(img)

# Subtle page grid lines
for y in range(0, H, 50):
    draw.line([(0, y), (W, y)], fill=(240, 237, 228), width=1)

def get_font(size=16):
    for path in [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Arial.ttf",
        "/Library/Fonts/Arial Unicode.ttf",
    ]:
        if os.path.exists(path):
            try: return ImageFont.truetype(path, size)
            except: pass
    return ImageFont.load_default()

font_tiny   = get_font(12)
font_label  = get_font(14)
font_value  = get_font(22)
font_header = get_font(26)
font_big    = get_font(30)

# ── Header ────────────────────────────────────────────────────────────────────
draw.rectangle([0, 0, W, 75], fill=(0, 82, 164))
draw.text((W//2, 38), "УКРАЇНА / UKRAINE", fill="white", anchor="mm", font=font_big)

# Trident watermark area (very light)
draw.text((W//2 - 80, 120), "⁑", fill=(230, 225, 210), font=get_font(80))

# ── Document type + series/number (top right) ─────────────────────────────────
draw.text((980, 90), "ПАСПОРТ / PASSPORT", fill=(20, 20, 20), font=font_header)
draw.text((980, 125), "Серія / Series", fill=(110, 110, 110), font=font_tiny)
draw.text((980, 143), "АА", fill=(10, 10, 10), font=font_value)
draw.text((1100, 125), "Номер / Number", fill=(110, 110, 110), font=font_tiny)
draw.text((1100, 143), "123456", fill=(10, 10, 10), font=font_value)

# Divider under header
draw.line([(40, 185), (W-40, 185)], fill=(180, 175, 160), width=2)

# ── Field block: personal data ────────────────────────────────────────────────
FIELDS = [
    # (label_uk,                    label_en,           value_uk,                       value_en_hint,          x,   y)
    ("ПРІЗВИЩЕ",                    "Surname",          "ШЕВЧЕНКО",                     "SHEVCHENKO",           50,  200),
    ("ІМ'Я",                        "Given name",       "ТАРАС",                        "TARAS",                50,  270),
    ("ПО БАТЬКОВІ",                 "Patronymic",       "ГРИГОРОВИЧ",                   "HRYHOROVYCH",          50,  340),
    ("СТАТЬ",                       "Sex",              "Ч / М",                        "Male",                 50,  410),
    ("ГРОМАДЯНСТВО",                "Nationality",      "УКРАЇНЕЦЬ",                    "UKRAINIAN",            50,  480),
    ("ДАТА НАРОДЖЕННЯ",             "Date of birth",    "09 березня 1814",              "09 March 1814",        50,  550),
    ("МІСЦЕ НАРОДЖЕННЯ",            "Place of birth",   "С. МОРИНЦІ, ЧЕРКАСЬКА ОБЛ.",   "Moryntsi, Cherkasy",   50,  620),
    ("ОРГАН ВИДАЧІ",                "Issued by",        "ДМС ЧЕРКАСЬКОЇ ОБЛ.",          "DMS Cherkasy Obl.",    50,  700),
    ("ДАТА ВИДАЧІ",                 "Date of issue",    "12 квітня 2010",               "12 April 2010",        50,  770),
    ("ДІЙСНИЙ ДО",                  "Valid until",      "12 квітня 2030",               "12 April 2030",        50,  840),
]

for label_uk, label_en, value, hint, x, y in FIELDS:
    # Label line (small, grey)
    draw.text((x, y), f"{label_uk} / {label_en}", fill=(90, 90, 90), font=font_label)
    # Value line (large, dark)
    draw.text((x, y + 20), value, fill=(8, 8, 30), font=font_value)
    # Transliteration hint (small, muted blue)
    draw.text((x + 5, y + 46), hint, fill=(80, 110, 160), font=font_tiny)
    # Separator
    draw.line([(x, y + 58), (x + 580, y + 58)], fill=(200, 195, 180), width=1)

# ── Photo placeholder ─────────────────────────────────────────────────────────
draw.rectangle([970, 200, 1280, 500], outline=(140, 140, 140), width=2, fill=(215, 215, 215))
draw.text((1125, 350), "ФОТО\nPHOTO", fill=(110, 110, 110), anchor="mm", font=font_header)

# ── РНОКПП / Tax number ───────────────────────────────────────────────────────
draw.text((970, 520), "РНОКПП / Tax number", fill=(90, 90, 90), font=font_label)
draw.text((970, 540), "1234567890", fill=(8, 8, 30), font=font_value)

# ── MRZ zone ─────────────────────────────────────────────────────────────────
draw.rectangle([0, 900, W, H], fill=(240, 244, 252))
draw.text((50, 912), "P<UKRSHEVCHENKO<<TARAS<HRYHOROVYCH<<<<<<<<<<<<<<<<<<", fill=(30, 30, 30), font=font_label)
draw.text((50, 935), "AA1234560UKR8140309M3004129<<<<<<<<<<<<<<<<<<2", fill=(30, 30, 30), font=font_label)
draw.text((50, 958), "РНОКПП: 1234567890", fill=(80, 80, 80), font=font_tiny)

img.save(OUT, "JPEG", quality=95)
print(f"Saved: {OUT}  ({W}x{H})")
