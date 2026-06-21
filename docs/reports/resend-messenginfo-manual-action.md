# Resend — messenginfo.com Setup: Manual Action Required

**Status:** DNS ready, Resend account not yet created  
**Date:** 2026-05-03  
**Blocked by:** Free plan 1-domain limit (handyandfriend.com already claimed)

---

## Context

- `messenginfo.com` is NOT verified in any Resend account
- `handyandfriend.com` is on the existing Resend Free plan (only 1 domain allowed)
- DKIM DNS TXT record (`resend._domainkey.messenginfo.com`) is already live in Cloudflare
- DMARC and SPF records are already present
- Contact form currently stores submissions in Supabase `audit_log` table — no email sent

---

## Steps to Enable Email (One-Time Manual Action)

### 1. Create a new Resend account

- Go to: https://resend.com/signup
- Sign in with Google using: `2133611700uscis@gmail.com`
- This must be a **new account**, separate from the handyandfriend account

### 2. Add domain messenginfo.com

- In the new account dashboard: **Domains → Add Domain**
- Enter: `messenginfo.com`

### 3. Verify DNS records

The following records are already in Cloudflare:

| Type | Name | Value |
|------|------|-------|
| TXT | `resend._domainkey` | `p=MIGfMA0GCSq...` (already set) |
| TXT | `@` | DMARC record (already set) |
| TXT | `@` | SPF record (already set) |

Click **Verify** in Resend — should pass immediately since DNS is ready.

### 4. Create an API key

- In Resend: **API Keys → Create API Key**
- Name: `messenginfo-production`
- Permission: **Sending access** only (not full access)
- Copy the key (shown once)

### 5. Add the key to Vercel

- Go to: https://vercel.com/dashboard → project `uscis-helper`
- **Settings → Environment Variables**
- Add: `RESEND_API_KEY` = `<your-new-key>`
- Apply to: Production, Preview, Development
- Click **Save**

### 6. Redeploy

```bash
npx vercel --prod --yes
```

Or trigger a new commit push — Vercel auto-deploys on push to main.

### 7. Update contact action to enable email

After Resend is configured, update `/apps/web/src/app/[locale]/_actions/contact.ts`:

- Uncomment the Resend email sending block
- Use sender: `noreply@messenginfo.com`
- Recipient: operator notification email (add as `CONTACT_NOTIFY_EMAIL` env var)
- Update `email_sent: false` → `email_sent: true` in the audit_log detail

---

## Current Fallback (Active Now)

Contact form submissions are stored in Supabase `audit_log` table:
- `action = 'contact_form_submitted'`
- `detail.name`, `detail.email`, `detail.message_preview` (first 200 chars)
- `detail.email_sent = false`
- Rate limited: 5 submissions per IP per hour

To view pending submissions:
```sql
SELECT created_at, detail->>'name' as name, detail->>'email' as email,
       detail->>'message_preview' as msg
FROM audit_log
WHERE action = 'contact_form_submitted'
ORDER BY created_at DESC;
```

---

## Notes

- DO NOT use `noreply@handyandfriend.com` — that is a separate business
- DO NOT call AI translation "certified" in any email copy
- The domain `messenginfo.com` is already in Cloudflare — no DNS changes needed after account creation
