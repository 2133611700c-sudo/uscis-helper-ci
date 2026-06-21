#!/usr/bin/env bash
set -euo pipefail

REQUIRED_DOCS=("STATUS.md" "HANDOFF.md" "CHANGELOG.md")

usage() {
  cat <<'EOF'
Usage:
  require-session-docs.sh --staged
  require-session-docs.sh --files <file1> [file2 ...]
  require-session-docs.sh --commit <sha>
  require-session-docs.sh --range <base..head>
  require-session-docs.sh --ci

Behavior:
  Fails unless all required docs are present in the checked file set:
    - STATUS.md
    - HANDOFF.md
    - CHANGELOG.md
EOF
}

print_missing_and_fail() {
  local scope="$1"
  shift
  local missing=("$@")
  echo "ERROR: session docs guard failed (${scope})."
  echo "Missing required files:"
  for f in "${missing[@]}"; do
    echo "  - ${f}"
  done
  echo
  echo "Fix example:"
  echo "  git add STATUS.md HANDOFF.md CHANGELOG.md"
  exit 1
}

check_file_list() {
  local scope="$1"
  shift
  local files=("$@")
  local missing=()
  local req
  local f
  local found

  if [[ ${#files[@]} -eq 0 ]]; then
    print_missing_and_fail "$scope" "${REQUIRED_DOCS[@]}"
  fi

  for req in "${REQUIRED_DOCS[@]}"; do
    found=0
    for f in "${files[@]}"; do
      if [[ "$f" == "$req" ]]; then
        found=1
        break
      fi
    done
    if [[ $found -eq 0 ]]; then
      missing+=("$req")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    print_missing_and_fail "$scope" "${missing[@]}"
  fi

  echo "OK: session docs present (${scope})."
}

check_commit() {
  local sha="$1"
  local files=()
  local line
  while IFS= read -r line; do
    files+=("$line")
  done < <(git diff-tree --no-commit-id --name-only -r "$sha")
  check_file_list "commit ${sha}" "${files[@]}"
}

check_range() {
  local range="$1"
  local commits=()
  local sha
  while IFS= read -r sha; do
    commits+=("$sha")
  done < <(git rev-list --no-merges "$range")

  if [[ ${#commits[@]} -eq 0 ]]; then
    echo "OK: no commits in range ${range}."
    exit 0
  fi

  for sha in "${commits[@]}"; do
    check_commit "$sha"
  done
}

check_ci() {
  local range=""

  if [[ "${GITHUB_EVENT_NAME:-}" == "pull_request" ]]; then
    if [[ -n "${GITHUB_BASE_SHA:-}" && -n "${GITHUB_HEAD_SHA:-}" ]]; then
      range="${GITHUB_BASE_SHA}..${GITHUB_HEAD_SHA}"
    else
      echo "ERROR: pull_request CI mode requires GITHUB_BASE_SHA and GITHUB_HEAD_SHA."
      exit 2
    fi
  elif [[ "${GITHUB_EVENT_NAME:-}" == "push" ]]; then
    if [[ -n "${GITHUB_BEFORE_SHA:-}" && -n "${GITHUB_SHA:-}" ]]; then
      range="${GITHUB_BEFORE_SHA}..${GITHUB_SHA}"
    else
      echo "ERROR: push CI mode requires GITHUB_BEFORE_SHA and GITHUB_SHA."
      exit 2
    fi
  elif [[ -n "${SESSION_DOCS_RANGE:-}" ]]; then
    range="${SESSION_DOCS_RANGE}"
  else
    echo "ERROR: --ci mode needs GitHub env vars or SESSION_DOCS_RANGE."
    exit 2
  fi

  echo "CI range: ${range}"
  check_range "$range"
}

if [[ $# -lt 1 ]]; then
  usage
  exit 2
fi

mode="$1"
shift

case "$mode" in
  --staged)
    staged_files=()
    while IFS= read -r line; do
      staged_files+=("$line")
    done < <(git diff --cached --name-only)
    # Empty commit (no staged files) — skip guard (e.g. chore: redeploy, merge commits)
    if [[ ${#staged_files[@]} -eq 0 ]]; then
      echo "OK: empty commit (no staged files) — session docs guard skipped"
      exit 0
    fi
    check_file_list "staged changes" "${staged_files[@]}"
    ;;
  --files)
    if [[ $# -lt 1 ]]; then
      usage
      exit 2
    fi
    check_file_list "explicit file list" "$@"
    ;;
  --commit)
    if [[ $# -ne 1 ]]; then
      usage
      exit 2
    fi
    check_commit "$1"
    ;;
  --range)
    if [[ $# -ne 1 ]]; then
      usage
      exit 2
    fi
    check_range "$1"
    ;;
  --ci)
    check_ci
    ;;
  *)
    usage
    exit 2
    ;;
esac
