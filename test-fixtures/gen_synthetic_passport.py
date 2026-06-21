#!/usr/bin/env python3
"""
Generate a synthetic Ukrainian-style passport JPEG with a valid TD3 MRZ.

No real PII. Identity is the same one used by passport.test.ts:
  - Surname: TESTSURNAME
  - Given:   TESTGIVEN
  - Doc no:  AB1234567
  - Nation:  UKR
  - DOB:     1985-07-12
  - Sex:     M
  - Expiry:  2029-06-30

Output: /Users/sergiiivanenko/work/uscis-helper/test-fixtures/synthetic-passport.jpg
The image is sized 1500x1000 — a realistic photo-of-passport-page aspect.
MRZ is rendered in OCR-B-equivalent monospace at the bottom.
"""

from PIL import Image, ImageDraw, ImageFont
import os

# ── ICAO 9303 check digit (weights 7,3,1) ──────────────────────────────
def char_to_value(c: str) -> int:
    if '0' <= c <= '9':
        return int(c)
    if 'A' <= c <= 'Z':
        return ord(c) - ord('A') + 10
    if c == '<':
        return 0
    raise ValueError(f"unexpected char in MRZ: {c!r}")

def check_digit(s: str) -> str:
    weights = [7, 3, 1]
    total = 0
    for i, c in enumerate(s):
        total += char_to_value(c) * weights[i % 3]
    return str(total % 10)

# ── build TD3 MRZ ──────────────────────────────────────────────────────
surname     = 'TESTSURNAME'
given       = 'TESTGIVEN'
doc_number  = 'AB1234567'
nationality = 'UKR'
dob         = '850712'        # YYMMDD
sex         = 'M'
expiry      = '290630'        # YYMMDD (future-dated so passport.test passes)
personal    = '0000000000000' # 13 chars, will be padded to 14 by '<'

# Line 1: P< + UKR + SURNAME<<GIVEN<<...  padded to 44
name_field = (surname + '<<' + given).ljust(39, '<')
line1 = ('P<UKR' + name_field).ljust(44, '<')[:44]

doc_padded     = doc_number.ljust(9, '<')
doc_check      = check_digit(doc_padded)
dob_check      = check_digit(dob)
expiry_check   = check_digit(expiry)
personal_padded= personal.ljust(14, '<')
personal_check = check_digit(personal_padded)

before_composite = (
    doc_padded + doc_check +
    nationality +
    dob + dob_check +
    sex +
    expiry + expiry_check +
    personal_padded + personal_check
)
composite_check = check_digit(before_composite)
line2 = (before_composite + composite_check).ljust(44, '<')[:44]

assert len(line1) == 44, f"line1 wrong length: {len(line1)}"
assert len(line2) == 44, f"line2 wrong length: {len(line2)}"

print('MRZ line 1:', repr(line1))
print('MRZ line 2:', repr(line2))

# ── render image ───────────────────────────────────────────────────────
W, H = 1500, 1000
img = Image.new('RGB', (W, H), (245, 240, 230))  # passport-paper beige
draw = ImageDraw.Draw(img)

# Decorative header (no claim of authenticity — this is clearly a test fixture)
header_font = None
mrz_font = None

# Try to find a monospace font that Pillow can use
font_candidates = [
    '/System/Library/Fonts/Menlo.ttc',
    '/System/Library/Fonts/Monaco.ttf',
    '/System/Library/Fonts/Courier.ttc',
    '/Library/Fonts/Courier New.ttf',
]
for fp in font_candidates:
    if os.path.exists(fp):
        try:
            mrz_font = ImageFont.truetype(fp, 44)
            header_font = ImageFont.truetype(fp, 28)
            break
        except Exception:
            continue
if mrz_font is None:
    mrz_font = ImageFont.load_default()
    header_font = ImageFont.load_default()

# Top label so any human looking at the file knows it's synthetic
draw.text((40, 30), "SYNTHETIC TEST PASSPORT — NOT A REAL DOCUMENT", fill=(120, 0, 0), font=header_font)
draw.text((40, 80), "TPS OCR fixture · no real PII · check digits valid", fill=(60, 60, 60), font=header_font)

# Fake photo placeholder
draw.rectangle([40, 140, 380, 540], outline=(80, 80, 80), width=3, fill=(220, 220, 220))
draw.text((110, 320), "PHOTO", fill=(120, 120, 120), font=header_font)

# Field labels (visible field block — matches what Google Vision sometimes uses)
labels_x = 420
field_y = 140
def field(label: str, value: str):
    global field_y
    draw.text((labels_x, field_y), label, fill=(80, 80, 80), font=header_font)
    draw.text((labels_x + 380, field_y), value, fill=(20, 20, 20), font=header_font)
    field_y += 60

field('Type / Тип',                'P')
field('Code / Код',                'UKR')
field('Passport No. / № паспорта', doc_number)
field('Surname / Прізвище',        surname)
field('Given names / Імена',       given)
field('Nationality / Громадянство','UKRAINIAN')
field('Date of birth / Народження','12 JUL 1985')
field('Sex / Стать',               sex)
field('Date of expiry / Дійсний до','30 JUN 2029')

# MRZ block at bottom — must be the most readable region for Vision
mrz_y = H - 200
draw.rectangle([0, mrz_y - 30, W, H], fill=(255, 255, 255))  # white strip for contrast
draw.text((40, mrz_y),       line1, fill=(0, 0, 0), font=mrz_font)
draw.text((40, mrz_y + 70),  line2, fill=(0, 0, 0), font=mrz_font)

out_path = '/Users/sergiiivanenko/work/uscis-helper/test-fixtures/synthetic-passport.jpg'
img.save(out_path, 'JPEG', quality=92)
print(f"Saved: {out_path}")
print(f"Size:  {os.path.getsize(out_path)} bytes")
