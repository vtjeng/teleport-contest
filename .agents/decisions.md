# Adopted process changes

This log records adopted process and tooling changes. Observations remain in
[friction.md](friction.md), and pending ideas remain in
[proposals.md](proposals.md). The Process analyst drafts entries; Work lead
integrates them alongside the approved implementation at safe boundaries with
all existing validation and publication checks preserved.

Keep each entry concise: date/change; why, with friction or proposal links;
implementation commit or PR; expected benefit and tradeoff; and follow-up
evidence initially `unmeasured`. Measure comparable observations when available
and link their evidence here. Preserve older entries; a later reversal links to
the earlier decision and states its reason. Do not backfill assumed adoption
or measured benefits from pending proposals.

## 2026-10-16 — Checked exploration snapshot coalescing

- Change: Vincent directly approved a WL-local 15-minute coalescer during active
  exploration. Completed independent discovery evidence and retrospective
  classifications create a watermark; unchanged data and publisher events do not.
  A minute-level local observer defers for owned Main work, integration/review,
  ready implementation/deliveries and publication CI. It is not hosted cron.
- Implementation: `scripts/dashboard-refresh.mjs`, `snapshot-publication.mjs`
  and `main-work.mjs` in this publication. The separate snapshot-only verifier
  binds actual captured history and regenerates public fields, requires unchanged
  execution and strict snapshot-only history, and preserves the original imported
  checkpoint. The existing tooling publication gate remains intact. Whole-operation
  shared leases, exact proposal recovery and report-equivalent execution queue
  bases protect normal integration and live claims.
- Benefit/tradeoff: bound otherwise indefinite exploration-only snapshot lag,
  while adding local process/lease ownership and recovery obligations. The
  observer cannot survive an environment shutdown and busy/failed boundaries can
  delay publication. No-change intervals do not fabricate a fresh timestamp.
- Follow-up: **unmeasured** operational lag benefit. Focused disposable-repository
  tests cover repeated proof reuse, foreign/mutated prefix rejection, privacy,
  ownership, strict scope, preserved pending/live tasks and crash recovery. Observe
  the first natural completed-discovery change and exact Lint/Pages result; no
  artificial gameplay or discovery event is created to exercise publication.

## 2026-10-16 — Exploration discovery history

- Change: Vincent requested a primary hourly view of unique qualified mismatching
  sessions and supported first-cause families. Claimed/closed discovery tasks,
  reported C-evidence usability, unknowns and dispositions provide context;
  qualified sessions per 100 closed tasks is a secondary task-level rate.
