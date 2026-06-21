# Messenginfo Operator Runbook

Single document for operating the TPS Ukraine and Re-Parole services.
Replaces what the original task pack called "phase 18 disaster recovery"
and "phase 20 operator documentation" — both are just sections here,
not separate work tracks.

Last updated: 2026-05-11.

## Quick links

- Production: https://messenginfo.com
- TPS Ukraine wizard: https://messenginfo.com/ru/services/tps-ukraine/start
- Vercel project: `prj_G5Bwd5VMDqEMdbPKLlQW50aF3pQq`
- Repo: `/Users/sergiiivanenko/work/uscis-helper`
- Public health probe: https://messenginfo.com/api/tps/health
- Gated ops health: `curl -H 'x-health-token: $HEALTH_TOKEN' https://messenginfo.com/api/health`
- Admin manual-review queue: https://messenginfo.com/admin/manual-review

## Rollback (production broken)

### Fastest — Vercel deployment promote

1. `vercel ls --token=$VERCEL_TOKEN | head -10` — find the last READY
   deployment whose SHA you trust.
2. `vercel promote <DEPLOYMENT_ID> --token=$VERCEL_TOKEN` — promotes
   that deployment to production-alias.
3. Confirm: `curl -s https://messenginfo.com/api/tps/health | jq .sha`
   should now show the rolled-back SHA.

### Slower — git revert + push

1. `cd /Users/sergiiivanenko/work/uscis-helper`
2. `git revert HEAD --no-edit && git push origin main`
3. Wait for Vercel deployment, verify `/api/tps/health` SHA.

### "Disable TPS service temporarily"

There is no kill-switch env var today. The fastest disable is to roll
back to a previous deployment via the Vercel approach above. If a kill
switch is needed routinely, add `NEXT_PUBLIC_TPS_DISABLED=1` env var
and gate the TPS routes/components in a single commit — but until that
ships, the runbook path is rollback.

### Per-feature rollback handles (each new safety/UX layer has one)

| Layer | Commit | Rollback handle | Effect of rollback |
|---|---|---|---|
| Source-script gate (ambiguous name → review) | 8cc7c72 | `vercel env rm RU_TRANSLIT_ENABLED production` + redeploy | Reverts to legacy KMU-55-for-all (no ambiguity review, no RU romanization). Env flip, no code revert. |
| Geo gazetteer → КАТОТТГ (458) | 02871f5 | `git revert 02871f5 && git push` | Restores the 60-item seed. NOTE: currently INERT in prod — snapCity fires only behind `SMART_NORMALIZE_ENABLED` (OFF). |
| Mirror translation PDF | 892d404 | `vercel env rm MIRROR_PDF_ENABLED production` + redeploy | Clients get the generic certification PDF for all doc types. Env flip, no code revert. |

These are env-flip-first by design: only the gazetteer needs a code revert, and it is currently inert in prod anyway.

### Known good commits (update on each ship)

- `bdddaf0` — CB.1 privacy fixes (cleanup cron + Clear-data button)
- `0699e87` — CB.2 legal-risk routing UI
- `756b1e1` — CB.3 manual fallback wiring
- `be2240c` — CB.4 output-contract drift fixes (lockbox + I-912 honesty)
- `d29e1da` — CB.6 PDF SHA256 integrity guard
- `09f4892` — CB.5 i18n drift + forbidden-claims guards

## Operations

### Refresh USCIS forms (when USCIS publishes a new edition)

USCIS form editions change roughly twice a year. The runtime hash guard
(`lib/tps/formIntegrity.ts`) will throw `PDF tampered or replaced` on
the first request after an unverified PDF swap — fail loud is the
intended behaviour.

Procedure when a refresh is needed:

1. `bash scripts/uscis/refresh_tps_forms.sh` (or download manually from
   uscis.gov and run `qpdf --linearize --object-streams=disable` on
   each new file; the existing PDFs were normalised the same way).
2. `for f in apps/web/public/uscis/tps/*.pdf apps/web/public/uscis/reparole/*.pdf; do echo "$f $(sha256sum "$f" | awk '{print $1}')"; done`
3. Update `apps/web/src/lib/tps/formIntegrity.ts` — `PINNED_HASHES` map.
4. Update `apps/web/src/lib/tps/forms/{i821,i765}FieldMap.ts` and
   `apps/web/src/lib/reparole/i131FieldMap.ts` — these are pinned to
   specific editions; renamed fields will break silently otherwise.
5. Update `docs/uscis/forms/tps/forms_manifest.json` — bump SHA, edition,
   page count, downloaded_at_utc, snapshot_date.
6. Update `apps/web/src/app/api/tps/health/route.ts` — `FORM_META`
   block.
7. `pnpm --filter web typecheck && pnpm --filter web test && pnpm --filter web build` — both
   the existing `forms manifest edition drift guard` test and the new
   `formIntegrity` test must pass.
8. Commit + push + verify `/api/tps/health` shows new editions on prod.

### Verify OCR locally (quick smoke)

```
# Health probe — should return ocr_configured: true
curl -s https://messenginfo.com/api/tps/health | jq .ocr_configured

# Local synthetic passport
cd /Users/sergiiivanenko/work/uscis-helper
python3 test-fixtures/gen_synthetic_passport.py
curl -F "file=@test-fixtures/synthetic-passport.jpg" \
     -F "doc_type_hint=passport" \
     http://localhost:3000/api/tps/ocr/extract | jq .
```

### Generate proof ZIP (end-to-end packet smoke)

```
# Start dev server: pnpm --filter web dev
# Then in another shell:
curl -X POST http://localhost:3000/api/tps/generate-packet \
  -H 'Content-Type: application/json' \
  -d @test-fixtures/synthetic-tps-answers.json \
  -o /tmp/tps-packet.zip

unzip -l /tmp/tps-packet.zip
# Expected: I-821.pdf, I-765.pdf (if wants_ead=true), README.txt
```

