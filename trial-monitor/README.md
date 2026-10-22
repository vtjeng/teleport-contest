# Single Standard engineer timeline records

The existing `manifest.json` and `repairs.json` feed the worker timeline. Their
paths are retained for compatibility; the parallel trial is shelved, with its
status `not-started` and start/end null. The audited Oct 21 11:50–15:50 UTC
baseline remains frozen: 13 accepted repairs, one carry-in, 3.25/hour including
it and 3.00/hour excluding it. These are elapsed wall-time observations.

The current lane selects repairs with `window: "single-worker"`. This register
has partial historical coverage: recent repairs and their corrections are
recorded, not the whole earlier single-worker history. Retired worker
ledger lanes and their metrics remain separately selectable. Neither missing
records nor elapsed spans measure active work, idle time or compute.

## Small recording path

Maintain these JSON files in ordinary source-backed work commits; do not make
status-only dashboard commits. Use one stable repair `id`, `kind:
"parity-repair"`, title, source/C-witness/test paths and a `candidates` array.
Append corrections to that same ID. Dashboard work and matched-C probes are
not accepted parity repairs. A `note` can retain rejected leads and limitations.

When an investigation actually begins/ends, record its UTC timestamps in
`investigations: [{ "start": "…", "end": "…", "note": "…" }]`. Use null for an
open end and update the register's `asOf` at that observation. Open spans stop
at that saved observation, never at the viewer's clock. If timestamps were not
recorded, leave the array empty; commits are not investigation start times.

Record known candidate SHAs and every required gate attempt under `candidates`.
Include run ID/name, exact SHA, attempt, event, branch, status/conclusion,
`createdAt` and final job `completedAt`. Preserve failures. Before moving
`manifest.operations.currentCandidate` to another SHA, persist the previous
candidate's final gate records. This is the latest **recorded** candidate,
which can lag the actual worker. A newly created SHA and its final gates can be
recorded in the next normal work commit; there is no self-referential commit
rewrite or separate publication loop. Update the affected files' `asOf`.

## What refreshes automatically

At build time, the existing dashboard embeds both files. Page open and
**Refresh public status** read their latest Main versions and public GitHub CI.
They refresh the existing timeline without status polling or credentials. The
existing whole-page reload still runs every 30 minutes. Only the
selected candidate is enriched with exact final job times. Investigation
activity, repair identity, correction grouping, evidence paths and candidate
selection require recorded events; GitHub cannot infer them. API failure keeps
the last-known snapshot and last successful check time, with a retry message.
All required reads must succeed before data is applied. Refresh shows loading,
updated or already-up-to-date feedback; overlapping clicks share no extra work.
The concise recorded-activity timestamp stays stale after one hour even if the
API read worked. Missing dates remain unknown. The outdated Exploration yield
and Shared work queue panels are no longer rendered; historical data is retained.

Checkpoint accepts integration-branch push/dispatch; Lint and Dashboard require
Main **push** success, all on one exact SHA. All three successful gate completion
times plus source/witness/test evidence establish an accepted repair; correction
candidates and reruns cannot increment that repair count. CI bars span run
creation through final job completion, including queue time. Publication is one
elapsed span over that candidate's Lint/Pages runs. Missing final times do not
create completed spans. The actual acceptance process still imports and
compares the saved checkpoint evidence before publication; this timeline is a
presentation of its recorded results, not a replacement gate.
