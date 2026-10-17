# Choosing what to implement next

Read this file when selecting or resuming a goal. `.agents/glossary.md`
defines the goal kinds; `.agents/loop.md` describes their execution.

## Choosing a goal

Repair regressions in the accepted fixed workload, regression recordings, or
previously matching synthetic screens first. A source-traced dependency needed
to repair a regression may precede it; record that dependency in the selection
reason. Otherwise choose an independently assignable source task from unmatched
synthetic local holdout cases in the latest valid saved evaluations, across
every admitted batch.
`.agents/scoring.md` defines evaluation freshness and comparison. The diagnostic mismatch lists feed the one assignment queue described in
`.agents/architecture.md`. Source criteria below do not override its claim-time
priority; seed continuity is a tie-breaker, not a second dispatch policy.

The work lead runs `node scripts/mismatch-queue.mjs --work --json` and
uses its sessions and investigation records for selection. Queue order is a
diagnostic display order, not an implementation requirement.
Use `--fixed --json` for the separate fixed 44-session diagnostic queue.
The combined queue retains corpus identity and reports missing, failed, or
stale synthetic evidence as blockers; an empty fixed queue does not establish
synthetic parity. Investigations cover C and Lua sources, partially implemented
functions, defects in existing code, screen and cursor mismatches, and
unresolved source owners.
A JavaScript declaration is inventory information, never completion evidence.

### One source-led capability trial

Vincent authorized exactly one implementation experiment,
`explicit-search-hallu-capability-20261017`, before a full failing recording.
This is the explicit-search caller/capability frontier, **not** a new port of
the already implemented `find_trap`. Main independently closed its source and
owner review at `0915ed8f939110d89cb36c27465a1e9a51c143de`, review SHA-256
`c03aba059bc7dc3e7a8a3faa49decfd72ef8b401885417db59ba1b22f2234d87`.
Only this trial may use its `sourceTrial` opt-in. Explicitly authorized source
parity corrections use the separate protocol below. This trial grants no
general source backlog.

Freeze the whole `detect.c:find_trap`, `detect.c:dosearch0`, and
`detect.c:dosearch` source/caller review; permit writes only to `js/detect.js`,
`scripts/detect.test.mjs`, and private `.cache/`. Remove only obsolete
hallucinatory explicit-search capability refusals, with default state/random
wiring and exact Hallucination predicates. Preserve real non-global/planning
isolation and injected-message/wait guards, source state/RNG ordering, messages,
map memory, acknowledgement/WIN_STOP, and redraw. Existing helpers must suffice;
stop on an unresolved callee, helper-file expansion, renderer/engine rewrite,
owner conflict, or inability to test the actual default production path.

Main enqueues through the existing `work-queue.mjs enqueue --json` command,
using the exact ID above as `id` and `goal`, Main producer/recipient,
implementation type/output, the three `source:detect.c:<function>` reservations,
and focused/lint checks. `sourceTrial` is the following immutable object, with
`assignmentBase` set to that assignment's **current accepted** base:

```json
{
  "id": "explicit-search-hallu-capability-20261017",
  "reviewedBase": "0915ed8f939110d89cb36c27465a1e9a51c143de",
  "reviewSha256": "c03aba059bc7dc3e7a8a3faa49decfd72ef8b401885417db59ba1b22f2234d87",
  "evidenceBasis": "constructed-state-runtime-pending",
  "assignmentBase": "<current accepted full SHA>"
}
```

Enqueue and claim verify pinned relevant source/test identities and C gitlink
against the reviewed source; changed identities require re-review. Normal queue
freshness, priority, dependencies and ownership still apply. Do not reassess the
trial onto a different base. One worker has at most 60 minutes implementation
and focused verification, plus 15 minutes independent review/triage, and at most
one scoped rework. No substitution or automatic scope extension on failure.

