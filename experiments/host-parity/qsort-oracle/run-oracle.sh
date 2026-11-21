#!/bin/bash
# run-oracle.sh -- build qsort-oracle.c with the host's C compiler and sort
# every case in cases.txt with the host's qsort().
#
# Usage: experiments/host-parity/qsort-oracle/run-oracle.sh <out-dir>
#
# Writes <out-dir>/calls.txt, one line per case in qsort-oracle.c's output
# format. The macOS workflow (.github/workflows/macos-recorder.yml) runs
# this; results/macos-calls.txt is a copy of its output.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${1:?usage: run-oracle.sh <out-dir>}"
mkdir -p "$OUT"
cc -O2 -Wall -Wextra -o "$OUT/qsort-oracle" "$HERE/qsort-oracle.c"
"$OUT/qsort-oracle" < "$HERE/cases.txt" > "$OUT/calls.txt"
rm "$OUT/qsort-oracle"
echo "$(wc -l < "$OUT/calls.txt" | tr -d ' ') cases in $OUT/calls.txt"
