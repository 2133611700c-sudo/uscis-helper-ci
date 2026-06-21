# Transkribus HTR — Live Test Status

**Date:** 2026-05-29
**Verdict so far:** NOT YET TESTED — blocked on a live auth token. No transcript has
ever been produced by our code. Any earlier "reads printed / garbage on handwriting"
claim was an overclaim and has been removed from `apps/web/src/lib/engine/htr.ts`.

## What was wrong before (root cause of the 500)

- Our `htr.ts` targeted the **legacy TrpServer** upload→ingest→PyLaia path. The
  PyLaia recognition trigger returned **HTTP 500 (ClassCastException on
  DocumentSelectionDescriptor)** — wrong request-body shape. See `/tmp/run.txt`.
- The correct API is **metagrapho / Processing API**: a single base64-inline
  `POST /processes` → poll `GET /processes/{id}` → `GET /processes/{id}/page`
  (PAGE XML). No upload dance. Now implemented as `metagraphoTranscribe()` /
  `metagraphoReader()` in `htr.ts`, and exercised by
  `apps/web/scripts/transkribus-bench.mjs`.

## The real blocker (proven with live API calls, 2026-05-29 ~10:54 UTC)

The account is **Google-OAuth federated** (readcoop realm). Tested every
non-browser path to mint a processing token — all fail right now:

| Path | Result |
|------|--------|
| `grant_type=password` (client_id=processing-api-client, creds from env) | `invalid_grant: Invalid user credentials` — the stored "password" is not a valid readcoop password (federated account) |
| `grant_type=refresh_token` (refresh from env) | `invalid_grant: Token is not active` — refresh token expired 10:10 UTC (~9.5h TTL from capture) |
| Stored access/proc tokens | EXPIRED (all three expire together) |

Account facts read from env: **plan=free, credits=50, API base=processing/v2**,
client_id=processing-api-client. 50 credits is enough for this bench.

Note: both the webui token AND the processing-api-client token carry
`aud:[TrpServer]` — so a **fresh browser token will very likely work on
processing/v2** with the correct base64 body. The prior 401 was a dead token.

## What unblocks it (owner, ~1 minute)

While logged into **app.transkribus.org**, open the browser console (F12 →
Console) and paste:

```js
// dumps every JWT-looking token Transkribus stored in this tab
Object.entries({...localStorage, ...sessionStorage})
  .flatMap(([k,v]) => { try { const o=JSON.parse(v); return [o.access_token, o.refresh_token, o.token, o.id_token].filter(Boolean).map(t=>[k,t]); } catch { return /^ey/.test(v)?[[k,v]]:[]; } })
  .forEach(([k,t]) => console.log(k, '\n', t, '\n'));
```

Copy the **access_token** (and **refresh_token** if shown — it buys ~9h of
autonomous re-minting) and paste them to me. Then I run the full bench
immediately and this file fills with the real per-model transcripts.

## Test matrix (ready to run)

Fixtures (`test-fixtures/real-docs/`):
- `birth_cert_handwritten_ivanenko.jpg` (handwritten)
- `marriage_1939_kharkiv_borodavka.jpg` (old handwritten)
- `military_id_p1_ivanenko.jpg` (printed+handwritten)

Models: 148545 (RU h/w+typed CER 5.54%), 144265 (UK h/w+typed CER 4.57%),
132853 (RU+UK XXI).
