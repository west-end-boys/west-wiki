#!/usr/bin/env sh
#
# github-issues task-tracking adapter — machine interface.
#
# Emits the normalized phase model required by core/workflow/task-tracking.md
# §Machine Interface as a single JSON object on stdout.
#
# Run from the project root (inside a clone with a GitHub remote):
#   sh .autocode/task-tracking/github-issues/phase-status.sh
#
# Contract: this script answers "what does the tracker say?" It makes no scheduling
# decisions — the harness owns those. See harness.md for the division of responsibility.
#
# GH and JQ are overridable so the mapping can be tested without network access.

set -eu

GH=${GH:-gh}
JQ=${JQ:-jq}

for bin in "$GH" "$JQ"; do
  command -v "$bin" >/dev/null 2>&1 || {
    echo "phase-status: required command not found: $bin" >&2
    echo "              see task-tracking/github-issues/conventions.md #Prerequisites" >&2
    exit 1
  }
done

# One call. Issues without a milestone, or in a milestone that is not "Phase <N>: ...",
# are not autocode tasks and are filtered out below.
issues=$(
  "$GH" issue list \
    --label "autocode:task" \
    --state all \
    --limit 1000 \
    --json number,title,body,labels,state,milestone
) || {
  echo "phase-status: 'gh issue list' failed — check 'gh auth status' and the repo remote" >&2
  exit 1
}

printf '%s' "$issues" | "$JQ" -c '
  def labelnames: (.labels // []) | map(.name);

  # Precedence: closed beats every label; then deferred > implemented > in-progress.
  def status:
    if (.state | ascii_downcase) == "closed" then "done"
    elif (labelnames | index("status:deferred"))    then "deferred"
    elif (labelnames | index("status:implemented")) then "done"
    elif (labelnames | index("status:in-progress")) then "in_progress"
    else "open" end;

  def planid:
    (.title | capture("^Task\\s+(?<i>[0-9A-Za-z._-]+)\\s*:") | .i)? // null;

  def verify:
    (.body // "" | capture("\\*\\*Verify:\\*\\*\\s*(?<v>[^\\n\\r]*)") | .v)? // "";

  # Sort tasks by plan ID segment-wise so 1.10 follows 1.9 rather than 1.1.
  def idkey:
    if .id == null then [999999]
    else (.id | split(".") | map(tonumber? // 0))
    end;

  map(select(.milestone != null))
  | map(select(.milestone.title | test("^Phase [0-9]+")))
  | map({
      phase:  (.milestone.title | capture("^Phase (?<n>[0-9]+)") | .n),
      header: .milestone.title,
      task: {
        id:          planid,
        status:      status,
        description: .title,
        verify:      verify,
        issue:       .number
      }
    })
  | group_by(.phase)
  | map({
      number: .[0].phase,
      header: .[0].header,
      tasks:  (map(.task) | sort_by(idkey))
    })
  | sort_by(.number | tonumber)
  | {phases: .}
'