The worker uses normal claim and `worker-state.mjs submit --task <transport>`.
Copy `sourceTrial` unchanged to its context, choose file-port `cFile: detect.c`,
`functions: ["find_trap"]`, and `requiredFunctions` entries for `dosearch0` and
`dosearch` with `sourceFile: detect.c`; the noncontiguous functions are not a
range spanning unrelated `mfind0`. Submission evidence declares
`evidenceBasis: "constructed-state-runtime-pending"`, impure source units,
source-pinned tests and real production callers. Exercise initialized live-game
defaults and real queued acknowledgement, not injected success substitutes;
cover core/display RNG including role/rank naming, resistance, remembered glyph,
WIN_STOP, clone guards and ordinary search/kick countercases. Missing recording
coverage remains explicit. Goal creation remains the existing received-delivery
registration path; workers do not edit `GOALS.json`.

Main reviews and accepts only after the normal exact hosted checkpoint,
fixed-44, regression recordings, all admitted synthetic evaluations and per-case
no-regression gates. Preserve the evidence basis under goal worker claims;
acceptance certifies neither source completion nor public input parity. These
constructed states are not recipes, C differential discoveries, admitted cases,
or score gains. Any later public recipe/replay/comparison and challenge admission
must satisfy the ordinary rules separately. Compare observed behaviors exercised,
regressions, rework, and recorded worker/lead effort including setup and triage;
mark unmeasured effort unknown and never treat calendar elapsed as CPU. Stop or
expand only after an explicit review decision; this one trial supplies no
general effectiveness claim.

### Explicitly authorized source parity corrections

When the user authorizes a source-proved parity repair without a public mismatch,
Work lead may enqueue a sessionless Main implementation with `sourceParity`.
Do not invent a session, discovery, runtime witness or score gain. This is a
correction to existing reachable behavior, not general roadmap selection.

Producer and Main review trace every preceding branch, return, helper predicate
and state change on the exact entry-to-target path, and establish one jointly
satisfiable valid state. A missing late call alone does not establish
reachability. This is a source review attestation, not mechanical proof.

The version-1 object binds its assignment/goal ID, accepted `assignmentBase`,
`evidenceBasis: "source-parity-runtime-pending"`, and an inline `review` with its
`reviewSha256` (SHA-256 of its exact JSON serialization). The review records the
user authorization, reviewed base, exact C `units` (`file.c:function`), allowed
paths, existing focused regression paths, pinned Git C gitlink and relevant
JavaScript/test blob identities, real production caller/source traces, and the
current and expected state/control-flow. Enqueue and claim verify the pins
against both bases. The reviewed scope and base cannot expand or be reassessed;
changed prerequisites require a new review. SourceParity and sourceTrial are
mutually exclusive. Rework retains the exact sourceParity object.

Use the file-port transport/context for the exact reviewed source units, with
empty sessions and unchanged sourceParity metadata; this records correction
scope without certifying whole functions. Worker claims retain the explicit
runtime-pending basis, impure units, production callers, entry points and pinned
tests. Preserve actual failing focused regression output against the original
source and passing output for the same command in `regression.before` and
`regression.after`. The before receipt names `base`, `command`, nonzero
`exitCode` and `output`; after names the same command, zero exit and output.
No public gameplay is authorized by this opt-in. Broader recording work still
needs its own qualified task.

Work lead may mark the user's requested repair urgent under existing priority.
It adds zero to the count of ready implementation sessions. Use the normal
immutable submission, exact hosted checkpoint and per-case no-regression
acceptance/publication path. Runtime-pending claims never become source
certification or synthetic discovery evidence. Preserve the separate ordinary
recording requirements for other assignments.

The queue displays measured unmatched screens, first mismatch steps, and
source groups for diagnosis. Neither screen counts nor first mismatch steps
predict how much source behavior a fix will complete. Keep RNG, cursor,
refusal, and runner failures visible; a failed or missing evaluation is not a
measured zero. For a free implementation worker slot, prefer a session with a
completed, valid investigation whose source functions and shared-state
contracts are not reserved by another worker or pending delivery. Otherwise
the worker claims an eligible session and investigates it before claiming
implementation scope. Apply the seed-continuation rule below before assigning
a new task.

