#!/usr/bin/env bash
# Re-download all 7 TPS-related PDFs from official USCIS pages and regenerate
# the manifest + field inventories. Run when an Edition Date on uscis.gov
# changes.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TPS="$ROOT/docs/uscis/forms/tps"
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'

mkdir -p "$TPS/html" "$TPS/pdf"

# 1. Fetch official form pages
for slug in i-821 i-765 i-912; do
  curl -sS -L -A "$UA" -o "$TPS/html/$slug.html" "https://www.uscis.gov/$slug"
done
curl -sS -L -A "$UA" -o "$TPS/html/tps-ukraine.html" \
  "https://www.uscis.gov/humanitarian/temporary-protected-status/TPS-Ukraine"

# 2. Download PDFs
for FILE in i-821.pdf i-821instr.pdf i-765.pdf i-765instr.pdf i-765ws.pdf i-912.pdf i-912instr.pdf; do
  curl -sS -L -A "$UA" -o "$TPS/pdf/$FILE" \
    "https://www.uscis.gov/sites/default/files/document/forms/$FILE"
done

# 2.5 Normalize the three fillable PDFs with qpdf so pdf-lib can parse them.
# USCIS publishes forms as encrypted XFA-hybrid PDFs with inline object refs
# that pdf-lib refuses to walk. qpdf --decrypt rewrites the PDF without
# encryption and with object streams disabled — pdf-lib then loads cleanly.
# Edition stamps and form fields are preserved; only the wrapping changes.
if ! command -v qpdf >/dev/null 2>&1; then
  echo "qpdf not found — install with 'brew install qpdf' before continuing." >&2
  exit 1
fi
PUB="$ROOT/apps/web/public/uscis/tps"
mkdir -p "$PUB"
for FILE in i-821.pdf i-765.pdf i-912.pdf; do
  qpdf --password='' --decrypt --object-streams=disable \
    "$TPS/pdf/$FILE" "$PUB/$FILE.tmp"
  mv "$PUB/$FILE.tmp" "$PUB/$FILE"
done

# 3. Rebuild manifest + field inventories
python3 "$ROOT/scripts/uscis/build_manifest.py"
python3 "$ROOT/scripts/uscis/inventory_fields.py"

echo "Done. Review docs/uscis/forms/tps/forms_manifest.json — any 'mismatch' status blocks deploy."
