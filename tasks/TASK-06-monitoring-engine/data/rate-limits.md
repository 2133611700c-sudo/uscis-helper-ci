# Rate Limits

Agent must respect these limits in all monitoring scripts. Exceeding them risks IP bans or API key revocation.

## USCIS (uscis.gov)

- No published API limit
- Self-imposed: 1 request per 2 seconds
- Add `await sleep(2000)` between requests in scripts that hit USCIS pages
- User-Agent: include `Messenginfo Monitoring/1.0 (contact@messenginfo.com)` to identify

## Federal Register (federalregister.gov/api)

- Documented: 60 requests per minute
- Use 30/min for buffer
- Federal Register asks API users to set User-Agent identifying themselves
- On 429 response: exponential backoff (wait 60s 120s 240s 480s before giving up)
- Respect `Retry-After` header if present

## YouTube RSS (youtube.com/feeds/videos.xml)

- No documented limit (RSS feed)
- Informal limit: 100 requests per hour
- Use 50/hour for buffer
- 20 channels × daily check = 20 requests/day — well under limit
- Cache RSS responses for 6h to handle workflow re-runs

## CBP (cbp.gov)

- We do not monitor CBP automatically (only check I-94 dead links if any added later)
- If checking CBP pages: 1 req/2s same as USCIS

## Resend (resend.com/api)

- Free tier: 100 emails/day, 3000/month
- Daily digest = 1 email/day = plenty of headroom
- Even if all 5 workflows triggered manually same day = 5 emails << limit

## Supabase

- Free tier: 500 MB DB + 5 GB bandwidth/month + unlimited API calls (within reason)
- Insert volume estimated: ~50 alerts/day max = 18000/year << any limit

## NEVER scrape

These sites are off-limits:

- `egov.uscis.gov` (Case Status) — explicit ToS prohibition on scraping
- `i94.cbp.dhs.gov` — same; user-only retrieval
- `my.uscis.gov` — user account portal, not for automation
- Any USCIS site that requires login

## Backoff strategy

For all scripts that hit external APIs:

```typescript
async function withBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts = 5,
  initialDelay = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (e: any) {
      if (attempt === maxAttempts - 1) throw e
      const delay = initialDelay * Math.pow(2, attempt)
      console.warn(`Retry ${attempt + 1}/${maxAttempts} after ${delay}ms: ${e.message}`)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw new Error('unreachable')
}
```

## Workflow timeout

All workflows have `timeout-minutes: 5`. If a workflow runs > 5 min it's killed automatically — likely runaway scraping or stuck request.