### Read pypdf field dump from a generated PDF

```
python3 - <<'PY'
import pypdf
r = pypdf.PdfReader("/tmp/I-821.pdf")
print("Pages:", len(r.pages))
print("---")
for name, val in (r.get_form_text_fields() or {}).items():
    if val:
        print(f"{name} = {val!r}")
PY
```

### Live post-deploy smoke (manual)

```
# After every prod push:
SHA=$(git rev-parse HEAD)
curl -s https://messenginfo.com/api/tps/health | jq .
# Confirm sha == $SHA
# Confirm forms.i821.edition == 01/20/25, sha256 matches PINNED_HASHES
# Confirm ocr_configured: true

# Smoke the locale pages
for L in ru uk en es; do
  echo -n "/$L/services/tps-ukraine/start: "
  curl -s -o /dev/null -w "%{http_code}\n" "https://messenginfo.com/$L/services/tps-ukraine/start"
done
# All 5 should be 200.
```

### Handle a failed user upload (operator)

User reports OCR did not work or fields were wrong. They either clicked
the "Нужна помощь / I need help" CTA (creates a row in
`manual_review_queue` with their email) or wrote to support@.

1. Open `https://messenginfo.com/admin/manual-review` (uses Supabase
   service_role; cookies handled by middleware).
2. Find the row — `doc_type='tps_ukraine_help_request'` rows are TPS.
3. Reply to the user's email. Common templates:
   - **"OCR could not read your document"** — ask them to retake on a
     dark surface, good light, no shadows, full page in frame.
   - **"OCR read a field wrong"** — point them at the "Изменить" button
     on the review row.
   - **"Where do I mail my packet?"** — point at the README inside the
     ZIP they downloaded; if missing, USCIS Ukraine TPS page
     (https://www.uscis.gov/humanitarian/temporary-protected-status/TPS-Ukraine).
   - **"Am I eligible for TPS?"** — DO NOT give an answer. Reply:
     "Messenginfo is not a law firm and cannot determine eligibility.
     Please consult a licensed immigration attorney or DOJ-accredited
     representative. USCIS lists how to find one at:
     https://www.uscis.gov/scams-fraud-and-misconduct/avoid-scams/find-legal-services"

### Delete a user's data on request (GDPR / SAR)

The TPS wizard does not persist any user PII server-side. Data lives in
the browser's localStorage and the user can wipe it with the
"Clear my data" button on the success screen.

For Re-Parole users (who DO have server-side `wizard_sessions` rows),
delete by session UUID:

```sql
-- Replace <SESSION_UUID> below
delete from public.wizard_sessions where id = '<SESSION_UUID>';
-- Cascade-deletes session_documents, extracted_fields, manual_answers,
-- generated_packets, audit_log entries linked to this session.
```

After deletion, also delete any packet ZIPs in the `packets` storage
bucket under that session_id:

```
# Via Supabase Studio: Storage → packets → <session_id>/ → Delete folder
# Or via CLI:
supabase storage delete packets/<session_id>/ --recursive
```

The daily cleanup cron (`/api/cron/cleanup`) sweeps expired sessions
automatically; manual deletion is only needed for user-requested early
removal.

## Monitoring (what to watch)

Today there is no Telegram daily summary wired (the env vars
`TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are not set; that part is
deferred to Phase E). The currently-available signals are:

- **Vercel logs** — search for `[google-vision]`, `[tps/manual-review]`,
  `[cron/cleanup]`, `[packet/generate]` labels. Filter to 4xx/5xx only
  for cost reasons.
- **Sentry** — errors from the TPS routes appear with breadcrumbs.
  Replay is configured with `maskAllText`/`maskAllInputs`/`blockAllMedia`
  so no PII shows.
- **`/api/tps/health`** — hit from external uptime monitor at 1-minute
  cadence. Alert if HTTP non-200 or `ok != true`.
- **Supabase Studio** — `manual_review_queue` table:
  `select count(*) from manual_review_queue where status='pending';`
  spikes mean OCR is failing more than usual.

## When something looks wrong

| Symptom | First place to look |
|---|---|
| TPS wizard 500s on generate | Vercel logs `[tps/generate-packet]` and Sentry for `WinAnsi`, `instanceof`, `XFA`, `PDF tampered` |
| OCR returns 415 / 413 | User uploaded HEIC/HEIF (now allowed) or >10 MB file |
| Lockbox in Checker says "unknown" | User typed a non-US state code; ask them to verify in 2-letter format |
| Form integrity error in logs | A PDF in `apps/web/public/uscis/` was replaced without updating `PINNED_HASHES` + field map. Roll back, then follow refresh procedure. |
| Re-Parole packet generation fails | Check `/api/packet/generate` — does Supabase Storage `packets/` bucket exist? Run the cleanup cron once to clear old objects. |

## Privacy contract reminder

- TPS OCR upload: image bytes go to Google Cloud Vision, are NOT stored
  by us, GC'd after the response.
- TPS generate-packet: ZIP is streamed back, NOT persisted server-side.
- TPS PII (typed by user): browser localStorage only, wiped by
  "Clear my data" button.
- Re-Parole: `wizard_sessions.state_json` holds PII for 90 days
  (cron-purged); `packets/` bucket holds filled ZIPs for 7 days
  (cron-purged).
- No PII in console logs, Sentry breadcrumbs, GA4, or PostHog.

If a finding contradicts any of this, treat it as a P0 — see
`test-fixtures/proof/SECURITY_PRIVACY_AUDIT.report.yaml` for the
baseline.
