# Single Standard engineer timeline records

The existing `manifest.json` and `repairs.json` feed the worker timeline. Their
paths are retained for compatibility; the parallel trial is shelved, with its
status `not-started` and start/end null. The audited Oct 21 11:50–15:50 UTC
baseline remains frozen: 13 accepted repairs, one carry-in, 3.25/hour including
it and 3.00/hour excluding it. These are elapsed wall-time observations.

The current lane selects repairs with `window: "single-worker"` or
`window: "post-trial"`. Frozen baseline and trial records stay outside it. This register
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
Include the candidate's UTC `committedAt` when recording a new or pending SHA,
plus run ID/name, exact SHA, attempt, event, branch, status/conclusion,
`createdAt` and final job `completedAt`. Preserve failures and previous final
gate records. Append corrections to the same repair; no separate pointer update
is needed. Candidate SHAs and their evidence still land in ordinary work commits,
without self-referential commit rewrites or a separate publication loop.

The repair register is the source of truth for candidate selection. The reducer
selects the newest dated candidate, independent of array order, using
`committedAt`, then `startedAt`, then the earliest persisted exact-SHA CI
`createdAt` as evidence that the candidate existed. These timestamps identify
candidate evidence, not active work or investigation start. The manifest's
legacy `operations.currentCandidate` is ignored for selection; a disagreement
is shown rather than silently followed. It can be retired without affecting
selection. Do not maintain it as another live pointer.

A candidate without a date cannot establish chronology. The page marks undated
entries, repairs with no candidate, and conflicting newest dates explicitly;
it never infers a new SHA from investigation text or a successful API read.
The displayed candidate is the latest dated evidence, not a claim about what
the engineer is doing now. Candidate age is calculated only from that persisted
candidate evidence, independently of register `asOf`, final gate times and
API check time. Complete candidates stay labelled completed; old evidence stays
stale even when unrelated history or CI checks are refreshed.

## What refreshes automatically

At build time, the existing dashboard embeds both files. Page open and
**Refresh public status** resolve Main once, read both files at that exact revision, and read public GitHub CI.
They refresh the existing timeline without status polling or credentials. The
existing whole-page reload still runs every 30 minutes. Only the
selected candidate is enriched with exact final job times. Investigation
activity, repair identity, correction grouping, evidence paths and candidate
dates require recorded events; GitHub cannot infer them. API failure keeps
the last-known snapshot and last successful check time, with a retry message.
All required reads must succeed before data is applied. Refresh shows loading,
updated or already-up-to-date feedback; overlapping clicks share no extra work.
Candidate evidence stays stale after one hour even if the API read worked. Missing dates remain unknown. The outdated Exploration yield
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
