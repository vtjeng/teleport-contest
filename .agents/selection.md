# Choosing what to implement next

Read this file when selecting or resuming a goal. `.agents/glossary.md`
defines the goal kinds; `.agents/loop.md` describes their execution.

## Choosing a goal

Repair regressions in the accepted fixed workload, regression recordings, or
previously matching synthetic screens first. Otherwise select from unmatched synthetic local holdout
cases in the latest valid saved evaluations, across every admitted batch.
`.agents/scoring.md` defines evaluation freshness and comparison. Workers use
the saved selected queue and the seed-continuation procedure below.

The orchestrator still runs `node scripts/mismatch-queue.mjs --json` for fixed
regressions and uses its `sessions` array and investigation records. That
command currently covers only the fixed 44 sessions; an empty result does not
establish synthetic parity. See "Tooling support" below before dispatching
synthetic work. Investigations cover C and Lua sources, partially implemented
functions, defects in existing code, screen and cursor mismatches, and
unresolved source owners.
A JavaScript declaration is inventory information, never completion evidence.

Rank synthetic cases by measured unmatched screens (total minus matched)
descending, then first mismatch step ascending (unknown last), then batch and
case ID. Keep RNG, cursor, refusal, and runner failures visible; a failed or
missing evaluation is not a measured zero. For fixed-workload regressions,
retain `remainingScreensUpperBound` descending, first mismatch step ascending,
and canonical session ID as the order.
For a free worker slot, select the first session with a completed, valid
investigation whose source functions and shared-state contracts are not
reserved by another worker or pending delivery. Apply the seed-continuation
rule below before assigning a new session. Use this per-session order even
when the command's grouped `candidates` order differs. Actual unmatched
counts rank synthetic cases; first-mismatch upper bounds are only diagnostics.
Neither predicts how many screens a source fix will recover.

Start background investigations for the other uncached or invalidated sessions
as `.agents/loop.md`, "Background investigations", specifies. Do not wait for a
higher-ranked session's investigation while a completed, valid investigation
is available. If none is available, wait for an investigator's completion,
then select the first ready session in the same order without waiting for the
rest. Keep an implementation span running until its normal handoff; reconsider
selection between spans.

Use the selected investigation's source trace to choose the goal kind:

- Missing or partial C behavior: open a `file-port` for the responsible whole
  function or self-contained function family. Use `--from-function` and
  `--to-function` for a group, in C definition order. Include required callees
  and the production caller changes in the same span. Existing declarations
  do not justify skipping incomplete branches.
- Missing or partial Lua behavior: open a `lua-port` for the responsible
  `dat/*.lua` program. Include its top-level statements, helper functions,
  random-call order, and dispatch wiring. An existing `load_special()` or
  registered loader does not establish that the program is complete.
- A defect in implemented behavior: open a `divergence-fix` and follow
  `.agents/divergence.md`. Trace deterministic state changes as well as RNG
  and drawing; a screen mismatch need not be a rendering defect.
- An unresolved source owner: keep its investigation in the background queue
  until it identifies a C or Lua owner and one of the above goal kinds. A
  caller annotation alone does not count as a completed investigation.

Always name the selected session with `--sessions` (or `--session` for a
divergence fix). For a synthetic case, retain its batch, manifest digest,
recording path and digest, and saved evaluation in the handoff and selection
reason; use a batch-qualified identity throughout goals and investigations.
When the selected goal differs from the command's highest grouped candidate
or its annotated owner, supply `--selection-reason` with
the selected session, remaining-screen count, cache path, and source-traced
owner. Explain its eligibility under per-session order, seed continuation,
and source reservations; identify higher-ranked sessions still awaiting
investigation or owned by another worker when applicable. This policy
authorizes that choice without user approval. A source-traced dependency or a
condition blocking
implementation can still justify a different choice; record that reason.

Keep goal prose specific to the decision: `summary` names the behavior,
`selectionReason` explains its priority, and `detail` holds the concise source
trace required for a divergence fix. Reference `investigations/<session>.json`
for the full diagnosis instead of copying its report into these fields.
Keep worker activity and delivery progress in the runtime ledger. Preserve
goal lifecycle, score boundaries, source-completion evidence, and
remaining-work reasons.

