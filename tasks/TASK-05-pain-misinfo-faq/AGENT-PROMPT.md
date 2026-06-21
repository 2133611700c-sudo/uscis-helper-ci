# AGENT PROMPT — TASK-05 Pain Points / Misinfo / FAQ DB

You are Claude Code working in `/Users/sergiiivanenko/work/uscis-helper`.

## STEP 0 — READ CONTEXT

1. `context/PROJECT-STATE.md`
2. `data/pain-points-seed.csv` — 35 validated pain points
3. `data/misinformation-seed.csv` — 15 active false claims
4. `data/faq-seed.csv` — 30 FAQ topics in EN
5. `data/types.ts.template` — schema definitions
6. `output-spec/COPYRIGHT-SAFETY-RULES.md`
7. `output-spec/HELPER-FUNCTIONS-SPEC.md`
8. `output-spec/FINAL-REPORT-TEMPLATE.md`

## STEP 1 — VERIFY ENVIRONMENT

```bash
cd /Users/sergiiivanenko/work/uscis-helper
git status
git checkout -b pain-misinfo-faq-$(date +%Y%m%d-%H%M)

# Verify Wave 1A and Form Intelligence are in place
ls apps/web/data/serviceCards.ts apps/web/data/formIntelligence/types.ts
```

If any missing → STOP, ask user.

## STEP 2 — CREATE TYPES FILE

```bash
mkdir -p apps/web/data/painPoints
cp data/types.ts.template apps/web/data/painPoints/types.ts
pnpm --filter web typecheck
```

Must pass.

## STEP 3 — GENERATE painPoints.ts FROM SEED

Read `data/pain-points-seed.csv` (35 rows).

Generate `apps/web/data/painPoints.ts`:

```typescript
import type { PainPoint } from './painPoints/types'

export const painPoints: PainPoint[] = [
  {
    id: 'reparole-ead-denied',
    rank: 1,
    short_title: 'Re-parole approved → EAD denied',
    description: 'You filed I-131 with the EAD checkbox. Re-parole was approved but the work permit was denied separately. You have 30 days to respond.',
    severity: 'critical',
    frequency: 'very_high',
    urgency: 'high',
    service_card_slug: 'ead-work-permit',
    evidence_count: 927,
    bad_advice_circulating: ['Just wait, EAD will come later'],
    product_solution: 'EAD denial diagnosis tool + MTR/NOID response checklist + 30-day deadline calculator',
    primary_solution_form: 'I-765',
    validated_sources: ['FB UA Community 927 comments', 'Telegram @eadu4u'],
    last_verified: '2026-04-30',
  },
  // ... continue for all 35 rows
]

export function getPainPoint(id: string): PainPoint | undefined {
  return painPoints.find(p => p.id === id)
}
```

## STEP 4 — GENERATE misinformation.ts

Read `data/misinformation-seed.csv` (15 rows).

Generate `apps/web/data/misinformation.ts`:

```typescript
import type { Misinformation } from './painPoints/types'

export const misinformation: Misinformation[] = [
  {
    id: 'tps-extension-equals-ead-extension',
    bad_claim: 'TPS extended to October 2026, so my EAD is valid until October',
    spread: 'very_high',
    source_of_misinformation: 'Confused community, recycled assumptions',
    truth: 'TPS Ukraine designation extends to October 19, 2026, BUT EAD auto-extension is capped at July 22, 2026',
    truth_source_url: 'https://www.federalregister.gov/documents/2025/01/17/2025-00771/',
    truth_source_title: 'Federal Register 90 FR 5936',
    risk_if_believed: 'Working on expired EAD after July 22 → I-9 reverification → job loss',
    product_mitigation: 'Banner on TPS Ukraine page, push notification, employer letter template',
    service_pages_to_warn: ['tps-ukraine', 'ead-work-permit'],
    last_verified: '2026-04-30',
  },
  // ... continue for all 15 rows
]
```

## STEP 5 — GENERATE faqAnswers.ts (4 LANGUAGES)

Read `data/faq-seed.csv` (30 rows in EN).

For EACH of the 30 questions, generate a FAQAnswer entry in EN, RU, UK, ES.

Total: 120 entries.

Translation rules:
- EN: original from seed
- RU: formal "вы", immigration terminology
- UK: formal "ви"
- ES: formal "usted", Latin American Spanish

