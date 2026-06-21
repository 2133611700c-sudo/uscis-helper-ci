#!/usr/bin/env python3
"""
Generate degraded variants of the synthetic passport to simulate real-world
phone-photo conditions: rotation, blur, JPEG compression, partial crop,
brightness shift, glare overlay, and downscaling.

NO real PII. Pure transformation of the existing synthetic-passport.jpg.

Outputs go to /Users/sergiiivanenko/work/uscis-helper/test-fixtures/degraded/.
Each is named after the degradation applied, so when the OCR endpoint
report comes back we can match failures to specific real-world hazards.
"""

from PIL import Image, ImageFilter, ImageEnhance, ImageDraw
import os
import io

SRC = '/Users/sergiiivanenko/work/uscis-helper/test-fixtures/synthetic-passport.jpg'
OUT_DIR = '/Users/sergiiivanenko/work/uscis-helper/test-fixtures/degraded'
os.makedirs(OUT_DIR, exist_ok=True)

base = Image.open(SRC).convert('RGB')
print(f'Source: {SRC}  size={base.size}')

# 1. Rotation — phone held at angle
for deg in (5, 15, 30):
    out = base.rotate(deg, expand=True, fillcolor=(0, 0, 0))
    p = os.path.join(OUT_DIR, f'rot_{deg}deg.jpg')
    out.save(p, 'JPEG', quality=85)
    print(f'  {p}  size={out.size}  {os.path.getsize(p)} bytes')

# 2. Gaussian blur — out-of-focus
for r in (1, 2, 4):
    out = base.filter(ImageFilter.GaussianBlur(radius=r))
    p = os.path.join(OUT_DIR, f'blur_r{r}.jpg')
    out.save(p, 'JPEG', quality=85)
    print(f'  {p}  {os.path.getsize(p)} bytes')

# 3. JPEG compression — low-quality WhatsApp-style
for q in (20, 40, 60):
    p = os.path.join(OUT_DIR, f'jpeg_q{q}.jpg')
    base.save(p, 'JPEG', quality=q)
    print(f'  {p}  {os.path.getsize(p)} bytes')

# 4. Downscale — too-small upload
for sz in (300, 600, 1000):
    factor = sz / base.size[0]
    new_h = int(base.size[1] * factor)
    out = base.resize((sz, new_h), Image.LANCZOS)
    p = os.path.join(OUT_DIR, f'downscale_{sz}w.jpg')
    out.save(p, 'JPEG', quality=85)
    print(f'  {p}  size={out.size}  {os.path.getsize(p)} bytes')

# 5. Brightness — low-light shot
for k in (0.4, 0.6, 1.4):
    out = ImageEnhance.Brightness(base).enhance(k)
    p = os.path.join(OUT_DIR, f'bright_{k}.jpg')
    out.save(p, 'JPEG', quality=85)
    print(f'  {p}  {os.path.getsize(p)} bytes')

# 6. Glare overlay — bright spot covering ~25% of MRZ
out = base.copy()
draw = ImageDraw.Draw(out, 'RGBA')
W, H = out.size
# A semi-transparent white ellipse over the MRZ region (bottom 1/5 of image)
mrz_y = int(H * 0.85)
draw.ellipse(
    [int(W * 0.3), mrz_y - 20, int(W * 0.9), mrz_y + 80],
    fill=(255, 255, 230, 160),
)
p = os.path.join(OUT_DIR, 'glare_over_mrz.jpg')
out.save(p, 'JPEG', quality=85)
print(f'  {p}  {os.path.getsize(p)} bytes')

# 7. Partial crop — bottom 40% missing (no MRZ at all)
W, H = base.size
out = base.crop((0, 0, W, int(H * 0.6)))
p = os.path.join(OUT_DIR, 'crop_no_mrz.jpg')
out.save(p, 'JPEG', quality=85)
print(f'  {p}  size={out.size}  {os.path.getsize(p)} bytes')

# 8. Combined rotation + blur + low-light — pessimistic realistic phone shot
out = base.rotate(8, expand=True, fillcolor=(0, 0, 0))
out = out.filter(ImageFilter.GaussianBlur(radius=1.2))
out = ImageEnhance.Brightness(out).enhance(0.7)
p = os.path.join(OUT_DIR, 'realistic_phone.jpg')
out.save(p, 'JPEG', quality=70)
print(f'  {p}  {os.path.getsize(p)} bytes')

# 9. Garbage — completely unrelated image (cat-like pattern) to test that
# the OCR pipeline rejects non-document content gracefully.
garbage = Image.new('RGB', (1200, 800), (210, 180, 130))
gd = ImageDraw.Draw(garbage)
for x in range(0, 1200, 40):
    gd.line([(x, 0), (x, 800)], fill=(180, 150, 100), width=2)
p = os.path.join(OUT_DIR, 'garbage_non_document.jpg')
garbage.save(p, 'JPEG', quality=85)
print(f'  {p}  {os.path.getsize(p)} bytes')

# 10. Tiny image — should be rejected by the quality gate
tiny = base.resize((50, 50), Image.LANCZOS)
p = os.path.join(OUT_DIR, 'tiny_50x50.jpg')
tiny.save(p, 'JPEG', quality=85)
print(f'  {p}  {os.path.getsize(p)} bytes')

print('\nDone. ls:')
for f in sorted(os.listdir(OUT_DIR)):
    full = os.path.join(OUT_DIR, f)
    print(f'  {f}  {os.path.getsize(full)} bytes')
