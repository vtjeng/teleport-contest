# Workflow friction log

Observations for ongoing triage, not confirmed defects or approved changes.
The Work lead records its own friction and relevant worker reports. The Process
analyst reviews these records under the standing responsibility in
[loop.md](loop.md#workflow-friction), appending evidence and recurrences without
interrupting execution. Pending changes belong in [proposals.md](proposals.md);
adopted changes and follow-up measurements belong in [decisions.md](decisions.md).
Append short entries; add recurrences to an existing entry when recognized.

For each entry, record:

- Context: date, task, commit, and command or step.
- Friction: what happened and its impact—retries, blocked work, or time.
  Label estimates; leave unknowns explicit.
- Evidence: error excerpts and log, artifact, or run references. Preserve
  enough detail to understand the issue if temporary files disappear,
  including a special script's purpose and key operations.
- Reason: why the work was needed. Cite any instruction requiring it or
  earlier evidence that appeared to make a check redundant.
- Outcome: workaround, result, and remaining concern.

No solution or priority is required. Preserve entries and append later
triage decisions or fix references.

## Observations

### 2026-10-15 — fresh-ledger baseline has no first publication route

- Context: clean-run startup at published `851aa5c0b1cdc9f0bd4da5d3c03c805667e6a5d7`,
  with no recovered runtime ledger or checkpoint archive. A local checkpoint
  was started after GitHub API access returned `Forbidden`.
- Friction: `accepted-main` returned `null`, while the enabled queue used its
  `initialBase` for exploration. Source inspection found that both
  `verifyToolingPublication()` and implementation bootstrap require a previous
  accepted anchor. A proposed first genuine batch acceptance route then proved
  insufficient: `verifyPrepComparisons()` also requires an accepted comparison
  commit and excludes `queue.initialBase`. No first submission failure or
  elapsed-time cost is claimed; this is a source-proven future submission block.
- Evidence: `scripts/worker-backlog.mjs` `acceptedMain()`,
  `scripts/assignment-queue.mjs` `queueBase()`, and
  `scripts/worker-delivery.mjs` `verifyToolingPublication()` and
  `verifyPrepComparisons()` at the commit above. The shared ledger contained no
  accepted deliveries or tooling publications when inspected.
- Reason: preserve exact-checkpoint and published-main proof without inventing
  accepted deliveries or bypassing comparison provenance.
- Outcome: Work lead and Coordinator informed. The analyst corrected its earlier
  acceptance-only assessment after Challenge lead identified the submission
  guard. Runtime recovery remains separate from the standing-triage change.
- Follow-up: the [initial published-baseline decision](decisions.md#2026-10-15--observe-a-verified-first-published-tooling-baseline)
  records the separately approved recovery implementation and its initially
  unmeasured operational follow-up. Original failed assumptions remain above.

### 2026-10-15 — exploration completion requirements are unconditional

- Context: Challenge lead prepared bounded v90 exploration assignments against
  the same published base while checking how to retain misses and deferrals.
- Friction: `work-queue.mjs complete` requires every declared artifact and a
  successful result for every required check kind regardless of `miss` or
  `deferred` outcome. A source-only deferral cannot truthfully supply a missing
  C capture or successful recorder check. No worker completion failure or time
  loss has yet been measured.
- Evidence: `scripts/work-queue.mjs` `complete` checks and
  `.claude/agents/challenge-lead.md`, "Exploration assignments", which allows a
  bounded miss or deferred target to complete when its evidence and stop rule
  are satisfied. Only Main-owned support tasks with outcome `failure` can
  retain nonzero check exits.
- Reason: enforce bounded exploration and preserve truthful failed observations
  without weakening the successful C-evidence gate for retained batch cases.
- Outcome: producers can scope source-only reconnaissance with no promised case
  artifacts/checks; a valid captured setup miss can retain its real passing
  checks. Recorder failures retain clean recovery and block on their dependency.
  Outcome-specific completion requirements remain a proposal, not an adopted fix.

### 2026-10-10 — accepted dependency verification exceeded the Git patch buffer

- Context: B rolling-boulder integration at
  `ddf5412d0452339261cff3b0fb162fba10f0b5a5`, while recording the
  `integrating` ledger event.
- Friction: the delivery inherited more than 120 accepted dependencies from a
  long-lived worker branch. `checkCandidate()` rehashed every accepted task,
  and a historical large commit exceeded its 32 MiB `git show` buffer. Two
  ledger attempts each spent about two minutes before failing.
- Evidence: the verifier failed in `contextFreePatchId()` with
  `spawnSync git ENOBUFS`; `git cherry` independently reported both B delivery
  patches as present in the candidate.
- Reason: `.agents/loop.md`, "Integration and publication", requires the exact
  delivery and dependency check before checkpoint validation.
- Outcome: `checkCandidate()` now returns immediately when the accepted
  integration is an ancestor of the candidate. Diverged histories still use
  the existing patch comparison, including repaired dependency branches.

### 2026-10-07 — failed hosted shard did not retain its test log

- Context: B136, `f9932445178a37fcbe5df051c1b9bb88a8b8e0c0`, hosted
  checkpoint run `37678802930`, test shard 1.
- Friction: the shard reported one failure among 2,158 tests, but neither the
  job log nor the uploaded `stage-tests-1` artifact retained the failed
  assertion. Diagnosis required two local shard runs and about four minutes;
  the first run also exhausted the focused runner's two-minute limit.
- Evidence: the artifact contained only `stage.json` with an ephemeral runner
  path `/tmp/teleport-checkpoint-cqGAP9/test-shard-1-4.log`.
  `gh run view --log-failed` printed only the checkpoint tail. Local bounded
  runs `run-L0i0LX` and `run-EFeecV` finally identified
  `scripts/detect.test.mjs:1474`.
- Reason: `.agents/loop.md`, "Integration and validation", requires diagnosing
  a completed checkpoint failure before integrating a correction.
- Outcome: the local full-profile reproduction exposed the stale trap redraw
  expectation. The corrected descendant passed hosted run `37680146646`.
  A future hosted failure can incur the same rerun when the failing assertion
  is outside the checkpoint tail.

### 2026-10-07 — ordered sync-main step cannot run around acceptance writes

- Context: B136 acceptance at
  `66b552d0bb2c158b1501eb551a9fc97b3fa47afc`; publication record commit
  `ea95cf8538fefc7bf235fb2a0b67b6f6b7f56705`.
- Friction: the ordered `sync-main --commit <accepted-commit>` step refused the
  dirty tree after `accept-task` wrote `GOALS.json`, `SCORE.tsv`, and accepted
  evaluations. After those required records were committed, the same command
  refused because local main was already a descendant and could not be
  fast-forwarded backward to the accepted commit.
- Evidence: the two errors were `main worktree has changes; preserve them
  before synchronization` and `local main cannot be fast-forwarded to this
  commit`.
- Reason: `.agents/loop.md`, "Integration and validation", orders source
  evidence and `accept-task`, worker continuation, then `sync-main`, dashboard
  generation, and the publication-record commit.
- Outcome: local and remote main were compared directly at
  `ea95cf8538fefc7bf235fb2a0b67b6f6b7f56705`, and the publication event passed.
  The documented sync step remains unusable at its ordered position.

### 2026-10-12 — preparation integration and ledger inspection retries

- Context: Prep13/v49 integration at `952e284d1885ab4da3be6155484a96bf2a955a1d`.
- Friction: `git merge --trailer` is unsupported; the first attempt exited 129 without changing the checkout. The attributed merge used `--no-commit`, followed by `git commit --trailer`.
- Evidence: the merge error was `unknown option trailer`; the successful candidate contains exactly 198 v49 case paths.
- Reason: integration preserves the submitted commit and requires the Codex attribution trailer.
- Outcome: the corrected merge and preflight passed; hosted checkpoint 38206234389 passed.

- Friction: B interpreted a transient ledger lock with an absent PID as potentially stale while the coordinator command handle remained live.
- Evidence: coordinator session 78133 completed its integration/preflight write; the lock then disappeared naturally. No lock was deleted.
- Reason: worker claims and coordinator transitions share the ledger lock.
- Outcome: B retried its claim after the writer completed. A PID check alone did not establish a stopped writer.

- Friction: Prep13 stores `missionPlan` as serialized JSON text. Enumerating it before checking its type generated hundreds of thousands of character-index keys in tool output.
- Reason: the coordinator verifies mission and overlap evidence before acceptance.
- Outcome: parsing the field as JSON allowed bounded summaries of its actual fields; all 57 independent replay hashes and 198 preserved attempt-file hashes passed.

### 2026-10-12 — dashboard browser module lookup

- Context: excluded-case dashboard validation at `452b6825c2f1cddb188e4df073c788211e080c87`.
- Friction: `NODE_PATH=$(npm root -g)` could not load Playwright.
- Evidence: the browser command reported `Cannot find module playwright`; an existing installation was found in the npm execution cache.
- Reason: frontend-rigor requires browser interaction checks for a changed filter.
- Outcome: the existing cached installation passed pointer, keyboard, exclusion disclosure, activity selection and responsive checks; no dependency was installed.

### 2026-10-12 — dispatcher integration and correction packaging

- Context: dispatcher delivery `09731e9aa0d118bc027c01ae959c88078fc9ac11` and hosted run `38210475750`.
- Friction: importing its investigation reports before source selection split the later cherry-pick patch. Ledger integration and preflight rejected the combined patch identity despite identical source and test blobs.
- Reason: selection requires committed findings; the ledger requires the submitted patches.
- Outcome: Main merged the exact submitted commit after verifying that only the delivery and its accepted-base merge were missing from history. Preflight passed.

- Friction: the hosted test shard failed a source-text assertion requiring the old two-argument `doextcmd` call. The new selected-command callback preserved the behavior that the assertion was meant to check.
- Evidence: `scripts/cmd-span.test.mjs` failed at the wizard-kill dispatch assertion; all fixed sessions and regression recordings passed. The corrected assertion passed its focused check.
- Reason: a failed validation requires a new worker delivery SHA before the ledger permits a retry. The worker must finish its current handoff, resume the earlier task, and package the integration correction.
- Outcome: failed logs and summary retained; the correction is committed separately. The initial instruction did not identify the older dispatcher task explicitly, so the worker tried the newer ready task; the coordinator supplied the exact older task ID.

- Friction: an evidence-only Prep14 correction could not submit an empty commit because the ledger requires a changed path.
- Outcome: Prep preserved the original 124 files and added an input-identical cobra recipe copy with corrected source and coverage metadata. Its new packet keeps twelve cases and excludes twenty-eight redundant controls; no C replay was repeated.

### 2026-10-12 — targeting-menu intake and repeated merge syntax

- Context: B delivery `801cda8f8eab1e9f801f8b4dbf21baf7e745fcf9`, combined candidate `ee910f83f79d8cb1ddab7352d52ee2b10e9db0d3`.
- Friction: goal selection rejected the original investigation because `mismatch.session` and `mismatch.remainingScreens` were missing. The intake monitor measured about 72 seconds for the rejected queue/open command and about 115 seconds for its corrected retry.
- Reason: the existing investigation validator requires identity and count inside the mismatch object. The coordinator imported the original report before running `readInvestigation` against its saved queue entry.
- Outcome: separate coordinator commits retained the worker report and added current provenance and required mismatch fields; selection and hosted validation passed. The next queued inventtype report was checked before import and has the same missing fields.

- Friction: `git merge --trailer` failed again with exit 129, repeating the Prep13 mistake already recorded here.
- Outcome: merge used `--no-commit`, then `git commit --trailer`; the report-only conflict retained the verified current diagnosis.

### 2026-10-12 — saved acceptance and divergence evidence terminology

- Context: inventory candidate `dd7580b087b2f6d91b80159b92966379aa7eba3a`, hosted run `38224853910`.
- Friction: importing the 51 saved synthetic evaluations and recording acceptance took 151 seconds (receipt `run-GsJnzk`: 08:45:17.630Z–08:47:48.801Z). No games were replayed by this handoff. The coordinator initially queried the nonexistent `checkpoint.yml`; the repository uses `checkpoint-trial.yml`.
- Outcome: the exact run was watched once, imported and accepted. Check the repository workflow filename before discovery.

- Context: C pyrolisk callback delivery `ba6dad22346f0b8b7cba2fbfe509abe87ad3141f`.
- Friction: `scopeEvidence()` reuses the port-evidence schema for divergence fixes, which led the worker to treat function entries as new whole-function completion claims and stop packaging a completed repair.
- Outcome: the packet identifies each affected function and explicitly limits its source review to the callback repair. It retains `kind: divergence-fix`; the coordinator records no new whole-source completion for it. No blocked recipe was fabricated and no validation rule changed.

### 2026-10-12 — bounded delivery carried unrelated branch ancestors

- Context: B message repair `0e0d1aa16d7b2de793f249201cf3ed73ed6a02e7`, before hosted validation.
- Friction: the coordinator inspected the delivery's base-to-head diff, then merged its full branch without inspecting all commits missing from Main. The staged list contained 17 paths, including unrelated pending fixes, but the combined shell command committed before the coordinator reviewed that list.
- Outcome: the unpushed merge is preserved at `recovery/mon-to-stone-merge-20261012`. Main returned to the prior commit; only the explicitly named accidental-merge paths were restored. Cherry-picking the submitted source commit produced the intended two-file repair. No validation or public push used the accidental merge.
- Follow-up: inspect both missing ancestry and the actual staged paths before committing a worker integration. Keep the stage inspection and commit as separate operations.

### 2026-10-12 — failed history candidate isolated to free ready dependency work

- Context: TTY history candidate `b3f99748`, hosted run `38234021440`.
- Friction: the combined gate found 32 failed tests, 16 failed regression
  recordings, and nine fixed sessions with screen/cursor losses. Keeping the
  unaccepted source on Main would prevent an independent ready shop delivery
  from receiving a clean combined gate while A corrected history.
- Evidence: the failed summary and stage logs are preserved under
  `.cache/history-failed-checkpoint-38234021440/`; all 792838 fixed RNG values
  still match. The earlier report import also needed its historical parent
  before the exact report patch could pass delivery verification.
- Reason: `.agents/loop.md` requires correcting regressions and integrating
  independent ready deliveries without waiting for an unfinished goal.
- Outcome: preserved the complete failed candidate at
  `integration-history-v48-failed-20261012` and its remote checkpoint branch,
  restored only its 43 named changed paths to the accepted game plus the
  approved priority, and requeued history without accepted completion credit.
  A owns the correction; Root is integrating shop to release C's caller.

### 2026-10-12 — shop startup defaults found after acceptance

- Context: accepted shop candidate `8ae7e7de`, before publication.
- Friction: the source review found that `decl.c` initializes `sell_response`
  and `sell_how`, but JavaScript assigned them only after a drop or container
  command. An owned projectile can reach selling before either command.
- Outcome: initialize both values in the existing startup reset and pin them
  to the C declarations. Independent blank-book and valuable-book projectile
  recordings match completely. Validate this separate correction with a
  supplemental hosted checkpoint before publishing the acceptance reports.

### 2026-10-12 — report import and delivery patch identity

- Context: discovery-sort delivery `2f6c53965` and correction `ff4afe979`.
- Friction: the first source commit also added its diagnosis, and later
  accepted work already supplied two of its imports. Delivery verification
  requires each original patch in history; importing only its remaining edits
  would lose that proof.
- Outcome: imported the diagnosis and exact report correction first, refreshed
  its current evaluation, then temporarily restored the original report and
  import parents before applying the exact source edits. Restored the current
  diagnosis and accepted menu owners in the combined candidate. Intermediate
  commits were neither checkpointed nor published.
- Context: supplemental shop score import before publication.
- Friction: the bounded runner does not forward heredoc stdin to its service;
  the first invocation exited successfully without importing evidence.
- Outcome: checked the missing output receipt, saved the same import code as
  an ignored temporary script, and ran that script under the bounded runner.
  All 51 saved evaluations were recorded before the public push.

### 2026-10-12 — entry-point metadata omitted from coordinator evidence

- Context: discovery source acceptance at `583ca5765`.
- Friction: Root copied the six function records from the worker packet but
  omitted its entry-point review and four entry-point records. Closure
  correctly rejected the incomplete metadata after importing the scores.
- Outcome: copied the reviewed entry-point fields, verified them at the same
  tested commit, and retried acceptance without replaying the full workload.
  History's evidence import includes all three fields before its retry gate.

### 2026-10-12 — corrected history source re-integrated

- Context: history correction `d94761f7`, after the failed `b3f99748` candidate.
- Outcome: preserved every original source patch and imported only the history
  commits plus the scoped correction. The correction fixes the duplicated
  WIN_STOP state, wrap cursor, and speculative quest-history side effect;
  its C comparisons establish the updated display digests. Nine fixed
  regression replays and 683 worker tests pass. The combined candidate's
  38 focused tests, lint and quality checks pass. The new module retains
  its earlier commands-area assignment, which was preserved on the failed
  branch. The hosted retry must cover every earlier failed stage.

### 2026-10-12 — petrification evidence extended past the pager

- Context: C petrification delivery `fbfe1b901`.
- Friction: the original positive ranges stopped at the slowdown More prompt,
  before the helper's completed stoning/death path. Its packet base also
  carried older pending source context.
- Outcome: C preserved the packet and supplied extended matching checks from
  the separate accepted-base candidate `2e38ab4ef`: ogre through step 147,
  nymph through step 231. Root verified the log hash and reverified those
  ranges on the combined Main implementation when recording source evidence.
  The caller conflict retained Main's synchronous `possibly_unwield` body;
  its whole asynchronous port remains a separate combat delivery. All 137
  combined focused tests, lint, and quality checks pass. No pending combat
  source is required by this candidate.

### 2026-10-12 — petrification caller suspension broke level creation

- Context: exact candidate `d6378edad` and hosted checkpoint `38247549364`.
- Friction: the new `newcham` caller yielded a dynamic import even when
  `mselftouch` immediately returned without effects. The focused checks did
  not include synchronous monster creation and theme-room contracts.
- Outcome: the hosted gate passed all 44 fixed sessions and 1,967 recordings
  but failed 14 tests. Saved every failed shard log and the failed summary;
  requested a bounded C correction for the synchronous guard path and the
  obsolete pit refusal test. Saved synthetic results show two completed v51
  cases and no losses across 1,540 cases, but acceptance waits for the retry.
  A read-only preview found the same unconditional suspension in the pending
  combat delivery's `possibly_unwield` caller and queued a separate correction.
- Correction: C's `76e877018` keeps the post-armor corpse guard synchronous
  and updates the pit assertion to verify death before damage RNG. All four
  affected test files pass. The submit tool rejected exact Main as a correction
  base because the original assignment used another branch's ancestry. C
  preserves both histories with an ancestry merge whose tree equals the exact
  Main candidate, then reapplies only the two-file correction for submission.

### 2026-10-12 — throne investigation schema and exact patch import

- Context: ready throne caller delivery `def667038` after petrification acceptance.
- Friction: its diagnosis used `verified`/`resolved` as investigation status
  and omitted fields required by `readInvestigation`. Root preserved the
  separate diagnosis commit and refreshed the schema and accepted evaluation
  before selecting the goal. The source commit also edited the old report,
  causing a conflict with that refresh.
- Outcome: aborted only the conflicting cherry-pick, preserved the original
  report parent, imported the exact three-file patch, then restored the
  current canonical diagnosis with the worker's matching evidence retained.
  Only the restored combined state enters checkpoint and public Main.
- Earlier retry import: Root attempted to import `38249833613` after the
  combined job passed while synthetic evidence cleanup still ran. The import
  guard rejected it. Root waited for the retained watch to exit successfully,
  then imported its complete evidence. Main remained at the exact candidate.

### 2026-10-12 — dispatcher report additions and queued menu correction

- Context: extended-command delivery `e55adc240` contains source commit
  `8ff88a981`, which also adds three reports already imported separately.
- Outcome: preserved the current reports, aborted only the conflicting
  cherry-pick, temporarily removed those named reports in a parent commit,
  imported the exact source/test/report patch, and restored all three current
  valid diagnoses before checkpoint.
- Read-only menu preview: delivery `92449c294` used Escape as the selector's
  default empty Enter result. B added an explicit empty value, but its first
  correction used a truthy JavaScript NUL string and a weak negative assertion.
  Root requested null and the exact reissued prompt; B submitted `33d261d01`
  with both cases passing. These corrections stay outside this dispatcher task.
- Dispatch friction: twice Root triggered B's correction turn while its ledger
  feedback command was still running. The worker correctly waited for the
  required state. Finish feedback before sending future correction turns.
- Dispatcher preflight also found that the older canonical report import did
  not preserve final report correction `e55adc240` as an exact patch. Root
  preserved its original report parent, imported that correction unchanged,
  and restored the current diagnoses before retrying preflight. Game code
  stayed identical to the already linted and quality-checked candidate.

### 2026-10-12 — active ledger path and whole-source intake

- Dashboard publication initially used the old `.cache/worker-state.json`
  instead of the active `.cache/worker-state-loop-20260925.json`. The snapshot
  writer reported the invalid run identity; Root regenerated and inspected the
  snapshot with the active ledger before committing or publishing it.
- Whole-source getpos intake found the earlier terrain-search completion
  omitted SELF and other input branches. Root queued the complete getpos and
  getpos_menu follow-up, then invalidated the old getpos evidence while
  retaining its history. B owns the correction and its expanded reservations.
- Vrock intake found its whole-monflee evidence listed only movement while
  several active command callers still omit the cloud owner. Root queued
  caller/evidence correction after B's current task and selected the next
  independent ready delivery.
- Black-light integration had adjacent function additions in uhitm.js. Root
  retained both the incoming hallucination helper and the existing energy-drain
  helper, then ran the affected dispatcher tests before hosted validation.
- Root first attempted to queue the black-light goal after importing its game
  code; current synthetic evidence correctly became stale. The preserved
  pre-import commit allowed registration without weakening that guard. The
  submitted report also lacked the required source object fields; Root rebuilt
  them from the reviewed C function and current saved queue before registration.
  The goal remains queued until exact-candidate hosted evidence permits opening.

### 2026-10-12 — saved-score ordering and pending source trees

- Black-light registration finished at the preserved pre-import code boundary.
  Goal opening then required current synthetic score records, while the
  acceptance helper required an open goal. After reviewing all 51 imported
  evaluations, Root recorded those saved results first, opened the goal, verified
  its source evidence, and used normal acceptance. No corpus was rerun.
- The later demon-pet goal was opened from the accepted saved fixed scan before
  importing its source patch, avoiding that ordering problem.
- A bounded caller survey found that combat evidence attributed pre_mm_attack
  directly to mattackm instead of missmm/hitmm and claimed a longer runtime
  range than its correction logs verified. C is correcting the attribution
  and checking the complete correction tree.
- The earlier petrification ancestry bridge retained pending combat commits
  while deliberately using Main's tree. Ancestry alone therefore does not
  prove those unaccepted source bodies are present. Preserve and combine the
  intact delivery tree with accepted Main before recording new evidence.

### 2026-10-12 — verified prefixes and Rustm conflict

- Automatic approval review initially rejected demon-pet acceptance because
  its synthetic case diverges after the cited helper range. Root verified the
  exact candidate through step 157, cited the existing rule that later
  divergences do not invalidate matching ranges, and retried the same normal
  acceptance command. Approval succeeded; the later combat mismatch remains
  visible in the saved evaluation.
- Rustm's patch conflicted with older combat context on Main. Root imported
  only the submitted helper and erosion import, retained Main's existing
  message import, and excluded unchanged worker-parent mswingsm context.
  The combined mhitm and uhitm focused checks passed.

### 2026-10-12 — Rustm runtime dependency

- Rustm's hosted checkpoint passed the fixed 44-session workload and every
  older recording, but its new monster-pair recording stopped at step 148,
  before the cited Rustm call at 155. The worker's passing recording used its
  pending whole-combat parent; the submitted dependency list did not identify
  that requirement. Root preserved the failed artifacts and focused diagnosis,
  parked Rustm, and restored accepted executable inputs before selecting
  another delivery. Resume after C's full combat task is accepted.
- Whole mattackm intake found the newly reachable pudding-split branch absent.
  C owns that correction. Whole monflee caller intake found ordinary command
  paths still requiring injected visibility/message functions; B owns the
  source-backed defaults. The getpos correction preserves C's pointer lifetime,
  terrain scan outputs, numeric input bytes, and empty goal string.

### 2026-10-12 — whole-combat completion and imports

- Root retired the old hitmm completion claim because it retained the
  silver-weapon message refusal. The new whole-combat task implements that
  reachable branch and preserves the earlier seduction evidence as history.
- The combat patch duplicated Main's existing pline_mon import and overlapped
  the accepted mselftouch caller correction. Root prepared the canonical import
  in a separate parent commit, preserved the exact worker patch, and kept the
  accepted awaited mselftouch call. Three affected focused suites passed, and
  all six source units verified against the matching v50 prefix through1754.
- An inline Node check of the growing SCORE.tsv exceeded its default child
  output buffer, then encountered the existing sandbox subprocess restriction.
  A direct Git redirect and Python byte comparison verified the52 appended
  rows without printing the historical score file. Use saved-file comparisons
  for this publication check.

### 2026-10-12 — self-touch report identity

- Opening the bounded polymon self-touch goal failed because its delivered
  investigation retained an older v50 manifest digest. Root initially refreshed
  the accepted evaluation and debt but omitted the manifest fields. The
  recording hash and five-screen debt were unchanged. Root refreshed every
  identity field from the accepted queue, preserved the original delivery,
  and retried selection before importing the game change.

### 2026-10-12 — publication ledger collision

- The validated self-touch/tooling report commit reached public main, but its
  publication event collided with a shared-ledger writer during worker updates.
  The helper exited after the push. Root confirmed the transient lock had gone
  and retried the same helper at the same report commit. It reused the saved
  packet and checkpoint; no live lock was removed or validation repeated.

### 2026-10-12 — preparation turn recovery

- Prep's turn failed on a content filter while preparing NetHack gameplay
  recordings. Root resumed the same worker and required it to collect or verify
  its existing command before starting another recorder. The worker confirmed
  both recorded commands had exited successfully and that no command remained
  live. Its thirty completed C attempts and earlier deliveries were preserved;
  it continued the same v57 task.

### 2026-10-12 — submitted-goal registration

- B's received backfire delivery could not be registered with `queue-goal`:
  that command repeated synthetic task selection and rejected the preserved
  historical investigation. The approved CI acceptance workflow requires
  registration from worker context. Root added `register-task-goal`, which
  reads the hash-verified received packet and leaves the goal queued without
  selection or report rewrites. Its focused tests and the actual B registration
  passed; the combined candidate still requires hosted validation.
- Prep17's mission plan contains embedded C screen observations on one JSON
  line. Printing its first line produced excessive output; a ledger event
  also printed full state when its stdout was not redirected. Root switched
  to selected-field summaries and cache-file output. The saved independent
  replays and all 148 original input hashes were checked without rerunning C.

### 2026-10-12 — hot-pursuit cursor loss and correction submission

- Candidate `34c94c5a1` passed hosted checks and gained 43 matching screens
  and 148 RNG values, but lost one cursor on its assigned Minetown case.
  Acceptance rejected it. A combined the source-defined `shk_move` threshold
  repair with hot-pursuit in correction `575ed936`; the original movement
  packet and rejected evidence remain intact. Checkpoint `38303795996` and
  acceptance passed at `b656ad046`, matching the full 627-step case. Main
  parked the overlapping movement task without adding a duplicate score.
- Submission required the registered branch name. A preserved both refs,
  temporarily restored that name to submit the scoped correction, then
  restored the original branch without rewriting commits.

### 2026-10-12 — bounded caller registration

- Context: dismount task `C-investigation-v52-mounted-pony-kick-throw-attempt9-20261012`, delivery `b990a633`, during required goal registration.
- Friction and evidence: `register-task-goal` rejected caller metadata with `--required-functions requires a C or Lua source port`; `.cache/dismount-current-registration.json` retains the retry result.
- Reason: normal acceptance requires the assigned goal to be registered from the received worker context, without selecting its session again.
- Outcome: `d787c2776` restricts the port-completion option to source ports. The original immutable caller context is preserved, actual registration succeeded, and all 25 existing goal tests passed outside the sandbox. The sandbox test process exited without inner diagnostics; it did not establish a source failure. Hosted checkpoint `38306945771` passed at `d2e601976`.

### 2026-10-12 — goal captions omitted the source-file fallback

- Context: received acid and prayer divergence fixes registered with `register-task-goal` from worker contexts using `cFile`.
- Friction and evidence: their source fields were correct, but their default human summaries read `Implement passiveum from undefined` and `Implement fix_worst_trouble from undefined`. The caption interpolates `context.sourceFile` without the `cFile` fallback used by source registration.
- Reason: the public dashboard needs accurate task captions. No source-scope or completion change was needed.
- Outcome: publication `0cb1d7e52` corrected those two captions without changing immutable context, scope, lifecycle or claims. The novel registration also uses a descriptive bounded-fix caption. The default formatter remains unchanged; future worker contexts can supply an explicit summary or sourceFile.

### 2026-10-13 — concurrent ledger writes during handoffs

- A scope update, C submission, B idle observation, and Root publication
  collided on the shared worker ledger lock. The writers completed; Root and
  workers retained their command handles and retried the same payloads after
  confirming the lock was absent. No lock was removed.
- B publication pushed `d58f2c00` before its ledger receipt failed. Retrying
  `task-handoff publish` reused that report commit and recorded publication;
  it did not repeat validation or append another score.
- Root briefly serialized C submission and B's idle update to finish the
  handoffs. The current lock behavior still requires manual coordination.

### 2026-10-13 — quest refusal test and metadata preview

- Quest candidate `a26c3da2` failed hosted run `38332051839` in an obsolete
  nemesis refusal test. A's correction `f2bfe0ad` supplies valid quest state
  and checks the ported speech. Hosted run `38332806796` passed at
  `65da8c69`; the failed summary remains preserved.
- A preparation-packet preview applied `Object.keys` to the string-valued
  mission plan and emitted character indices. The output was truncated.
  The intended preview needed only the manifest's case IDs and rationales.

### 2026-10-13 — fee caller failures and committed baseline reports

- Unpaid-fee candidate `748073928` failed hosted run `38339601835`: lamp
  billing referenced an undefined `random`, six lamp recordings failed,
  and an inventory test still expected a newly asynchronous charge helper
  to finish synchronously. C corrected environment forwarding and the
  test's awaits in `a8e487a9`; hosted run `38341322856` passed at
  `f3648d25`. The failed summary and original delivery remain preserved.
- A's growth-name submission needed the accepted evaluation for
  `3d403994`, which was committed in published descendant `a1d88799`,
  rather than the tested source commit. Root first recommended a plain
  report merge; submission then rejected unrelated closure paths such as
  `GOALS.json`. A used an explicit bridge with the published tree and
  assignment ancestry, excluding those paths from its delivery. Source
  and execution inputs were unchanged, so the saved checks were reused.
- Exclusive `mcast_spell` reservations made insect, weakening, and armor
  investigations wait for each other's dispatcher deliveries. Their
  diagnoses were preserved, and Root prioritized deliveries that released
  those blockers. Ready implementations continued to precede new batch
  admission under the approved scheduling rule.

### 2026-10-13 — committed handoff baselines and focused replay waits

- Root committed accepted evaluation records before waking workers for their
  next claims: growth records in `5ab0e7bd`, armor records in `422e6ce8`,
  and naming records in `59550da3`. Workers merged those descendants before
  claiming or resuming. This puts baseline artifacts in their assignment
  history and avoids the earlier report-bridge repair. Checked game inputs
  remained unchanged.
- C’s first exact armor replay attempt, `run-EqUilX`, exited 75 while
  Root’s acceptance helper `run-VPqhgm` owned the full validation slot.
  Root collected its retained command handle and notified C; the retry
  `run-p1Nkov` passed. No recording or aggregate check was duplicated.

### 2026-10-13 — report conflict and exact delivery ancestry

- The AD_MAGM report conflict resolved to the worker’s immutable report,
  but preflight rejected its changed patch identity: Main had preserved the
  original diagnosis without the worker’s later baseline-refresh commit.
- Root verified that all seven delivered paths matched the exact submission,
  then preserved that submitted ancestry with a merge whose tree did not
  change. Preflight passed. The unpublished merge’s missing Codex trailer
  was corrected while retaining a recovery ref; no submitted worker commit
  was amended. Hosted run `38351056321` passed at `71adf289`.

### 2026-10-13 — digging relocation regression caught by acceptance

- Hosted checkpoint `38357931835` passed at `b9cbf1ba`, but acceptance
  rejected the conjoined-pit delivery because previously matching v53
  `v53-ring-shop-wall-digging-damage-action3` failed with
  `SHOP_WALL_COST is not defined`. It lost 295 matching screens and
  cursors and 4,617 matching RNG calls. The v55 target improved.
- The relocated function omitted a binding from its former module. Root
  preserved the unpublished candidate and asked B for a separate correction
  with a new immutable receipt. Passing standard CI does not replace the
  acceptance helper's comparison with previously accepted cases.

### 2026-10-13 — saved scan omitted from queue refresh

- Root refreshed the queue with `mismatch-queue.mjs --work --json` without
  `--scan`, causing a redundant 44-session fixed scan after successful
  hosted validation. Run `run-NoxNRg` finished in about 144 seconds before
  Root's stop command reached it; the retained handle returned success.
- Later refreshes should pass the imported checkpoint's `scan-cache.json`
  with `--scan`. That saved artifact has all 44 rows. Synthetic diagnostics
  can still refresh separately when their current cache is missing.

### 2026-10-13 — spell helper insertion and delivery identity

- The spell-floor helper insertion conflicted with A's corrected
  `disintegrate_mon` source comment. Root retained the comment and the
  complete incoming helper; preflight then rejected changed patch identity.
- Root verified four delivered files and the complete inserted helper
  against immutable `794e91a9`, then preserved that submission's ancestry
  with a merge that left Main's tree unchanged. Preflight passed at
  `acaa5f96`; all 86 focused spell tests passed after the resolution.

### 2026-10-13 — admission activity task guard

- The first all-accepted-batches check after tooling validation tried to
  record admission activity against the pyrolisk implementation task. The
  ledger rejected it: admission and baseline phases require an accepted
  preparation task. No event was appended.
- The direct ledger admission check passed at `1812ba65` and returned an
  empty group: v56–v61 remained submitted rather than accepted. For a
  nonempty group, record its admission activity against accepted Prep.

### 2026-10-13 — publication receipt collided with a ledger writer

- Lantern publication pushed `d97b56fb`, then its `published` event failed
  because another writer held the shared ledger lock during Prep26 submission.
  The retained publication handle exited with code 2.
- Root observed that the lock had cleared and retried the publication helper.
  It reused the committed dashboard and completed the receipt successfully;
  Root did not remove a lock or restart validation.

### 2026-10-13 — source workers waiting for prepared batch admission

- After healer acceptance at `950ec0f9`, the refreshed queue contains only
  the held v48 host-profile case. A2, B, and C are idle with no independent
  source task. Seven submitted batches, v56 through v62, await acceptance
  and admission; their cases are not yet worker inputs.
- Main follows implementation-first integration priority, then starts Prep20
  when the ready implementation queue empties. Its saved C evidence is
  verified. The approved Admission workflow will baseline accepted manifests
  at the next safe boundary.

### 2026-10-13 — admission lock and manifest handoff timing

- Prep20 acceptance completed, but its first admission-activity event met a
  transient shared-ledger lock. Root observed that the lock had cleared and
  retried the same event; admission then wrote only the v56 manifest.
- The required wakeups before publication reached A and B while
  `accepted-main` still named the tested preparation commit without the new
  manifest. Both held their claims. After publication, Root sent the cleared
  dependency once so they could sync the manifest and proceed.
- C initially returned its previous completed read-only findings after the
  new-batch wakeup. Root confirmed that turn was completed and followed up
  on the same worker with the published manifest and source-work request.

### 2026-10-13 — worker edits in Main and runtime recovery

- Prep21 acceptance rejected accidental pickup source and test edits in Main.
  B transferred both files to its checkout; Root compared their byte hashes,
  preserved the patch, and restored only those two Main paths. B reran its
  focused checks against the actual worker tree. The hosted candidate stayed
  unchanged and its passing result was reused.
- Concurrent ledger writes then interrupted the final acceptance event. Root
  observed the cleared lock, recorded that exact verified event, and saved
  the canonical handoff receipt without repeating validation.
- On resumption at 14:57 UTC, the old runtime handles and four temporary
  worker checkouts were absent, with no worker processes running. Git retained
  their commits and indexes. Root rehydrated those checkouts, passed all four
  recorder setup checks, and reconnected Luna-high A2/B/C and the dedicated
  preparation worker. Lost uncommitted proofs are recreated before use.

### 2026-10-13 — grouped Prep handoff compatibility

- The first grouped integration added a prep-integrating event. Older worker
  checkouts rejected the shared ledger before recording their resumed turns.
  The accepted ce51c523 commit contains the compatible parser; clean source
  workers merged it before writing. Prep can use the accepted Main CLI from
  its assigned checkout until its next clean merge.
- Wakeups before publication again reached workers before their checkouts
  contained the new manifests and baseline evaluations. They held claims
  until c171803b was published, then resumed from the refreshed queue.
- C's worker guide directs it to worker-state next, but the CLI reserves
  that command for the coordinator. C used the shared queue and status for
  its ownership check. No guide change is included here.

### 2026-10-13 — saved-result commands hold the full validation slot

- A's final zap replay waited for run-A3Huea and run-WtiF6t. Those Main
  commands accepted saved hosted evidence and refreshed the queue from its
  saved fixed scan; neither reran the full gameplay workload. They still
  occupied the same local slot that fresh C comparisons require. Root
  collected each retained handle and notified A after completion.
- C's clean-boundary sync-main command was rejected as coordinator-only.
  Its direct merge preserved submitted commits. The merged f075b7d93 was
  local accepted closure history at that time, not yet public; Root corrected
  that provenance description before publication.

### 2026-10-13 — acceptance ledger contention

- B partial-stack acceptance encountered a live ledger lock after its hosted
  checks passed. Root retried the exact verified validation event, then
  completed acceptance at the unchanged tested commit without replaying it.
- Main receipt and publication writers also briefly blocked A and C submissions.
  Root collected each writer handle and notified workers to retry unchanged.

### 2026-10-13 — correction checkout ancestry

- Blind-floor CI exposed an older tactile-pile fixture without the game
  context required by the newly reachable death path. The worker corrected
  the fixture and retained production behavior.
- A correction branch first failed the immutable worker-registration check.
  Renaming the preserved old branch and the correction branch retained both
  histories while restoring the registered name.
- Submission then required assignment-base ancestry, which Main cherry-picks
  do not retain. A tree-identical bridge recorded the already accepted worker
  base before replaying the correction. Main integrated only its two correction
  commits; the bridge tree equals the failed candidate tree.
- Worker CLI rejects parking implemented investigations as coordinator-only;
  Root recorded the v48 build-profile park with unchanged raw target evidence.

### 2026-10-13 — queued targets and reserved callers

- C selected its own already submitted bee-jelly target from the accepted
  queue before checking pending deliveries. Root identified the duplicate
  before its assignment; no code was changed. The queue continues to show
  a target until its delivery is accepted.
- A and C exhausted independent admitted cases while their completed work
  remained queued. Both recorded idle; B remains blocked on zap_updown.
  Root prioritized that dependency chain, then prepared-batch admission.

### 2026-10-14 — corrected Prep group omitted its original case files

- Context: frozen Prep27/v63 and Prep28/v64 integration, corrected delivery
  `a76fb960f9ed89ad00bf859a13290a0627c6ba5b`.
- Friction: the group helper cherry-picked the latest correction without the
  original v64 data commit. Two annotated clay-golem files failed with
  modify/delete conflicts. The failed integration command exited before repair.
- Evidence: `.cache/prep-group.json` retains the frozen membership;
  original delivery `21718f0002e863a511fc027c903c05375400ef78` contains the
  missing files. The repaired group passed hosted checkpoint `38451492201`.
- Reason: the loop requires preserving original task commits through corrections
  and validating the frozen group before admission.
- Outcome: aborted the unfinished correction cherry-pick, preserved the already
  integrated v63 commit, then imported original v64 data before its correction.
  Retrying the same frozen group succeeded. The helper still needs to include
  original task data when a correction packet lists only later commits.

### 2026-10-14 — unchanged Prep gameplay required new tracked annotations

- Context: Prep28 overlap correction after the accepted blind-floor caller fix.
- Friction: a metadata-only correction was rejected because its delivery had no
  changed tracked paths. The worker annotated the recipe and recording, then
  repeated C recording and independent replay despite unchanged gameplay inputs.
- Evidence: corrected packet
  `65477fc42d34472553349ebc43b2a380c8b71fab2fefb1d96dda5816a8f8453d.json`
  preserves the original revision and byte-identical C replay; Root's saved
  `.cache/prep28-v64-corrected-verification.json` reports no failed checks.
- Reason: admission requires corrected overlap classification and the delivery
  interface requires a changed tracked path.
- Outcome: the correction was accepted as 12 failures and three controls.
  The unchanged C gameplay remains pinned to the original delivery.

### 2026-10-14 — automatic ancestry blocked independent deliveries

- Context: new v63 Newman and v64 unseen-web deliveries after admission.
- Friction: submissions inherited pending deliveries from worker branch history,
  although workers verified that their actual callees were already accepted.
  Retrying the same head with explicit dependencies failed because its ready
  event ID already held a different immutable payload.
- Evidence: original Newman delivery `71ee68b3f5e9c8f51c1acb021abe76b195d4f87e`
  and corrected `33bc476444fa070644192ba4580b2a8d8b12e40d`; original unseen-web
  `d3b5e011b3c22850716b4aebdbcaf15d806249b0` and corrected
  `54d792a7d77979db73f93694d202eb0c6003f733`. Both corrections preserve code,
  tests and saved replay evidence, with no pending dependencies.
- Reason: the loop permits independent tasks after submission and requires
  preserving immutable deliveries and real dependencies.
- Outcome: workers preserved their advanced branches, made empty metadata
  commits from the original deliveries, submitted new packets, then merged the
  preserved histories back. Future initial submissions need explicit actual
  dependencies to avoid unrelated ancestry delaying integration.

### 2026-10-14 — approval review misclassified an accepted worker sync

- Context: C's clean-boundary merge of accepted Main `02a098f2e3bf8dab3c52e27f90b3fd1adacc6260`.
- Friction: automatic approval review rejected the merge as coordinator-only
  integration, leaving C doing read-only work.
- Evidence: the checkout was clean; `.cache/b-drawbridge-accept.json` retained
  the exact acceptance receipt. `.agents/loop.md`, "Merge requests", explicitly
  permits workers to merge accepted Main at clean boundaries.
- Reason: workers must retain pending source commits while syncing accepted code.
- Outcome: the coordinator supplied those checks with the same merge request;
  review allowed it. The clean merge is `1eef11bf5cb52b871d5c0361e2adbd092b821aba`,
  and C resumed work. Submitted source history was preserved.

### 2026-10-14 — grouped integration stopped on empty metadata and a resolved report

- Context: the first frozen group contains 50 received implementation deliveries.
- Friction: the helper stopped on the originally empty dependency correction
  `33bc476444fa070644192ba4580b2a8d8b12e40d`. Adding `--allow-empty`
  preserved that submitted metadata; the focused regression reproduced the
  failure and passed after correction `7d64ae4986e1f20591cb080dd0d15b7b7ff02fe4`.
- Evidence: retained runs `run-Or4bTH`, `run-auleFq` and `run-wfDIIv`.
  The report addition `91a0161dae96f5d8ef5b6a1913174e3425627d7e`
  conflicted with the preserved original diagnosis. Choosing its exact submitted
  contents created `ce24627d6`; retry then reapplied it because the resolved
  patch differed from the original addition. A path comparison proved that
  the report already matched before clearing the redundant cherry-pick.
- Reason: immutable corrections and original diagnoses must survive integration,
  and an interrupted group must resume without repeating completed changes.
- Outcome: the candidate branch is preserved, the empty-metadata correction
  is integrated, and a focused retry correction is requested from the tooling
  worker. Both corrections will use the group's exact hosted checkpoint.

### 2026-10-14 — corrected group needs retained integration prerequisites

- Context: candidate `98a56ec0a87a7ca742189a3f045da03d41ee193c`
  failed hosted run `38515123991`; fixed development and all recording batches passed.
- Friction: two tests and one input-boundary check failed. Root initially linked
  the boundary warning to the listed selftouch gap. A2 traced the first screen
  mismatch to the version banner instead; the cumulative goto_level gap did
  not establish the cause. B's C comparison confirmed the judge-profile mismatch.
- Outcome: B submitted planner-isolation and version corrections; A2 retained
  the separately source-traced disintegrate_arm caller correction. Further
  goto_level changes were not requested. All original deliveries remain intact.
- Friction: rebuilding corrected deliveries from the accepted base would lose
  coordinator tooling fixes, quality assignments and original diagnoses that
  predate delivery bases. The frozen failed branch preserves those prerequisites.
- Outcome: helper correction `5509b9ff092c1baf099ca8ce1528d540b149c81b`
  adds explicit retained commits, applied in history order before submissions.
  Its 11 focused tests cover corrected rebuild, retry and split; the live group
  supplies the full checkpoint. The accepted base and failed branch stay intact.

### 2026-10-14 — group metadata verification exceeded the focused limit

- Context: corrected integration of 50 received implementation deliveries.
- Friction: bounded run run-4XVZhs exhausted the 120-second focused limit
  during ledger verification after source integration and packet preflight.
- Evidence: its retained terminal receipt records timeout, exit 124 and reaped
  control group. The recorded lock owner no longer existed (ESRCH).
- Outcome: Root removed the proven dead lock and resumed the same candidate
  with the 900-second full profile. Retained run run-FmtN8h completed successfully
  at 41f0b9fdd4e3a7743344ba85f44b57f987d501d7. The timeout did not
  establish a source failure. This entry waits for the next validated record
  boundary so logging does not change the candidate during its hosted check.

### 2026-10-14 — preserved diagnosis belongs in the tested candidate

- Context: wizard clone delivery 20e461f follows the accepted group of 50.
- Friction: adding its original diagnosis as Main bookkeeping failed the
  publication guard because its recorded source commit is outside the accepted
  history. The diagnosis and measurement must retain their original attribution.
- Outcome: Root preserved the original commit, removed the premature report
  addition from Main, and included it in the candidate before hosted validation.
  The retry retains that report and the earlier timeout log as prerequisites.

### 2026-10-14 — later clone boundary depends on queued Castle callers

- Context: clone candidate c38740332 passed hosted run38523290019.
- Friction: acceptance found screens+152 and RNG+1754 but cursors-46 in
  its target. The candidate stops at step986 before later cursors are emitted.
  The C trace reaches muse.c:use_defensive monster creation; that caller is
  reserved by the ready Castle-hole delivery a464b127.
- Outcome: Root requested an immutable correction without weakening the gate,
  preserved the failed branch and frozen plan, and selected a fresh compatible
  group containing Castle and four other received deliveries. It needs its own
  hosted checkpoint. The clone correction resumes after Castle releases the
  caller scope; its previous score is not acceptance evidence for the new group.
- Friction: old parked reports failed current schema and ancestry checks during
  submission. Workers preserved old commits, normalized fields from recorded
  values, and used accepted-tree ancestry bridges with scoped restored blobs.
  They validated the complete reports before submission.

### 2026-10-14 — ready split was blocked by held corrections

- Context: five-delivery candidate `68d2aee` failed hosted run `38526616796`.
  The saved logs identify two affected tasks; three deliveries remain ready.
- Friction: split required every original task to be ready, including the two
  held corrections, so independent source work could not reach a fresh gate.
- Outcome: correction `a4ffd876` changes that check to the selected tasks. Its
  13 focused tests preserve dependency rejection, held statuses and submissions,
  original base and baseline, and fresh-checkpoint acceptance. Root exercised
  the split with Invocation, cancellation and rolling-trap deliveries; preflight
  passed. The failed branch and both corrections remain preserved.

### 2026-10-14 — preparation publication requires local main

- The v65–v67 preparation group passed hosted checkpoint 38531268459 at
  `de6a2ef0`, and Admission run 38532374999 passed at `979a3f396`.
- Publication from the retained Admission branch exited with
  `publish from local main`. Root collected that terminal result, switched to
  local `main`, fast-forwarded it to the verified Admission commit, and retried
  the same publication. The retry published `061c6b63`; no validation was rerun.

### 2026-10-14 — source-group history and preflight after admission

- The next group preserves Castle and self-status corrections plus gremlin and
  stone-to-flesh deliveries. Their report-only conflicts required keeping both
  original report snapshots in Git history and restoring the newer gremlin
  diagnosis before validation.
- Preflight at `ff3f9105` failed with `spawnSync git ENOBUFS` for three deliveries.
  The missing-patch fallback hashes all commits after a stale worker base,
  including unrelated large preparation recordings. Root requested a focused
  tooling correction; no hosted checkpoint or acceptance was started.

### 2026-10-14 — temporary worker storage absent on resumption

- All four registered worker directories under `/tmp` were absent on
  resumption. Git branches and immutable delivery packets remained available.
  Root restored the original paths from those branches and ran the private C
  checkout and recorder readiness checks before resuming workers.
- C reconstructed its uncommitted discoveries edits. Prep reported 25 earlier
  C pairs with no surviving proof bytes; those attempts remain historical
  observations and do not count toward the reconstructed batch. New proof files
  are copied to the coordinator cache after each completed attempt.

### 2026-10-14 — report ancestry and isolated spell delivery

- Source groups encountered missing-base report conflicts for shop relocation
  and Astral hostility. Root restored each worker's exact committed report and
  continued the retained cherry-pick; no source review or gameplay check was
  repeated for those report resolutions.
- A's spell delivery included unrelated `GOALS.json` changes after merging
  accepted Main during the task. An isolated branch merged accepted Main into
  the original assignment before applying the two task commits. Its packaged
  tree equals the tested tree. Submission succeeded with the explicit packaged
  head after switching the checkout back to its registered branch; all original
  commits and branch refs remain preserved.

### 2026-10-14 — checkpoint import attempted before all jobs finished

- Root attempted to import run 38589672152 after the combined checkpoint job
  finished while three synthetic jobs were still running. The importer rejected
  the pending run. Root collected the original watch's terminal success before
  importing again. The later candidate's complete run status was verified before
  import; no checkpoint was rerun.

### 2026-10-14 — GitHub Pages deployment timeout

- Dashboard run 38591623655 built and uploaded the accepted `58844faaf`
  snapshot, but Pages remained in `updating_pages` until the deployment timed
  out. Root saved the failure log and retried only the failed Dashboard job.
- The first retry failed because the run contained two generated `github-pages`
  bundles. Root archived both ZIPs and metadata, verified their integrity, removed
  only those generated bundles, and retried Dashboard. Attempt 3 deployed
  successfully; accepted source and dashboard work was published at `b4eee962`.
  Gameplay validation was not rerun.
- The first Dashboard attempt for `b4eee962` also timed out in `updating_pages`.
  Root archived and verified its generated bundle, then removed that deployment
  input before a Dashboard-only retry to avoid duplicate artifacts.
  Attempt 2 deployed successfully; the pending publication tracker cleared the
  failure after resumption.

### 2026-10-14 — preflight fallback correction accepted

- Correction `0206b470` was integrated as `f0581a765`. Missing-patch fallback
  searches the submitted paths while preserving whole-commit identity checks;
  unrelated large preparation patches no longer enter that search.
- The four-source preflight passed, hosted checkpoint 38535686281 passed at
  `f0581a765`, and all four tasks were accepted. The original failed candidate
  and report snapshots remain in history.

### 2026-10-14 — generated-output assertion and incomplete hero fixtures

- Hosted checkpoint 38601150821 at `db36ea92c` rejected the six-source candidate.
  Adding Samurai home data to `QUALITY.json` also required adding it to the
  explicit generated-output list in `quality-status.test.mjs`. Root corrected
  that assertion; its 36 focused tests passed.
- The new `newsym` tactile-memory path exposed seven test fixtures without an
  initialized hero form across five test files. B owns their correction under
  the original Rogue-memory task. The failed candidate and hosted logs remain
  preserved; its passing fixed and recording checks do not establish acceptance.

### 2026-10-14 — resumed queue commands and shared billing callers

- A read-only implementation-group preview invoked the bounded runner inside
  the sandbox and failed on its `flock` subprocess. Root did not retry that
  optional preview. A queue refresh used a nonexistent `artifacts/scan-cache.json`
  path, exited without replaying, then succeeded using the imported archive's
  actual `scan-cache.json` path.
- B's unpaid-food diagnosis reaches `costly_alteration`. Its message can wait
  for input before changing a crysknife into a worm tooth. Both B and a narrow
  read-only helper traced the source contract; silent dummy billing alone cannot
  remove that wait. Caller propagation reaches shared object placement and
  container helpers. A owns the reserved shop-scattering and bones callers; C
  owns the queued throwing caller correction. B owns the remaining caller audit
  and must claim its complete write scope before edits.
- The helper reported that an earlier artifact search exceeded its requested
  recipe scope and emitted a larger case payload. It stopped the search and made
  no edits, recordings or replays. Later help used only the assigned source scope.

### 2026-10-14 — coordinator records after group registration

- Root added a required friction record after the three-source group was already
  registered. The integration helper rejected retrying at that descendant; a
  direct registration also rejected the occupied slot. An attempted bounded
  Node heredoc did not forward stdin and performed no registration. Root saved
  the command in a cache file, released the old registration, then reran the
  supported integration helper at the exact hosted candidate. Preflight passed;
  the same hosted checkpoint was imported and accepted, without a duplicate run.

### 2026-10-14 — source-ready repair handoff and prayer packaging

- A's ordinary shop repair matches the admitted v67 case, while independent
  scatter and catch-up recipes hit earlier getpos or priest movement differences.
  Root reread the existing worker rule allowing verified functions plus explicit
  incomplete functions and committed blocked recipes. A submitted those blockers
  instead of claiming complete runtime coverage. The first submission exposed
  required caller units needing their own blocker records; A added them.
- C's prayer investigation initially attributed the first mismatch to crowning.
  The trace instead identified the ordinary reward's wielded-weapon state slot;
  fixing it reached the later genuine crown branch. The complete case then
  matched. C preserved the failed explanation as counter-evidence and corrected
  the report schema, reward-switch wording and delivery base so its separate
  diagnosis commit is included.
- The next group again hit a missing-base investigation conflict at the prayer
  implementation commit. Root restored that exact worker report snapshot and
  continued the cherry-pick; source code needed no merge edits.

### 2026-10-14 — hosted lookup, bounded previews and delivery provenance

- Root initially queried a nonexistent checkpoint.yml workflow; the query returned HTTP404. The documented project workflow is checkpoint-trial.yml. Root used that file to identify the existing candidate run and retained one watch.
- A Prep plan preview entered the bounded runner inside the sandbox and failed to launch flock. Its saved receipt was inspected; integration then ran outside the sandbox under the full bounded wrapper. No duplicate validation ran.
- A one-case worker scan automatically acquired the shared full validation slot and briefly blocked Root integration before any integration edits. Its receipt confirmed successful completion and reaping. Root retried the integration and directed future one-case scans through the focused bounded wrapper.
- The resumed v64 report verifier required its exact accepted evaluation in the delivery head. Root permitted one provenance path containing the unchanged accepted evaluation blob; the worker preserved its source and diagnosis commits and recorded no new score.
- The next seven-source group had a shop-module header comment conflict between accepted repair names and the incoming settlement names. Root preserved both lists; no executable source required a conflict edit.
- After the header conflict was resolved, retry reapplied the already integrated settlement patch because its Git context differed. The delivery preflight recognizes the complete context-free patch. Root verified the duplicate attempt had no staged changes, skipped it, applied the remaining submitted commits, and ran all seven preflights before using the documented group-registration event. The first preflight found only an unassigned new UTF-8 module; Root assigned it to the existing Display and symbols area.
- Hosted38621775362 failed one arrival assertion that still required the removed make_happy_shoppers gap marker. Root updated that assertion; all29 focused arrival tests passed. Fixed44 and all regression recordings passed in the failed hosted run, which remains preserved rather than accepted.
- A read the hosted watch handle as a local validation hold. Root clarified that worker checks could continue and labeled the handle explicitly as a hosted gh watch. A later lost scan handle was recovered from its terminal, reaped bounded receipt without replaying it.

### 2026-10-14 — goal registration and timeout fixture corrections

- Root omitted goal registration before the seven-task acceptance. The helper rejected the otherwise passing candidate because its goals were absent. Registering the preserved worker contexts and retrying acceptance at the same tested commit succeeded without another checkpoint. Root registered all sixteen received goals before the next integration.
- Hosted checkpoint38627114768 failed two old timeout tests that expected ROT_ORGANIC to remain unported. The completed callback reached their incomplete object fixtures instead. Root preserved the failed checkpoint and requested an additive correction from the owning worker after its current task; all44 fixed sessions and all1991 regression recordings passed.
- The first receipt for B's levitation-trap delivery encountered the live ledger lock. Root retried the identical event under the established lock-only retry rule; no lock was removed.

### 2026-10-14 — acceptance receipt timeout

- The sixteen-task acceptance helper automatically used the focused120-second profile and timed out after writing closure records. Its saved receipt confirmed the process was reaped. Root retried idempotent acceptance at the same tested commit under the full bounded profile, recovered the receipts, and refreshed the queue without rerunning tests or evaluations. The longer profile is needed for similarly sized acceptance and publication groups.
- The v71 saved-proof verifier hit sandbox spawnSync git EPERM. Root reran that read-only hash verification outside the sandbox; all102 preserved files and ten included independent replay proofs passed.

### 2026-10-14 — provenance handoff and remaining-case ownership

- The v71 checkpoint watch exited on a GitHub jobs API404. Root collected its handle and used one recovery query to confirm successful completion at the exact commit; no workflow was rerun.
- Workers merged the admitted manifest commit before publication, then submission required the evaluation committed by publication. Root authorized copying only that exact published evaluation blob into each affected delivery. Workers preserved source commits and measurements; no gameplay checks were repeated for provenance alone. Future handoffs must distinguish the manifest commit from its published baseline evidence.
- The three-task integration encountered live ledger collisions after applying its commits. The supported idempotent helper retry succeeded without changing source or removing locks. Root used the established lock-only retry limit.
- A and C initially treated the accepted meatobj fix as completion of the v70 cube case. The saved queue still contained a later mismatch. Root reran the ownership helper, corrected the mistaken idle reports, and assigned fresh investigations without reopening accepted task history.
- B's temporary C diagnostic build initially used an older installed binary because incremental compilation did not reinstall it. B installed the instrumented binary and checked its output against both the admitted and uninstrumented recordings; all559 step keys, screens, cursors and RNG sequences matched after normalizing source line numbers.
- Root tried a nonexistent fetch-hosted-admission.mjs help command. The documented importer is fetch-admission.mjs; the failed lookup changed no task state.

### 2026-10-14 — scope metadata, import conflicts and queue starvation

- A's boots context represented sessions as range objects; goal registration expects session strings. A added a metadata correction and retained its source commits and successful checks. C's teleporter context selected two primary functions with an unrelated function between them. C moved the helper to requiredFunctions; Root's read-only goal preview then selected only the intended two functions. Neither correction repeated gameplay checks.
- Overlapping additions to one long zap.js import line caused a five-task integration conflict. Root preserved A_CHA and W_SADDLE. Git's patch identity did not recognize the combined line as the original adornment patch. A normal merge of the worker's original ancestry staged unrelated version.js and historical investigation changes; Root aborted it before committing. Root instead cherry-picked only the two relevant commits onto the frozen accepted base and merged that isolated branch. Its tree matched the resolved candidate, the helper resumed successfully, all preflights passed, and both affected focused suites passed 115 tests before hosted validation.
- Shared ledger writes again collided. Identical events succeeded under the existing bounded lock-only retry. One receipt used a notification's abbreviated task ID and failed as unknown; Root recovered the registered full ID from the ledger. No live lock was removed.
- A and B exhausted independent v72 cases while their deliveries awaited integration and Prep37 finished its next batch. Both recorded idle turns with the dependency. The refreshed queue reported zero available candidate groups and two workers needing work, so the completed preparation packet took priority at the next safe boundary.
- Prep37's initial horn comparison checked the older resistant v61 case but missed v72's identical self-damage first cause. Root identified the overlap; Prep excluded it, checked all sixteen v72 cases, and retained the valid C probe outside membership. Root approved ten failures and fourteen controls after the recorded search across 28 source routes. A reused proof verifier initially expected a combined control-rationale field; the packet instead stored closest coverage and its difference separately. Checking those actual fields passed without changing inputs or rerunning recordings.
- Prep's documented post-delivery next command was coordinator-only in its checkout. The worker captured the rejection and continued using its own task identities to reserve the next unused batch; it did not inspect implementation assignments.

### 2026-10-14 — delivery bases, active ownership and preparation priority

- Automatic approval review rejected A’s domove_core scope because earlier accepted tasks still listed that function. Root checked the derived active-reservation map: both requested keys were clear and all earlier owners were accepted. A then recorded the needed claim without narrowing away its caller.
- A and C needed accepted prerequisites while their current tasks were already committed. Their registered assignment bases were outside accepted Main’s ancestry, so submitting from an accepted-only base failed the delivery guard. Root’s initial isolation advice missed that guard. Ordinary merge bases starting at each assignment base preserved ancestry; cherry-picking only the task commits kept unrelated historical paths outside the delivery diff. Temporary tree-and-parent bridge refs were preserved but not used.
- The five-task acceptance hit a transient ledger lock. The writer finished and removed its own lock. Root retried the same tested commit under the bounded lock-only rule; saved validation and partial receipts were reused, with no repeated checkpoint.
- B’s turn still said idle after it claimed the remaining cube investigation, so the scheduler briefly counted it as needing work. B corrected its active turn before the next priority decision. After A and C actually finished their deliveries, the valid queue had no independent unreserved case and two workers needing work; Prep38 took priority at the next safe boundary.
- Root verified all 80 Prep38 case files, 39 first-run logs and 16 independent replay rows. A reused verifier expected a separate closest-coverage array, while this packet named the closest cases in each difference paragraph. Root checked all eight rationales and their actual source/difference fields; the saved hashes and checks passed without changing recordings or replaying them.

### 2026-10-14 — baseline handoff and hider test expectations

- Before waking workers on v74, Root committed only the hosted baseline evaluation and SCORE.tsv at b5bfb005, then checked that descendant through the publication verifier. Workers merged the checked handoff with its official evaluation already present; they needed no later provenance copy.
- Root tried to record Prep38 admission activity before preparation acceptance; the ledger rejected it without changing state. Root used waiting during its checkpoint and admission only after acceptance. The public push later succeeded, but its publication event hit a transient ledger lock. Retrying the identical publisher reused the report commit and completed the record without validation or push changes.
- The four-task checkpoint38654601026 failed two older movement assertions that expected hidden monsters to be refused. All44 fixed sessions and1994 regression recordings passed. A traced both expectations to the newly ported C gates and added positive movement and closed-door tests without changing production code. Both affected suites passed139 tests and lint; corrected checkpoint38655955306 passed, and the same four-task group was accepted. Later deliveries remained queued.
- A's old idle turn persisted after it resumed the correction, and C ended its counted-stack investigation while its turn still said active. Root reconciled observed activity and C's explicit dependency wait; A subsequently recorded its completed correction and idle turn. The counted-stack implementation remains blocked by C's pending quiver delivery's dowield reservation.
- Root verified Prep39's68 data files,33 valid first-run logs and12 independent replay rows. Its incomplete original child log remains preserved outside the proof count. The approved reduced v75 has three distinct failures and eight controls, with source and earlier-coverage comparisons retained for each.

### 2026-10-15 — counted-stack diagnosis and preparation handoffs

- C committed the counted-stack diagnosis before parking behind its submitted quiver reservation. After that reservation cleared, its delivery base already contained the diagnosis, so its new commit list contained only source and report modifications. Main lacked the report those modifications expected. Root detected this before integration and preserved the original report-only 946f9d8ef commit at the next preparation record boundary; source and runtime evidence did not change.
- The same-function reservation required counted-stack implementation to wait for quiver acceptance. Root woke C immediately after acceptance and queue promotion, before publication. C resumed the preserved investigation, submitted its passing correction, and recorded idle when every remaining case was owned or parked.
- Root again committed and verified a baseline-only handoff before waking workers on v75. This manual publication check kept the official evaluation in each worker base without a later provenance-copy correction.
- Prep40 reviewed20 source routes and43 C attempts, retained41 valid first pairs and15 independent replays, and excluded exact earlier boomerang, tinning and nonlethal Earth coverage. Two failed quit recordings remain recipes and failure logs, outside the proof count. Root verified84 submitted data files and every saved artifact hash; the verifier skipped absent recording hashes for those two invalid attempts. The approved reduced v76 contains five failures and five controls; cloud-status coverage remains outside membership behind B's whole-function task.
- Shared ledger writes continued to collide briefly. Identical events and helpers succeeded under the bounded lock-only retry; no live lock was removed. The v75 preparation checkpoint repeated the full suite, fixed workload, regression recordings and existing synthetic batches with unchanged game code, as the current preparation gate requires.

### 2026-10-15 — v76 evidence and preparation boundary

- All three implementation workers became idle with only owned deliveries and the parked v48 profile case in the queue. Root followed the saved admission priority and prepared v77 next. Prep41 found no qualifying first failures across 32 source designs and 30 valid C pairs; Root approved a reduced controls-only packet, retaining 13 independent C replays and documented coverage differences without claiming exhaustion. Prep42 shifts to other source families.
- The ledger permits an investigation to reserve only its initial session. A2 first traced the statue-search source, then used implement to reserve the shared dosearch0 scope and swallowed-search session before source edits. Required automatic-search caller evidence needed two independent recordings; the first Wizard route hit a locked door, so A2 corrected the C route and preserved the valid Healer witness.
- C paused a replay after the bounded wrapper rejected its launch while publication held the validation slot. Root collected the retained publication process and notified C when the slot released. No live lock was removed.
- Root corrected a worker-state flag from --ledger to --file, a checkpoint workflow lookup from checkpoint.yml to checkpoint-trial.yml, and coordinator process metadata from objects to strings. The rejected calls made no state change. Workers retried transient ledger locks with unchanged payloads.

### 2026-10-15 — current evidence handoff and matching preparation

- After nameshk acceptance exposed the later chest-forcing failure, Root committed only the official accepted v76 evaluation and verified the report-only descendant before waking C. C merged that handoff before publication and submitted its follow-up without copying provenance into the delivery.
- C’s chest report contained one incorrect full implementation SHA. Root requested a report-only correction; C resubmitted with the actual source SHA and identical saved checks. No gameplay validation was repeated for that correction.
- Prep waited for A’s recorder boundary after A had already submitted and recorded idle. Root confirmed that A had no live process and released the stale wait. Later local holds ended immediately after accepted queue promotion. A publication-slot rejection and transient ledger locks retained their existing commands and evidence; no live lock was removed.
- Prep42 found no qualifying first failures across 21 source designs and 42 valid C pairs. Root approved a reduced packet of 12 matching controls after saved branch, state and substantive-caller comparisons; the C21 acid-cure overlap was excluded. All attempts and 13 independent C replay proofs remain preserved.

### 2026-10-15 — v79 search and prefix evidence

- The 22-route source search produced five distinct first failures and eight matching controls from 30 valid C pairs. Root approved reduced membership after exact prior routes were excluded and two materially different displaced-demon setups missed the intended branch. The failed extra ending-padding attempt remains a recipe and failure log, with no recording claim.
- The candle error discarded ordinary full-replay output. Prep preserved an unchanged-input delegated capture matching 235 screens and 2,564 RNG calls before the actual failing step. A separate delegated RNG-log stack traced the demon sibling relocation to live RNG consumed during planning; the two demon defects retain one source owner.
- Saved prefix evidence used cdb0c7b7; final comparisons used accepted 244c6517. Root verified that js/ and package.json are byte-identical between them, preserving the successful evidence without another gameplay run. The sleeping-Wizard entry remains explicitly untested for the future Amulet owner.

### 2026-10-15 — v79 workers and v80 preparation

- B read an earlier launch hold after the v79 baseline and queue were ready. Root confirmed the hold had ended; Prep distinguished the released hold from the current recorder slot. A later automatic-review rejection cited that stale hold. The unchanged bounded C command succeeded after Root supplied the release evidence.
- A2 found the second demon_talk production caller in domonnoise, claimed it before editing, and reused a fully matching independent Geryon chat recording for that caller. The monster-turn synthetic ranges remain separate evidence. An implement event containing a worker field was rejected without mutation; the corrected event omitted that field.
- Prep44 retained28 valid C pairs and14 independent replays across22 designs. Root approved reduced v80 membership with one successful-writing caller failure and13 controls after reviewing prior source paths, state conditions and action histories. Mounted forced-attack setups remained misses and were deferred without an attack-coverage or exhaustion claim.

### 2026-10-15 — v79 acceptance and v81 preparation

- The v80 packet became ready before the source integration freeze, with no free current investigation for an idle worker. Root followed preparation priority, baselined it, committed the checked official evaluation handoff, and woke A2 before publication.
- C added the required cheap variation for its new sleeping-Wizard recipe and renamed the original to describe its observed nonzero wake check. The successful wake outcome remains explicitly unverified. Saved tests and unchanged synthetic evidence were reused.
- The four-source checkpoint accepted candle timers, demon interactions, disclosure and the Amulet hook without per-case regression. Disclosure exposed a later score-list screen; Root committed the exact accepted v79 evaluation and woke B before publication. A publication ledger lock cleared on the identical helper retry.
- Prep45 retained30 valid C pairs and18 independent replays across24 designs. Root approved18 matching controls after saved branch, state and caller comparisons; six earlier-covered routes and all substitute, jackal and force misses remain outside membership. No exhaustion claim was made.

### 2026-10-15 — terminal return and v82 preparation

- B traced the final v79 screen past topten: its notice was correct, then dosacrifice continued after the C NORETURN ending and overwrote it. The source fix propagates gameover at that caller. Initial final checks ran directly; B repeated only focused tests, lint, exact replay and range under run-bounded, saved receipts, resumed the changes-required task and resubmitted a report-only correction.
- The accepted writing and sacrifice group completed v79 and v80 without per-case regression; all fixed sessions and2000 regression recordings passed. The queue now retains only the parked v48 build-profile case.
- Prep46 retained28 valid C pairs and21 independent replays after30 designs and nine earlier-covered exclusions. Root approved21 controls after source/state/caller comparisons. Seven setup misses remain outside membership; taming coverage says observed distance2 and known cursed identify says sole-item automatic selection. No intended distance3–5, picker, or exhaustion claim was made.

### 2026-10-15 — build provenance and v83 first causes

- The user approved excluding v48 short-version output like the v32/v35 build cases, then approved a concrete future-handling instruction naming investigation files, resolution fields and the queue command. The refreshed queue puts all four existing exceptions under excluded and contains no actionable session; recordings and raw score history are unchanged.
- The old v48 summary still described missing command dispatch. Root replaced it with the current Unix/MacOS banner diagnosis. Publication verification also detected a separate dashboard UI commit already on local main. Root preserved that commit and included it with the next preparation checkpoint instead of publishing it under earlier source evidence.
- Prep47 retained34 valid C pairs and19 independent replays across30 designs and25 attempted routes. Root approved reduced v83 membership with five first causes and12 strict controls after actual caller/state comparisons. The old v33 acid recipe reaches hero gulpum, not the current NPC mhitm_ad_acid path; the earlier guessed gulpmu label was corrected. Two animation-only differences remain outside membership.
- Read-only delegated prefixes and stack diagnostics preserved the original mismatch signatures while locating future poison-cloud vision changes, planned glob RNG, pet wraith consumption and temporary-corpse timer cleanup. Intended later combat targets remain separate from actual first failures.

### 2026-10-15 — Prep pilot and standalone validation baseline

- The user approved six dedicated Luna/high Prep lanes under the Sol lead. Root preserved and parked v84 before integrating the pilot as c9b28079; checkpoint38686768168 passed and was imported once. Public e8b4a6de and its successful dashboard deployment contain the pilot. All workers acknowledged the absolute updated ledger reader before probe events; existing recordings and submissions remain intact.
- The next three-source integration stopped before candidate creation: implementation-handoff reported `published commit has unvalidated changes: .agents/glossary.md` (run-XmKTO5). Its acceptedMain pointer still names the earlier Prep47 publication7330de32; no unpublished accepted delivery remains on which to record the standalone pilot's supplemental checkpoint. The passing pilot evidence is saved under checkpoint-results/c9b28079bfc6cb8fa2da2d327887c3c546c8d1f5/run-hosted-24cQvt. Three received fixes and their registered goals are preserved while the supported baseline-registration path is repaired.
- B's initial v83 submission inferred unrelated historical dependencies. Root recorded feedback; B resumed and submitted a metadata-only correction with explicit dependencies none. Source, checks and original packets were retained. Transient ledger locks during receipts and activity writes cleared on retries of the identical events; no lock was removed.
- The Prep lead's turn failed with an automated content-filter message. Root recovered the same lead and six lanes without duplicating commands. All six recorder setups finished successfully; the first new game capture reached its saddle-touch transformation, while the later rejection remained unverified. A sandbox EPERM on a ledger command was retried outside the sandbox under the documented restriction.
- Prep48 submitted v84 as one independently reproduced dighole floor-boulder deletion failure, with no controls. Saved verification run-Uvghhz checked28 committed data files,14 first-capture logs,four independent replays and115 immutable artifacts without replaying gameplay. Two new pilot captures and the saved altar probe matched and stayed outside membership; three unfinished routes were deferred explicitly. The floor-boulder witness duplicates the included pit caller, while v61's bee/jelly deletion uses a different caller. The original30-design plan and all valid captures remain preserved.
- All five v83 source fixes were received before v84 admission. With the implementation workers idle and no unowned admitted case, the approved scheduling rule selects Prep48 first. Its ordinary exact-commit checkpoint will also cover the baseline-registration helper and the local friction edits; no old checkpoint is reused for those changes. Prep49 continues the deferred source routes with the same six lanes.

### 2026-10-15 — v83 combined checkpoint correction

- Checkpoint 38692845447 at 6d64146 passed all 44 fixed sessions, 2000 regression recordings and seven synthetic evaluation jobs, but failed one cmd test whose fixture required AD_ACID to remain unported. The new acid handler reached hitmsg and the fixture lacked species names. C supplied the species record and changed the assertions to the supported monster-action path; its focused correction and lint passed. Root retained all six approved dashboard commits and the CI batching change while rebuilding the same frozen five-task group. No failed checkpoint was accepted or imported as passing evidence.
- All seven synthetic jobs started 49–50 seconds after workflow start. Checkout took 30–32 seconds and replay 78–187 seconds per job. These are one-run observations, not a paired speedup measurement.

### 2026-10-15 — v85 preparation and protocol rollout

- The five-source group passed corrected checkpoint 38694336696 and acceptance without per-case regressions. v83 gained 2934 screens on unchanged cases and retains one screen mismatch; all RNG and cursors match. Root committed official evaluation evidence and woke A on step 859 before publication. B's v84 dighole fix is received. With no free independent case for B or C, the approved priority rule selects ready Prep49 before the next implementation group.
- Prep49 preserves 14 original C pairs, 21 logs and 225 immutable artifacts; saved verification run-7D9iP3 found no hash or input failures. Its one included mounted-down-chat failure has a byte-identical independent C replay and unchanged 54-screen/cursor, 2718-call prefix. Four matches stay outside membership; setup misses and deferred routes retain their observed limits. Current unmatched v83 vision output and v84 floor-object deletion use different source callers. Earlier mounted stethoscope, leash and ordinary pony chat do not exercise downward mounted dochat.
- The Prep lead encountered another automatic turn filter error while packaging. Root resumed the same lead; all slots were already clear. Two excluded C log files had been overwritten by generic JavaScript output names. Prep recovered original bounded-run logs whose receipt hashes matched the saved reports; no C run was repeated. An initially empty replay stdout failed submission, then the actual preserved stderr supplied the successful replay log.
- The approved bootstrap follow-up and saved-comparison submission check are included at this ordinary Prep gate. A, Prep and all six lanes acknowledged the pinned accepted ledger reader before Root changed its checkout. Prep50 will finish its current packet with the existing producer and reader; the new validated pair activates together at the next clean batch boundary. Historical packets and their exact retries remain valid.

### 2026-10-15 — Prep scheduling and follow-up evidence

- The user’s overnight monitoring reported a v85 lane reservation lasting from 06:02:34 to 06:04:47 UTC around a bounded command lasting about 0.3 seconds, and about 24 minutes without a recorded next assignment for Prep-3 after a match. Root relayed the requested immediate finished-lane reassignment, concrete reasons for waiting, setup-miss classification and correction from observed C evidence. The user removed extra per-command lead grants; the existing atomic two-slot reservation and local resource limits remain. Prep reassigned the idle lanes and acknowledged the instructions.
- A’s first step-859 delivery recorded direct focused, lint and range commands. Root requested only those checks under the required bounded runner; all three passed and a metadata-only correction preserved the source commit. No new C run or full local gate was required.
- The v85 baseline-import hold cleared after the queue was refreshed. Prep initially retained the old hold in its recovered turn; Root restated the release, and the lead confirmed that scheduling resumed. The new comparison check is published in 76ad9b15 but remains pending activation until Prep50’s immutable old-protocol packet is submitted and the lead and six lanes switch together at a clean boundary.

### 2026-10-15 — v86 boundary and comparison-check activation

- Prep50 submitted one unset-retravel dispatch failure after 12 frozen source designs. Saved verification run-kNbCjW checked four unique C input/recording pairs, 84 immutable artifacts and the included byte-identical independent replay without executing gameplay. Three setup misses remain excluded: two kitten hurtle routes missed the final mine position, and a graffiti More prompt consumed the pit/ball inputs. Deferred source plans and observed setup state are preserved; no target reach or exhaustion is claimed.
- The included C command prints “No travel destination set” at step 11. The accepted JavaScript comparison matches the earlier 11 screens/cursors and all 2819 RNG calls, then refuses before the existing dotravel_target helper. Prior fixed and synthetic help/list screens mention retravel but do not execute this caller. Current unresolved mounted chat uses sounds.c:dochat; the accepted region and dig fixes are separate source sites. No active cmd.c or dotravel_target claim conflicts with this case.
- After the immutable Prep50 submission, the lead and all six lanes merged accepted tooling at 90f779bf, read the updated guide and acknowledged the new producer and submit reader before claiming Prep51. New comparison logs identify the accepted commit and recording hash. Old evidence was not backfilled, and submission adds no replay. Root sent the requested final published-and-active confirmation; the external monitor requested no routine milestone messages.
- C's mounted-chat delivery needed bounded lint and range receipts. Its already bounded focused tests and successful full differential were reused; the correction also fixed the stale dochat comment. The prior source and runtime evidence remain preserved in both submissions.

### 2026-10-15 — routine holds and preparation continuity

- Root had paused independent Prep commands during ordinary imports, acceptance, queue refresh and admission preparation as a routine resource precaution. These pauses were not crash recovery, and Root identified no concrete resource or shared-input conflict. The user directed Root to remove them; Prep continues in private worktrees against fixed accepted comparison inputs under the atomic two-slot and existing bounded resource limits.
- The user directed Prep to preserve the lane pipeline while packaging a qualifying failure. Ready corrected commands and observed C prompts, inventory and map state carry into the next batch when they cannot finish in the current packet. A qualifying failure alone does not require replanning all six lanes. Setup misses remain misses, and no extra per-command lead grant is required.
- The Prep lead encountered repeated automatic turn failures reporting exactly: “This content was flagged for possible cybersecurity risk.” Root resumed the same lead and collected existing command handles without duplicating recordings or changing guardrails. These failed turns are separate from lane waits and Root's routine holds; no duration is inferred.
- Prep51 is the first immutable packet using the published saved-comparison provenance check. Saved verification run-Cm8wql checked 14 original C pairs, 26 first-capture logs, 155 immutable artifacts and one byte-identical independent replay without gameplay execution. Its menu-travel failure is distinct from B's pending unset-retravel dispatcher fix; the command, location-menu and registry inputs remain unchanged through accepted mounted-chat publication. Three strict matches stay outside membership and unfinished source routes continue in Prep52.

### 2026-10-15 — v87 delivery packaging and v88 evidence

- The v87 travel task depended on a missing doextcmd dispatch arm as well as dotravel's menu branch. A preserved its changes while B's retravel dispatcher reservation remained active. After B passed checkpoint and acceptance, Root committed a checked source/evaluation handoff and released that scope before publication; A then claimed the dispatcher and completed the caller wiring.
- Root first suggested an accepted handoff as A's delivery base without checking that the assignment base was its ancestor. A caught the submission guard and preserved the original branch while building a clean two-parent base and applying only its source/report patches. Report validation then caught publication SHA versus evaluation SHA provenance. A corrected the fields additively. A's file-port label also expanded two noncontiguous functions into 119 declarations; its corrected packet and queued central registration now describe a divergence fix. No source checks were repeated for metadata alone.
- Importing the v87 report raised a modify/delete conflict because its initial diagnosis was in the worker's base ancestry but absent from Main. Root retained the submitted report and subsequent corrections. Integrated source, tests and final report match the delivery. Checkpoint 38709114332 and acceptance passed without per-case regressions; v87 gained its two missing screens and cursors, with all 6390 RNG calls matching.
- A coordinator baseline-handoff launch was rejected while the preceding bounded queue command still held the full slot. Root waited for that process to exit, then retried the handoff. Transient ledger locks cleared on identical retries. Prep's independent work continued.
- User monitoring found repeated sandboxed lane recorder launches failing with flock EPERM. The lead relayed the existing escalated bounded-wrapper requirement into all six lane command templates and received six acknowledgements. A separate v88 comparison had been escalated but unbounded; lane 6 repeated only the unchanged JavaScript comparison under the required wrapper, preserving both raw logs. Its completed bounded C recording and independent replay were reused. Further automatic content-filter turn failures resumed the same lead without duplicate recordings or guardrail changes.
- Prep52 preserved 30 unique paired C input sequences, 196 saved logs and 320 immutable artifacts, with one byte-identical independent replay and one qualifying monster-to-hero collision failure. Nine strict matches remain excluded. The closest v64 route uses the same bare-torso predicate but moves the hero into the monster through a different callback. A local artifact-inventory file was regenerated after its earlier bytes were embedded in the packet; the lead preserved the newer file separately and restored the historical path from immutable bytes. Root checked that repair and reused all other saved verification results.
- User monitoring identified source feasibility and already-covered guards as search bottlenecks. Root relayed the existing preference for concrete omitted production callers, C-derived independent inputs and route feasibility checks. The lead reported source-only reassignment work that had not appeared as new probe events and is recording subsequent ownership when assigned. Ready C-observed corrections carry into Prep53 while the next omitted-caller designs proceed; no new capacity or routine Root hold was introduced.

### 2026-10-15 — v88 acceptance and v89 setup limits

- C wired the existing instapetrify caller in mhurtle_step. Checkpoint 38713966128 and acceptance passed without per-case regressions; v88 gained its last screen and cursor, matching all 68 boundaries and 2558 RNG calls. Publication 8440f6a1 and its dashboard deployment succeeded. Transient publication ledger locks cleared on retries of the same helper.
- One v89 defensive-wand investigation matched through dwarf pickup without reaching its intended ray. An extra C turn was launched before the stop-on-match message arrived. Root preserved both captures, excluded the matching-prefix investigation and deferred the intended caller without a qualifying-failure or replay claim from the extension.
- User monitoring found the fainted-pool target still extending pager corrections at attempt 13. Root enforced the existing setup-deferral rule; the lead collected its already-launched attempt 15 and deferred it. Root found the same continuation pattern in the steed route and directed deferral after terminal attempt 13. Both retain their actual state, missed targets and retry history across batch boundaries. New source-only assignments replace them; a new batch does not reset their attempts.
- A command labelled independent C replay actually invoked diff-fresh-worker and repeated JavaScript comparison. The lead caught this before submission, preserved run-bQi3jD as protocol rework and obtained the one missing actual record-session replay as bounded run-ofaaBk. Its separate output is byte-identical to the retained C recording; no JavaScript log was relabelled as C proof. Repeated automatic turn-filter failures resumed the same lead with existing process handles and evidence preserved.
- Prep53 retained one different-square float_down chain-relocation failure from 50 unique recorded input sequences and 51 output aliases. Saved verification checked 366 immutable artifacts, the actual recorder command and terminal receipt, and accepted-c475 comparison provenance without gameplay execution. A preserved version-6 failed-format recipe made Root's session normalizer return default inputs. Inspecting its actual segments established that they equal the corrected version-5 recipe and C capture; both byte histories and the initial verifier failure remain preserved. No valid version-6 recording is claimed.
- A temporary Main helper for the earlier v87 scope correction failed on an unescaped newline before mutation, then succeeded after correction. One Main read attempted to parse acceptance output before its retained process finished; waiting on that process supplied the completed output without relaunching acceptance. These are coordinator script and collection errors, separate from game evidence.

### 2026-10-16 — fresh execution and hosted evidence recovery

- Artifact storage failed at proxy CONNECT with HTTP 403, leaving successful
  hosted runs unreadable through artifact downloads. The approved Checks API
  transport in 6bf27a309 passed hosted run 38835906013; finalized output retained
  14 payload chunks and the importer verified all 93 original result files,
  including 89 complete synthetic evaluations, without artifact-host access.
  Historical missing ownership and delivery packets remain separate unresolved
  history; the fresh ledger records only newly observed execution and publication.
- The installed GitHub CLI rejects `gh api --slurp`, which the existing
  publication CI checker required. A temporary bounded-page adapter used the
  unchanged checker and pending-cache semantics. The scoped compatibility fix
  replaces that optional flag with explicit bounded API pages and retains
  malformed-response, identity, failure, lock and cache-preservation checks.
- The ledger initializer accepted the distinct run ID
  `loop-20261016-fresh-support`, but dashboard snapshot parsing accepted only a
  date-only ID. The scoped fix permits a bounded identifier suffix and preserves
  the date cutoff and public-field filtering. The original ledger is preserved;
  the user subsequently approved public dashboard deployment through normal
  accepted pushes to main, retaining the existing validation and publication gates.
- Worker 1's next claim overlapped the Work lead's atomic publication update
  and returned a ledger-lock error. The owner was identified, the supported
  update finished, and an unchanged retry found no ready task; no lock was removed.
- Snapshot structural-field filtering did not remove process references from
  three inherited public summaries. Report-only correction 647f046e removed
  those references and one generic process-reference phrase without deleting
  events or changing IDs, timestamps or outcomes; Dashboard run 38838343989
  deployed it successfully. Snapshot generation now sanitizes new and inherited
  public text so regeneration cannot restore those references. The focused
  regression preserves historical records and public GitHub result IDs.
- Each main publication also launched Score and Coverage, repeating tests and
  fixed-workload scoring and potentially occupying two runner slots. Vincent
  asked whether to disable these runs; Coordinator adopted manual-only reports
  after reviewing the evidence, following the sanitizer checkpoint boundary.
  Their push triggers and mandatory publication-checker
  expectations change together so absent manual reports cannot leave a
  publication pending. The first subsequent publication will check automatic
  Lint and Dashboard, absence of Score/Coverage push runs and pending-cache
  completion. No Checkpoint coverage is reduced; throughput remains unmeasured.

### 2026-10-16 — runnable handoffs and blocked evidence retention

- Final v90 publication `896c8764` was followed by queue refresh 1.748 seconds
  later; four pending independent plans were reassessed and live claims were
  unchanged. The saved publication timing records this interval. Earlier
  observed publication-related stale intervals were 10.045 and 40.806 seconds.
  This is one measured readiness transition, not a throughput comparison.
- Six handoffs after the ready buffer was replenished at 04:02 UTC took 5, 10,
  49, 7, 14 and 30 seconds. Earlier 133- and 190-second gaps began with no
  runnable assignment. A later unicorn block at 04:17:00.970 was followed by
  the next claim at 04:19:07.838, a 126.868-second gap despite four runnable
  tasks and no intervening base change. Separate time awaiting eligible work
  from time between eligibility and claim; these intervals do not measure CPU
  use. Existing continuation and wakeup instructions cover the latter case.
- Dull-blade result `90521656` froze a 174-byte verifier PASS message instead
  of its promised 52-file evidence envelope. Linked correction `6c3a614b`
  retained the original result and froze the existing 1,590,811-byte JSON
  envelope without gameplay reruns. Queue completion checks required check
  kinds and exits but does not validate the promised envelope contents.
- Lamp save/restore retained a recorder-environment failure, and unicorn
  gifting retained an incomplete final-pager comparison with an actual
  nonzero exit and no attributed gameplay defect. Their queue-block packets
  froze recovery metadata and pointers rather than full scratch evidence.
  Work lead separately preserved both original envelopes read-only by hash;
  neither is an accepted case. The [pending envelope proposal](proposals.md#freeze-declared-evidence-at-result-and-block-boundaries)
  addresses this retention step without turning failed checks into passes.

### 2026-10-16 — dashboard publication handoff follow-up

- Ten completed/block-to-next-claim handoffs after the 126.868-second outlier,
  through 04:32:35 UTC, took 5.491–13.594 seconds (median 9.581). Each began
  with fresh evidence and runnable work. The later wrapping-duplicate block
  reached its next claim in 8.864 seconds. This is a small observational
  sample, not a controlled throughput comparison or CPU-use measurement.
- Dashboard publication `fe81ebc2` was followed by queue refresh after 585 ms,
  compared with the earlier 1.748-second interval. Three pending plans were
  reassessed by 2.087 seconds after publication; live claims were unchanged.
  Evidence freshness and task eligibility are separate timings. Lint
  `38850873458` and Dashboard `38850873501` both succeeded. At 04:33:02 UTC,
  three workers held claims and only one assignment remained runnable;
  continuous replenishment remains useful under the existing instructions.
- Four new matching-result packets again retained verifier summaries rather
  than their full evidence: cursed taming `ef1da076` (325 bytes), confused
  charging `3734013b` (325), magic-lamp cancellation `9b7f04f6` (285), and
  cursed scare `c5435273` (201). Taming, charging and scare summaries name
  envelopes of 697,124, 491,096 and 2,643,512 bytes respectively; the lamp log lists
  PASS assertions only. Work lead was notified to preserve existing originals
  before scratch replacement, using shared immutable storage or evidence-only
  correction, without gameplay reruns. This recurrence supports the pending
  envelope proposal; the matching probes remain excluded from new manifests.
- The wrapping investigation found the exact admitted v52 source/history
  overlap before C or JavaScript execution. Work lead superseded it after
  producer confirmation. The tin result `e285af3e` explicitly excludes its
  post-comparison continuation from validated claims. Preserve these stopping
  decisions and their original evidence; neither warrants duplicate replay.

### 2026-10-17 — Toolbar checkpoint exposed a synthetic shutdown race and evidence-access friction

- Evidence: toolbar candidate `09767b78f`, hosted Checkpoint `38982567469` failed Tests—goal lifecycle + shard 1. Log-storage access was unavailable; the Checks annotation contained only exit 1. Work lead ran the exact shard diagnostically: 2,975 passed, one failed at the prompt recorder's crash-after-observer assertion. Preserve that failed run and local log; fixed and synthetic replay checks passed separately but did not make the failed checkpoint acceptable.
- Cause: the fake child emitted the observer frame and synchronously exited 7 while the recorder intentionally sent SIGTERM on observing completion. The signal could win, so the fixture sometimes produced an expected termination rather than the intended crash. This evidence established a fixture race, not a recorder defect.
- Correction: PA test-only `ed0a59de4` (integrated `21bb0ffca`) makes only this fake child ignore SIGTERM before emitting frames. Its immediate explicit exit 7 remains authoritative. Assertions now require process-failure, exit 7/no signal, all five journaled frames and observer decision, incomplete capture and one physical invocation/no replay. No sleeps, retries or production behavior changes. Focused 16/16 passed; integrated full Checkpoint `38983628108` passed. Main `21bb0ffca` Lint `38984125417` and Dashboard `38984124888` passed. Future hosted recurrence reduction is unmeasured.
- Separate bookkeeping friction: a standalone tooling activity event was rejected as unknown task. No fake assignment was added; actual Main ownership/lease remained intact. Existing task-bound activity schema does not represent arbitrary standalone tooling labels. One occurrence does not yet justify a schema/tooling change; use explicit coordinator/lease evidence and preserve the rejection.
- Follow-up: preserve exact failed-check logs through existing approved evidence channels when available. Do not rerun successful stages solely for bookkeeping. The targeted full checkpoint remains the acceptance gate.

### Parked preparation blocked fresh batch (2026-10-17)

- After toolbar publication `21bb0ffca`, supported Prep97 `assign` was rejected
  by `worker-state.mjs` ownership checks: exhausted
  `prep-v96-source-exploration-20261016` was "still pending (parked); resume it
  before a later batch". Actual Prep96 was parked from `working`, with zero
  submitted deliveries and no recorded processes. The rejected assign did not
  persist; its separate earlier case-directory scope rejection was corrected
  before this guard failure. Both observations remain historical.
- The guard prevented a fresh independent preparation unless Work lead resumed
  the exhausted task or misstated its completion. Coordinator explicitly
  requested a supported transition preserving the old status and evidence.
  `49babf797` / integrated `56e0217a5` adds the narrow explicit predecessor-list
  and reason path described in [decisions](decisions.md#2026-10-17--explicit-continuation-after-exhausted-parked-preparation).
  Working preparation, submitted predecessors, required corrections, exact
  batch identity and live-process/probe checks remain protected.
- Focused tests passed 32/32; actual-ledger projection was read-only. No live
  assignment, evidence mutation, source-owner release or budget reset was made
  by the Process analyst. First canonical transition and any wait reduction
  remain unmeasured; no CPU or discovery-yield benefit is claimed.

- Record-draft handoff also exposed a notification mistake: Work lead initially used `send_message` to request new work from an analyst whose turn had completed. That tool does not trigger a completed turn. Work lead corrected the wait with `followup_task` on the same handle; no replacement agent or repeated check was needed. Use `followup_task` for new work at completed-agent boundaries.

### 2026-10-17 — Version-gap consumer and command entry-point checks

- The first continuation assignment succeeded, but a read-only planner check still held the historical parked task. Narrow follow-up found contiguous-version checks in planning, local admission and hosted proof. The additional bridge was preserved as unvalidated, unpublished candidate 4b8c8d969. Its 89 focused imported-helper tests passed, while its first actual CLI invocation exited 13 with a top-level-await import cycle. No continuation receipt was written and no aggregate checkpoint ran. Future command changes need a real CLI regression covering entry-point initialization as well as imported helpers.
- Vincent then explicitly selected the simpler unsubmitted v96 path. No further bridge repair or gameplay run was made. Original v97 delivery d504e3f remains immutable and its wrapper is parked; original v96 attempts and base remain intact. Current intake reuses the exact saved evidence once under v96. The decision and pending outcomes are recorded in [decisions](decisions.md#2026-10-17-follow-up--use-the-unsubmitted-v96-batch-for-the-saved-case).
- The preceding tooling checkpoint monitor also encountered a transient GitHub HTTP 401. Work lead collected it and monitored the same run with one replacement, without restarting validation. The retained refresh observer still defers under the Main lease; its unavailable old tool handle and live OS process require a graceful restart from accepted code at the final boundary, preserving its saved journal.

### 2026-10-17 — Standing push authorization and worker environment recovery

- Automatic approval review separately rejected the exact preparation and
  admission candidate pushes, asking for repository-content and branch scope.
  Vincent explicitly approved each preserved push, then reaffirmed standing
  approval for normal pushes to this same project repository. Each retry used
  the same candidate and destination; neither denial was bypassed. The single
  canonical authorization section in AGENTS.md now states that scope, retaining
  validation, accepted-publication and no-force/no-delete requirements. Future
  approval-review behavior and time savings remain unmeasured.
- After the admitted v96 baseline entered the queue, the old Worker 1 agent
  could not execute because its selected environment was unavailable. It
  reported no claim or source work. A fresh worker using the documented model
  verified the same preserved worktree clean; Work lead updated the registered
  handle through the supported observation protocol before connection/claim.
  This was execution-environment recovery, not evidence of a failed assignment.
- The old refresh observer was later verified as a zombie. Work lead preserved
  its stale owner record and journal, removed only that stale owner file, and
  started one replacement observer from accepted code. It continues to defer
  under the Main lease; no discovery event or publication was fabricated.

### 2026-10-17 — Source-led one-task handoff

- The approved source-led experiment did not fit ordinary queue selection (implementation requires a mismatching session) or impure delivery evidence (matching recording/synthetic range). The one-task policy/tooling exception is explicit; no fake session, pure label or inactive reason is used. Prior version-gap tooling passed imported-helper tests but failed its actual CLI entry point, so this candidate exercises real spawned commands through received goal registration. All rejected fixture operations preserve ledger/branch/evidence bytes. See the linked decision above.
- XP dependency closure stopped after 105.939 seconds elapsed; its shared-engine risk was not reduced to a partial selector fix. The subsequent bounded alternative-selection window was 371 seconds elapsed, with independent Main review occurring within it. These are observation windows, not CPU or all-in effort; do not sum overlapping work as a throughput claim. Preserve setup/review/CI cost separately from the future worker trial.
- Separate source-support wording correction: immutable W2 result `3570095f` overstated a public `#wizgenesis` prohibition after reading “no injected state” as a debug-command ban. The worker acknowledged the error after freezing. Main's additive producer disposition preserves NOT_CLOSED for missing creation/placement/transfer proof, not a policy ban. Original packet unchanged; no runtime, ownership release, or schema/tool change follows this occurrence. Saved evidence: Main `.cache/defensive-undead-floor-callback-review/producer-disposition.json`.

- First real trial submission exposed a lead receipt-wrapper limit: capturing the growing ledger projection with spawnSync default buffering truncated the saved stdout after the supported event had persisted. The exact idempotent event was reread/retried with stdout streamed to a file; no duplicate state transition or gameplay check was created. Treat goal registration output as its documented text rather than JSON. This is local wrapper bookkeeping, not a reason to rerun passed checks or add a coordination layer.

## 2026-10-17 — Inventory-adjust pilot setup and error classification

- Vincent approved one bounded fast-check search pilot. The existing differential helper deletes temporary artifacts, while this experiment requires original inputs frozen before shrinking, complete C/JS outputs, physical invocation receipts and independent reproduction. A specific inventory-adjust runner reuses existing recorder/comparison/workspace helpers; it adds official locked fast-check 4.10.2 and exports one existing recorder DST helper without changing static recorder behavior. Implementation `6654324bc7fd3e51a38c49d5c4223dce5be98cbf`.
- Setup is a material experiment cost: retained 04:47:21–05:00:38.932 UTC records 797.932 seconds elapsed, not compute or active labor. Work began before the first retained clock, so full setup/all-in effort is unknown. Work lead review, hosted validation/publication, worker execution and result review must remain separate phases; no gameplay had occurred at handoff. This single pilot has no simultaneous current-method control and cannot establish comparative strategy speed or causal yield.
- Before hosted freeze, read-through found evaluator/JS subprocess errors labeled recorder-failure. Follow-up `a0bc4f39d6eb4747c9a3eef615e4041edc1ec39a` preserves distinct runner-error, with explicit assertions for both labels. Eight focused tests, targeted lint and diffcheck passed; no gameplay repair or successful aggregate validation repeated. Original handoff and supplemental `runner-label-followup.json` preserve both commits and logs.
- Earlier synthetic worker verification rejected a fake API missing per-step empty animation arrays (7 pass/1 fail); the fixture was corrected and the retained final check passed 8/8. This is harness-fixture evidence, not a gameplay failure. Actual calibration/setup failures, errors/timeouts, generated/unrun draws, shrink/replay attempts and distinct source-confirmed outcomes remain unmeasured pending the canonical worker run.

- Work lead publication review caught a necessary consumer omission before candidate freeze: standalone tooling allowed scripts/instructions but rejected the two root package manifests, blocking the approved official fast-check dependency even with a full checkpoint. Follow-up `ca81b996c4f58fee8edec38ddea58b5f2caff93c` allows exactly `package.json` and `package-lock.json` as committed regular non-executable files. No game/corpus/config-directory allowance was added. Deletion, executable/symlink modes, nested package paths and `.npmrc` remain rejected.
- The manifests remain execution inputs; this is not a bookkeeping or checkpoint-reuse exemption. Exact imported passing checkpoint, accepted ancestry, local/remote publication identity and unchanged post-checkpoint execution tree still apply. The existing real publication CLI test now includes the vetted pinned devDependency/lock; six focused publication tests and targeted lint/diffcheck passed, with explicit rejection of post-checkpoint manifest edits and existing game/corpus cases. No gameplay or ledger changes occurred.
- Expected benefit: unblock normal validated publication of tooling dependencies; tradeoff: dependency review/lock maintenance and full hosted validation remain part of experiment overhead. This is a path/mode allowance, not an automatic package-content approval; the actual manifest and lock diff must be reviewed. Follow-up publication/run benefit remains **unmeasured**. Separate setup observation and proof hashes are in private `publication-consumer-followup.json`; do not fold waiting wall time into active effort or attribute concurrent Prep98/W2 work to pilot cost.

### Finite pilot outcome (2026-10-17)

**Measured follow-up (2026-10-17), append to bounded inventory-adjust pilot decision.** Completed immutable result `ddc82759f60c57521166547599809378b05a1a2daaabad98861d6439c31dcdb3` binds envelope `76d9f1854a2ad6c910c668a668d9bf1fc5aa6617dc06f7b9534a55f798b565c4`. PA verified outer/envelope binding, unchanged original recipes, target/prefix/key/frame/process receipts and exact accepted `6167164f6` comparison bindings; WL verified all 378 payloads. Corrected calibration plus 16 draws all matched: 17 C/17 JS, 14 unique suffix inputs, 32 adjustments (17 Moving/12 Swapping/3 Collecting), 556 screens/cursors and 42,585 ordered RNG entries equal. Zero new mismatch candidates, qualifying sessions, source-confirmed causes or admissions; no shrink/reproduction exercised. Stop this completed finite negative; no broader correctness or comparative strategy claim.

**Friction/cost.** First calibration failed from install-root/HACKDIR confusion (141 ms, 1 C/0 JS); explicit one-time corrected invocation preserved the same 16 samples. Corrected loop 16.354 seconds; aggregate 18 C/17 JS. First start→final end was 482.927 seconds, within ten minutes, although original launch/single-invocation restrictions were explicitly relaxed. No third run. Original duplicate wrapper required transport-only normalization, not gameplay repair. Potential future task-preparation improvement: verify actual HACKDIR/sentinel before launch; no new implementation adopted here.

Observed elapsed phases: initial setup 797.932 seconds; consumer repair 69.130; checkpoint creation→saved summary 305.601; tooling publication→freshness release 838.438; worker claim→first start 221.826; failed-loop end→corrected start 466.432. These overlap/include waits, shared publication and other accepted work; never sum as labor/compute. First setup clock→final end is a 4,398.878-second envelope, not full all-in effort. Active effort, complete setup and final artifact/review effort remain unknown. Detailed phase/proof receipts are PA `.cache/inventory-adjust-fuzz/actual-{phase-measurements,saved-outcome-review}.json`; no gameplay or comparator was rerun for this review. No token-saving claim or automatic expansion.

## 2026-10-17 — Status recaps and stale worker snapshots

- At the 05:42–05:45 UTC audit, dashboard snapshot 05:20:02 still showed Worker 3 idle and v98 blocked. Canonical connection/claim events at 05:33:50/05:33:58 and subsequent saved checks showed active v98 execution. Repeated multi-role status recaps and full state reads added coordination work; token use and active effort were unavailable. No worker inactivity or account-quota cause was inferred.
- Vincent approved a bounded simplification: reuse existing evidence-linked phase/handoff receipts and one owned validation watch; other roles wait for a notification/material change or continue independent work. Show exact capture time/age and recorded-status limits beside queue/activity. Existing required independent reviews and validation gates remain intact.

## 2026-10-17 — Status lifecycle correction and evidence retention

**Friction / measured follow-up.** Preserve the initial `995e` finalizer, which cleaned status banks during suspended `in_really_done`; `932ee` added the guard and retention regression. A manual wizard diagnostic bypassed production `runSegment`/official overlay and retained hashes/booleans without raw first differences, leaving its mismatch uninterpretable. One approved official `932ee` replay then passed 10/10 screens/cursors and 2,691 ordered RNG entries with complete invocation, pin/overlay and streams. This corrects evidence quality; it does not retrospectively validate the manual diagnostic.

One initial official two-menu batch exited 0 but omitted `outputDir`, losing streams/metrics: its parity remains **unknown**. One approved corrective batch retained durable receipts and passed 59/59 with 2,401 RNG entries and 55/55 with 2,560. Record two batch invocations separately; the first exit code alone establishes neither per-case success nor physical subprocess counts.

Worker 1 transparently packaged PA's authentic canonical four-frame capture, including its original `moves: ''` limitation. Its single official `932ee` replay passed 4/4 with 3,046 RNG entries. Preserve the pre-runtime cache `ENOENT` and post-run offline parser repair; neither justifies claiming another gameplay invocation. Verified immutable result `9a79784d…` retains the proof. Earlier cache paths tracked in a worker commit disappeared on queue branch switch; shared immutable typed packets preserved the exact bytes for extraction/import. Cite packet identity and embedded file hashes rather than a moving checkout cache path.

The proposed new-C phase stopped **before launch** because Worker 2's expected private install was absent: a setup prerequisite, not an unported-source blocker. The Healer input exists. Worker 1's separately approved ≤6-minute cache-only preflight reuses its proven recorder and copies PA's observer; zero new C invocations were reported at this handoff. Do not infer a successful C run, source completion or blanket public-debug restriction.

**Decision / limits.** These were explicitly approved bounded corrections, not a new harness or gate change. Retain one manual diagnostic and its limits, one corrected official wizard replay, two menu-batch invocations, one official PA-capture replay, and the zero-launch C setup stop as distinct phases. Keep the original artifacts, corrections and approvals linked. Complete phase elapsed/active costs remain unknown unless actual receipts establish them; no comparative-efficiency, CPU, token-saving, whole-source certification or challenge-admission claim follows. Final W2 acceptance still requires the ordinary source/evidence review and full regression gate. No additional tooling project, tests or runtime is proposed by this record.


**Completed plain-TIME follow-up.** The cache-only preparation exceeded its six-minute cap by approximately 25 seconds; its three authorized transport corrections did not change gameplay input. W1 then ran exactly one observed C capture, one unchanged canonical C replay and one official JavaScript comparison at `932ee8739…`, finishing at 07:00:09.512Z within the original 07:04:28.043Z runtime deadline. Immutable result `eb68c8c8…` and envelope `caa9af24…` preserve all 41 payloads. Both C captures have identical four-step output; JavaScript matched 4/4 screens and cursors and 3,046 ordered RNG entries. At changed moves 2–4, the original observer trace contains `BL_TIME=16` and `BL_FLUSH=-1` only, with TIME values 2, 3 and 4 and no full `bot()` call. The clear-helper invocation remains source/input inference rather than a directly instrumented observation.

The initial wrong-field and startup-only gate assessments remain immutable; offline trace review corrected their classification without recapturing gameplay. One typed packet omitted “timebot” from its task identity and was correctly rejected before queue completion; a metadata-only correction retained that rejected envelope. Final focused/lint raw stdout was unavailable, so delivery explicitly cites the contemporaneous phase-result summary and actual commands as summarized receipts rather than claiming recovered raw logs. The exact combined hosted checkpoint independently runs tests and lint before acceptance. No additional runtime, source-certification claim or gate waiver follows from these transport repairs.


**First hosted gate.** Candidate `75dce4334…` failed Checkpoint `39012966823` in test shards 3 and 4; it was not accepted. The initial sole `gh run watch` exited on an annotations HTTP 401, while a direct status read confirmed that the same run remained active. One bounded status-only watcher replaced the exited process, without rerunning validation. Standard retrieval of both failed-job logs returned Forbidden, so Work lead reproduced only those two failed shards locally in sequence. Those local runs exposed three status-style assertion failures and fourteen menu redraw exceptions from missing hero state. They also exposed separate local setup noise (missing `clang` on PATH and absent `fast-check` in this checkout); neither is attributed to the hosted failures or the implementation. The original failed run, rejected delivery and local diagnostic logs remain preserved. Supported feedback generated one linked canonical rework assignment; the full exact-commit hosted gate remains required after correction. No failed summary, raw log or success verdict was manufactured.


**Scoped first correction.** The source review tied the exception to the existing `bot()` pre-player/status-updates/suppressed-output guards and to a non-gameplay menu repair. It also distinguished direct test-fixture rule replacement from C's option reassessment lifecycle. Correction `94b0f25ae…` preserves the style assertions, adds pre-player and multi-page dismissal regressions, and passed all 271 tests in the three affected files plus lint, with raw output retained. The original 22-unit scope stays intact; only the existing menu caller adapter and two existing test paths were added after an owner check. A basename-format reservation rejection made no ledger change; one premature caller hunk was immediately reverted before the approved scope event and is disclosed in the phase receipt. No C capture or differential was repeated. Normal combined hosted revalidation and acceptance remain pending at this record.

### 2026-10-17 — Source qualification gaps and stale recovery ownership

- Saved canonical ledger evidence from 17:00:00 through 18:02:00 UTC covers
  17 newly enqueued assignments, 16 worker results, and 15 closed
  result-to-next-claim intervals. Enqueue-to-claim elapsed was 9.349–25.635
  seconds, median 14.956 seconds. The closed result-to-next-claim intervals
  were 2m16.401s–14m57.696s, median 4m51.862s. Every result left zero eligible
  ready assignments immediately afterward. Worker 1's unicorn result at
  17:58:17.437 left an open 3m42.563s interval at the audit cutoff. The
  observable gap is qualification/review/replenishment before enqueueing;
  it does not establish avoidable review time or slow ready-task dispatch.
- The denominator is three worker lanes over 62 minutes, or 186 lane
  minutes: 73.295 were claimed and 112.705 unclaimed. These are ownership
  intervals, not active-execution or CPU measurements. Review, evidence
  packaging, other lead work and interrupted recovery can occupy unclaimed
  time; lead effort has no complete denominator. Ready work shared among
  several free lanes must not be counted as several independent opportunities.
- At 18:02 UTC, the canonical next-work projection still registered Worker 1
  to the former Work lead's handle and displayed an old Castle idle reason,
  despite the newer completed unicorn result. The live agent tree had no
  Worker 1 and contained a stale pending Challenge lead recovery handle
  alongside the live continuation. The Coordinator confirmed the pending
  Challenge lead handle was stale and asked Work lead to reconcile Worker 1
  through the supported ownership protocol before waking it. No claim was
  changed by this audit; registration staleness does not prove a worker failed
  or lost an assignment.
- Supporting private receipt: Process analyst worktree
  `.cache/process-monitoring-20261017/audit-1700-1802.json`, including the
  canonical ledger byte digest, event count, task timestamps, original ready
  projections and right-censored interval. Action: reconcile ownership at
  recovery, then use the already-owned conditional setup verdicts or a
  distinct qualified candidate when available. Preserve bounded negative
  outcomes and necessary independent review; no filler task, repeated prior
  audit, gameplay rerun or new coordination tooling is justified by this sample.
  Subsequent recovery and replenishment improvement remains unmeasured.

- First recovery follow-up: the unavailable handle was cleared at 18:02:58.321,
  its replacement observed at 18:07:10.456, connected at 18:07:38.831, and
  claimed at 18:07:45.124 UTC: 4m46.803s from removal to claim. Most of that
  elapsed window preceded new qualification. The lamp task itself was eligible
  from 18:06:16.148, waiting 88.976 seconds while Worker 2 was registered idle
  with no owned processes. Work lead confirmed there was no context or
  ownership reason to bind it to Worker 1; targeting the recovering lane caused
  avoidable ready-work delay. Adopt the existing shared-priority practice of
  waking an available eligible worker while another reconnects. Preserve the
  current claims; no new tooling or check is needed. Receipt:
  `.cache/process-monitoring-20261017/recovery-followup-1808.json`. Reduction
  in later ready-work delay remains unmeasured.

### 2026-10-17 — Old turn reason mistaken for lava execution provenance

- Lava task `support-lava-trapped-ring-complete-conditional-c-only-20261017`
  claimed at 18:28:21.468 UTC and blocked at 18:30:43.518 (2m22.050s).
  Recovery packet `8791d679154d76512bb5cfdcb72970c0247fbe9aa53cca7cb9dbd74b3cce097a`,
  commit `02de3a8b7867a9a15d1749276c4d041dad87f2a1`, preserves the missing
  actual launcher/capture evidence and UNKNOWN physical setup count. Its typed
  envelope contains four provenance/assignment/plan/review files, not an
  execution request, result, stdout/stderr or capture. No target or retry is
  justified; retain the original cap and immutable block.
- The apparent canonical statement that one setup capture exited zero belongs
  to the earlier mimic task. Its sole originating event is
  `worker2-mimic-setup-recording-collected-20261017T171200`, 17:12:12.854 UTC,
  during `support-mimic-genocide-fixed-history-setup-c-only-20261017`. It
  survived seven later Worker 2 claims and was 76m8.614s old at the lava claim.
  No new Worker 2 turn/invocation event appears in the lava claim-to-block
  interval. This establishes status contamination; it does not establish
  whether a lava process ran or why actual invocation evidence is unavailable.
- Cause: `assignment-queue.mjs` claim and finish transitions change assignment
  and `turnAt` without clearing `worker.reason`; the block transition also
  leaves that text. `worker-state.mjs` next-work output then displays the old
  reason beside the new assignment. A read-only actual-ledger prefix reproduces
  exactly that association. The prior fresh timestamp could misleadingly age
  the old text. Task prose already required actual request/outcome receipts
  before C; adding more launcher prose would not address this attribution bug.
- Work lead adopted a narrow projection fix: clear obsolete reason provenance
  at queue claim/result/block boundaries, stamp an explicit turn reason with
  its original time/current task, and expose that provenance in next-work
  output. Retain historical events and execution/acceptance gates. Until
  integrated, trace any status statement to its originating event/task and
  demand actual receipts for execution claims. Physical lava count remains
  UNKNOWN; no cap reset, retry, new gameplay or historical packet rewrite.
- Supporting private receipt: Process analyst
  `.cache/lava-provenance-triage-20261017/observation.json`, including exact
  ledger/packet/source hashes, the original reason event, seven claims and
  before-block projection. Work lead owns implementation, focused regression
  checks and normal hosted validation/publication. Future recurrence reduction
  remains unmeasured. The Process analyst did not modify source/tests or claims
  or invoke C/JavaScript gameplay.

### 2026-10-17 — Captured session steps classified as input-only

- Iron-shoes source result at 19:00:08.806 UTC labels selected v8/v56
  `.session.json` files as input-only and says their original screen receipts
  are absent. Its own frozen envelope `68bb16dfb6258103b1f4ffc8a069f976df69c5fdb64d1e076fccd44845afb8fd`
  contains `segments[].moves` and `segments[].steps[].screen/cursor/rng`:
  both v8 files have 15 complete recorded steps; v56 action2/action3 have
  253/255. All 538 steps contain nonempty screens, cursors and RNG arrays.
  The missing-screen statement is therefore a data-classification error;
  it does not establish exact target overlap or close any prior budget.
- The earlier [status-lifecycle correction](#2026-10-17--status-lifecycle-correction-and-evidence-retention)
  also needed offline correction of wrong-field/startup-only assessments.
  Recurrence warrants a reading practice: inspect actual keys and selected
  step fields before declaring a named original missing or input-only; do not
  infer shape from its filename. The exact parser mistake here is unknown.
  Producers can append a correction using retained bytes while preserving
  the original result. No C, new claim, cap reset, broad archive survey,
  source/test change or new evidence tool is needed for this finding.
- PA saved schema-only receipt:
  `.cache/session-schema-triage-20261017/iron-shoes-observation.json` records
  exact file hashes/counts and the conflicting frozen labels. Work lead and
  Challenge lead own offline source/budget disposition. No independent budget,
  runtime parity or eligibility verdict is claimed; later reduction in reading
  rework remains unmeasured.

### 2026-10-17 — Ready task waited across lead context recovery

- EARTH conditional C-only task was enqueued at 19:13:54.061 UTC and claimed
  by Worker 2 at 19:17:01.541: 3m7.480s ready wait. Work lead confirmed its
  own context recovery occurred before the `followup_task` wakeup; no recorder
  or other execution prerequisite blocked the claim. At 19:16:43, saved queue
  output showed the task ready, no claims/processes/blockers, and live Worker
  2 completed on the previous AP source task.
- This differs from the earlier [handle-recovery wait](#2026-10-17--source-qualification-gaps-and-stale-recovery-ownership):
  EARTH's frozen launcher/context required Worker 2, whose handle already
  existed. Waking a different lane would not execute that contract unchanged.
  Complete the supported wakeup immediately after a successful enqueue,
  before unrelated lead/context work; `send_message` alone cannot start a
  completed turn. This is an existing-policy handoff correction, not a new
  queue/tooling proposal. Keep original claim time/cap and all physical limits.
  Future wait reduction remains unmeasured; no CPU or worker-delay claim.

### 2026-10-17 — Successful physical phases awaiting interrupted receipt closure

- At the 19:35:29.046 UTC recovery observation, EARTH task
  `support-dwarf-earthsense-fixed-east-complete-conditional-c-only-20261017`
  remained canonically claimed from 19:17:01.541, with no result or block.
  Its original total deadline was 19:27:01.541. Main's saved 19:20:58.855
  review already accepted the C witness and exact unchanged replay, exhausting
  the one setup, one target and one replay allowances. All three retained
  phase results exit zero without timeout; offline hashes and byte counts
  match their referenced request, full stdout/stderr and capture files.
  This observation establishes available physical evidence and missing
  terminal transport, without certifying source novelty or batch eligibility.
- The Main review preceded the deadline by 6m2.686s. Review to this observation
  is an open, right-censored 14m30.191s interval; the deadline was exceeded by
  8m27.505s. Worker 2 still points at its original assignment base, and the
  live recovery tree lists no worker handles. The Coordinator reports the
  old handles vanished near 19:33. Interruption onset, packaging progress and
  the cause of missing receipt remain unknown. These overlapping intervals
  concern one task and are not additive CPU, active effort or proven avoidable
  wait measurements; the lead-effort denominator is unavailable.
- Work lead owns preservation and supported terminal receipt recovery. Reuse
  retained evidence with the original claim/clock, disclose packaging after
  the cap, and preserve the physical phase exhaustion. This is a narrow
  recovery action under existing policy, not authorization for more C,
  JavaScript comparison, a new claim or reset deadline. The Process analyst
  changed no claim, ran no gameplay or validator, and repeated no successful
  validation. Closure and later handoff improvement remain unmeasured.
- Private supporting receipt:
  `.cache/process-monitoring-20261017/earth-interruption-receipt-gap-1936.json`
  records ledger digest/event count, task events, exact review and phase
  receipt hashes, retained file inventory, branch/base and the observation
  cutoff. This is distinct from the earlier ready-task wakeup delay: the
  current gap begins after saved successful physical evidence and review.

- Recovery follow-up: Work lead froze terminal `deferred` result
  `cff4926a39dc9043bdde0535333cd1fc5ebf128ff0b9c061a7658485b2720d1e`
  at 19:35:31.889 UTC. Its 840,422-byte immutable packet retains a
  836,904-byte, 30-file envelope and explicitly records the original deadline
  miss, successful physical witness, exhausted phases and no additional C/JS.
  Review-to-result closed at 14m33.034s; result was 8m30.348s after the cap.
  The supported next-work projection then shows zero ready, claimed or blocked
  assignments and three workers needing work. This closes the interrupted
  handoff; it does not measure reduced future delay or establish C/JS parity.

### 2026-10-17 — Support completions could not refresh exploration activity

- The retained dashboard snapshot is captured at 15:12:35.496 UTC. The
  canonical ledger contains 58 later closed, claimed Worker 1–3 exploration
  assignments through 19:35:31.889, all produced by Main with support purpose;
  the last closure is 4h22m56.393s beyond the displayed capture. These include
  source-only support and bounded physical evidence, not 58 independent
  discoveries. Activity, effort, CPU and discovery yield are separate measures.
- Accepted `snapshot-publication.mjs` hashes only closed independent discovery
  records. Main support closures therefore cannot create a pending refresh
  watermark even after ordinary ownership/CI deferrals clear. This is an
  eligibility limitation of the existing coalescer; the sample does not assign
  all observed lag to it because Main leases and other deferrals also occur.
- The Coordinator approved Work lead's narrow expansion: add a separate
  watermark of sanitized, closed, claimed Worker 1–3 exploration completion/
  block activity. Retain the independent discovery denominator, 15-minute
  coalescing, privacy, no-change suppression, Main ownership/readiness/CI gates,
  strict snapshot-only proof and original checkpoint identity. Claims, turns,
  capture timestamps and publisher activity alone still create no refresh.
  See the [adopted decision](decisions.md#2026-10-17--refresh-on-closed-worker-exploration-activity).
  First natural refresh and elapsed freshness benefit remain unmeasured.
- PA read-only receipt:
  `.cache/process-monitoring-20261017/dashboard-freshness-source-support-1939.json`
  retains snapshot/ledger hashes, the 58 closure identities and original
  accepted watermark source. No refresh, publication, gameplay or validation
  was rerun for this observation; Work lead owns implementation and checks.

### 2026-10-18 — Rejected predecessor remains unread after accepted correction

- Recovery next-work output still lists splitbill predecessor `2d20443f` as unread: it lacks `receivedAt`/`acceptedAt`, but feedback was recorded at 07:48:14.298 UTC and its corrected successor `70abdb10` was received at 07:52:40.467, accepted at 08:02:59.386 and published in `7f025f44`. Work lead's saved `.cache/resume-1439-status.json` preserves both revisions. No receipt or integration was repeated.
- `scripts/worker-state.mjs` `nextActions()` filters unread solely by missing receipt/acceptance. `pendingMainWork()` correctly follows each task's latest revision and accepted task status, so this is stale notification projection, not outstanding delivery or validation work. Source search found only tests consuming the `unread` field directly; this observation establishes human recovery ambiguity, not an automated gate delay.
- Candidate change: omit already-reviewed/replaced revisions from unread while retaining immutable feedback/history and current correction visibility. Scope and checks belong to Work lead selection. No task, claim or historical receipt was changed. Avoided rework and later recurrence reduction remain unmeasured.

### 2026-10-18 — Fixture export audit checked the repository instead of the final import path

- Fountain qualification `9287095c` claimed 14:58:03.304 and completed 14:59:43.310 UTC after its one original-code invocation failed module resolution. Frozen fixture `61f9d7e4` lived at `.cache/fountain-fixed-input-target-qualification-20261018/fountain.test.mjs` but retained `../js/const.js`, resolving to absent `.cache/js/const.js`. No test body, constructor, fountain action, target, RNG or TTY was reached. Original attempts remain spent; this is not source refutation.
- The retained `preflight.mjs` did run and report 97 named imports resolved. Its regex discarded the literal `../` and read `js/...` from repository cwd, so it checked intended root exports instead of the final fixture's actual ESM targets. Existing `new URL('../nethack-c/...', import.meta.url)` source reads have the same relocation problem. Source-pin/export checks alone do not establish final-path resolution. The static-audit prose includes a retrospective explanation despite its frozen-before heading; use the retained check implementation, final bytes and command receipt for the actual limit.
- Earlier melt `3e1693e3` also spent an invocation on a relative import before startup; prior fountain `d6de7bf8` unbound names and `22c357bb` rejected flags were different binding/check failures. Here an audit was ineffective, rather than demonstrated omitted. Within the existing fixture audit, resolve literal imports and relative file URLs against the final fixture path, read those exact files and check their bindings before freezing. Do not substitute a guessed repository path, copied list or syntax-only verdict. This needs no additional worker phase, game import, gate, pipeline or historical retry. Work lead clarified the active melt task accordingly. Future recurrence reduction remains unmeasured.


### 2026-10-18 — Noncontiguous units encoded as a primary range

- Limbo delivery `a93a` represented its two reviewed units as
  `context.functions=['losedogs','migrate_to_level']`. Delivery validation reads
  those entries individually, but `goal-log.mjs:790` interprets first/last as
  primary C range endpoints, adding intervening functions; sourceParity
  registration then correctly rejected the expanded scope.
- Work lead selected a linked metadata-only revision using existing support:
  `functions=['losedogs']` and
  `requiredFunctions=[{sourceFile:'dog.c',name:'migrate_to_level'}]`.
  Preserve the original delivery and focused/lint bytes; no production edit,
  source expansion, bypass or repeated game tests. Linked revision `027a`
  progressed to hosted acceptance of candidate `43bb` at 17:09:52.836 UTC.
  This is metadata friction, not failed runtime behavior evidence.

### 2026-10-18 — State observers disagreed with their owners

- Terminal qualifier `7421` read `state.u.invent`, while `invent.js:3032`
  owns `state.invent`; actual `uhave.amulet=1` did not establish absent inventory.
  Limbo's first postdraft test likewise read `after.gridOwns` instead of
  `after.actor.gridOwns`; initial meaningful original red and the later
  observer correction/final identical-byte red–green chronology remain distinct.
- Outside-polyshock qualifier `97aea` stopped because its guard treated the
  length of `[0,0,0,0,0]` as shop membership. Production checks the first value
  (`shk.js:2461,3220`). Raw capture retains shop room 3, bounds x=3..5/y=7..10,
  owner79, hero(67,4), `urooms[0]=12`, and zero shops. Main/Challenge review
  corrected the original prose's inaccurate claim that this membership was
  uncaptured. No wand, APPLE or callback ran; the spent miss is unchanged.
- Existing state/provider audit should trace guards and copied observers to
  actual owners/accessors and representations. Import/export validation and
  `no-undef` do not establish those facts. No new rule, tooling, gate, pipeline
  or physical allowance is proposed; follow-up selection remains Main-owned.

- Follow-up: metadata-only linked revision `027a36b5` became ready at
  16:59:48.369 UTC, received at 17:00:29.471, and an integration group began
  at 17:01:10.546. Read-only `git diff` from original `a93a879a` to `027a36b5`
  shows no change in `js/dog.js` or `scripts/dog-migrate.test.mjs`;
  context/check references and a correction receipt changed, while original
  process-registration logs remain in the original immutable revision.
  Candidate `43bbcb33` validated at 17:09:07.422 and was accepted at
  17:09:52.836 UTC. Publication remains separate; no source-completion
  or public-parity certification follows.

- Subsequent separately selected qualifier `466b63dd` passed membership/setup,
  then its direct default `bhito` call drew non-shudder and failed before
  replacement allocation on an incomplete RNG provider. Bounded source inquiry
  `ce0b59e9` (17:08:00.050 UTC) found normal production callers supply the full
  canonical RNG bundle. This corrects PA's initial adapter-gap classification:
  the observed failure is a fixture/caller-contract omission, not established
  normal production failure. Preserve both packets; no default widening/code,
  retry or gameplay-history gate is proposed.


### 2026-10-18 — Reused stale fixture restored a known rejected guard

- New poly-replacement qualification `0e9b3502` completed at 17:16:45.457
  UTC with a printed callback count of zero. Its command receipt records no
  stdout redirection and a truncated interface response; exact terminal
  stop/error and full state are unavailable. Preserve that uncertainty and
  the spent invocation; no runtime guard, target or source refutation follows.
- Static comparison of immutable envelopes identifies a concrete recurrence:
  the new retained fixture hash `426b1026882eb0eb0fdf17e7ffd4f56c94a560aa25789703139360af81bcb448`
  is the original `97aea` 16,706-byte script. The corrected `466b` fixture is
  instead `ee2927a82ade1d47921dcfee78cb1b5da901a5aa6786269a88078f9b0e478aaa`.
  New final hash `e1180276daa1450b49318937505f7a490a19ccdf2bde772e976af02313a413bb`
  again rejects nonzero `ushops.length` at line 200, while corrected `466b`
  uses `activeShopRooms()`. Known rejected source was therefore reintroduced,
  even though missing capture prevents identifying the actual stopping guard.
- Existing reuse/provenance practice should bind the selected predecessor
  digest and exact fixture path/hash, preserving all reviewed corrections.
  Existing full-capture instructions require retaining stdout/stderr files
  through the frozen command, not relying on interface output. No new prose,
  tooling, gate, pipeline or physical allowance is proposed; further work
  remains Main-selected. How the worker chose the stale copy is unverified.


### 2026-10-18 — Friction notes were added after the tested publication boundary

- Work lead reports the first limbo publication refused newly appended
  `.agents/friction.md`. Existing `task-handoff.mjs:90` permits only closure
  reports in a dirty publication worktree; `checkpoint-reuse.mjs:9` lists five
  bookkeeping files and does not include friction notes. This is document
  placement outside the existing reuse contract, not a gameplay regression.
- Work lead preserved its additions in Main
  `.cache/resume-1439/friction-pending-next-checkpoint.md`, restored the exact
  committed friction file, and retried publication. Carry the isolated notes
  into the next candidate BEFORE its full checkpoint. No allowlist change,
  gate weakening or gameplay rerun is needed. Retry/publication outcome is
  pending observation; exact first-refusal time was not separately frozen here.

- Retry outcome: the ledger records limbo publication `2f856577` at
  17:16:57.215 UTC. Normal CI is a separate follow-up, not independently
  rerun or certified by PA. Pending notes stay for the next full checkpoint.


### 2026-10-18 — Boolean assertion rejected a source numeric flag

- Wizard repair task blocked at 17:25:19.917 UTC after its first regression
  setup assertion compared actual `state.u.uhave.amulet === 0` with expected
  boolean `false`. No Wizard constructor, `keepdogs`, meaningful target red,
  production edit or retry occurred. Recovery commit `1e076eec` preserves
  frozen test and raw receipt; prior positive qualification `e6fee` is separate.
- Production `u_init.js:171` builds `uhave` with `zeroRecord`; line 84 fills
  every field with numeric zero. `invent.js:3196` also clears the Amulet flag
  to zero. This is an observer/type mismatch, not a failed game precondition.
  It joins the existing wrong state-owner, fixed-array membership and nested
  observer-path misses; import/name checks do not establish state types.
- Existing state audit should preserve the source-shaped numeric assertion
  (strict zero for this known initialized field) in any separately selected
  continuation. No new rule, helper, gate, pipeline or allowance is proposed;
  Main owns further selection and original stop/caps remain preserved. Record
  this at a future unfrozen candidate boundary, not after an exact checkpoint.

- Full-diff review by Main/Challenge subsequently found additional unreached
  test defects: `getRngLog()` was retained by mutable reference rather than
  copied; the rendered-More handler lacked the requested 16-response count/cap;
  full TTY equality would forbid the source's legitimate removal redraw;
  the preexisting marker was not asserted false; and after-`finally` handler
  restoration equality was missing. Numeric zero remained the actual first
  observed miss. Do not claim those later assertions ran or that fixing only
  the first mismatch validates the whole regression. Existing whole-fixture
  state/provider/observer review applies; explicit supported unblock retains
  recovery `1e076eec`, original history, frozen sourceParity pins/base/scope
  and spent stop. No new tooling or gate was introduced.


### 2026-10-18 — Repeated fixture predicate and capture failures

- Saddle47a71be9 stopped before mount because a normal Knight role form335 was compared with generic PM_HUMAN260. The prior melt source receipt21c55c11 already identified the source Upolyd predicate (u.umonnum versus u.umonster). Imports resolved; this was a state predicate error. Its separately selected same-input continuation62f775a9 introduced Set.includes in both a pre-action observer and catch snapshot. The catch masked the original exception, leaving the actual reached stage unknown. Preserve both spent invocations; no source refutation or automatic retry follows.
- Dig a0b6 retained a literal target-specific original red log and unchanged-test green, but fixed receipt filenames allowed green to overwrite the full original red state/RNG JSON. Those bytes remain unavailable; their hashes and compact summaries are not raw proof. Metadata-only624b preserves the existing logs/freeze/full green bytes without rerunning or reconstructing. Its noncontiguous context also needed the already documented primary/requiredFunctions representation.
- Existing final-script state-owner, catch/finally and evidence-preservation requirements apply. No new helper, rule, pipeline or gate is proposed; preventive benefit remains unmeasured.


## 2026-10-18 — constant bindings and post-callback evidence

Repeated terminal ESM misses imported object constants from `const.js`:
`AMULET_OF_YENDOR` (67a4308f), `BOULDER` (6f1939bc and 86e80909), and
`APPLE` (1445f752). These constants belong to `objects.js`. The new impact
freeze deferred its import audit to the module body, which ESM linking never
entered; its provenance admits only syntax/string checks completed. Boulder
86e likewise retained pins/hashes without the required export audit. Preserve
each spent invocation; source hashes and `node --check` do not prove exports.

Figurine e4eee originally reported captureCount0 as no callback execution.
The immutable fixture instead awaits `bhito` at129 before its post-callback
Set/array observer throws at139 while evaluating `captures.push` arguments.
Inner catch assignment and outer `??=` plus the raw error locate this after
normal callback return. Final marker presence survives; numeric before/after
projections do not. Main/CL/worker corrected the prose additively; no new
qualification retry was selected from the false pretarget premise.

Dig a0b6 disclosed full original-red receipts overwritten by green at fixed
paths; raw red stdout/freeze/summary/hashes survived, missing bytes stayed
unavailable. Main now reports figurine raw/projections preserved per run:
earlier046a meaningful red/green preceded import-only final cleanup; the final
same-byte original0!==80/repair-green pair ran after first code, with lint0.
Retain that chronology. Existing audit/capture requirements apply; no new rule,
helper, gate, or measured prevention benefit is claimed.

### 2026-10-18 — Stale unread predecessor correction prepared

Splitbill `2d20443f` lacked a receipt after feedback and accepted successor
`70abdb10`; the unread projection still advertised it while the current-delivery
backlog was empty. The isolated latest-revision/no-feedback filter preserves
current corrections and immutable history. Two meaningful original failures and
34/34 focused green support it. Main applied the reviewed correction as `0c86c723d`; a normal full checkpoint
remains pending; the read-only four-to-zero stale-row projection is not a measured
time saving or evidence of an automated gate delay.

### 2026-10-18 — Boulder regression observer and intermediate log loss

The genuine pre-code regression reached the unpaid boulder accounting target.
Its first repaired run passed the target assertions then compared `{x,y}` with
`{x,y,ushops,urooms}`. Main approved only the coordinate projection correction
within the original budget. Final identical-byte original-red/repaired-green
pairing follows the first draft; the initial genuine red remains separate.
The first observer-failure raw output was overwritten by a reused log path.
Its unique state receipt survives; transcript reconstruction is not original
raw output. No replay was requested to recreate lost bytes. The unchanged
fixture dependency must be committed for clean hosted checkout.

## 2026-10-18 — Observer ownership and retained chronology

Getcad's `acd418` meaningful original red preceded code. The first repaired
pursuit was correct, but its observer read empty `messages[]` while the
actual reproach was retained in `topMessage`. Main allowed only that observer
correction within the original 15-minute scope. Final `06a2` same-byte red/green
ran after the draft; all prior raw captures were retained without overwrites.

Cube `02ac` rejected raw undefined `multi` and skipped restoring saved null.
Cube `16f7` records effective 0, marker-before=false and restoration=true;
passive ran, but natural `rn2(3)=0` skipped freezing. No extra call was selected.
Existing capture contracts apply; no new rule, helper, gate, or causal benefit claim.

## 2026-10-18 — Source-parity assignment schema preparation

Main's initial glob implementation enqueue drafts were rejected before any
queue event or claim while aligning allowed/test/caller pins and exact source
unit reservations. The final packet uses an existing pinned test file; the
uncreated test path could not supply a source pin. No worker invocation,
physical allowance or cap was consumed by these draft rejections.
Successful enqueue at 22:20:24.540 reached claim at 22:20:36.449 (11.909 s).
Review and schema preparation share the preceding interval; their exact costs
are unmeasured. Existing assignment validation applies; no new rule or gate.

The first frozen regression `6b58` then stopped at ESM linking: `SHRINK_GLOB`
was imported from `timeout.js`, though `const.js:1302` owns its export.
No test body or production edit ran. Main's full diff audit also found the
unreached timer-kind/action confusion (`TIMER_OBJECT=3`, `SHRINK_GLOB=7`) and
an assertion order that could mask the target error. Main allowed only those
three preproduction corrections within the original 20-minute scope, with
refreeze and a meaningful original red still required. The first miss/raw
remain retained; no new qualification, cap reset, or causal benefit claim.

The corrected frozen `d076` test reached the real pickup refusal before the first
production edit, then passed 125 tests. Review held delivery `829b` because its
shared preflight removal let synchronous callers mutate before refusal, and
eligible planned globs lacked the existing input handoff. The linked correction
preserved the original target proof and paired final `bf501` bytes after the
first draft; an intermediate control setup-miss test copy was overwritten. Its
raw failure and hash survive, while the exact intermediate test is unavailable.
Literal raw/capture envelopes replace path summaries. No benefit is measured.

## 2026-10-18 — Quest-return source order and fixture corrections

Two original-code setup misses preceded the actual ordering result: the test
expected empty Knight inventory, then omitted canonical artifact registration.
Main authorized narrow corrections within the original 12-minute deadline;
normal inventory, the initialized artifact table and both misses/raw remained.
The first genuine ordering red carried a cleanup warning, also retained.
All test corrections preceded the first production edit. Final frozen `ab901`
produced a clean original red (76 pass/1 fail), then 77 green and lint at `7a2b`.
CL verified all 18 literal raw bindings and the final test. The real delayed
pager proves the source await order; normal-history runtime remains unknown.
Delivery at 22:52:27.844 preceded the original 22:55:19 deadline. This was
Vincent's explicit source fix; no challenge prerequisite or new allowance.
No new checks, helpers, rules, gates or causal benefit claim.

## 2026-10-18 — Monster regression dependency and raw chronology

Frozen `0c48` stopped at a non-async callback's `await import`, before execution.
Main's narrow wrapper/observer corrections stayed within the original limit.
Final `20f6` freeze and actual target red preceded production code; the first
coded run's ReferenceError and repaired green remain separate raw outcomes.
A success-shaped filename does not change the failed run's actual result.
The unchanged 19,191-byte `e0ebb` fixture was required at the test's literal
ignored `.cache/.../attempt.mjs` path. Packaging-only rework requires those exact
dependency bytes committed plus an immutable deduplicated envelope of existing unique
raw outputs, captures, prefixes and frozen bytes; it changes no game or test
and runs no replacement trial. Any unavailable bytes stay explicit.
Optional controls not run remain distinct from source-reviewed behavior;
no broader snuff/planning runtime claim, new rule, gate or benefit claim.

## 2026-10-18 — Unearth source fixture and observer preparation

Zero-game `4a34` needed corrections to strict undefined-gameover/false guards,
startup prefixes, full copied ISAAC state including `n`, and pile admission.
Linked `20c9` still needed precise pending-input ownership, effective `multi`
and invocation intent. Main bound final exact `bdeda` before selecting one run.
Actual `4db8` reached default `unearth_objs` and the missing absorption boundary:
glob 66 moved buried-to-floor beside 65; exit 2 retained the caught error and
partial state. No retry or rescue followed that qualification.
Special-container `f969` repeated root-HP/gameover, `nexthere` pile-link and
capture assumptions; its linked correction remains source-only.
These are fixture/observer preparation findings. They establish no game defect
or failed physical retry. Original packets, caps and actual raw remain intact.
No new checks, helpers, rules, gates or causal benefit claim.

Meaningful `a32e` original red preceded code. The first repaired callback
returned with glob 66 mass 40, glob 65 deleted and one timer for 66 at 27, but
the observer read `after.after.objects.timers` instead of `after.after.timers`.
Main verified the initially blamed `before.fullSnapshot` path was valid; the
worker corrected that report additively. Only the three timer paths and the
already-selected unique 66 SHRINK timeout `[27]` check were authorized within
the same claim/deadline. First failed-green raw and unique `slY89N` stay intact.
The new final test pair is after the draft; the genuine precode red remains.
No queue block/unblock, fixture change or game-scope expansion occurred.

## 2026-10-19 — Container primary regression evidence

Direct frozen `6e2d` reached a genuine target red before first production code,
then the same fixture produced semantic green. The required focused primary
test had not been added, so validation correctly rejected its missing original
red in `scripts/sp-lev-object.test.mjs`. Existing 162 focused passes and lint
do not supply that primary evidence retroactively.
Main authorized a test-only wrapper after the draft, with the final same-byte
`d92` red / repaired-green pair required. Production and fixture stay unchanged;
the original 20-minute deadline, 00:25:13, remains in force.
All direct-run raw/freeze chronology is retained alongside the later wrapper.
This corrects regression ownership/evidence within the existing assignment;
no new qualification, validator/review weakening, gate or benefit claim.

`e527` review found one vacuous assertion searching compact JSON for a spaced
`"oid": 70` fragment. Main permits removing only that assertion; actual parent
children, sole 68 timer at 25 and survivor checks remain. The new frozen pair
follows `e527`, under a five-minute rework cap and the original wall deadline.
Source/fixture stay unchanged; prior `6e2d` and `9ae79` raw remain distinct.


### 2026-10-19 — Source fixture review and terminal setup misses

- Custom `6a2d` made one physical invocation: parent 1, callback 0, no transfer.
  Species/coordinate admission review missed the second constructor gate:
  the default synchronous `makemon` route required its async tail owner.
- Monstone `1571` was source only: uncommitted-artifact completion refusal,
  automatic commit-hook lint, six-minute overrun and ledger-lock refusal;
  terminal closure preserved partial evidence without runtime execution.
- Linked source-only `6781` had a missing brace caught before physical
  selection; Main corrected/froze the final fixture before the sole invocation.
- Monstone `5de7` returned an actor, then its required snapshot used free
  identifier `minvent` instead of `minv`, missed by Main and peer review.
  `entered=0`, `afterCall=null` and observer errors remain explicit; exit 0
  serialized the error. Both physical families are held, with no retry.
- Existing final-body source/observer/default-binding audit applies; benefit is unmeasured.

- Stash `a6b6` stopped before the target with both live timers present; its
  timer predicate used `state.svm.moves` instead of JS root `state.moves`.
  Main and peer review missed this source-owner predicate. The raw clock value
  was absent, limiting causal proof. Separately selected clock-corrected `399c`
  reached `use_container`'s missing `absorbGlob` path without observer error; the first cap stays spent.

- Stash c655 reached the genuine pre-code target failure and passed after the
  caller repair, then lint rejected an unused test import. Main authorized only
  that import removal within the original cap. Final 7ce01 red/green is after
  the draft; earlier c655 bytes and raw runs remain separate. No new rule,
  helper, gate or measured prevention benefit follows from this correction.

### 2026-10-19 — Tip test preparation and lint receipts

- First `64f3` precode test reached the missing-absorb target; shell `set -e`
  omitted outer exit/end files. The actual tool/child exits and raw remain.
- A read from Main's root briefly misreported absent work; the correct W2
  branch/source/raw were reconciled, with no mutation or ownership loss.
- Two stored `owt` assertions and an unused `dirname` import fix preceded code;
  the failed precode lint hook is retained. Final `b6fd` original 5/1 red
  preceded first code and the same test passed 6/6 after repair.
- First lint child/file status 0 conflicted with tool status 1; cause unknown.
  One authorized Node verification returned child/tool 0; both literal runs remain.
- Submission `83ba` is recorded; no cap reset, measured benefit or new rule.

- Tip 83ba referenced an ignored evidence envelope without committing literal
  bytes. Main and peer review preserved and verified it before a packaging-only
  linked correction; 9ad4175 commits the unchanged envelope and metadata without
  rerunning checks. Existing immutable-evidence requirements apply; benefit is
  unmeasured and no new helper, rule or gate is introduced.