`queue-goal`, `open-goal`, `next-span`, and a divergence fix's `queue-span`
still check selection against grouped candidates and the recorded reason.
The orchestrator applies the completed-investigation priority described here.
Reconsider priority between spans. When an open goal no longer addresses the
first eligible session under these scheduling rules, preserve its work with
`park-goal --goal <id> --reason "<source-based reason>"` and select again.
State the remaining source or coverage work and the condition for resuming
in the existing reason. Name a blocking function or goal when one is known;
if only closure records remain, say so. Reconsider these reasons at loop
startup and when a named dependency lands. Resume with `open-goal --id <id>`
when the condition is met and its priority permits.

When source review shows that another goal replaces a queued or parked plan,
retire the old plan with `supersede-goal --goal <old-id> --by <replacement-id>
--reason "<source-based reason>"`. This preserves its evidence, spans, and
measurements without claiming completion or adding a score event. Superseded
plans leave the current queue and cannot be reopened; their replacement owns
any remaining work. Keep a goal parked when it still has independent work.

Use `node scripts/goal-log.mjs roadmap` to trace dependencies and choose
under-exercised behavior for new synthetic missions. An empty fixed queue
selects synthetic work; exhausting synthetic screens selects batch generation.
Do not fall back to unrelated source ports merely because a queue is empty.
Whole-source completion and caller evidence remain required for every port.

## Generating the next synthetic batch

When current, complete evaluations of every admitted batch show zero unmatched
screens, generate the next batch without asking for another goal. Blocked or
uninvestigated failures, unavailable results, and stale evaluations do not
satisfy this condition. Keep outstanding RNG or cursor defects visible across
the transition. If a new batch already matches, retain its baseline and repeat
with different behavior coverage.

Plan a small batch of independent missions before inspecting their JavaScript
results. Use C source and coverage gaps to vary behavior families, action
histories, and relevant character or state conditions; changing only seeds
is insufficient. Follow `experiments/generalization/plan.md`, "Expanding
challenges", and `.agents/validation.md` for C exploration and recording.
Confirm reproducibility with an independent C replay. Retain every valid,
reproducible case, including missed missions and cases JavaScript already
passes; reject only invalid setup or recorder failures with recorded C evidence.
Resolve recorder-environment differences before treating them as game defects.

Keep recipes, C recordings, and hashes immutable. Preserve `v1` at
`challenges/manifest.json`; admit the next batch under a new versioned
manifest, starting with `v2`, without replacing or extending a frozen batch.
Commit the batch and save its first evaluation at a committed implementation
before its JavaScript failures guide fixes. Publish that baseline and resume
selection from the admitted cases. Retain earlier batches as regression checks
and their original evaluations as history. `.agents/scoring.md` defines how
to report each batch without counting added screens as implementation gains.

## Tooling support

The existing scan, queue, goal-selection checks, and investigation dashboard
were built for the fixed workload; the challenge scorer currently reads only
`challenges/manifest.json`. At loop setup, implement and validate missing
support in these existing tools before dispatching synthetic goals or using a
new manifest. Preserve batch-qualified case identities, immutable hashes,
source investigations, per-batch evaluations, and dashboard status throughout.
This supporting work is part of the authorized operating mode.

Do not pass a challenge evaluation as `--development-scan`, move challenges
into `sessions/`, or overwrite `v1` to satisfy a fixed-workload interface.
Keep the fixed queue and score distinct from the synthetic work queue; an
empty fixed queue must not hide pending synthetic investigations.

## Seed continuation

After a delivery, the persistent worker selects its next source-traced goal
under the standing permission in `.agents/loop.md`. Prefer continuing the same
seed when a focused replay of its immutable worker base identifies the next
goal. If that scope is blocked or overlaps another worker, select the
highest-ranked independent ready goal from the saved selected queue, with
regression repairs taking priority over further synthetic gains.
Seed continuity is a scheduling preference, not permission to special-case
that seed or to skip whole-source completion.

