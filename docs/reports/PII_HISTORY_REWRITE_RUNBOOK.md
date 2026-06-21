# PII History-Rewrite Runbook (PREPARED, NOT EXECUTED)

**Date:** 2026-06-04. The agent PREPARED this. **Nothing here was run.** Execution is a separate, explicit
owner decision (the destructive Phase B rewrites history and force-pushes). No real PII values appear in this
doc — they live only in a local, gitignored `pii-replacements.txt` the owner fills.

## 0. Current risk posture — read this first (it changes the urgency)

- **The repo is PRIVATE** (`gh repo view … --json isPrivate` → `true`). The owner's identity PII has **not**
  been publicly exposed; the blast radius is whoever has access to this private repo (owner + any collaborators).
- **`docs/reports/evidence/` is already fully gitignored** (`.gitignore` lines 34-38). New evidence blobs are
  no longer added — the *ongoing* leak surface is closed. What remains is **historical** blobs + the name in
  current-tree test fixtures.
- **Therefore:** a history rewrite is **only warranted if the repo will ever become public or be shared
  outside the owner** (open-source it, add an external collaborator/contractor, hand it to a buyer/auditor).
  If it stays internal-only forever, record that decision and STOP — the cost/risk of a rewrite is not justified.

> Honest limit: an identity DOB / passport number cannot be "rotated" like a password. If this repo had EVER
> been public (it has not, per the check above), you would have to assume the data was already harvested and a
> rewrite would be cosmetic. Because it is private, the rewrite is meaningful — it cleans the artifact before
> any future exposure.

## 1. Scope (from a read-only survey 2026-06-04; counts, no values)

| token (pattern) | tracked files (HEAD) | history commits (`-S`) |
|---|---|---|
| surname | 46 | 55 |
| patronymic | 23 | — |
| passport number | 21 | 30 |
| exact DOB | 36 | — |
| home city | 43 | — |

- **Real-PII binary blobs in history:** **51** generated USCIS packets (real filled forms) under
  `docs/reports/evidence/**/*.zip` and `**/dual-proof-unpacked/I-765.pdf` / `I-821.pdf`. **These are the worst
  leak** (the owner's actual completed immigration forms).
- **The `docs/audit/generated/*` field dumps do NOT contain the surname** (verified 0) — they are field-name
  inventories, not PII. **Do not delete them as PII.**

## 2. Classification — three buckets (do NOT blanket-replace)

The owner's name is BOTH a leak AND an intentional KMU-55 regression fixture in **26 test files**. A naive
"replace the name everywhere" would break the test suite. Split the work:

- **BUCKET A — DELETE from history (pure leak, zero code value):** the 51 evidence blobs (`*.zip`, unpacked
  `I-765.pdf`/`I-821.pdf` and siblings) under `docs/reports/evidence/`. Already gitignored going forward; purge
  the historical blobs.
- **BUCKET B — REDACT real-ID tokens in retained TEXT files:** passport number + exact DOB in session docs
  (STATUS/HANDOFF/CHANGELOG/OWNER_QUEUE), a couple of bench scripts, `strictValidators.ts`, and a few reports.
  Replace with synthetic constants.
- **BUCKET C — MIGRATE test fixtures to a SYNTHETIC identity (current tree, Phase A):** the 26 test files use
  the real name on purpose. Replace it with a synthetic identity that still exercises KMU-55 (e.g. a made-up
  surname/given/patronymic with the same transliteration shape) and update assertions. Only after HEAD is
  clean does the history rewrite of the name make sense (else the leak persists in HEAD).

## 3. Two-phase plan

### Phase A — current-tree scrub (NON-destructive, normal PR, doable any time)
Stops the forward leak and makes the rewrite coherent. Reviewable, reversible.
1. Pick a synthetic identity (surname/given/patronymic/passport#/DOB/city). Record the real→synthetic map in a
   local **gitignored** `pii-replacements.txt` (real on the left). NEVER commit this file.
2. Replace BUCKET B tokens (passport#, DOB) in retained text files with the synthetic constants.
3. Migrate BUCKET C test fixtures to the synthetic identity; update assertions; run the full suite to green.
4. Confirm BUCKET A is gitignored (it is) and `git rm --cached` any still-tracked evidence blob.
5. Commit + PR. After this, HEAD contains no real PII.

### Phase B — history rewrite (DESTRUCTIVE; force-push; owner-gated on "going external = yes")
Run only after Phase A is merged AND the owner decides the repo will/again-might be shared. Needs a
maintenance window and clone coordination.

```bash
# 0) PREREQS: clean working tree, everyone notified, all PRs merged/closed.
pip install git-filter-repo            # or brew install git-filter-repo

# 1) BACKUP — mandatory. A force-push is not reversible; keep an untouched copy.
git clone --mirror git@github.com:2133611700c-sudo/uscis-helper.git ../uscis-helper-BACKUP.git
git bundle create ../uscis-helper-prerewrite.bundle --all

# 2) Work on a FRESH clone (filter-repo refuses a dirty/linked clone).
git clone git@github.com:2133611700c-sudo/uscis-helper.git ../uscis-helper-rewrite
cd ../uscis-helper-rewrite

# 3) PURGE the 51 evidence blobs from ALL history (Bucket A).
#    paths-to-purge.txt = one path/glob per line (docs/reports/evidence/, *.zip, the unpacked I-*.pdf).
git filter-repo --invert-paths --paths-from-file ../paths-to-purge.txt

# 4) REDACT tokens across ALL history (Buckets B + C names).
#    pii-replacements.txt lines:  REAL==>SYNTHETIC   (literal; one per line; real values never leave local disk)
git filter-repo --replace-text ../pii-replacements.txt

# 5) Re-add origin (filter-repo drops it) and FORCE-PUSH the rewritten history.
git remote add origin git@github.com:2133611700c-sudo/uscis-helper.git
git push --force --all origin
git push --force --tags origin
```

## 4. Verification (after Phase B)
```bash
git grep -I "<surname>" $(git rev-list --all) | head        # expect: empty
git log --all --diff-filter=A --name-only --pretty=format: | grep -i evidence/   # expect: empty
```
Then on GitHub: the old blobs may still be reachable via cached commit SHAs until GitHub GCs them — open a
**GitHub Support** request to purge cached views, and **delete + recreate any fork**, and **close stale PRs**
(PR refs keep old objects alive). Every collaborator must **re-clone** (their old clones still hold the PII).

## 5. Rollback / safety
- The mirror clone (`../uscis-helper-BACKUP.git`) and the bundle are the only way back after a force-push —
  keep them offline until you're certain.
- If anything looks wrong post-push, restore from the mirror (`git push --mirror` from the backup).

## 6. What this runbook does NOT do
Nothing was executed: no file deleted, no token replaced, no history rewritten, no force-push, no Phase A
commit. Repo confirmed PRIVATE. Decision to run Phase A and/or Phase B is the owner's, recorded in OWNER_QUEUE.
