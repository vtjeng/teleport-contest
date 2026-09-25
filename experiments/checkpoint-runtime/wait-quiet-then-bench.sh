#!/usr/bin/env bash
# Waits until the machine is quiet, then runs the paired checkpoint benchmark:
# ROUNDS alternating rounds of BASE and CAND, each checkpoint split into its
# test-suite half and the other checks, each in a fresh worktree.
# Quiet means the 1-minute load average stays below 1.0 for 10 consecutive
# one-minute checks. After 2 hours of waiting it runs anyway and says so.
# Usage: wait-quiet-then-bench.sh <repo> <base> <cand> <out-dir> [rounds]
set -u
S=$(cd "$(dirname "$0")" && pwd)
REPO=$1 BASE=$2 CAND=$3 OUT=$4 ROUNDS=${5:-3}
deadline=$(( $(date +%s) + 7200 ))
quiet=0
while :; do
  load=$(cut -d' ' -f1 /proc/loadavg)
  if awk -v l="$load" 'BEGIN { exit !(l < 1.0) }'; then quiet=$((quiet + 1)); else quiet=0; fi
  if [ "$quiet" -ge 10 ]; then echo "quiet at $(date -Is), load $load"; break; fi
  if [ "$(date +%s)" -ge "$deadline" ]; then echo "not quiet by $(date -Is), load $load; running anyway"; break; fi
  sleep 60
done
mkdir -p "$OUT"
cd "$REPO" || exit 1
for i in $(seq 1 "$ROUNDS"); do
  for c in "$BASE" "$CAND"; do
    for part in tests rest; do
      node scripts/run-bounded.mjs full -- node "$S/profile-checkpoint.mjs" "$REPO" "$c" "$OUT/$c-$part-$i.json" "$part" > "$OUT/$c-$part-$i.log" 2>&1
      echo "$c $part $i exit=$? at $(date -Is), load $(cut -d' ' -f1 /proc/loadavg)"
    done
  done
done
echo "bench done"
