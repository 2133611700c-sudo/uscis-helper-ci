# DNS Setup: messenginfo.com on Cloudflare

Domain: `messenginfo.com`
Registrar/DNS: Cloudflare
Email provider: Resend (`noreply@messenginfo.com`)
Site hosting: Vercel (already connected — do not touch A/CNAME records for the apex/www)

---

## Overview

You need 5 DNS records to send transactional email via Resend without landing in spam:

| Purpose | Type | Added where |
|---------|------|-------------|
| Email routing (MX) | MX | Cloudflare |
| SPF | TXT | Cloudflare |
| DKIM (×2 records) | TXT | Cloudflare — values from Resend dashboard |
| DMARC | TXT | Cloudflare |

---

## Step 1: Add messenginfo.com to Resend

1. Go to [resend.com/domains](https://resend.com/domains) → **Add Domain**
2. Enter `messenginfo.com` → select region **US East (us-east-1)**
3. Resend will show you the exact DKIM TXT record values — copy them, you will need them in Step 3.

---

## Step 2: Navigate to Cloudflare DNS

1. Log in at [dash.cloudflare.com](https://dash.cloudflare.com)
2. Select domain **messenginfo.com**
3. Left sidebar → **DNS** → **Records**
4. Use **Add record** for each entry below

---

## Step 3: Add all DNS records

### MX — inbound routing for Resend

| Field | Value |
|-------|-------|
| Type | `MX` |
| Name | `@` |
| Mail server | `feedback-smtp.us-east-1.amazonses.com` |
| Priority | `10` |
| TTL | `Auto` |
| Proxy status | **DNS only** (grey cloud — MX must never be proxied) |

---

### SPF — authorize Resend to send from your domain

| Field | Value |
|-------|-------|
| Type | `TXT` |
| Name | `@` |
| Content | `v=spf1 include:amazonses.com ~all` |
| TTL | `Auto` |

> If you already have an SPF record for `@`, **edit** it rather than adding a second one. Merge the `include` values into a single TXT record. Multiple SPF records on the same name cause failures.

---

### DKIM — cryptographic sender signature (2 records from Resend)

After adding the domain in Resend, the dashboard shows two DKIM CNAME or TXT records like:

```
resend._domainkey.messenginfo.com  →  <value from Resend>
```

Exact values vary per account. Copy each one from **Resend → Domains → messenginfo.com → DNS Records**.

For each record Resend provides:

| Field | Value |
|-------|-------|
| Type | `TXT` (or `CNAME` if Resend shows CNAME) |
| Name | exact subdomain shown in Resend (e.g. `resend._domainkey`) |
| Content | exact value shown in Resend — do not alter |
| TTL | `Auto` |
| Proxy status | **DNS only** |

---

### DMARC — policy and abuse reporting

| Field | Value |
|-------|-------|
| Type | `TXT` |
| Name | `_dmarc` |
| Content | `v=DMARC1; p=none; rua=mailto:dmarc@messenginfo.com` |
| TTL | `Auto` |

> `p=none` is monitoring-only. Once you confirm clean delivery over 2–4 weeks, harden to `p=quarantine` then `p=reject`.

---

## Step 4: Verify propagation

Check from terminal after saving records (allow up to 15 minutes on Cloudflare):

```bash
# SPF
dig TXT messenginfo.com +short

# DMARC
dig TXT _dmarc.messenginfo.com +short

# MX
dig MX messenginfo.com +short

# DKIM — replace 'resend._domainkey' with the actual subdomain from Resend
dig TXT resend._domainkey.messenginfo.com +short
```

Expected SPF output contains `include:amazonses.com`.
Expected DMARC output starts with `v=DMARC1`.

---

## Step 5: Verify in Resend dashboard

1. **Resend → Domains → messenginfo.com**
2. Click **Verify DNS Records**
3. All records should turn green. If DKIM is still pending, wait 5–10 minutes and retry.
4. Once verified, send a test email from Resend to a Gmail address and check **Show original → Authentication-Results** — should show `dkim=pass`, `spf=pass`, `dmarc=pass`.

---

## Gotchas

- **Do not proxy MX through Cloudflare** (orange cloud). MX records must be DNS-only.
- **Do not add two SPF records** on the same name. Merge into one.
- **Vercel records are already in place** — do not modify or delete the A/AAAA/CNAME records Vercel added for `@` and `www`.
- DKIM values are account-specific — they cannot be guessed. Always copy from Resend dashboard.
- If `dig` is not available on your machine: use [toolbox.googleapps.com/apps/dig/](https://toolbox.googleapps.com/apps/dig/) or `nslookup -type=TXT messenginfo.com`.