Use existing investigation records and reservations to identify related work
in the same C function family or Lua program, caller path, or state contract.
Where one coherent implementation can address those mismatches, include the
additional source functions, callers, and session IDs before claiming source
scope, subject to worker reservations. Do not bundle unrelated work
solely to increase the number of sessions covered. Define the complete scope
before code edits start and finish its source behavior even when only one
session currently reaches it.

Do not investigate a batch of sessions merely to group work before assignment.
The assigned worker owns diagnosis through delivery. Separate investigators
provide bounded help for a specific question under `.agents/loop.md`, "Worker
support"; do not maintain a continuously refilled investigator pool. Keep an
implementation task running until its normal handoff; reconsider availability
between tasks.

Use the selected investigation's source trace to choose the goal kind:

- Missing or partial C behavior: open a `file-port` for the responsible whole
  function or self-contained function family. Use `--from-function` and
  `--to-function` for a group, in C definition order. Include required callees
  and the production caller changes in the same task. Existing declarations
  do not justify skipping incomplete branches.
- Missing or partial Lua behavior: open a `lua-port` for the responsible
  `dat/*.lua` program. Include its top-level statements, helper functions,
  random-call order, and dispatch wiring. An existing `load_special()` or
  registered loader does not establish that the program is complete.
- A defect in implemented behavior: open a `divergence-fix` and follow
  `.agents/divergence.md`. Trace deterministic state changes as well as RNG
  and drawing; a screen mismatch need not be a rendering defect.
- An unresolved source owner: continue the claimed investigation until it
  identifies a C or Lua owner and one of the above goal kinds, or records a
  concrete blocker. A caller annotation alone does not count as a completed
  investigation.

Always name the selected session with `--sessions` (or `--session` for a
divergence fix). For a synthetic case, retain its batch, manifest digest,
recording path and digest, and saved evaluation in the handoff and selection
reason; use a batch-qualified identity throughout goals and investigations.
List each related synthetic session included in a grouped task in `--sessions`
so its own batch and recording provenance travels with the goal.
Use `--selection-reason` to identify the selected session, investigation, and
source-traced scope, including related sessions bundled into the task. When the
goal's source differs from the queue's annotated owner, explain the source
trace that establishes the actual owner. If a non-regression task precedes an
outstanding regression, name the dependency that requires it. The selection
guard checks source ownership and current evidence, not screen-count rank.

Keep goal prose specific to the decision: `summary` names the behavior,
`selectionReason` explains its source scope, and `detail` holds the concise
source trace required for a divergence fix. Reference `investigations/<session>.json`
for the full diagnosis instead of copying its report into these fields.
Keep worker activity and delivery progress in the runtime ledger. Preserve
goal lifecycle, score boundaries, source-completion evidence, and
remaining-work reasons.

`queue-goal`, `open-goal`, and task-context creation still check selection
against actionable source-traced cases and current evidence. Do not park an
open goal merely because another session has more unmatched screens. Park it
when its source scope is blocked or the task cannot continue independently:
`park-goal --goal <id> --reason "<source-based reason>"`. State the remaining
source or coverage work and the condition for resuming. Name a blocking
function or goal when one is known; if only closure records remain, say so.
Reconsider these reasons at loop startup and when a named dependency lands.
Resume with `open-goal --id <id>` when the condition is met.

When source review shows that another goal replaces a queued or parked plan,
retire the old plan with `supersede-goal --goal <old-id> --by <replacement-id>
--reason "<source-based reason>"`. This preserves its evidence, historical spans, and
measurements without claiming completion or adding a score event. Superseded
plans leave the current queue and cannot be reopened; their replacement owns
any remaining work. Keep a goal parked when it still has independent work.

Use `node scripts/goal-log.mjs roadmap` to trace dependencies and choose
under-exercised behavior for new synthetic missions. An empty fixed queue
selects synthetic work; a shortage of independently assignable tasks selects
batch preparation or admission under the rule below.
Do not fall back to unrelated source ports merely because a queue is empty.
Whole-source completion and caller evidence remain required for every port.

## Generating the next synthetic batch

