# Workflow friction log

Observations for later triage, not confirmed defects or approved changes.
The main orchestrator records its own friction and relevant worker reports.
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
