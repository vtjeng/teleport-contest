#!/bin/bash
# batch-check.sh -- Record one chunk of a batch's recipes on this host and
# replay each recording with the port.
#
# Usage: experiments/host-parity/batch-check.sh <out-dir> <batch> <chunk> <chunks>
#
# Records every recipe of experiments/host-parity/batch/<batch>/ whose index
# in the sorted list is <chunk> modulo <chunks>, replays each recording with
# frozen/ps_test_runner.mjs, and writes one line per game to
# <out-dir>/results-<batch>-<chunk>.tsv: id, passed, RNG calls matched and
# total, screens matched and total. The port already matches these games'
# Linux recordings, so a game that fails here differs between the hosts.
# Only the recordings that fail are kept, under <out-dir>/fail/<batch>/.
set -uo pipefail
OUT="$1"; BATCH="$2"; CHUNK="$3"; CHUNKS="$4"
mkdir -p "$OUT/fail/$BATCH" "$OUT/rec"
ls experiments/host-parity/batch/"$BATCH"/*.session.json | sort | awk -v c="$CHUNK" -v n="$CHUNKS" '(NR-1)%n==c' > "$OUT/list-$BATCH-$CHUNK.txt"
echo "chunk $CHUNK of $CHUNKS: $(wc -l < "$OUT/list-$BATCH-$CHUNK.txt") recipes of batch $BATCH"
experiments/host-parity/record-sample.sh "$OUT/rec" 4 $(cat "$OUT/list-$BATCH-$CHUNK.txt") || true
cp "$OUT/rec/failed.txt" "$OUT/record-failed-$BATCH-$CHUNK.txt"
RES="$OUT/results-$BATCH-$CHUNK.tsv"; : > "$RES"
check_one() {
    local f=$1 id; id="$(basename "$f" .session.json)"
    node frozen/ps_test_runner.mjs "--worker-session=$f" 2>/dev/null | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const i=d.indexOf("__RESULT_ONE__");let r={};try{r=JSON.parse(d.slice(i+14))}catch(e){r={passed:false,error:"no result"}}
const m=r.metrics||{};console.log([process.argv[1],r.passed?1:0,m.rngCalls?.matched,m.rngCalls?.total,m.screens?.matched,m.screens?.total,(r.error||"").slice(0,80)].join("\t"))})' "$id"
}
export -f check_one
ls "$OUT"/rec/*.session.json | xargs -P 4 -I{} bash -c 'check_one "$1"' _ {} >> "$RES"
awk -F'\t' '$2!=1{print $1}' "$RES" | while read -r id; do cp "$OUT/rec/$id.session.json" "$OUT/fail/$BATCH/"; done
mkdir -p "$OUT/logs-$BATCH-$CHUNK"; for id in $(cat "$OUT/rec/failed.txt"); do cp "$OUT/rec/logs/$id.log" "$OUT/logs-$BATCH-$CHUNK/" 2>/dev/null; done
rm -rf "$OUT/rec"
echo "replayed $(wc -l < "$RES"), failing $(awk -F'\t' '$2!=1' "$RES" | wc -l), not recorded $(wc -l < "$OUT/record-failed-$BATCH-$CHUNK.txt")"