Challenge lead plans exploration and assembles batches while the three general workers
execute queued assignments. `.agents/architecture.md` owns hierarchy,
producer permissions, the five-ready-session priority, and worktrees. Challenge lead
adds bounded exploration and follow-up tasks to that queue and does not spawn
or dispatch separate explorers. Work lead owns acceptance and admission; only a
complete admitted baseline produces runnable implementation work.

Maintain one active batch plan. After submitting it, Challenge lead can plan the next
unused version without waiting for acceptance, while retaining correction
context for earlier deliveries. Prioritize queued corrections according to
the shared policy. Acceptance does not admit a batch. Apply the exploration
evidence requirements in `.claude/agents/challenge-lead.md`.

After each current evaluation and worker handoff, check the combined queue and
reservations for selectable investigations and independent source tasks.
Exclude claimed or blocked work and group known shared causes. An unclaimed
session may provide investigation work before its source owner is known; do
not require a new grouping investigation just to count it. This provisional
availability count does not establish source independence or authorize edits.
Use current complete saved evaluations to decide admission priority. Missing
or stale evidence is not a zero count: refresh it before deciding. Record queue
starvation in the friction log.

Independently design each C behavior candidate before comparing its JavaScript
result. There is no minimum number of designs for search, comparison or
submission; one eligible case may proceed. For each candidate, name the source
behavior, the state and action history needed to reach it, and the C
observation that will show it was reached. Earlier admitted cases and candidates
overlapping an unresolved admitted case, an earlier submitted unadmitted case,
or another case in the new batch do not establish a distinct new behavior. Draw candidates from current source-traced blockers and parked
work, the roadmap's under-exercised functions,
and earlier missions that missed their intended behavior. Prefer targets with
a plausible C route and different source owners; reserve some missions for less
directed exploration. A rare blocker is
one candidate, not a requirement to hold the whole batch open. Vary behavior
families, action histories, and relevant character or state conditions;
changing only seeds is insufficient. Follow
`experiments/generalization/plan.md`, "Expanding challenges", and
`.agents/validation.md` for C exploration and recording.
Compare valid C probes provisionally against a fixed accepted JavaScript
commit. Independently replay every case retained in the prepared manifest.
A case qualifies when it has a local mismatch and the C
behavior responsible for its first mismatch is source-traced and distinct
from the first mismatching behavior of every other counted session. Later mismatches in that session are allowed. Record the
first mismatch step, source behavior, and owner for each counted session.
Keep distinct, valid, reproducible mismatching cases in the prepared manifest.
A missed mission can count if its first mismatch meets the criterion above.
Matching cases and cases with duplicate or unresolved first mismatch behaviors
do not qualify. Retain valid overlap probes outside that manifest
with their C evidence and the earlier case they duplicate. Reject invalid setup
or recorder failures with recorded C evidence. Resolve recorder-environment
differences before treating them as game defects.

Leave matching probes out of new prepared manifests unless the user requests
a specific regression control. Preserve their recipes and C evidence as
preparation evidence; do not investigate their novelty. Keep existing admitted
controls unchanged. This rule also applies to cases that missed their target.
Preserve already-submitted batches and their saved control rationales.

After two materially different C setups fail to reach a difficult target,
defer it with the observed reason and try another; a cheap source-proven route
can justify another attempt. Replace deferred targets with different reachable
behaviors. Submit a nonempty, validated group of distinct failures as soon as
it is ready; a single qualifying failure is sufficient.
If no failures qualify, report the searched behaviors and blockers, then
continue with other targets. Park only for a concrete blocker.
Choose further candidate behaviors from the C source and coverage gaps; do not
alter a recipe to exploit a JavaScript result. Local mismatch counts are
provisional because main can advance during preparation. The work lead's
first saved evaluation after admission is authoritative and may find fewer
remaining mismatches.

Do not filter, replace, or extend an admitted batch based on those results.

