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

- C committed the counted-stack diagnosis before parking behind its submitted quiver reservation. After that reservation cleared, its delivery base already contained the diagnosis, so its new commit list contained only source and report modifications. Main lacked the report those modifications expected. Root detected this before integration and preserved the original report-only946f9d8ef commit at the next preparation record boundary; source and runtime evidence did not change.
- The same-function reservation required counted-stack implementation to wait for quiver acceptance. Root woke C immediately after acceptance and queue promotion, before publication. C resumed the preserved investigation, submitted its passing correction, and recorded idle when every remaining case was owned or parked.
- Root again committed and verified a baseline-only handoff before waking workers on v75. This manual publication check kept the official evaluation in each worker base without a later provenance-copy correction.
- Prep40 reviewed20 source routes and43 C attempts, retained41 valid first pairs and15 independent replays, and excluded exact earlier boomerang, tinning and nonlethal Earth coverage. Two failed quit recordings remain recipes and failure logs, outside the proof count. Root verified84 submitted data files and every saved artifact hash; the verifier skipped absent recording hashes for those two invalid attempts. The approved reduced v76 contains five failures and five controls; cloud-status coverage remains outside membership behind B's whole-function task.
- Shared ledger writes continued to collide briefly. Identical events and helpers succeeded under the bounded lock-only retry; no live lock was removed. The v75 preparation checkpoint repeated the full suite, fixed workload, regression recordings and existing synthetic batches with unchanged game code, as the current preparation gate requires.
