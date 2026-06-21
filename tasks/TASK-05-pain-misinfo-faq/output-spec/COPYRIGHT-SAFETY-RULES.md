# Copyright Safety Rules

The forensic audit research from prior sessions includes:
- Paraphrased community posts from Facebook
- Paraphrased Telegram messages (with permissions varying)
- Comment counts and engagement metrics

Some original posts may be copyrighted by their authors. The seed CSV files in `data/` already use paraphrased descriptions. The agent must NOT reintroduce verbatim quotes when generating output files.

## Hard rules

### 1. No direct quotes longer than 15 words from any single source

If you find yourself quoting a Facebook post or Telegram message verbatim, paraphrase. Rewrite into plain professional language.

Wrong:
```
description: "Дуже багато хто пише, що 'я подав I-131 ще в серпні, отримав receipt, але до сих пір ніякого ходу справа не має, а паспорт вже закінчується через тиждень'"
```

Right:
```
description: "Re-parole filed weeks or months ago — receipt notice received but no further updates while the parole expiration date approaches."
```

### 2. No copy-paste from forensic audit notes

The forensic audit files contain paraphrased content. Do NOT copy those paraphrases into output files. Generate fresh paraphrases in plain professional English.

### 3. Cite by source name + evidence count, not full content

In `validated_sources` field:

Right: `"FB UA Community 927 comments"`
Right: `"Telegram @eadu4u group 6,941 subs"`
Wrong: `"FB user @ivan_petrov said 'my EAD was denied because USCIS said...'"`

Never include named individual users in `validated_sources` unless they are public figures (attorneys nonprofits) and content is from their official channel.

### 4. No personal data

Even if a forensic audit captured names addresses or case numbers from public posts, these MUST NOT appear in output files. Strip all PII when generating descriptions.

### 5. Trust source URLs only for Tier 1

`truth_source_url` MUST point to:
- USCIS (uscis.gov)
- CBP (cbp.gov)
- DOJ (justice.gov)
- Federal Register (federalregister.gov)
- eCFR (ecfr.gov)

Never use community sources (YouTube videos forum posts) as `truth_source_url`. They go in `validated_sources` of the pain point but never as the truth-establishing source.

### 6. FAQ answer language

FAQ answers should be:
- Original prose written for this site
- NOT paraphrased from USCIS PDFs verbatim (paraphrase USCIS content too)
- NOT copied from other immigration sites
- Cite Tier 1 source URLs but never copy their text

## Manual review

After generation, agent should review `docs/research/pain-points-source-map.md` line by line and flag any text that looks like it could be a verbatim quote from the original research. Flagged lines need rewriting before commit.