- Implementation: metrics and audited index in
  [b78a09a39](https://github.com/vtjeng/teleport-contest/commit/b78a09a39677de73a0cff497f4f078e9de18c9f3),
  originally Process analyst f13840c08, with the dashboard renderer and snapshot wiring in
  the same publication. Immutable packet digests bind retrospective classifications;
  current ledger events keep new unknowns visible. Main support, linked follow-ups
  and v90's seven recovered cases are outside the discovery denominator. Carried
  sessions retain their original discovery time. Physical C-attempt and session
  denominators remain unavailable.
- Why: the earlier dashboard lag came from publication-only snapshot creation;
  exploration ledger events did not trigger deployment. Show activity snapshot
  freshness separately from page build time. This adds no automatic refresh cadence.
  Three dated operational markers are not strategy experiments or causal evidence.
- Benefit/tradeoff: reviewable discovery history, with sparse samples, retrospective
  classifications and snapshot lag stated explicitly. Existing claim, evidence,
  admission, validation and publication gates remain unchanged.
- Follow-up: **unmeasured**. Review UI usefulness after publication and discovery
  yield after a separately predeclared strategy experiment; task throughput is not
  a success criterion.

## 2026-10-15 — ongoing friction triage and an adopted-change log

- Change: make friction triage a standing Process analyst responsibility, with
  brief post-batch and periodic reflections, and link this log from the dashboard.
- Why: repeated setup extensions and a mislabelled replay in the
  [v89 friction record](friction.md#2026-10-15--v88-acceptance-and-v89-setup-limits),
  plus the [fresh-ledger startup gap](friction.md#2026-10-15--fresh-ledger-baseline-has-no-first-publication-route),
  show the need for ongoing review of repeated failures and coordination mistakes.
  The user's standing request replaces the former request-only triage rule.
- Implementation: [17a1f38f0754cb1b6fdcfcd68776fe65afea7e53](https://github.com/vtjeng/teleport-contest/commit/17a1f38f0754cb1b6fdcfcd68776fe65afea7e53).
- Expected benefit/tradeoff: detect recurring friction and test small remedies
  sooner; brief reflections and decision upkeep add coordination work. Reviews
  use saved evidence independently of worker execution and preserve existing gates.
- Follow-up evidence: `unmeasured`. Compare repeated attempts, rejected-delivery
  corrections, and avoidable waits across subsequent comparable batches, including
  reflection overhead and unchanged or worse outcomes; link observed results here.

## 2026-10-15 — observe a verified first published tooling baseline

- Change: add `initial-baseline.mjs` to observe an already tested and published
  first baseline, recording the existing `tooling-published` event with a
  hash-frozen checkpoint and no task or delivery acceptance.
- Why: the [fresh-ledger startup record](friction.md#2026-10-15--fresh-ledger-baseline-has-no-first-publication-route)
  identified a deadlock: ordinary tooling publication required an earlier
  accepted anchor, and the first Prep submission required an accepted comparison.
  Work lead approved this separate scoped recovery change.
- Implementation: [8c74fa337a6f226f301830d0936d38285776b1e5](https://github.com/vtjeng/teleport-contest/commit/8c74fa337a6f226f301830d0936d38285776b1e5).
- Expected benefit/tradeoff: establish a truthful initial comparison baseline
  without fabricating history or changing old readers. The route requires exact
  archived execution evidence, published-main identity and tooling-only history;
  a later tooling baseline needs an explicit queue refresh and JavaScript-only
  comparison update for retained cases. Normal validation and acceptance gates stay.
- Follow-up evidence: `unmeasured`. Observe the first real initialization and
  first Prep submission at that baseline; record any rejected supported case,
  provenance updates and retries. Preserve original C captures and packets.

## 2026-10-16 — complete hosted evidence through the GitHub API

- Change: routine checkpoint and admission imports read complete result files
  from the exact combine job's Check output. Numbered gzip/base64 annotation
  chunks and a final SHA-256 manifest preserve the original JSON bytes.
  Imports verify the workflow run, attempt, commit, job, check suite, GitHub
  Actions app, chunk membership and file digests before existing archive and
  per-case acceptance checks. Historical artifact transport requires explicit
  `--artifact`; missing API evidence has no automatic fallback.
- Why: proxy CONNECT HTTP 403 failures prevented artifact-host access after
  successful hosted validation; see the recovery entry in [friction.md](friction.md).
- Implementation: [6bf27a30913ac385d5af8da2556117bd499c1f42](https://github.com/vtjeng/teleport-contest/commit/6bf27a30913ac385d5af8da2556117bd499c1f42).
- Expected benefit/tradeoff: routine imports no longer depend on the artifact
  storage host. Annotation encoding and API pagination add transport overhead.
- Follow-up evidence: [checkpoint 38835906013](https://github.com/vtjeng/teleport-contest/actions/runs/38835906013)
  passed, and finalized check 116766121192 retained all 14 payload chunks.
  API import verified 93 files, including all 89 admitted synthetic evaluations,
  with 496,613 compressed bytes and no artifact download. Existing full-checkpoint
  and per-case validators passed. This establishes transport availability for one
  checkpoint; comparative timing and hosted admission publication remain unmeasured.

## 2026-10-16 — manual Score and Coverage reports

- Change: Vincent asked whether to disable automatic Score and Coverage runs;
  Coordinator adopted manual-only reports after reviewing the evidence. Remove
  their main-push triggers while retaining manual dispatch, scripts and artifacts.
  Publication tracking requires automatic Lint and Dashboard only.
- Why: Checkpoint already tests and scores both populations before publication.
  Score's separate summary has no repository acceptance consumer. Coverage's
  unique unexecuted-line listing is reporting only and sets no threshold.
- Expected benefit/tradeoff: avoid two repeated post-publication jobs while
  giving up their automatic per-push reports. The full prepublication Checkpoint
  gate remains unchanged. The latest six completed jobs averaged 13m11s for
  Coverage and 8m39s for Score; all 18 sampled completed runs per workflow passed.
- Follow-up evidence: first-publication workflow selection and pending-cache
  completion will be checked. Comparative publication timing and throughput
  remain unmeasured.

## 2026-10-16 — typed queue evidence attachments

- Change: Work lead adopted opt-in versioned attachments for newly enqueued
  exploration tasks that require self-contained evidence. Completion and
  blocking retain exact JSON bytes separately from verifier log status.
  Validate task/base, explicit linked packet identity, embedded byte counts,
  SHA-256 values and required file references before a ledger transition.
- Why: repeated successful verifier logs were frozen instead of the promised
  original envelopes. Four excluded matches needed supplemental preservation;
  their original deficient packets remain unchanged and explicitly qualified.
- Expected benefit/tradeoff: reject missing/corrupt attachments before results
  are recorded, at the cost of JSON parsing, hashing and stored bytes. Internal
  consistency does not prove source correctness or make a failed case admissible.
  Existing successful-check and batch acceptance gates remain required.
- Follow-up evidence: focused guard tests cover PASS-only/missing evidence,
  binding and corruption failures, unchanged claims after rejection, exact-byte
  retention across branch changes, and nonzero blocked receipts. Hosted
  validation and first producer use remain pending; transport-rework reduction
  and overhead are unmeasured.

## 2026-10-16 — opt-in source-specific recorder prompt completion

- Change: Vincent explicitly approved implementing and validating PA's bounded
  same-process prompt-handler proposal (`c1585d8d6`, strategy review section
  "20:40 proposal"). Implementation `01ff7e5f2`, corrected by `4ce70ef6d`, adds
  an opt-in recorder mode; default static recording is preserved. A frozen
  source-bound table permits exact-frame More acknowledgments, proven-neutral
  optional scroll-call cancellation and one positively recognized inventory
  observer. Unknown or ambiguous boundaries stop with partial evidence.
- Why: fixed suffixes in closed chwepon and bag-tip feasibility tasks reached
  messages but lost their observers to pagers/name entry. Prefix re-recording
  physically repeats the action; it cannot serve as live prompt completion.
- Tradeoff: exact whole-screen/cursor predicates are deliberately conservative
  and require source review. Practical authorability remains unmeasured. Full
  frame/key receipts and the actual emitted input-only recipe are retained;
  target-plus-observer success requires one unchanged static C replay within
  the same total deadline. Capture and replay count as separate physical runs.
- Limits/follow-up: fake-boundary tests cover the handler and process failures;
  hosted validation is required before publication. No C game or old scout was
  rerun for this change. First authorized producer use and capture improvement
  are initially unmeasured. Closed budgets, JavaScript comparison gates and
  admission rules remain unchanged; Unicode endpoint loss is separate.

## 2026-10-16 — Challenge lead direct discovery execution

Vincent authorized Challenge lead to execute discovery personally. Commit
`ebb317b62` records the single normative permission in architecture's "Direct
Challenge lead exploration" section; the role brief points there. This removes
the producer-only constraint without changing worker dispatch, independent
source/duplicate review, comparison eligibility or acceptance. Expected benefit
is less producer-to-worker handoff; discovery-yield and coordination effects
remain unmeasured. Existing lead-owned C-only authorization does not wait for
this documentation publication or establish a verified runtime model variant.

## 2026-10-16 — Remove minimum discovery-design count

Vincent explicitly removed the minimum number of candidate designs for search,
JavaScript comparison and submission. The active rule in selection now permits
one eligible case; earlier dated twelve-design planning records are historical
and superseded on that point. Independent design, valid C evidence, unchanged
replay, fixed accepted comparison, distinct source attribution and normal
acceptance/admission remain required. Expected benefit is earlier feedback from
a useful case; discovery yield and coordination effects remain unmeasured.

## 2026-10-17 — Explicit continuation after exhausted parked preparation

- Change: Work lead adopted `49babf797` (integrated as `56e0217a5`) after the
  Coordinator requested a supported fresh Prep97 assignment preserving exhausted
  Prep96. A Work-lead-only `assign` opt-in names exact `afterParked` predecessor
  IDs and records a nonempty `continuationReason` on the new task. Only older,
  unsubmitted preparations explicitly parked from `working` qualify; recorded
  processes and probes must be reconciled first. See the supported syntax in
  [architecture](architecture.md).
- Why: the [parked preparation guard](friction.md#parked-preparation-blocked-fresh-batch-2026-10-17)
  rejected a fresh independent batch because exhausted Prep96 remained parked.
  The Coordinator required its exhausted parked status and evidence to remain intact.
  The default guard remains for assignments without an explicit disposition.
- Expected benefit/tradeoff: allow useful fresh preparation to proceed while
  retaining the earlier task, status, evidence, batch identity and budgets.
  The explicit predecessor list and reason add review and bookkeeping; this is
  a narrow path for unsubmitted history, not a way to skip submitted deliveries,
  required corrections, dependencies or live ownership. Resume rechecks current
  predecessor state, and next-work guidance prefers the fresh active task.
- Follow-up evidence: 32 focused lifecycle tests, targeted lint and diff checks
  passed. A read-only in-memory projection of the actual ledger rejected the
  default assignment and allowed the explicit successor while leaving Prep96
  and ledger bytes unchanged. Hosted validation, first canonical successor
  assignment and elapsed handoff benefit are initially unmeasured. Existing
  C evidence, comparison, replay, acceptance and admission gates remain intact.

### 2026-10-17 follow-up — Use the unsubmitted v96 batch for the saved case

Vincent explicitly chose to place the saved qualifying case in unsubmitted v96, preserving the exhausted attempts and original v97 delivery. Prep97's earlier supported assignment remains historical; its wrapper is explicitly parked and immutable delivery d504e3f is unchanged. The additional gap-admission bridge (PA fae18209e, preserved candidate 4b8c8d969) remains unvalidated and unpublished. Its CLI failed with an unsettled top-level-await cycle before writing a receipt; no further bridge fix or gameplay run was made.

The original v96 transport is resumed through the existing contiguous admission path. Its old assignment base and attempts remain intact; the new delivery uses explicit accepted base 520b47b so only the two newly namespaced case files are submitted. Recipe and recording bytes remain identical to the frozen evidence, with the v97 wrapper linked and left unadmitted. Count the case once. Hosted validation, admission, publication and any handoff benefit remain pending. This follows the earlier [continuation decision](#2026-10-17--explicit-continuation-after-exhausted-parked-preparation) without rewriting that history.

Follow-up: exact v96 preparation checkpoint 38987618073 and admission 38993707573
passed. The first complete baseline is 147/148 screens and 4,892/4,892 RNG values;
Main publication 93582abfd96f1953681ac7aa349afd7787072cd9 completed with passing
Dashboard and Lint workflows. The case was admitted once, and its remaining
source-traced mismatch entered the canonical implementation queue. The v97
wrapper remains parked and its original delivery unchanged. No elapsed-time
benefit or broader source completeness is established by this successful route.

## 2026-10-17 — One reviewed source-led explicit-search capability trial

Vincent approved a bounded implementation trial from a clearly source-proven omission before a full failing recording. The XP candidate failed independent dependency closure: last-draw rule identity reaches the shared transition/timer engine, so its private sketch was parked without policy/queue changes. A bounded source-only selection then identified the explicit-search hallucinatory capability frontier. Main independently closed this scope at reviewed base `0915ed8f`, review SHA-256 `c03aba059bc7dc3e7a8a3faa49decfd72ef8b401885417db59ba1b22f2234d87`. `find_trap` already exists; the change permits one task to repair its stale explicit-search preflight/default capability boundary. See [friction](friction.md#2026-10-17--source-led-one-task-handoff).

Implementation `29cdc1af352afc23cf13f0adebb56907a35cb5aa` adds the exact `explicit-search-hallu-capability-20261017` opt-in to existing queue, transport, goal and delivery validation. Frozen review/units/write paths and constructed-state evidence basis follow the normal lifecycle. Enqueue/claim check reviewed source identities at a current accepted assignment base; no stale-base/reassessment waiver. Normal priority/ownership/process checks remain, scope cannot expand, and at most one linked correction may be claimed. All normal hosted fixed/regression/synthetic acceptance gates remain. Constructed-state claims stay runtime-pending and cannot supply source certification, public-input parity, admission, discovery or score evidence.

Expected benefit: measure the cost and exercised behavior of one small source-led repair without waiting for a new full-game mismatch. Tradeoffs: one deliberately special route and reviewed-source pin maintenance; constructed-state checks provide narrower evidence than public input replay. Observed tooling proof is 34 focused guard/evidence tests including real spawned enqueue/claim/submit/received-goal commands, 93 existing goal/delivery compatibility tests during implementation, targeted lint and diff checks. The exact final CLI suite covers the final trial-only binding assertions. Hosted validation/publication, natural task use, public reachability, behavior gain, regression outcome, rework and comparative effort remain **unmeasured**. Work lead owns the checked publication and first real assignment. No game code or real ledger was changed by the Process analyst.

Integrated tooling commit: `32f401a26605853f4bacb08e0ab164f8d1c727f3`. Exact hosted validation and real trial outcomes remain pending.

### 2026-10-17 follow-up — First source-led delivery enters validation

The exact opt-in checkpoint `38999092252` passed at published `f2b94f80`; Dashboard `38999494404` and Lint `38999494416` passed. The reader was gracefully reloaded from that accepted code before the real assignment. Worker 2 then submitted `2bcdbb8b45b2e9a0a0cac1784d1f100fea8e1efa`, limited to detect implementation/tests, with 72 focused tests and lint passing. Independent bounded review found the default production search/acknowledgement path and state/RNG isolation within the frozen scope; no correction was requested. Full hosted trial regression validation and acceptance remain pending.

Claim-to-submit elapsed time was 522.835 seconds, preceded by 30.322 seconds in the queue. Active effort remains unknown. Screening, opt-in implementation, CLI tests, lead review, hosted validation, publication and reader reload are separate setup costs, not excluded from assessing this experiment. Their observed windows overlap and are not summed as CPU or all-in effort. The later XP oracle feasibility assessment is separate follow-on work. Constructed-state tests remain narrower than public-input C parity; no certification, admitted case or score gain is claimed.

## 2026-10-17 — Bounded inventory-adjust fast-check pilot

- Vincent approved one targeted differential-fuzzing experiment. Add a finite inventory-slot composition pilot using official fast-check 4.10.2 (locked), the existing proven ordinary Valkyrie setup, existing recorder/API comparison and private immutable per-attempt artifacts. Implementation `6654324bc7fd3e51a38c49d5c4223dce5be98cbf`; Work lead fills integrated/tested commit.
- Why: compare a cheap structured suffix search with current source-first targeting while counting setup/triage and all physical attempts. This is one experiment, not a general search framework or evidence/admission waiver. W2 XP/status remains independent.
- Scope/caps: 16 generated draws of1–3 tracked weapon adjustments across occupied/empty/no-op/case slots;10min runtime,10s per C/JS process,≤27 evaluations including calibration,≤9shrink evaluations (original replay included), and one best replay. Freeze all original recipes first, first failure before shrink; preserve prefix/target/first-divergence category; keep invalid/timeout/error/unrun distinct.
- Evidence:8 focused tests and targeted lint pass. Earlier fake-worker test correctly rejected missing per-step animation arrays; fixture corrected and failure retained. Recorder change is only an export of the existing DST helper. No game/queue edits and no pilot gameplay yet.
- Expected benefit/tradeoff: test composition/boundary inputs with reproducible generation and bounded shrinking; adds dependency, setup, source/prior review and hosted-validation cost. Prior occupied-slot duplicate and empty-inventory match remain explicit; no new-source-cause count from a raw difference.
- Follow-up **unmeasured** until the actual queued execution. Record actual run start only from worker evidence (no tooling-publication strategy marker), attempted/usable/qualified/reproduced/distinct causes, setup failures, unrun/shrink/replay counts and all setup/review/CI/worker elapsed intervals with active effort unknown. Normal challenge admission/source evidence/scoring gates unchanged.

Use the linked friction entry above in the pending adopted-change decision:

- Why: [Inventory-adjust pilot setup and error classification](friction.md#2026-10-17--inventory-adjust-pilot-setup-and-error-classification). Test whether bounded structured suffix composition produces a useful reproducible new cause; record every setup/triage/run cost. This single pilot has no matched current-method control, so comparative strategy speed/yield remains unestablished.
- Implementation: `6654324bc7fd3e51a38c49d5c4223dce5be98cbf` plus classification correction `a0bc4f39d6eb4747c9a3eef615e4041edc1ec39a`; Work lead fills integrated/tested commit. The correction preserves separate runner-error versus recorder-failure, without expanding gameplay eligibility.
- Follow-up remains **unmeasured** before actual W1 execution. Retained setup observation is 797.932 seconds elapsed from the first clock to initial handoff; full setup and active effort unknown. Record WL review/CI/publication and worker/result-review phases separately. Actual strategy marker belongs to the real worker run, not tooling publication. Existing challenge admission and regression gates remain unchanged.

- Work lead publication review caught a necessary consumer omission before candidate freeze: standalone tooling allowed scripts/instructions but rejected the two root package manifests, blocking the approved official fast-check dependency even with a full checkpoint. Follow-up `ca81b996c4f58fee8edec38ddea58b5f2caff93c` allows exactly `package.json` and `package-lock.json` as committed regular non-executable files. No game/corpus/config-directory allowance was added. Deletion, executable/symlink modes, nested package paths and `.npmrc` remain rejected.
- The manifests remain execution inputs; this is not a bookkeeping or checkpoint-reuse exemption. Exact imported passing checkpoint, accepted ancestry, local/remote publication identity and unchanged post-checkpoint execution tree still apply. The existing real publication CLI test now includes the vetted pinned devDependency/lock; six focused publication tests and targeted lint/diffcheck passed, with explicit rejection of post-checkpoint manifest edits and existing game/corpus cases. No gameplay or ledger changes occurred.
- Expected benefit: unblock normal validated publication of tooling dependencies; tradeoff: dependency review/lock maintenance and full hosted validation remain part of experiment overhead. This is a path/mode allowance, not an automatic package-content approval; the actual manifest and lock diff must be reviewed. Follow-up publication/run benefit remains **unmeasured**. Separate setup observation and proof hashes are in private `publication-consumer-followup.json`; do not fold waiting wall time into active effort or attribute concurrent Prep98/W2 work to pilot cost.

**Measured follow-up (2026-10-17), append to bounded inventory-adjust pilot decision.** Completed immutable result `ddc82759f60c57521166547599809378b05a1a2daaabad98861d6439c31dcdb3` binds envelope `76d9f1854a2ad6c910c668a668d9bf1fc5aa6617dc06f7b9534a55f798b565c4`. PA verified outer/envelope binding, unchanged original recipes, target/prefix/key/frame/process receipts and exact accepted `6167164f6` comparison bindings; WL verified all 378 payloads. Corrected calibration plus 16 draws all matched: 17 C/17 JS, 14 unique suffix inputs, 32 adjustments (17 Moving/12 Swapping/3 Collecting), 556 screens/cursors and 42,585 ordered RNG entries equal. Zero new mismatch candidates, qualifying sessions, source-confirmed causes or admissions; no shrink/reproduction exercised. Stop this completed finite negative; no broader correctness or comparative strategy claim.

**Friction/cost.** First calibration failed from install-root/HACKDIR confusion (141 ms, 1 C/0 JS); explicit one-time corrected invocation preserved the same 16 samples. Corrected loop 16.354 seconds; aggregate 18 C/17 JS. First start→final end was 482.927 seconds, within ten minutes, although original launch/single-invocation restrictions were explicitly relaxed. No third run. Original duplicate wrapper required transport-only normalization, not gameplay repair. Potential future task-preparation improvement: verify actual HACKDIR/sentinel before launch; no new implementation adopted here.

Observed elapsed phases: initial setup 797.932 seconds; consumer repair 69.130; checkpoint creation→saved summary 305.601; tooling publication→freshness release 838.438; worker claim→first start 221.826; failed-loop end→corrected start 466.432. These overlap/include waits, shared publication and other accepted work; never sum as labor/compute. First setup clock→final end is a 4,398.878-second envelope, not full all-in effort. Active effort, complete setup and final artifact/review effort remain unknown. Detailed phase/proof receipts are PA `.cache/inventory-adjust-fuzz/actual-{phase-measurements,saved-outcome-review}.json`; no gameplay or comparator was rerun for this review. No token-saving claim or automatic expansion.

## 2026-10-17 — Compact handoffs and explicit snapshot age

- Why: [Status recaps and stale worker snapshots](friction.md#2026-10-17--status-recaps-and-stale-worker-snapshots). Use existing receipts with task/commit/run, verdict, evidence references, next owner/action. One validation run has one monitor owner/watch; notification-aware waits remain the expected waiting mechanism. Reconcile ownership on recovery before replacing a failed watch.
- Implementation: PA change `04bc8935741b19ed04a4d9e43649af658112ea79`, integrated as `c95b3ce17`; exact hosted candidate result remains pending. Dashboard queue and activity show exact UTC capture timestamp, age explicitly at page load, and Not live; idle rows say Idle at snapshot. Missing/invalid time cannot establish current activity; future timestamp reports clock discrepancy. No new coordination schema, watcher, refresh cadence, model/capacity change or validation exemption.
- Verification: three focused rendered-template tests passed (184.269 ms); targeted test-file ESLint and diffcheck passed. Tests cover visible timestamp/age, missing/invalid/future times, unchanged queue ordering and existing exploration/build freshness distinction. No gameplay or worker interruption. Work lead also checked Chromium at 320/1440 pixels: exact UTC timestamp, page-load age, Not live wording and wrapped text were visible without page errors; saved screenshots use a dated local fixture, not live deployment proof. Exact hosted candidate validation remains pending.
- Expected benefit/tradeoff: reduce status-only handoffs and mistaken interpretations of dated idle rows; receipts still require decision-relevant evidence reads, and display age is measured at page load rather than a live connection check. Follow-up **unmeasured** until subsequent actual handoff/recovery use; no token-saving claim.

## 2026-10-17 — Dispatch independent work during handle recovery

- Change: Work lead wakes an available eligible worker through the existing
  shared queue priority while another worker reconnects. A recovery alone is
  no reason to reserve an independent task for that lane. Retain existing
  claims, source reservations and all acceptance gates.
- Why: [Source qualification gaps and stale recovery ownership](friction.md#2026-10-17--source-qualification-gaps-and-stale-recovery-ownership).
  The lamp assignment waited 88.976 seconds after becoming ready while Worker
  2 was registered idle. Work lead confirmed there was no context or ownership
  reason for waiting on Worker 1's connection and adopted this practice.
- Implementation: an existing-policy dispatch correction; no code, new
  service, tests, validation rerun or worker interruption. Work lead integrates
  this record at the next genuine publication boundary and records that commit.
- Expected benefit/tradeoff: avoid independent ready-work delay during
  recovery, while losing any informal preference for restoring a specific
  lane first. Preserve useful context preference when there is a concrete
  dependency. Later comparable recovery-to-dispatch observations remain
  **unmeasured**; no CPU, capacity or comparative throughput claim.

## 2026-10-17 — Scope turn reasons to their original task and time

- Change: Work lead owns the narrow queue/state projection fix to clear old
  reason/provenance at claim/result/block boundaries, bind explicit turn
  reasons to their original timestamp and current task, and expose that
  provenance in next-work output. Preserve immutable ledger events, claims,
  physical budgets and all evidence/acceptance gates.
- Why: [Old turn reason mistaken for lava execution provenance](friction.md#2026-10-17--old-turn-reason-mistaken-for-lava-execution-provenance).
  A mimic status reason survived seven Worker 2 claims and appeared beside
  the new lava task at 76m8.614s old. The lava recovery packet preserves missing
  execution evidence and an UNKNOWN physical setup count; it grants no retry.
- Implementation: Work lead fills the exact integrated commit and focused/
  hosted validation results at the genuine publication boundary. PA supplies
  saved read-only ledger-prefix and source evidence; source/tests remain
  exclusively with Work lead. Implementation and validation are pending.
- Expected benefit/tradeoff: prevent a prior task's status from being read as
  current execution evidence; newly claimed or completed lanes may have no
  reason until an explicit current observation. Actual invocation receipts
  remain necessary. Future recurrence reduction and effort savings are
  **unmeasured**; no gameplay or CPU claim.

### 2026-10-17 follow-up — Reason provenance publication and first claim

Integrated/published `b124ef9482e91f7421732608db46e24eb8e1c894` at
18:40:54.401 UTC. Work lead retained exact passing Checkpoint `39058651350`,
Dashboard `39059127903`, Lint `39059127894` and the successful ordinary
publication-CI receipt. This publication also integrates the source-gap,
recovery-dispatch and stale-reason process records above.

A saved read-only ledger-prefix projection at the next Worker 1 claim,
18:42:48.399, retains its defensive-amulet assignment with null
reason/reasonAt/reasonTask. Worker 2/3 completed idle rows are also null;
the prior mimic reason no longer appears beside these tasks. This establishes
the corrected projection, not recurrence reduction. That sole new claim after
publication waited 21.076 seconds from enqueue, inside the earlier
9.349–25.635-second range. Nine ordinary post-recovery handoffs have median
12.699 seconds (9.654–21.076); they are different small windows without a
comparable recovery trial. Causal delay/effort savings and future recurrence
reduction remain **unmeasured**. PA receipt:
`.cache/lava-provenance-triage-20261017/post-publication-projection.json`.
No test, validation or gameplay was repeated for this observation.

## 2026-10-17 — Refresh on closed worker exploration activity

- Change: the Coordinator approved a separate refresh watermark for sanitized
  closed, claimed Worker 1–3 exploration completion/block activity, including
  Main support. Independent discovery records and their yield denominator
  retain their existing meaning. This extends the earlier
  [checked snapshot coalescer](#2026-10-16--checked-exploration-snapshot-coalescing).
- Why: [Support completion freshness](friction.md#2026-10-17--support-completions-could-not-refresh-exploration-activity).
  The 15:12:35.496 UTC snapshot precedes 58 closed worker support explorations
  through 19:35:31.889. The old discovery-only watermark could not observe
  those closures; ownership and CI deferrals also constrain publication.
- Implementation: `2cb4f1625` adds the scoped public activity watermark and
  updates its coalescer and proof consumers. All 18 focused dashboard refresh
  checks passed, including a Main support closure, unchanged discovery yield,
  claim/status no-ops, privacy and interrupted publication recovery. The final
  candidate requires exact hosted validation before publication; its receipt
  records the tested revision and hosted result.
- Benefit/tradeoff: make completed exploration activity eligible for the
  existing 15-minute refresh while allowing more activity-driven snapshots.
  Claims, turns, capture/publisher churn and unchanged data do not trigger it.
  Keep privacy, Main/readiness/CI deferrals, exact snapshot-only history and
  the original checkpoint proof; no worker claim or discovery count changes.
- Follow-up: **unmeasured**. Observe the first natural support closure through
  pending eligibility and checked publication, recording first-seen, deferral,
  capture and Dashboard/Lint outcome separately. No artificial task, repeated
  validation or gameplay is needed to manufacture a freshness observation.
