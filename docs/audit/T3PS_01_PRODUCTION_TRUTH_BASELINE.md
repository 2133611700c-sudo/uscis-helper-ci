# T3PS-01 Production Truth Baseline

- task_id: `T3PS-01-PRODUCTION-TRUTH-BASELINE`
- generated_at: `2026-05-14T07:42:30Z`
- verdict: `FAIL`

## 1) Repo truth (local)

- Path: `/Users/sergiiivanenko/work/uscis-helper`
- Branch: `main`
- Local HEAD: `0e239635b062c1c0e9289bc08794da5d7fbe59b7`
- origin/main: `0e239635b062c1c0e9289bc08794da5d7fbe59b7`
- Ahead/behind: `0 / 0`
- Working tree: `DIRTY`
  - `M apps/web/tsconfig.tsbuildinfo`
  - multiple untracked artifacts/log files

## 2) GitHub truth (repo from task context)

- Target repo: `2133611700c-sudo/opencloud-gpt-agent`
- Default branch: `main`
- Remote main SHA: `b1e16cf53df7ef7be0e93e6a333f5db92dd2e136`
- Expected commit check (`0e23963 or newer`): **FAILED**
  - Command: `gh api repos/2133611700c-sudo/opencloud-gpt-agent/commits/0e23963`
  - Error: `No commit found for SHA: 0e23963 (HTTP 422)`

## 3) Mac gates

- Command: `./scripts/run-all-gates.sh`
- Status: **PASS**
- Report: `/Users/sergiiivanenko/work/uscis-helper/test-fixtures/proof/RUN_ALL_GATES.report.yaml`
- Summary: `5/5 pass` (`typecheck`, `vitest`, `lint`, `guard`, `build`)

## 4) Vercel deployment truth

- `vercel ls --scope 2133611700c-sudo` => **FAILED**
  - Error: `The specified scope does not exist`
- `vercel inspect https://messenginfo.com` => **PASS**
  - deployment_id: `dpl_5A1KHYhPswRBuVDvsSr3MJNR1reG`
  - state: `READY`
  - deployment_url: `https://uscis-helper-5uxqzzaku-sergiis-projects-8a97ee0f.vercel.app`
  - aliases include: `https://messenginfo.com`, `https://www.messenginfo.com`
- Health SHA: `0e239635b062c1c0e9289bc08794da5d7fbe59b7`

## 5) Production HTTP smoke

All required user routes returned `200` with `Mozilla/5.0` user-agent:

- `/ru/services/tps-ukraine/start` -> 200
- `/en/services/tps-ukraine/start` -> 200
- `/ru/services/tps-ukraine` -> 200
- `/ru/services/tps-ukraine/sources` -> 200
- `/ru/privacy` -> 200
- `/api/tps/health` -> `ok=true`, sha=`0e239635b062c1c0e9289bc08794da5d7fbe59b7`

## 6) OpenClaw capability check

- Workflow exists: `openclaw-task-runner.yml`
- Dispatch with expected inputs from task YAML: **FAILED** (`HTTP 422 Unexpected inputs`)
- Fallback dispatch without inputs: **PASS**
  - run_id: `25848225569`
  - run_url: `https://github.com/2133611700c-sudo/opencloud-gpt-agent/actions/runs/25848225569`
  - conclusion: `success`
  - artifact: `openclaw-task-runner-25848225569`

## Blockers

1. Task-level GitHub repo points to `opencloud-gpt-agent`, while local/Vercel production verification target is `uscis-helper`; commit `0e23963` is not present in `opencloud-gpt-agent`.
2. Local repository is not clean (dirty working tree).

## Final baseline result

Status for `T3PS-01-PRODUCTION-TRUTH-BASELINE`: **FAIL**.