Before editing, check the current runtime ledger and pending scope
announcements for active and pending-delivery reservations. Prepare the next
worker-local span context and notify the orchestrator of the base commit,
next mismatch, source scope, dependencies, and write set. Claim that scope
with an atomic `assign` event as `.claude/agents/span-worker.md`, "Claiming
and submitting work", specifies, before editing.
Do not wait for acknowledgement after a successful claim.
If ownership is unclear, another worker reserves the function, or a shared
contract must change, ask the orchestrator to resolve that dependency and
continue independent work meanwhile. Different functions in the same file
need not conflict. If no independent goal is ready, investigate the next
eligible candidate and report the blocker rather than waiting for an
assignment. Respect the user's task bounds and stop requests throughout.

Explain seed continuation or a reserved higher-ranked candidate in
`--selection-reason`; do not describe it as globally highest priority.
A fresh worker-branch observation stays tied to that commit and does not
replace main's investigation cache. Recheck selection and
existing completion evidence before integrating each delivery; reconcile
work made redundant by intervening integrations rather than implementing it
again. A submitted delivery may be integrated while another worker proceeds;
neither dispatch nor integration waits for an entire worker batch.

## Investigation cache

Store each session's source investigation in
`investigations/<session>.json`, using the queue's canonical session ID.
Preserve the `holdout/` prefix as a subdirectory and give synthetic cases a
separate batch-qualified namespace. This tracked cache supplies
both worker handoffs and the CI-built dashboard. The orchestrator commits
completed and partial results by explicit path at the next commit boundary
that preserves checkpoint ownership, then pushes them. Uncommitted results
are not published. Follow `.agents/validation.md`, "Routine validation", to
avoid changing checkpoint inputs during goal closure. The orchestrator may seed an entry from an existing
investigation with the required evidence and recorded count, without repeating
its work.

Each JSON object contains:

- `session`: canonical session ID.
- `remainingScreensUpperBound`: the session's queue count when investigated.
- `status`: `partial` until the source owner and actionable scope are established,
  then `complete`.
- `commit` and `mismatch`: the full examined commit SHA and original session
  queue entry, retained as provenance. Omit its `investigation` field to avoid
  copying earlier cached results into later ones.
- `summary`: the current source-backed finding for the dashboard, including
  the unresolved behavior or blocker. For a partial result, state what is
  known and what remains unresolved. Keep worker activity out of this field.
- `source`: an object with `file` and `branch` strings, plus `functions`,
  `callers`, and `dependencies` arrays of strings. Name the preconditions in
  `branch`.
  Use the Lua program name in `functions` for a Lua investigation. A partial
  result may omit `source`; when included, provide `file` and `functions`.
  A complete result needs a nonempty file, branch, function list, and caller
  list; use an empty dependency list when there are no dependencies.
- `goalKind`: `file-port`, `lua-port`, or `divergence-fix` when complete.
- `evidence`: a nonempty array of strings with source locations, diagnostic
  artifact references, and explanations of the cause and implementation scope. For a partial result,
  include the next source-backed probe. Include enough source detail to read
  the finding in CI without access to local diagnostic artifacts.

Update a tracked investigation when its diagnosis, source scope, supporting
evidence, or unresolved blocker changes. Replace superseded explanations
with the current finding; retain counter-evidence that prevents repeating a
failed approach and every unresolved source defect. Git preserves earlier
versions. Do not append worker activity checks, submission acknowledgements,
correction scheduling, or repeated checkpoint totals to `evidence`; those
belong in the runtime ledger, delivery packet, or saved validation result.

The dashboard reads investigation status, summary, and source names. Keep
those fields current when publishing a changed finding, and retain the
source detail workers need even when the dashboard does not display it.
Changes to record writers or schemas must preserve the dashboard's goal
history, score attribution, parked-work reasons, source coverage, and
investigation states. Check the affected dashboard data and rendering when
changing that contract; routine finding updates do not require a new replay.

