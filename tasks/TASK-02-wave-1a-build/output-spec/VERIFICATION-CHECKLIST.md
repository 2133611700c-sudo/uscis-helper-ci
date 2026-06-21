# Verification checklist — run after deploy

Save all output to `/tmp/wave-1a-verification.txt`.

## 1. Local build green

```bash
cd /Users/sergiiivanenko/work/uscis-helper
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web build
```

All 3 commands must exit 0.

## 2. Brand safety greps (must return EMPTY)

```bash
grep -RE "USCIS Helper" apps/web/app apps/web/components apps/web/messages
grep -RE "AI-powered|AI-assisted|AI lawyer|AI legal advice" apps/web/app apps/web/components apps/web/messages
grep -RE "Certified Translation" apps/web/messages
```

If any returns lines → HARD STOP, fix before commit.

## 3. i18n key parity (must return EMPTY diffs)

```bash
jq -r 'paths(scalars) | join(".")' apps/web/messages/en.json | sort > /tmp/en.keys
for loc in ru uk es; do
  jq -r 'paths(scalars) | join(".")' apps/web/messages/$loc.json | sort > /tmp/$loc.keys
  echo "=== diff en vs $loc ==="
  diff /tmp/en.keys /tmp/$loc.keys
done
```

## 4. Production HTTP checks (80 routes)

```bash
echo "=== Static pages ===" >> /tmp/wave-1a-verification.txt
for locale in en ru uk es; do
  for path in "" /services /about /contact /faq /privacy /terms /disclaimer; do
    code=$(curl -sI "https://messenginfo.com/$locale$path" | head -1)
    echo "/$locale$path -> $code" >> /tmp/wave-1a-verification.txt
  done
done

echo "=== Service pages ===" >> /tmp/wave-1a-verification.txt
for locale in en ru uk es; do
  for slug in parole-expires-soon re-parole-u4u tps-ukraine ead-work-permit \
              i-94 uscis-case-status payment-problem biometrics rfe-denial \
              translate-document form-draft-helper official-sources; do
    code=$(curl -sI "https://messenginfo.com/$locale/services/$slug" | head -1)
    echo "/$locale/services/$slug -> $code" >> /tmp/wave-1a-verification.txt
  done
done
```

Count `200 OK` lines:
```bash
grep -c "200 OK" /tmp/wave-1a-verification.txt
```
Must be ≥ 80.

## 5. Mobile bottom bar present

```bash
curl -s -A "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" \
  https://messenginfo.com/en | grep -c 'data-mobile-bar="true"'
```
Must be > 0.

## 6. Service cards rendered (≥ 12)

```bash
curl -s https://messenginfo.com/en | grep -oc 'data-service-card'
```
Must be ≥ 12.

Add `data-service-card="true"` attribute to each ServiceCard component for this check.

## 7. Case Status Checker present

```bash
curl -s https://messenginfo.com/en | grep -c 'id="case-status"'
```
Must be ≥ 1.

## 8. Receipt NOT in any URL params

```bash
# Search build output for any sign of receipt being sent server-side
grep -rE "receipt=" apps/web/app apps/web/components 2>/dev/null
```
Must be empty.

## 9. Disclaimer rendered

```bash
curl -s https://messenginfo.com/en | grep -c "not a law firm"
```
Must be ≥ 1.

## 10. Translate page safe statement

```bash
curl -s "https://messenginfo.com/en/services/translate-document" | grep -c "8 CFR\|certified translation"
```
Must be ≥ 1 (case-insensitive search recommended; use `grep -ci`).

## 11. Security headers present

```bash
curl -sI https://messenginfo.com/en | grep -iE "strict-transport-security|x-content-type|x-frame|referrer-policy|permissions-policy"
```
Must show all 5 headers.

## 12. No www on canonical

```bash
curl -sI https://www.messenginfo.com/ | head -3
```
Must show 301 redirect to `https://messenginfo.com/`.

## 13. Sitemap valid

```bash
curl -s https://messenginfo.com/sitemap.xml | grep -c "<url>"
```
Must be ≥ 80.

## 14. robots.txt present

```bash
curl -s https://messenginfo.com/robots.txt | head -5
```
Must show `User-agent: *` and `Allow: /` (and disallow `/api/`).

## 15. Manifest valid

```bash
curl -s https://messenginfo.com/manifest.webmanifest | jq .name
```
Must return `"Messenginfo"`.

## 16. OG image present

```bash
curl -sI https://messenginfo.com/og/messenginfo-og.png | head -3
```
Must show 200 and `content-type: image/png`.

## 17. Favicon present

```bash
curl -sI https://messenginfo.com/favicon.ico | head -3
```
Must show 200.

---

## Pass criteria

All 17 checks must pass. If any fail → list in final report under "Issues" with exact output.
