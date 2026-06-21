# Database schemas — aggregated outputs

After all 20 channels processed, aggregate per-channel data into these 4 master files.

## 1. verified-claims.csv

```
claim_id,source_id,video_id,claim_text,claim_lang,topic,status,tier1_url,tier1_title,verified_at,notes
```

Example row:
```
VC-0001,YT-MURATOVA,abc123,"Re-parole filing requires personal evidence as of Aug 2025",RU,re-parole,verified,https://www.uscis.gov/humanitarian/uniting-for-ukraine,USCIS U4U page,2026-04-30,Confirmed in USCIS announcement
```

## 2. rejected-claims.csv

```
claim_id,source_id,video_id,claim_text,claim_lang,topic,status,reason,contradicting_url,contradicting_text,verified_at
```

Example:
```
RC-0001,YT-SCAM-EXAMPLE,xyz789,"You can work on re-parole without EAD",RU,ead,contradicted,Re-parole grants presence only,https://www.ecfr.gov/...,8 CFR 274a.12 lists EAD categories required for work,2026-04-30
```

## 3. creator-contacts.csv

```
source_id,channel_name,handle,subscribers,language,tier,telegram,website,instagram,facebook,email,phone,country,notes,verified_at
```

## 4. official-sources.json

JSON object with all Tier 1 URLs encountered, deduplicated, with last-checked timestamps.

```json
{
  "sources": [
    {
      "url": "https://www.uscis.gov/humanitarian/uniting-for-ukraine",
      "title": "USCIS Uniting for Ukraine page",
      "topic": "re-parole",
      "tier": 1,
      "first_seen": "2026-04-30T10:00:00Z",
      "last_checked": "2026-04-30T15:30:00Z",
      "http_status": 200,
      "referenced_by_sources": ["YT-MURATOVA", "YT-MANILICH", "YT-RELOKA"]
    }
  ],
  "metadata": {
    "total_sources": 0,
    "alive_count": 0,
    "dead_count": 0,
    "last_audit": "2026-04-30"
  }
}
```

## SUMMARY.md format

```markdown
# Source Intelligence Audit — Summary

**Date range**: 2026-04-30 → [end date]
**Channels processed**: [N] of 20

## Per-channel results

| source_id | tier_orig | tier_final | claims_total | verified | contradicted | trust_score |
|---|---|---|---|---|---|---|
| YT-MURATOVA | 2 | 2 | 28 | 25 | 1 | TRUSTWORTHY |
| ... | | | | | | |

## Top contradictions

[Top 5 contradicted claims across all channels — these go to TASK-05 misinformation database]

## Recommended for monitoring (TASK-06)

[Channels with TRUSTWORTHY rating that should be added to YouTube RSS monitor]

## Recommended DO NOT LINK

[Channels with too many contradictions]

## Partnership candidates

[Channels that are TRUSTWORTHY + have business contact info]
```

## Helpers for downstream tasks

The aggregated files feed:

- **TASK-05** (Pain Points DB): `rejected-claims.csv` → seeds `misinformation.ts` data
- **TASK-06** (Monitoring): `creator-contacts.csv` (subset) → seeds YouTube RSS monitoring
- **Wave 1.5 content**: `verified-claims.csv` → "common mistakes" sections on service pages
- **Wave 3 attorney directory**: `creator-contacts.csv` filtered by tier 2 → outreach list