After each current scan, compare each session's `remainingScreensUpperBound`
with its cached value. Invalidate only that session's investigation when the
count changes. Do not invalidate it for a new commit, changed files, elapsed
time, a changed annotation or mismatch kind, or another session's progress.
Do not use the recording's fixed `recordedSteps` total as the invalidation key.
Sessions absent from the mismatch queue need no investigation or selection;
retain their cache files without scheduling work for them.

A partial entry does not qualify for selection; continue its investigation.
A complete entry with the same count remains valid across spans and restarts.
Check the count again before accepting an investigator's result so that a late
result for an old count cannot replace a current investigation. Pass a valid
cached investigation to the span worker, which still verifies its source
claims before implementation. Cache reuse does not establish source completion
or replace validation.

Keep the replay cache's existing freshness checks in `scan-sessions.mjs`.
The current scan supplies the count used to validate this separate
investigation cache.

The queue and dashboard distinguish `complete`, `partial`, `missing`, `stale`
(count changed), and `invalid` (unreadable or malformed file) results. Only a
`complete` result qualifies for selection. Repair malformed files without
discarding their source findings. CI reads the tracked investigation files;
keep findings and their source pointers in the result, not only in `.cache/`.

## Opening the goal

Queue a C source port with:

```
node scripts/goal-log.mjs queue-goal --kind file-port --id <id> \
  --c-file <file.c> --from-function <first> --to-function <last> \
  --summary "<whole source behavior>" --sessions <development-session>
```

Omit the function bounds to cover the whole C file. A function family may be
selected in any file; it need not wait for a file-size threshold.

Queue a Lua program with:

```
node scripts/goal-log.mjs queue-goal --kind lua-port --id <id> \
  --lua-file <program.lua> --summary "<whole source behavior>" \
  --sessions <development-session>
```

Queue a divergence fix with `--kind divergence-fix`, `--c-file`, `--function`,
`--session`, and optionally `--step`; put the source trace in `--detail`.
A Lua program correction uses `lua-port` so its top-level behavior remains in
scope. The same source-tracing and replay requirements apply.

Open with `open-goal --id <id>`, then plan with `next-span --goal <id>`.
A source port plans every unit without recorded completion evidence,
including previously declared functions. Record the evidence as
`.agents/validation.md`, "Source completion evidence", specifies. Do not
rewrite historical goal or score rows to make their old name counts verified.

## Reading a mismatch

An RNG annotation identifies a call site, not necessarily the cause. Compare
its preconditions and the state established by earlier calls against the
upstream source. The last matching RNG call proves only that draw matched;
it does not prove that its caller or earlier deterministic behavior was right.
Lua annotations can identify both a helper and the program that called it.

For a screen or cursor mismatch, use `frozen/screen-decode.mjs` and the scan's
cell and cursor fields to locate the difference. Investigate messages, input
boundaries, game state, and drawing. Matching RNG does not imply matching game
state. A mismatch without a known step stays in the queue until investigated.

For a refusal, inspect the actual throw and the C or Lua branch it replaces.
Name the source function in the refusal message when it is missing, so later
scans can attribute it. Remove obsolete guards and injected placeholders when
their behavior lands; do not rename a refusal into a completed implementation.

A session can have multiple segments. The scorer concatenates their screens
and RNG logs positionally, so an early segment's output count can shift later
segments. Compare first mismatches and complete recordings as well as totals.
`score-development.mjs` is the authority on measured matching screens across
the fixed 44-session workload.

The queue ranks first failures from the fixed workload. The local-holdout
recordings are ordinary entries in that workload: goal-log accepts identifiers
such as `holdout/seed4500-knight-coverage` and explicit paths such as
`sessions/holdout/seed4500-knight-coverage.session.json` in `--sessions` or
`--session`, storing the canonical queue ID with its `holdout/` prefix.
`--development-scan` takes a saved scan JSON artifact; `--sessions` and
`--session` take workload identifiers or explicit session paths.
The upper bounds are not predicted gains. Synthetic failures drive the
separate work queue under "Choosing a goal"; keep their exact unmatched-screen
counts and first-failure diagnostics distinct. The remote competition holdout
is outside this workspace.
