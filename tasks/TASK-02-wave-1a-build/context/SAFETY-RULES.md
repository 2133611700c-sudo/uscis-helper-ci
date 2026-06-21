# SAFETY RULES — hard stops

## NO-TOUCH directories (read-only references)

- `/Users/sergiiivanenko/handy-friend-landing-v6` — UX reference for visual style
- `/Users/sergiiivanenko/work/messenginfo-merge` — old logistics project

**You may READ files in these directories** for inspiration on component patterns, animations, layout choices.

**You must NOT**:
- Modify, create, delete any file in these directories
- Run `npm install` or `pnpm install` from inside them
- Run `git` commands from inside them
- Copy components verbatim — read for inspiration, write fresh code in the working repo

## NO-WRITE patterns

- Never modify global git config: no `git config --global ...`
- Never modify shell rc files (.bashrc, .zshrc)
- Never modify `~/.ssh/`, `~/.aws/`, `~/.gnupg/`
- Never write to `/etc/`, `/usr/`, `/opt/`
- Never modify other Vercel projects, especially `prj_cB1RFa7bfSuWpuhBZs76UiYvTLzg` (Handy & Friend — unrelated production project)

## Secrets handling

- Never print env var values to logs or report
- Never commit `.env`, `.env.local`, `.env.production` to git
- Verify `.gitignore` covers all `.env*` patterns before commit
- If you find a secret already committed in history → report immediately, do not delete from history yourself

## Receipt number handling (CRITICAL)

The Case Status Checker handles USCIS receipt numbers (e.g. `IOE1234567890`). These are PII.

**Forbidden**:
- Storing receipt in component state beyond the form session
- Sending receipt to any backend
- Including receipt in URL params (e.g. `?receipt=IOE...`)
- Including receipt in analytics events (Vercel Analytics, anything)
- Logging receipt to console
- Including receipt in error messages

**Required**:
- Validate locally with regex (per `data/case-status-checker-spec.md`)
- On valid match: open `https://egov.uscis.gov/` in new tab WITHOUT the receipt number
- Show user-facing copy: "We don't store your receipt number"

## Hard stops — STOP and report, do not continue

- Build/typecheck failure
- `pnpm install` failure
- i18n key parity diff returns non-empty
- Brand grep returns non-empty matches
- Vercel deploy fails
- Receipt number found in any storage / URL / log
- Modification detected to no-touch folders
- Secret found committed
- More than 3 dead links among officialSourceUrl values
- Build output > 50 MB (likely accidental asset bloat)
- Any of these env vars missing: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

When you stop: write what happened to `/tmp/wave-1a-stop-report.md` and output the path.

## Things that are FINE (not hard stops)

- Optional Telegram env vars missing → render fallback "links will be added after verification" string
- Lighthouse score not perfect → log, continue
- Some images not optimal — log, continue
- Lint warnings (not errors) — log, continue
