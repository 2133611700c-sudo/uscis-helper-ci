#!/usr/bin/env bash
# Production smoke for POST /api/tps/generate-packet.
#
# Run this AFTER every Vercel deploy that touches lib/tps/* or
# the official PDFs. Confirms the API returns a real ZIP with
# both forms, preserves edition stamps, and prefills critical
# fields. Exits non-zero on any failure.
#
# Usage:  scripts/uscis/smoke_tps_packet.sh [base_url]
#   default base_url is https://messenginfo.com
#
# Optional env: USCIS_SMOKE_FAMILY_NAME, USCIS_SMOKE_GIVEN_NAME
# (otherwise uses synthetic placeholders so no PII ever leaves CI).

set -euo pipefail

BASE_URL="${1:-https://messenginfo.com}"
FAMILY="${USCIS_SMOKE_FAMILY_NAME:-SMOKEFAMILY}"
GIVEN="${USCIS_SMOKE_GIVEN_NAME:-SMOKEGIVEN}"

UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36'
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "==> POST $BASE_URL/api/tps/generate-packet"
HTTP=$(curl -sS -L -A "$UA" \
  -X POST "$BASE_URL/api/tps/generate-packet" \
  -H 'Content-Type: application/json' \
  -D "$TMPDIR/headers.txt" \
  -o "$TMPDIR/packet.zip" \
  -w "%{http_code}" \
  -d "{
    \"family_name\":\"$FAMILY\",\"given_name\":\"$GIVEN\",\"middle_name\":\"SMOKEMID\",
    \"dob\":\"1980-01-15\",\"sex\":\"M\",
    \"country_of_birth\":\"Ukraine\",\"country_of_nationality\":\"Ukraine\",
    \"passport_number\":\"XX0000000\",\"passport_country_of_issuance\":\"Ukraine\",
    \"passport_expiration_date\":\"2030-12-31\",
    \"us_address_street\":\"100 Smoke St\",\"us_address_city\":\"Smokeville\",
    \"us_address_state\":\"CA\",\"us_address_zip\":\"90001\",
    \"mailing_same_as_physical\":true,
    \"last_entry_date\":\"2023-05-01\",\"i94_admission_number\":\"00000000001\",
    \"filing_path\":\"initial\",\"wants_ead\":true,\"ead_category\":\"a12\",
    \"daytime_phone\":\"5550000000\",\"email\":\"smoke@example.invalid\",
    \"has_criminal_concern\":false,\"has_prior_tps_denial\":false,
    \"left_us_without_advance_parole\":false
  }")

if [ "$HTTP" != "200" ]; then
  echo "FAIL: HTTP=$HTTP (expected 200)"
  echo "Response body:"
  cat "$TMPDIR/packet.zip"
  exit 1
fi

# Check Content-Type
CTYPE=$(grep -i '^content-type:' "$TMPDIR/headers.txt" | awk '{print tolower($2)}' | tr -d '\r')
case "$CTYPE" in
  application/zip*) ;;
  *) echo "FAIL: content-type=$CTYPE (expected application/zip)"; exit 1 ;;
esac

# Check X-TPS-* headers
applied_821=$(grep -i '^x-tps-i821-applied:' "$TMPDIR/headers.txt" | awk '{print $2}' | tr -d '\r')
applied_765=$(grep -i '^x-tps-i765-applied:' "$TMPDIR/headers.txt" | awk '{print $2}' | tr -d '\r')
skipped_821=$(grep -i '^x-tps-i821-skipped:' "$TMPDIR/headers.txt" | awk '{print $2}' | tr -d '\r')
skipped_765=$(grep -i '^x-tps-i765-skipped:' "$TMPDIR/headers.txt" | awk '{print $2}' | tr -d '\r')

if [ -z "$applied_821" ] || [ "$applied_821" -lt 20 ]; then
  echo "FAIL: I-821 applied=$applied_821 (expected >= 20)"
  exit 1
fi
if [ -z "$applied_765" ] || [ "$applied_765" -lt 15 ]; then
  echo "FAIL: I-765 applied=$applied_765 (expected >= 15)"
  exit 1
fi
if [ "${skipped_821:-0}" != "0" ]; then
  echo "FAIL: I-821 skipped=$skipped_821 (expected 0)"
  echo "First skip: $(grep -i '^x-tps-i821-first-skip:' "$TMPDIR/headers.txt")"
  exit 1
fi
if [ "${skipped_765:-0}" != "0" ]; then
  echo "FAIL: I-765 skipped=$skipped_765 (expected 0)"
  echo "First skip: $(grep -i '^x-tps-i765-first-skip:' "$TMPDIR/headers.txt")"
  exit 1
fi

# Unzip and confirm structure
mkdir -p "$TMPDIR/x"
unzip -q -d "$TMPDIR/x" "$TMPDIR/packet.zip"
[ -f "$TMPDIR/x/I-821.pdf" ] || { echo "FAIL: I-821.pdf missing"; exit 1; }
[ -f "$TMPDIR/x/I-765.pdf" ] || { echo "FAIL: I-765.pdf missing"; exit 1; }
[ -f "$TMPDIR/x/README.txt" ] || { echo "FAIL: README.txt missing"; exit 1; }

# Confirm edition stamps survived
# Use tmpfile to avoid pipefail interactions with pdftotext warnings.
pdftotext -layout "$TMPDIR/x/I-821.pdf" "$TMPDIR/i821.txt" 2>/dev/null || true
pdftotext -layout "$TMPDIR/x/I-765.pdf" "$TMPDIR/i765.txt" 2>/dev/null || true

if ! grep -q 'Form I-821 Edition 01/20/25' "$TMPDIR/i821.txt"; then
  echo "FAIL: I-821 edition stamp not found"
  exit 1
fi
if ! grep -q 'Form I-765 Edition 08/21/25' "$TMPDIR/i765.txt"; then
  echo "FAIL: I-765 edition stamp not found"
  exit 1
fi

# Confirm prefilled identity made it into the rendered PDF text
if ! grep -q "$FAMILY" "$TMPDIR/i821.txt"; then
  echo "FAIL: I-821 missing family name $FAMILY in rendered text"
  exit 1
fi
if ! grep -q '01/15/1980' "$TMPDIR/i821.txt"; then
  echo "FAIL: I-821 missing DOB 01/15/1980 in rendered text"
  exit 1
fi

echo "==> PASS"
echo "    HTTP 200, Content-Type=application/zip"
echo "    I-821: applied=$applied_821, skipped=$skipped_821"
echo "    I-765: applied=$applied_765, skipped=$skipped_765"
echo "    Edition stamps preserved"
echo "    Family name + DOB visible in rendered I-821"
exit 0
