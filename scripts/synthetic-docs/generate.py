#!/usr/bin/env python3
"""
generate.py — Synthetic, PII-FREE Cyrillic document images for the REAL-OCR E2E.

Renders clean printed Ukrainian/Russian "document" PNGs with Pillow using a
Cyrillic-capable font (Arial). These are NOT real people: every name, date and
place is invented for test purposes only, so the fixtures are safe to commit and
to upload to a free-tier Gemini read. The images are fed to the LIVE
/api/translation/vision-extract route (real Gemini) by the staging E2E — no OCR
value is ever hardcoded into the fixture itself.

Fixtures produced (under tests/fixtures/translation-synthetic/):
  ua_birth_printed.png      Ukrainian printed civil cert (Shevchenko/Taras, смт Вишневе, РАЦС)
  ru_printed.png            Russian printed doc with ru-only markers (Ы/Э/Ё/Ъ)
  ua_passport_mrz.png       passport bio page + a valid TD3 MRZ block (real check digits)
  ambiguous_script.png      uk/ru-shared-letters-only name (ПЕТРОВА) → must trigger review
  handwritten_critical.png  one critical field rendered in a handwriting-style font

Run:  python3 scripts/synthetic-docs/generate.py
Deps: Pillow (pip install Pillow). macOS Arial is at the path below; on Linux/CI
      the script falls back to DejaVuSans (Cyrillic-capable) so it runs on the runner.
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover
    print("ERROR: Pillow is required. pip install Pillow", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "tests" / "fixtures" / "translation-synthetic"

# ── Font resolution ──────────────────────────────────────────────────────────
# Primary printed font: Arial (macOS) → DejaVuSans (Linux/CI). Both cover Cyrillic.
# Handwriting proxy: Comic Sans MS (macOS, Cyrillic-capable, informal) →
#   Arial Italic (macOS) → DejaVuSans-Oblique (Linux). A slanted/informal face is
#   only a *proxy* for handwriting — the point is that a critical field looks
#   visually distinct so the reader treats it as a hard case, not that it is real
#   cursive. MRZ uses a monospace font (Courier) like a real machine-readable zone.
_PRINTED_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
]
_BOLD_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]
_HAND_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Comic Sans MS.ttf",
    "/System/Library/Fonts/Supplemental/Arial Italic.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Italic.ttf",
]
_MONO_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Courier New.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
]


def _first_existing(candidates: list[str]) -> str:
    for c in candidates:
        if Path(c).exists():
            return c
    raise FileNotFoundError(
        f"No usable font found among {candidates}. Install Arial (macOS) or "
        "fonts-dejavu (Linux: apt-get install fonts-dejavu-core)."
    )


def font(path_list: list[str], size: int) -> "ImageFont.FreeTypeFont":
    return ImageFont.truetype(_first_existing(path_list), size)


def _cyrillic_renders(f: "ImageFont.FreeTypeFont") -> bool:
    """Guard: a 'Cyrillic' font that draws tofu boxes is useless. Compare the ink
    of Ш against an unsupported CJK glyph; a real Cyrillic glyph differs clearly."""
    def ink(ch: str) -> int:
        img = Image.new("L", (80, 80), 255)
        ImageDraw.Draw(img).text((5, 5), ch, font=f, fill=0)
        return sum(1 for p in img.getdata() if p < 128)
    return abs(ink("Ш") - ink("好")) > 80


# ── Drawing helpers ──────────────────────────────────────────────────────────
INK = (20, 20, 20)
PAPER = (252, 251, 247)


def new_page(w: int = 1240, h: int = 1754) -> tuple["Image.Image", "ImageDraw.ImageDraw"]:
    """A4-ish @ ~150 DPI, off-white paper."""
    img = Image.new("RGB", (w, h), PAPER)
    return img, ImageDraw.Draw(img)


def _add_paper_grain(img: "Image.Image") -> "Image.Image":
    """Subtle scan-realistic grain. Two purposes: (1) raises PNG entropy so the file
    clears the route's 100 KB min_bytes_for_extraction gate (a perfectly flat render
    compresses to ~50 KB and is rejected as needs_better_scan BEFORE Gemini is called);
    (2) looks more like a real scan. Alpha is low so text stays crisp for OCR."""
    base = img.convert("RGB")
    w, h = base.size
    # Coarse grain (generated at 1/3 res then upscaled) compresses far better than
    # full-res noise → file lands in the 100KB–2MB "proceed" window, not the >2MB
    # resize path, while still clearing the 100KB min gate.
    small = Image.effect_noise((w // 3, h // 3), 30).convert("L").resize((w, h))
    noise_rgb = Image.merge("RGB", (small, small, small))
    return Image.blend(base, noise_rgb, 0.09)


def line(d, x, y, text, f, fill=INK):
    d.text((x, y), text, font=f, fill=fill)


def border(d, w, h, margin=40):
    d.rectangle([margin, margin, w - margin, h - margin], outline=(120, 120, 120), width=3)


# ── Document builders ────────────────────────────────────────────────────────
def build_ua_birth_printed(f_title, f_h, f_b) -> "Image.Image":
    img, d = new_page()
    w, h = img.size
    border(d, w, h)
    line(d, 360, 90, "СВІДОЦТВО ПРО НАРОДЖЕННЯ", f_title)
    line(d, 470, 150, "(повторне)", f_b)
    y = 280
    rows = [
        ("Прізвище:", "ШЕВЧЕНКО"),
        ("Ім'я:", "ТАРАС"),
        ("По батькові:", "ГРИГОРОВИЧ"),
        ("Дата народження:", "15.01.1990"),
        ("Місце народження:", "смт Вишневе"),
        ("Стать:", "чоловіча"),
    ]
    for label, val in rows:
        line(d, 90, y, label, f_h)
        line(d, 540, y, val, f_b)
        y += 90
    y += 40
    line(d, 90, y, "Орган реєстрації:", f_h); line(d, 540, y, "РАЦС", f_b); y += 90
    line(d, 90, y, "Місце реєстрації:", f_h); line(d, 540, y, "Київська область", f_b)
    line(d, 90, h - 160, "Серія та номер: I-СН No 000000 (зразок)", f_b)
    return img


def build_ru_printed(f_title, f_h, f_b) -> "Image.Image":
    img, d = new_page()
    w, h = img.size
    border(d, w, h)
    # Russian-only orthographic markers Ы Э Ё Ъ deliberately present.
    line(d, 420, 90, "СВИДЕТЕЛЬСТВО", f_title)
    line(d, 470, 150, "(образец)", f_b)
    y = 300
    rows = [
        ("Фамилия:", "СОЛОВЬЁВ"),
        ("Имя:", "ЭДУАРД"),
        ("Отчество:", "ИЛЬЁВИЧ"),
        ("Дата:", "02.19.2003"),
        ("Место:", "город Подъездный"),
        ("Признак:", "мужской"),
    ]
    for label, val in rows:
        line(d, 100, y, label, f_h)
        line(d, 520, y, val, f_b)
        y += 95
    line(d, 100, h - 200, "Маркеры письма: Ы Э Ё Ъ", f_b)
    return img


def _td3_check_digit(s: str) -> str:
    """ICAO 9303 TD3 check digit: weights 7,3,1; A=10..Z=35; '<'=0."""
    weights = [7, 3, 1]
    total = 0
    for i, ch in enumerate(s):
        if ch.isdigit():
            v = int(ch)
        elif ch == "<":
            v = 0
        else:
            v = ord(ch.upper()) - 55  # A->10
        total += v * weights[i % 3]
    return str(total % 10)


def _td3_mrz() -> tuple[str, str]:
    """Build a valid 2x44 TD3 MRZ with correct check digits. Synthetic identity."""
    # Line 1: P<ISSUER + names
    issuer = "UKR"
    name = "SHEVCHENKO<<TARAS<HRYHOROVYCH"
    l1 = ("P<" + issuer + name).ljust(44, "<")[:44]
    # Line 2 fields
    passport_no = "FH123456"                      # 9 chars
    passport_no_f = passport_no.ljust(9, "<")
    cd_passport = _td3_check_digit(passport_no_f)
    nationality = "UKR"
    dob = "900115"                                # YYMMDD
    cd_dob = _td3_check_digit(dob)
    sex = "M"
    expiry = "300114"
    cd_exp = _td3_check_digit(expiry)
    optional = "".ljust(14, "<")
    cd_opt = _td3_check_digit(optional)
    composite_src = (
        passport_no_f + cd_passport + dob + cd_dob + expiry + cd_exp + optional + cd_opt
    )
    cd_composite = _td3_check_digit(composite_src)
    l2 = (
        passport_no_f + cd_passport + nationality + dob + cd_dob + sex + expiry
        + cd_exp + optional + cd_opt + cd_composite
    )
    l2 = l2.ljust(44, "<")[:44]
    return l1, l2


def build_ua_passport_mrz(f_title, f_h, f_b, f_mono) -> "Image.Image":
    img, d = new_page()
    w, h = img.size
    border(d, w, h)
    line(d, 300, 80, "PASSPORT / ПАСПОРТ — UKRAINE", f_title)
    y = 240
    rows = [
        ("Surname / Прізвище:", "SHEVCHENKO"),
        ("Given names / Ім'я:", "TARAS HRYHOROVYCH"),
        ("Passport No.:", "FH123456"),
        ("Nationality:", "UKR"),
        ("Date of birth:", "15 JAN 1990"),
        ("Date of expiry:", "14 JAN 2030"),
        ("Sex:", "M"),
    ]
    for label, val in rows:
        line(d, 90, y, label, f_h)
        line(d, 640, y, val, f_b)
        y += 85
    # MRZ band — monospace, dark on light, two 44-char lines.
    l1, l2 = _td3_mrz()
    band_top = h - 320
    d.rectangle([60, band_top, w - 60, band_top + 180], outline=(60, 60, 60), width=2)
    line(d, 80, band_top + 35, l1, f_mono)
    line(d, 80, band_top + 100, l2, f_mono)
    return img


def build_ambiguous_script(f_title, f_h, f_b) -> "Image.Image":
    img, d = new_page()
    w, h = img.size
    border(d, w, h)
    # PETROVA — every letter (П Е Т Р О В А) exists identically in uk AND ru.
    line(d, 430, 90, "ДОВІДКА / СПРАВКА", f_title)
    y = 320
    rows = [
        ("Прізвище / Фамилия:", "ПЕТРОВА"),
        ("Ім'я / Имя:", "ОЛЕНА"),
        ("Документ:", "ПАСПОРТ"),
    ]
    for label, val in rows:
        line(d, 100, y, label, f_h)
        line(d, 620, y, val, f_b)
        y += 110
    line(d, 100, h - 220, "Скрипт неоднозначний (uk/ru спільні літери)", f_b)
    return img


def build_handwritten_critical(f_title, f_h, f_b, f_hand) -> "Image.Image":
    img, d = new_page()
    w, h = img.size
    border(d, w, h)
    line(d, 360, 90, "СВІДОЦТВО ПРО НАРОДЖЕННЯ", f_title)
    y = 300
    # Printed fields …
    line(d, 90, y, "Прізвище:", f_h); line(d, 540, y, "КОВАЛЕНКО", f_b); y += 95
    line(d, 90, y, "Ім'я:", f_h);     line(d, 540, y, "ОКСАНА", f_b);    y += 95
    # … with the CRITICAL date rendered in the handwriting-proxy font.
    line(d, 90, y, "Дата народження:", f_h)
    line(d, 540, y - 6, "07.03.1985", f_hand, fill=(15, 30, 90))  # blue "ink"
    y += 110
    line(d, 90, y, "Місце народження:", f_h); line(d, 540, y, "місто Львів", f_b)
    line(d, 90, h - 180, "Критичне поле (дата) — рукописний шрифт-проксі", f_b)
    return img


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    f_title = font(_BOLD_CANDIDATES, 38)
    f_h = font(_BOLD_CANDIDATES, 34)
    f_b = font(_PRINTED_CANDIDATES, 36)
    f_mono = font(_MONO_CANDIDATES, 26)
    f_hand = font(_HAND_CANDIDATES, 46)

    if not _cyrillic_renders(f_b):
        print("ERROR: chosen printed font does not render Cyrillic glyphs (tofu).",
              file=sys.stderr)
        return 2
    if not _cyrillic_renders(f_hand):
        print("WARNING: handwriting font does not render Cyrillic — date stays Latin "
              "digits, which is acceptable for this fixture.", file=sys.stderr)

    artifacts = {
        "ua_birth_printed.png": build_ua_birth_printed(f_title, f_h, f_b),
        "ru_printed.png": build_ru_printed(f_title, f_h, f_b),
        "ua_passport_mrz.png": build_ua_passport_mrz(f_title, f_h, f_b, f_mono),
        "ambiguous_script.png": build_ambiguous_script(f_title, f_h, f_b),
        "handwritten_critical.png": build_handwritten_critical(f_title, f_h, f_b, f_hand),
    }

    ok = True
    for name, img in artifacts.items():
        path = OUT_DIR / name
        img = _add_paper_grain(img)  # scan-realistic grain → PNG >100KB (vision-extract min_bytes gate)
        img.save(path, "PNG")
        size = path.stat().st_size
        # The route rejects <100KB as needs_better_scan (IMAGE_QUALITY_RULES.min_bytes_for_extraction).
        status = "ok" if size > 105_000 else "SUSPICIOUS (below the 100KB OCR gate)"
        if size <= 105_000:
            ok = False
        print(f"  wrote {path.relative_to(ROOT)}  {size} bytes  [{status}]")

    # MRZ self-check echo (so a reader can confirm the check digits are real).
    l1, l2 = _td3_mrz()
    print("\n  TD3 MRZ line 1:", l1)
    print("  TD3 MRZ line 2:", l2)
    print(f"\n{'OK' if ok else 'FAIL'}: {len(artifacts)} synthetic PNGs generated in "
          f"{OUT_DIR.relative_to(ROOT)}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
