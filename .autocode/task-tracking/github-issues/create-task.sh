#!/usr/bin/env bash
# Idempotently create a GitHub issue representing one or more digested BUILD-PLAN tasks.
#
# Scope is deliberately narrow (title/milestone/owner/body-file only, no free-form gh
# invocation) so this script is safe to allowlist for unattended approval, per
# core/workflow/task-tracking.md's plan.digest and the github-issues adapter's
# operations.md.
#
# Usage:
#   create-task.sh --title TITLE --milestone MILESTONE --owner agent|operator \
#                   --body-file FILE [--repo OWNER/NAME] [--label NAME]...
#
# TITLE should start with the plan task ID(s), e.g. "Task 0.15: ..." or
# "Tasks 0.4-0.9: ...". Idempotence matches on everything before the first ":".
#
# --owner agent     -> label: autocode:task
# --owner operator  -> labels: autocode:task, status:deferred, operator-action
#                      (status:deferred keeps it out of task.next(); operator-action
#                      marks it for human filtering)
#
# Prints the issue number on stdout (existing or newly created). Diagnostic text goes
# to stderr, so `num=$(create-task.sh ...)` captures just the number.

set -euo pipefail

REPO=""
TITLE=""
MILESTONE=""
OWNER=""
BODY_FILE=""
EXTRA_LABELS=()

usage() {
  cat >&2 <<'USAGE'
Usage: create-task.sh --title TITLE --milestone MILESTONE --owner agent|operator --body-file FILE [--repo OWNER/NAME] [--label NAME]...
USAGE
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --title) TITLE="$2"; shift 2 ;;
    --milestone) MILESTONE="$2"; shift 2 ;;
    --owner) OWNER="$2"; shift 2 ;;
    --body-file) BODY_FILE="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    --label) EXTRA_LABELS+=("$2"); shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown argument: $1" >&2; usage ;;
  esac
done

[[ -n "$TITLE" ]] || { echo "--title is required" >&2; usage; }
[[ -n "$MILESTONE" ]] || { echo "--milestone is required" >&2; usage; }
[[ -n "$BODY_FILE" && -f "$BODY_FILE" ]] || { echo "--body-file must point to an existing file" >&2; usage; }

case "$OWNER" in
  agent) LABELS="autocode:task" ;;
  operator) LABELS="autocode:task,status:deferred,operator-action" ;;
  *) echo "--owner must be 'agent' or 'operator'" >&2; usage ;;
esac

for l in "${EXTRA_LABELS[@]:-}"; do
  [[ -n "$l" ]] && LABELS="$LABELS,$l"
done

REPO_ARGS=()
[[ -n "$REPO" ]] && REPO_ARGS=(--repo "$REPO")

# Idempotence: match on everything before the first colon in the title, e.g.
# "Tasks 0.1-0.3:" or "Task 0.15:" - mirrors operations.md's plan-ID lookup, widened
# to cover grouped-task titles.
PREFIX="${TITLE%%:*}:"
EXISTING=$(gh issue list "${REPO_ARGS[@]}" --state all --search "in:title \"${PREFIX}\"" \
  --json number,title \
  | jq -r --arg p "$PREFIX" '[.[] | select(.title | startswith($p))][0].number // empty')

if [[ -n "$EXISTING" ]]; then
  echo "Issue already exists: #$EXISTING ($PREFIX)" >&2
  echo "$EXISTING"
  exit 0
fi

URL=$(gh issue create "${REPO_ARGS[@]}" \
  --title "$TITLE" \
  --milestone "$MILESTONE" \
  --label "$LABELS" \
  --body-file "$BODY_FILE")

echo "Created: $URL" >&2
echo "${URL##*/}"
