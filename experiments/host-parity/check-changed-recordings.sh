#!/bin/bash
# check-changed-recordings.sh -- Record on this host every recipe that a
# candidate adds or changes, and require each recording to equal the committed
# one byte for byte.
#
# Usage: experiments/host-parity/check-changed-recordings.sh <base-ref> <out-dir> [--list-only]
#
# The judge's reference recordings were made on macOS; recordings are usually
# made on Linux (docs/testing.md, "Local recordings and the judge's host").
# The macOS recordings workflow runs this on a macOS runner for every
# candidate, so a recording that only a Linux recorder produces cannot become
# regression evidence. A recipe counts when it or its recording differs from
# <base-ref> and both files exist. Exits 1 when a recipe fails to record, a
# recording differs, or a changed recording has no recipe at the same path,
# and 0 when nothing changed.
set -euo pipefail

BASE="${1:?usage: check-changed-recordings.sh <base-ref> <out-dir> [--list-only]}"
OUT="${2:?usage: check-changed-recordings.sh <base-ref> <out-dir> [--list-only]}"
MODE="${3:-}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE/../.."

mkdir -p "$OUT"
# --no-renames lists a moved file as an addition, so a renamed recipe or
# recording is checked like a new one.
git diff --name-only --no-renames --diff-filter=AM "$BASE"...HEAD -- recipes recordings \
    | sed -E 's#^(recipes|recordings)/##' | sort -u > "$OUT/changed.txt"
: > "$OUT/recipes.txt"
: > "$OUT/orphans.txt"
while IFS= read -r rel; do
    if [ -f "recipes/$rel" ] && [ -f "recordings/$rel" ]; then
        echo "recipes/$rel" >> "$OUT/recipes.txt"
    elif [ -f "recordings/$rel" ]; then
        # A recording with no recipe at the same path cannot be re-recorded,
        # so it would escape the comparison. A recipe with no recording is a
        # blocked recipe and has nothing to compare.
        echo "recording without a recipe: $rel" | tee -a "$OUT/orphans.txt"
    fi
done < "$OUT/changed.txt"
if [ -s "$OUT/orphans.txt" ]; then
    echo "$(wc -l < "$OUT/orphans.txt" | tr -d ' ') changed recordings have no recipe at the same path" >&2
    exit 1
fi
count=$(wc -l < "$OUT/recipes.txt" | tr -d ' ')
echo "$count recipes with a recording changed since $BASE"
if [ "$MODE" = "--list-only" ] || [ "$count" -eq 0 ]; then
    exit 0
fi

status=0
for dir in $(cut -d/ -f2 "$OUT/recipes.txt" | sort -u); do
    # record-sample.sh names its output by the recipe's base name, so each
    # source-file directory is recorded into its own output directory.
    experiments/host-parity/record-sample.sh "$OUT/$dir" 3 \
        $(grep "^recipes/$dir/" "$OUT/recipes.txt") || status=1
done

: > "$OUT/differing.txt"
while IFS= read -r recipe; do
    rel="${recipe#recipes/}"
    recorded="$OUT/$(dirname "$rel")/$(basename "$rel")"
    if [ ! -f "$recorded" ]; then
        echo "not recorded: $rel" | tee -a "$OUT/differing.txt"
        status=1
    elif ! cmp -s "$recorded" "recordings/$rel"; then
        echo "differs from the committed recording: $rel" | tee -a "$OUT/differing.txt"
        status=1
    fi
done < "$OUT/recipes.txt"

differing=$(wc -l < "$OUT/differing.txt" | tr -d ' ')
echo "$((count - differing)) of $count recordings equal the committed ones on $(uname -s)"
exit "$status"