The worker submits case recipes and C recordings under
`challenges/cases/<batch>/`. Keep the manifest in immutable delivery evidence,
outside `challenges/manifests/`, with an independent C replay result in each
case's `reproducibility` field. The work lead checks the cases, merges the
recipes and recordings into `main`, runs the combined checkpoint, and accepts
the delivery. Keep those files and their hashes unchanged. Compare each
mismatching candidate's reached C behavior, relevant state, and action history with
unresolved admitted cases, earlier submitted unadmitted batches, and other cases in the
new batch. Use the latest complete saved evaluations for admitted cases and
immutable delivery packets for unadmitted cases. A merged task does not imply
that its cases match. Fully matching admitted cases do not disqualify a new
mismatching case for overlap, even in the immediately preceding batch. Use saved
C evidence for this comparison; do not replay the archive just to check overlap. Full
regression validation still covers every admitted case.
Shared startup and command setup do not by themselves constitute overlap; the
substantive behavior exercised must differ. Cite comparable cases from that set
and the causal distinction for each mismatching candidate, including target
misses. Keep valid
overlapping C probes outside the prepared manifest with their C observation
and the earlier case they duplicate. They do not need independent replay unless
needed to establish a blocker. During the existing pre-admission review,
recheck overlap against current saved evidence; require a corrected delivery
for overlapping cases or unrequested matching controls. Until admission, the cases do not enter synthetic scoring,
the mismatch queue, or the dashboard's scored batch charts. The dashboard lists
ready batches awaiting admission separately.

At each safe integration boundary, admit all valid, accepted batches available
then, in version order. Do not wait for worker starvation, an empty delivery
queue, or screen parity. Freeze the group before baseline validation; new
arrivals belong to the next group. Hold batches only for concrete evidence,
integrity, or dependency failures. Follow `.agents/validation.md`, "Hosted
admission baselines". Run baselines on GitHub, not the local machine.

After admitting accepted batches, use the current valid queue and reservations
to choose the next integration. If fewer independent candidate groups are
available than implementation workers needing work, integrate dependency-ready
prepared batches before implementation deliveries. Otherwise prioritize
implementation. Resolve required dependencies before blocked preparation;
use existing prepared batches before requesting more. `worker-state next
--queue <saved-queue>` reports the counts and next action. Missing or stale
evidence requires a refresh, not a shortage assumption. Never interrupt an
active candidate to change priority.

After saving a new batch's baseline, follow `.agents/loop.md`, "Notifications".

Do not interrupt an active checkpoint. Admission still requires current,
complete evaluations and passing fixed-workload evidence. Missing, failed,
or stale evaluations block admission.
Continue investigating and scheduling older unmatched cases;
admission does not close or suppress them. Keep outstanding RNG or cursor
defects visible across the transition. Preserve `v1` at
`challenges/manifest.json`; admit later
batches in version order under new manifests, starting with `v2`. Never replace
or extend an admitted batch.

Keep every prepared case when admitting its manifest; do not filter by
JavaScript results. Save the hosted baseline before selecting failures.
Retain earlier batches and their original evaluations as regression history.
`.agents/scoring.md` explains how to report each batch without counting added
screens as fixes.

## Tooling support

The combined work queue, goal-selection checks, scorer, and dashboard retain
batch-qualified identities and immutable recording hashes. Synthetic case IDs
are `synthetic/<batch>/<case-id>`; keep that full ID in `--sessions` or
`--session`, worker context, and `investigations/<session>.json`. `v1` remains
at `challenges/manifest.json`; later manifests live at
`challenges/manifests/v2.json`, `v3.json`, and so on. Only directly listed
versioned manifests are admitted batches.

Use current saved evaluations for every admitted batch before selecting work.
The dashboard reads those evaluations and shows each batch’s history
separately, so adding a batch does not look like implementation progress.

Do not pass a challenge evaluation as `--development-scan`, move challenges
into `sessions/`, or overwrite `v1` to satisfy a fixed-workload interface.
Keep the fixed queue and score distinct from the synthetic work queue; an
empty fixed queue must not hide pending synthetic investigations.

## Seed continuation

A worker completes its current assignment and then claims from the shared
queue under `.agents/architecture.md`. Continuing the same seed is a
preference only between otherwise equally eligible tasks. Do not privately
create a next implementation goal or bypass exploration/rework priority.
Work lead or Challenge lead may add a proposed follow-up through the queue's producer rules.

