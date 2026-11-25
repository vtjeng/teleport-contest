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
# <base-ref> and both files exist. On a host other than macOS, a recipe whose
# committed recording must come from macOS (scripts/recipe-host.mjs,
# "recordOn": "macos") is listed in <out-dir>/macos-only.txt and left to the
# macOS recordings workflow instead of being recorded. Exits 1 when a recipe
# fails to record, a recording differs, or a changed recording has no recipe
# at the same path, and 0 when nothing changed.
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

# A Linux recording of a macOS-only recipe cannot equal its committed macOS
# recording, so only the macOS host records it. recipe-host.mjs exits 1 on a
# recipe it cannot read, which stops this script.
: > "$OUT/macos-only.txt"
if [ "$(uname -s)" != Darwin ]; then
    node scripts/recipe-host.mjs $(cat "$OUT/recipes.txt") > "$OUT/macos-only.txt"
fi
grep -vxF -f "$OUT/macos-only.txt" "$OUT/recipes.txt" > "$OUT/to-record.txt" || true
macos_only=$(wc -l < "$OUT/macos-only.txt" | tr -d ' ')
sed 's/^/macOS-only, left to the macOS recordings workflow: /' "$OUT/macos-only.txt"

status=0
for dir in $(cut -d/ -f2 "$OUT/to-record.txt" | sort -u); do
    # record-sample.sh names its output by the recipe's base name, so each
    # source-file directory is recorded into its own output directory.
    experiments/host-parity/record-sample.sh "$OUT/$dir" 3 \
        $(grep "^recipes/$dir/" "$OUT/to-record.txt") || status=1
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
done < "$OUT/to-record.txt"

differing=$(wc -l < "$OUT/differing.txt" | tr -d ' ')
checked=$((count - macos_only))
echo "$((checked - differing)) of $checked recordings equal the committed ones on $(uname -s);" \
    "$macos_only macOS-only recipes left to the macOS recordings workflow"
exit "$status"
