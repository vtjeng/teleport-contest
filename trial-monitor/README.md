# Dashboard workflow and discovery evidence

The repository dashboard projects evidence; it does not dispatch work or accept
repairs. Main is the sole gameplay integrator. The reported session topology and
batch policy live in `manifest.json` under `operations.workflow`, with an
observation date and source. They are editable configuration, not fixed lanes.
Retired Oct 19 worker activity remains historical and hidden by default.

## Data and refresh boundaries

- Scores retain the existing complete `challenges/published.json` cohort and
  evaluation-hash checks. The repair register retains individual identities,
  corrections and shared candidate SHAs. Gate success is labelled publication
  verification; receipt completion is a separate fact.
- `evidence-sources.json` lists explicit immutable metadata references, including
  unmerged analyst PRs. `evidence.json` is generated, not a manually maintained
  ledger. Only listed case/inventory/projection/decision JSON is read; no runner,
  recording, gameplay file or excluded investigation is executed.
- Rebuild with `node scripts/dashboard-evidence.mjs`, or verify with `--check`.
  Both operate offline using `git show <full-sha>:<path>`. Fetch the corresponding
  public PR refs first if those objects are absent. Update pins and regenerate
  only with new reviewed evidence at an ordinary publication boundary. Default
  dashboard builds read the compact checked-in projection without network calls.
- Page open / Refresh public status retain the existing pinned-Main repair and
  CI refresh. They do **not** refresh discovery evidence. The UI shows separate
  scan completion, available review watermark, topology observation, register
  observation, score receipt and source SHAs. A review watermark is incomplete
  when newer version-1 cases lack reviewedAt. Register/receipt persistence can
  lag the latest local completion until the next ordinary publication.

## Observed transitions, without another ledger

When a transition is actually observed, retain it on its existing evidence case
or repair record in `workflow.events`, each `{type, at, evidence}`. `at` is UTC;
`evidence` identifies the observed handoff/completion record. Supported types:
`reported-ready`, `picked-up`, `returned-for-evidence`. On repair records add
`workflow.rootCause` equal to the evidence case's `rootCause`. Cases may include
multiple source keys and PRs. Root identity, not PR count, defines queue rows.
Do not reconstruct timestamps from PR creation, commits or validator exit codes.
A case's `readiness: review_ready` is only reported readiness, not acceptance.
Missing timestamps stay unknown even when the current status is recorded.

Complete receipt evidence and exact-SHA publication gates are both required for
accepted status. The existing verified score receipt can establish completeness
for its group, but has no receipt-completion timestamp: elapsed acceptance time
therefore stays unknown. The pinned Levels follow-up independently records one
fully accepted case; its recordedAt is an observation, not an exact completion.
Future completion records can supply `completedAt` when actually observed.
Shared gates/receipt status are displayed once per SHA, never summed per repair.

For explicit consumer waiting, `operations.noActionableHandoffIntervals` accepts
`{start, end, evidence}` only when both boundaries and the no-actionable condition
were observed. Ready-to-pickup measures producer backlog delay. Neither gaps nor
these wall durations establish idle time, active compute, tokens or savings.
Crashes/interruptions can make elapsed spans ambiguous. Queue coverage is partial:
only selected pinned packages and linked repair records are projected. Historical
unknown transitions must not be backfilled en masse.

## Outcome units and interpretation

Scanner inventory keys, reviewed keys, semantic roots, catalog comparisons and
accepted repairs are different units. Review fingerprints and evidence keys must
bind to the exact run; stale bindings are not negatives. Unresolved/invalid setup,
unreachable, missing coverage, duplicates and unknown classifications remain
separate. Empty unresolved decision files may be represented by a case explicitly
marked unresolved and bound through its original projection; never as a negative.

The displayed key rate is `explained_negative / (explained_negative + confirmed
+ accepted)`. It excludes duplicates, unresolved and all unreviewed/stale keys.
These are selected analyst reviews, not a representative sample or a population
FPR. Both raw denominator and exclusion counts remain visible. Cause rates use
named roots on both sides and are withheld when reviewed keys lack a root.
Repeated technique/version records remain distinct; source-audit key kinds map
message keys to missing_message and other edges to call_graph under the same
pinned tool/config/run. Do not pool different runs or versions as one estimator.
Exact bound negative decisions may exclude only their matched keys; heuristic
ranking hints only deprioritize, never resolve a lead. Static source comparisons
stay outside scanner/repair rates and make no runtime correctness claim.

## Validation and rollout

Focused tests: `node --test scripts/dashboard-workflow.test.mjs
scripts/dashboard-workflow-view.test.mjs scripts/trial-monitor.test.mjs scripts/single-worker-activity.test.mjs
scripts/dashboard-data.test.mjs`. Run focused ESLint and, after committing,
`node scripts/checkpoint-preflight.mjs`. The dashboard build embeds the tested
reducer and renderer; preview at phone and desktop widths, exercise inventory
selection and disclosures, and check page errors/overflow. No hosting, access,
security or workflow changes are needed. Main integrates the draft tooling PR,
performs its normal gates and verifies publication. No CI dispatch is needed
from this tooling session. Use a `[skip ci]` commit for the draft tooling push.

Rendered QA limitation for this candidate: Chromium navigation to the local
preview `file:///tmp/dashboard-preview.html` was rejected with
`ERR_BLOCKED_BY_ADMINISTRATOR`. The operation stopped without alternate routing.
Desktop and Android screenshots/visual inspection remain required at rollout.
The optional `scripts/dashboard-workflow.browser.mjs` checks inventory switching,
disclosures, page errors and overflow on a permitted preview URL; it blocks
external HTTP requests and never runs gameplay.

## Historical recording format (single-engineer period)

The following describes retained historical fields and refresh behavior. Its
single-engineer topology is retired; use the observed topology above.


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
