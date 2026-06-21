# Messenginfo Monitoring Runbook

## Scope
Monitoring behavior for `https://messenginfo.com` with intentional anti-bot middleware.

## Current behavior (VERIFIED 2026-05-06)
- Public pages block default `curl/*` User-Agent with `403 Forbidden` by design.
- Browser-like User-Agent reaches public pages successfully (`200`).
- `https://www.messenginfo.com` redirects to apex and then serves content.
- `/api/health` exists and returns `404` without `x-health-token` by design.

## Do not use for uptime
- Raw command:
```bash
curl -I https://messenginfo.com/en
```
- Expected result: `403` (this is not downtime).

## Use for public-page uptime
```bash
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
curl -I -A "$UA" https://messenginfo.com/en
curl -Ls -A "$UA" -o /dev/null -w "%{url_effective} %{http_code}\n" https://www.messenginfo.com
```

## Use for machine health checks
- Endpoint: `/api/health`
- Requirement: header `x-health-token: <HEALTH_TOKEN>`
- Without token, `404` is expected and correct.
- With token, expected `200` JSON with `ok: true`.

```bash
# no token -> expected 404
curl -i https://messenginfo.com/api/health

# with token from secret manager/env (do not print token)
curl -sS -H "x-health-token: $HEALTH_TOKEN" https://messenginfo.com/api/health
```

Expected safe response shape:
```json
{
  "ok": true,
  "ts": "2026-05-06T08:38:03.952Z",
  "db": true
}
```

## Monitoring policy
1. Page-level uptime checks must use browser-like User-Agent.
2. Infrastructure/app health checks must use `/api/health` with token.
3. Alerting must classify `raw curl 403` as `EXPECTED_BOT_BLOCK`, not outage.