The claimed implementation task still needs a complete source scope, base,
write set, and atomic source/session reservations before edits. Another
worker's reservation or an unclear shared contract is a dependency to resolve
through Work lead, not permission to widen the task. The queue preserves the
original assignment and stopping condition through that investigation.

Explain any seed-continuation tie-breaker, related sessions, and reservations
in the task's selection reason. Source observations stay tied to their measured
commit; retain investigation provenance and do not refresh historical counts
merely for acceptance. Reconcile work made redundant by intervening accepted
fixes before dispatching it again. Neither dispatch nor integration waits for
all workers to finish together.

## Investigation cache

Store each session's source investigation in
`investigations/<session>.json`, using the queue's canonical session ID.
Preserve the `holdout/` prefix as a subdirectory and give synthetic cases a
separate batch-qualified namespace. This tracked cache supplies
both worker handoffs and the CI-built dashboard. The work lead commits
completed and partial results by explicit path at the next commit boundary
that preserves checkpoint ownership, then pushes them. Uncommitted results
are not published. Follow `.agents/validation.md`, "Routine validation", to
avoid changing checkpoint inputs during goal closure. The work lead may seed an entry from an existing
investigation with the required evidence and recorded count, without repeating
its work.

Each JSON object contains:

- `session`: canonical session ID.
- `remainingScreensUpperBound`: the fixed session’s queue count when investigated.
  Synthetic records instead use exact `remainingScreens` and `recordedSteps`,
  and retain `corpus`, `batch`, `caseId`, `manifestPath`, `manifestSha256`,
  `recordingSha256`, `evaluationPath`, and `evaluationCommit` from the queue.
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

After each current scan or evaluation, compare each fixed session’s
`remainingScreensUpperBound` or synthetic case’s `remainingScreens` with its
cached value. Invalidate only that investigation when its count changes, or
when its synthetic batch, manifest, or recording identity differs. Do not invalidate it for a new commit, changed files, elapsed
time, a changed annotation or mismatch kind, or another session's progress.
Do not use the recording's fixed `recordedSteps` total as the invalidation key.
Sessions absent from the mismatch queue need no investigation or selection;
retain their cache files without scheduling work for them.

A partial entry does not qualify for selection; continue its investigation.
A complete entry with the same count remains valid across tasks and restarts.
Check the count again before accepting an investigator's result so that a late
result for an old count cannot replace a current investigation. Pass a valid
cached investigation to the implementation worker, which still verifies its
source claims before implementation. Cache reuse does not establish source completion
or replace validation.

Keep the replay cache's existing freshness checks in `scan-sessions.mjs`.
The current scan checks an investigation's count for new task selection.
Submission instead checks historical counts against their cited saved evidence;
an accepted fix need not rewrite its original diagnosis.

The queue and dashboard distinguish `complete`, `partial`, `missing`, `stale`
(count changed), and `invalid` (unreadable or malformed file) results. Only a
`complete` result qualifies for selection. Repair malformed files without
discarding their source findings. CI reads the tracked investigation files;
keep findings and their source pointers in the result, not only in `.cache/`.

## Registering the goal

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

Write a worker-local task context for the selected scope before implementation;
the work lead registers its central goal at integration and leaves it queued
until acceptance. A source port includes
every unit in its selected range without recorded completion evidence,
including previously declared functions. Submit worker findings as
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

When source and saved C evidence establish a build-profile difference or
recorder defect, update `investigations/synthetic/<batch>/<case>.json`.
Keep its recording identity and measured counts current, set `status` to
`"complete"`, and add `resolution` with `kind` (`"build-provenance"` or
`"recorder-defect"`), `reason`, and `disposition`. Cite the supporting evidence.
Work lead refreshes the work queue with `scripts/mismatch-queue.mjs --work --json`
and confirms the case appears under `excluded`. Preserve original recordings
and raw score history. Reopen the case if new evidence shows a gameplay
defect or the relevant build-profile contract changes.

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