Each entry MUST have:
- `short_answer` — 1-2 sentences
- `full_answer` — 3-6 sentences max
- At least one `official_source_urls` entry (Tier 1)
- `related_pain_points` — IDs from painPoints.ts
- `related_misinformation` — IDs from misinformation.ts (if any apply)
- `last_reviewed: '2026-04-30'`
- `review_status: 'draft'` (will be 'approved' after attorney review for Wave 1.5)

Save to `apps/web/data/faqAnswers.ts`.

## STEP 6 — GENERATE HELPER FUNCTIONS

Per `output-spec/HELPER-FUNCTIONS-SPEC.md`, create `apps/web/lib/painPoints.ts`:

```typescript
import { painPoints, type PainPoint } from '@/data/painPoints'
import { misinformation, type Misinformation } from '@/data/misinformation'
import { faqAnswers, type FAQAnswer } from '@/data/faqAnswers'

export function getPainPointsForService(slug: string): PainPoint[] {
  return painPoints.filter(p => p.service_card_slug === slug)
}

export function getMisinformationForService(slug: string): Misinformation[] {
  return misinformation.filter(m => m.service_pages_to_warn.includes(slug))
}

export function getFaqsByTopic(
  topic: string,
  locale: 'en' | 'ru' | 'uk' | 'es'
): FAQAnswer[] {
  return faqAnswers.filter(f => f.topic === topic && f.language === locale)
}

export function getCriticalPainPoints(): PainPoint[] {
  return painPoints
    .filter(p => p.severity === 'critical')
    .sort((a, b) => a.rank - b.rank)
}
```

## STEP 7 — GENERATE SOURCE MAP

Write `docs/research/pain-points-source-map.md` with:

For each pain point, list:
- ID
- Original research source (FB / Telegram / Market Research)
- Evidence snippets (PARAPHRASED — never copy-paste from forensic audits, max 15 words direct quote per source)
- Cross-validation sources
- Last verified date

## STEP 8 — VERIFICATION

```bash
# TypeScript compiles
pnpm --filter web typecheck

# All Tier 1 URLs alive
grep -hoE 'https://[^"]*' \
  apps/web/data/painPoints.ts \
  apps/web/data/misinformation.ts \
  apps/web/data/faqAnswers.ts | \
  sort -u | \
  while read url; do
    code=$(curl -sI -o /dev/null -w "%{http_code}" "$url")
    echo "$code $url"
  done | tee /tmp/url-check.txt | grep -vE "^(2|3)" 

# Output should be empty (no 4xx/5xx)
```

```bash
# Language parity check for FAQ
node -e "
const { faqAnswers } = require('./apps/web/data/faqAnswers');
const byTopic = {};
faqAnswers.forEach(f => {
  if (!byTopic[f.topic]) byTopic[f.topic] = new Set();
  byTopic[f.topic].add(f.language);
});
for (const [topic, langs] of Object.entries(byTopic)) {
  if (langs.size !== 4) {
    console.log('MISMATCH topic ' + topic + ' has langs: ' + [...langs].join(','));
  }
}
console.log('OK if no MISMATCH lines above');
"
```

```bash
# Copyright check — flag any quotes > 15 words from forensic audit research
# Manual review of pain-points-source-map.md required
```

## STEP 9 — COMMIT

```bash
git add apps/web/data/painPoints.ts \
        apps/web/data/misinformation.ts \
        apps/web/data/faqAnswers.ts \
        apps/web/data/painPoints/types.ts \
        apps/web/lib/painPoints.ts \
        docs/research/pain-points-source-map.md
git commit -m "feat(data): pain points / misinformation / FAQ databases"
git push -u origin HEAD
```

## STEP 10 — FINAL REPORT

Write to `docs/reports/pain-misinfo-faq-report.md` per `output-spec/FINAL-REPORT-TEMPLATE.md`.

## CONSTRAINTS

- TypeScript compile fails → STOP, fix
- Tier 1 source URL returns 4xx/5xx → flag for review, don't include
- Direct quote > 15 words from forensic audits → MUST paraphrase
- FAQ language mismatch → STOP, generate missing language
- NO modifications to apps/web/components or apps/web/app (data only)
- NO modifications to live serviceCards.ts

## EXECUTE NOW.
