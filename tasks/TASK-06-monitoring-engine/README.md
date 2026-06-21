# TASK-06 — Daily Monitoring Engine

**For**: Claude Code (with GitHub CLI + Supabase access)
**Working dir**: `/Users/sergiiivanenko/work/uscis-helper`
**Duration**: 2-3 hours
**Outcome**: 5 GitHub Actions workflows + Supabase tables + scripts that monitor USCIS/Federal Register/forms/dead-links/YouTube + email digest
**Prerequisite**: TASK-04 done (form intelligence files exist for form-edition-checker workflow)

---

## FOLDER LAYOUT

```
TASK-06-monitoring-engine/
├── README.md                          ← THIS FILE
├── AGENT-PROMPT.md
├── context/
│   └── PROJECT-STATE.md
├── data/
│   ├── monitoring-sources-seed.csv   ← Initial sources to seed Supabase
│   ├── supabase-migration.sql        ← Schema for new monitoring tables
│   ├── env-vars-required.md          ← What env vars to set + where
│   └── rate-limits.md                ← Rate limit rules per source
└── output-spec/
    ├── WORKFLOW-TEMPLATES/           ← GitHub Actions YAML templates
    │   ├── uscis-news-monitor.yml.template
    │   ├── federal-register-monitor.yml.template
    │   ├── form-edition-checker.yml.template
    │   ├── dead-link-checker.yml.template
    │   └── youtube-monitor.yml.template
    ├── DIGEST-EMAIL-SPEC.md          ← Email format spec
    └── FINAL-REPORT-TEMPLATE.md
```

---

## EXECUTION

1. Open Claude Code in repo
2. Tell it: "Read AGENT-PROMPT.md and execute. Build all 5 workflows and Supabase migration."
3. After agent commits, manually run each workflow once via `gh workflow run` to verify
4. Wait for first daily digest email (next morning)

---

## SUCCESS CRITERIA

- 4 new tables in Supabase: monitoring_sources, monitoring_alerts, form_editions, dead_links_log
- 5 GitHub Actions workflows in `.github/workflows/`
- 9 scripts in `scripts/monitoring/`
- All env vars documented + verified set in GitHub Actions secrets
- First test run of each workflow returns success
- First daily digest email arrives at `2133611700uscis@gmail.com`
- No rate limit violations in logs

---

## SAFETY

- USCIS Case Status NEVER scraped (forbidden by ToS)
- Federal Register API rate limit respected (60 req/min)
- USCIS forms pages: max 1 req/2s
- YouTube uses RSS feeds, not Data API (avoids quota issues)
- Telegram NOT monitored automatically (Wave 3 — separate Bot API setup)
