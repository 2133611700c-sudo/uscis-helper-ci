#!/bin/bash
# Booklet Stability Test — 10-run canonical dataset
# Ground truth (synthetic — replace with real values via E2E_EXPECTED_* env vars):
#   surname = Іваненко
#   given_name = Іван
#   patronymic = Тарасович
#   DOB = 01.01.1990 (1990-01-01)
#   city = Тростянець
#   province = Вінницька обл.

set -euo pipefail
export PATH="/opt/homebrew/bin:$PATH"

BASE_URL="${1:-http://localhost:3000}"
IMAGE="/Users/sergiiivanenko/work/uscis-helper/qa-shots/private/booklet_test_resized.jpg"
RUNS="${2:-10}"
OUT_DIR="/Users/sergiiivanenko/work/uscis-helper/reports/booklet-stability-$(date +%Y%m%d-%H%M%S)"

mkdir -p "$OUT_DIR"

echo "=== BOOKLET STABILITY TEST ==="
echo "Image: $IMAGE"
echo "MD5: $(md5 -q "$IMAGE")"
echo "Server: $BASE_URL"
echo "Runs: $RUNS"
echo "Output: $OUT_DIR"
echo ""

# Header for CSV
echo "run,surname,city,province,patronymic,crossref_status,field_count,latency_ms,dob" > "$OUT_DIR/results.csv"

for i in $(seq 1 $RUNS); do
  echo "--- Run $i/$RUNS ---"
  START=$(python3 -c 'import time; print(int(time.time()*1000))')

  RESP=$(curl -s -w "\n%{http_code}" \
    -X POST "$BASE_URL/api/tps/ocr/extract" \
    -F "file=@$IMAGE;type=image/jpeg" \
    -F "docHint=booklet" \
    --max-time 90 2>/dev/null || echo "CURL_FAILED")

  END=$(python3 -c 'import time; print(int(time.time()*1000))')
  LATENCY=$((END - START))

  HTTP_CODE=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')

  # Save raw response
  echo "$BODY" > "$OUT_DIR/run_${i}.json"

  if [ "$HTTP_CODE" != "200" ]; then
    echo "  HTTP $HTTP_CODE — FAILED"
    echo "$i,ERROR,ERROR,ERROR,ERROR,http_$HTTP_CODE,0,$LATENCY,ERROR" >> "$OUT_DIR/results.csv"
    continue
  fi

  # Extract fields with node
  PARSED=$(echo "$BODY" | node -e '
    const fs = require("fs");
    const data = JSON.parse(fs.readFileSync("/dev/stdin","utf8"));
    const fields = data.module?.fields || [];
    const get = (f) => {
      const found = fields.find(x => x.field === f);
      return found ? (found.normalized_value || found.raw_value || "NULL") : "NOT_FOUND";
    };
    console.log(JSON.stringify({
      surname: get("family_name"),
      city: get("city_of_birth"),
      province: get("province_of_birth"),
      patronymic: get("middle_name"),
      dob: get("dob"),
      crossref: data.crossref_status || "n/a",
      count: data.final_field_count || 0,
      route_ms: data.route_total_ms || 0,
    }));
  ' 2>/dev/null || echo '{"surname":"PARSE_ERR"}')

  SURNAME=$(echo "$PARSED" | node -e 'console.log(JSON.parse(require("fs").readFileSync("/dev/stdin","utf8")).surname)')
  CITY=$(echo "$PARSED" | node -e 'console.log(JSON.parse(require("fs").readFileSync("/dev/stdin","utf8")).city)')
  PROVINCE=$(echo "$PARSED" | node -e 'console.log(JSON.parse(require("fs").readFileSync("/dev/stdin","utf8")).province)')
  PATRONYMIC=$(echo "$PARSED" | node -e 'console.log(JSON.parse(require("fs").readFileSync("/dev/stdin","utf8")).patronymic)')
  DOB=$(echo "$PARSED" | node -e 'console.log(JSON.parse(require("fs").readFileSync("/dev/stdin","utf8")).dob)')
  CROSSREF=$(echo "$PARSED" | node -e 'console.log(JSON.parse(require("fs").readFileSync("/dev/stdin","utf8")).crossref)')
  FCOUNT=$(echo "$PARSED" | node -e 'console.log(JSON.parse(require("fs").readFileSync("/dev/stdin","utf8")).count)')
  ROUTE_MS=$(echo "$PARSED" | node -e 'console.log(JSON.parse(require("fs").readFileSync("/dev/stdin","utf8")).route_ms)')

  echo "  surname=$SURNAME | city=$CITY | province=$PROVINCE"
  echo "  patronymic=$PATRONYMIC | dob=$DOB | crossref=$CROSSREF"
  echo "  fields=$FCOUNT | latency=${ROUTE_MS}ms (total ${LATENCY}ms)"
  echo "$i,$SURNAME,$CITY,$PROVINCE,$PATRONYMIC,$CROSSREF,$FCOUNT,$ROUTE_MS,$DOB" >> "$OUT_DIR/results.csv"
  echo ""
done

echo "=== RESULTS ==="
column -t -s',' "$OUT_DIR/results.csv"
echo ""
echo "Raw responses saved to: $OUT_DIR/"
