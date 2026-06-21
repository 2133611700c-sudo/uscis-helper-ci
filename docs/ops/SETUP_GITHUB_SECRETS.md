# Setup — GitHub Actions secrets for the Supabase drift-guard

The `supabase-drift-check` workflow (`.github/workflows/supabase-drift-check.yml`) runs daily
and FAILS if the prod schema drifts from the repo migrations. It **skips cleanly** until these
three secrets are set — so until you do this, it is a harmless no-op.

## 1. Get the three values

| Secret | Where to get it | Value for this project |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | Supabase Dashboard → top-right avatar → **Account** → **Access Tokens** → *Generate new token* | (copy the generated token — shown once) |
| `SUPABASE_PROJECT_REF` | The prod project ref | **`rtfxrlountkoegsseukx`** |
| `SUPABASE_DB_PASSWORD` | Supabase Dashboard → Project `uscis-helper` → **Settings** → **Database** → *Database password* (reset it there if unknown) | (copy / reset) |

## 2. Add them to GitHub Actions

GitHub → the repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
Add each of the three above as a **Secret** (not a variable). Names must match EXACTLY (case-sensitive).

## 3. Verify

GitHub → **Actions** → **Supabase Drift Check** → **Run workflow** (the `workflow_dispatch` button).
- Expected on a clean repo↔prod: the run **succeeds** with `No drift — repo migrations match prod.`
- If it **fails** with `Supabase schema DRIFT detected`: the prod schema and the repo migrations
  diverged (someone changed prod without a matching repo migration, or vice versa). Read the printed
  diff, then either add the missing repo migration or reconcile prod — do NOT ignore it.

## 4. Rollback / disable

Delete any of the three secrets → the workflow's guard step detects the missing token and **skips**
(exits 0) on every run. No code change needed to turn it off.

## Notes

- The workflow needs Docker (for the CLI shadow DB) — GitHub's `ubuntu-latest` runners have it.
- The token is read-only-ish for diffing; rotate it from the Supabase dashboard if exposed.
- This guards against a SILENT prod schema change by anyone (including future direct MCP applies).
