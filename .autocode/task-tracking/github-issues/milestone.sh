#!/usr/bin/env bash
# Idempotent milestone (phase) management for the github-issues task-tracking adapter.
#
# Scope is deliberately narrow (title/description/state via fixed subcommands, no
# free-form `gh api` invocation) so this script is safe to allowlist for unattended
# approval, per core/principles/best-practices.md's Scripts Intended for the
# Permission Allowlist.
#
# Usage:
#   milestone.sh ensure --title TITLE [--description DESC] [--repo OWNER/NAME]
#   milestone.sh close  --title TITLE [--repo OWNER/NAME]
#   milestone.sh list   [--state all|open|closed] [--repo OWNER/NAME]
#
# ensure: finds a milestone whose title matches TITLE exactly (open or closed);
#         creates it if absent. Prints the milestone number on stdout.
# close:  finds an open milestone whose title matches TITLE exactly and closes it.
#         Prints the milestone number on stdout. Fails if no open match is found.
# list:   prints a JSON array of {number,title,state}, filtered by --state
#         (default: all).
#
# Diagnostic text goes to stderr, so `num=$(milestone.sh ensure ...)` captures just
# the number.

set -euo pipefail

GH=${GH:-gh}
JQ=${JQ:-jq}

ACTION="${1:-}"
shift || true

REPO=""
TITLE=""
DESCRIPTION=""
STATE="all"

usage() {
  cat >&2 <<'USAGE'
Usage:
  milestone.sh ensure --title TITLE [--description DESC] [--repo OWNER/NAME]
  milestone.sh close  --title TITLE [--repo OWNER/NAME]
  milestone.sh list   [--state all|open|closed] [--repo OWNER/NAME]
USAGE
  exit 1
}

case "$ACTION" in
  ensure|close|list) ;;
  *) usage ;;
esac

while [[ $# -gt 0 ]]; do
  case "$1" in
    --title) TITLE="$2"; shift 2 ;;
    --description) DESCRIPTION="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    --state) STATE="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown argument: $1" >&2; usage ;;
  esac
done

if [[ -n "$REPO" ]]; then
  REPO_PATH="$REPO"
else
  REPO_PATH="{owner}/{repo}"
fi
MILESTONES_PATH="repos/$REPO_PATH/milestones"

case "$ACTION" in
  list)
    case "$STATE" in
      all|open|closed) ;;
      *) echo "--state must be 'all', 'open', or 'closed'" >&2; usage ;;
    esac
    "$GH" api -X GET "$MILESTONES_PATH" -f state="$STATE" --paginate \
      | "$JQ" -s 'add // [] | map({number, title, state})'
    ;;

  ensure)
    [[ -n "$TITLE" ]] || { echo "--title is required" >&2; usage; }

    EXISTING=$("$GH" api -X GET "$MILESTONES_PATH" -f state=all --paginate \
      | "$JQ" -s --arg t "$TITLE" 'add // [] | map(select(.title == $t)) | .[0].number // empty')

    if [[ -n "$EXISTING" ]]; then
      echo "Milestone already exists: #$EXISTING ($TITLE)" >&2
      echo "$EXISTING"
      exit 0
    fi

    CREATE_ARGS=(-f title="$TITLE")
    [[ -n "$DESCRIPTION" ]] && CREATE_ARGS+=(-f description="$DESCRIPTION")

    NUMBER=$("$GH" api "$MILESTONES_PATH" "${CREATE_ARGS[@]}" --jq '.number')
    echo "Created: milestone #$NUMBER ($TITLE)" >&2
    echo "$NUMBER"
    ;;

  close)
    [[ -n "$TITLE" ]] || { echo "--title is required" >&2; usage; }

    NUMBER=$("$GH" api -X GET "$MILESTONES_PATH" -f state=open --paginate \
      | "$JQ" -s --arg t "$TITLE" 'add // [] | map(select(.title == $t)) | .[0].number // empty')

    if [[ -z "$NUMBER" ]]; then
      echo "No open milestone titled '$TITLE' found" >&2
      exit 1
    fi

    "$GH" api -X PATCH "repos/$REPO_PATH/milestones/$NUMBER" -f state=closed >/dev/null
    echo "Closed: milestone #$NUMBER ($TITLE)" >&2
    echo "$NUMBER"
    ;;
esac
