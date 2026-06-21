# Digest Email Spec

## Subject

`Messenginfo Monitor — {YYYY-MM-DD}`

## Sender

`monitor@messenginfo.com` (requires Resend domain verification)

## Recipient

Read from env: `CONTACT_EMAIL_DESTINATION` (default `2133611700uscis@gmail.com`)

## Format

HTML email. Plain inline styles, no external CSS, no JS, no remote images. Renders identically in any client.

## Structure

```html
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; color: #0f172a;">

  <h1 style="font-size: 22px; margin: 0 0 8px 0;">Messenginfo Monitor</h1>
  <p style="color: #64748b; margin: 0 0 24px 0;">{date_human}</p>

  <!-- Section 1 — Critical alerts (if any) -->
  <h2 style="font-size: 16px; color: #b91c1c;">⚠️ Action required ({n_critical})</h2>
  <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
    <tr style="background: #fee2e2;">
      <td style="padding: 8px;">{title}</td>
      <td style="padding: 8px;"><a href="{source_url}">{source}</a></td>
    </tr>
    <!-- ... -->
  </table>

  <!-- Section 2 — USCIS news -->
  <h2 style="font-size: 16px;">USCIS News ({n_news})</h2>
  <ul>
    <li><a href="{url}">{title}</a> — {date}</li>
    <!-- ... -->
  </ul>

  <!-- Section 3 — Federal Register -->
  <h2 style="font-size: 16px;">Federal Register ({n_fr})</h2>
  <ul>
    <li><a href="{url}">{title}</a> — {publication_date}</li>
  </ul>

  <!-- Section 4 — Form editions -->
  <h2 style="font-size: 16px;">Form edition changes ({n_forms})</h2>
  <ul>
    <li>{form_id}: edition_date may have changed (PDF hash diff). <a href="{pdf_url}">Verify</a></li>
  </ul>

  <!-- Section 5 — Dead links -->
  <h2 style="font-size: 16px;">Dead links ({n_dead})</h2>
  <ul>
    <li><code>{url}</code> — {http_status} — referenced in <code>{file}</code></li>
  </ul>

  <!-- Section 6 — YouTube new videos (only on Mondays) -->
  <h2 style="font-size: 16px;">YouTube — new videos this week ({n_yt})</h2>
  <ul>
    <li>{channel}: <a href="{video_url}">{title}</a> ({date})</li>
  </ul>

  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0 16px 0;">

  <p style="color: #64748b; font-size: 12px;">
    Messenginfo automated monitoring · Generated {timestamp_iso} ·
    Acknowledged alerts removed from next digest.
  </p>

</body>
</html>
```

## Acknowledgment

Each alert in the digest links to a Supabase admin URL (or shows the alert ID).

For now, manual acknowledgment via Supabase dashboard:
```sql
UPDATE monitoring_alerts
SET acknowledged_at = now(), acknowledged_by = 'sergii'
WHERE id IN ('alert-uuid-1', 'alert-uuid-2');
```

Future Wave 3: admin web UI for acknowledgment.

## Empty digest behavior

If no alerts in last 24h: send NO email. Don't spam inbox with "all quiet" notes.

## Failure handling

If `sendDigest()` throws:
- Log full error to GitHub Actions output
- Do NOT mark alerts as acknowledged
- User sees workflow failure in Actions tab

## Critical alert escalation (future, not Wave 1A)

Optional future feature: if `severity = 'critical'` alerts present, send immediate email separately rather than waiting for daily digest. Not built in this task.
