# Choosing what to implement next

Read this file when deciding which behavior to port next: which goal to open
and which slice comes first. `.agents/workflow.md` defines "goal" and "behavior
slice".

## Choosing a goal

Every goal is a fail-closed boundary port: it implements C behavior the port refuses. Two sources nominate a boundary.

**The development-session census nominates every candidate that stops at least one development session.** It ranks the boundaries that stop the 33 recorded sessions. "Appendix A: Measuring what the port cannot do yet" covers how to run it and rank the results.

**A fresh-seed census nominates what the recorded sessions cannot show.** The 33 development sessions are a fixed sample, so a behavior that stops none of them carries an `unlocks` of 0 and never reaches the ranking. A census of 600 fresh D:1 walks at `a6b32bd` found 67 stopping on `pet combat evaluation` while its `unlocks` stood at 0.

Open a goal on a fresh-seed-census boundary only when the development-session census has no candidate left, meaning every boundary it reports carries a capped forecast of 0. Queue it with `--forecast-steps 0` and a `--forecast-basis` naming the census: its seed range, how many games it counted, and how many stopped on the boundary.

The deferral ledger records known gaps so that later reviews and traces do not re-derive them. An open entry is retired by the goal whose port reaches its subject, or resolved at a goal close when that goal's commits already closed it. Record what an entry waits on with `npm run quality -- block-deferral --id <id> --blocked-on <symbol>`.

## Opening the goal

**Record the forecast when the goal opens and the delivery when it closes.** Record the capped forecast and sessions with `node scripts/goal-log.mjs queue-goal --forecast-steps <n> --forecast-basis <text> --sessions <csv>`; `open-goal` captures the score standing, and `close-goal` records delivered figures beside the forecast. Compare a slice's delivery against its forecast, and the goal's delivery against the goal's forecast. Retire a ranking statistic when the last three closed goals each delivered less than a tenth of its forecast. Use it again only in a goal entry whose `--forecast-basis` states how those three closes corrected it.

**A goal may be larger than one agent session.** It closes through several behavior slices, each closed on its own. A goal may list the slices it needs; where it does not, the agent identifies each slice while the goal is in progress. Close slices that port rows of one C table or arms of one C function family as one slice whose recordings cover the table's rows or the function family's arms. `AGENTS.md` states when a goal needs a checklist: work that continues across agent sessions, touches more than one game system, or approaches 500 changed lines of game code. `QUALITY.json`'s thresholds schedule reviews inside a goal and set no ceiling on its size; size never justifies refusing, deferring, or silently narrowing a stated goal. Narrow a goal only through the recorded split in `.agents/loop.md` step 4. Start at the first queued slice.

**State the boundary in terms the sessions contributing to its forecast reach.** A criterion that the witness sessions do not exercise ("every option", "every row of a table") belongs in its own queued goal with its own forecast, where the ranking prices it.

**The agent selecting work chooses the goal.** Do not ask the user which goal to take.

## Where goal state lives

`GOALS.json` holds every goal, written only through `node scripts/goal-log.mjs`. A closed goal's entry stays as the calibration record; score evidence stays in `SCORE.tsv`, review metadata in `QUALITY.json`, and implementation history in Git. `ROADMAP.md` describes the systems the current goals belong to, and `docs/goal-history.md` holds notes and findings that outlived the goals that produced them. Every task starts with `node scripts/goal-log.mjs --current`, so goal entries stay terse: the boundary, the forecast, and the traced findings in `detail`.

-------------------------------------------------------------------------------

## Appendix A: Measuring what the port cannot do yet

Run `node scripts/scan-sessions.mjs`. It replays the 33 development sessions and prints six sections and a legend: where each session first stops, a boundary census, a refused-command census, unmet behaviors per session, a reconciliation of observed stops and modeled needs, and a behavior table. The legend and the script's header comment define every section and column; `--help` lists the options. This appendix covers the judgments the report leaves to the reader.

The scanned directory is fixed and the script accepts no path argument, so it cannot be aimed at `sessions/holdout/`.

Emitted screens are not matched screens: `scripts/score-development.mjs` is the authority on how many of them match C.

### From a boundary census row to a C function

Trace the upstream owner in `nethack-c/upstream/`. Grep the C source for the message at the stop, open the function, and port it; "Implement NetHack behavior from source" in `AGENTS.md` states why the message alone does not specify the behavior.

The steps behind a boundary are an upper bound, not a prediction. Sessions blocked on one owner routinely block again on another, and the keystrokes after a stop include prompt answers, count prefixes, and menu selections. To measure what a candidate unblocks, apply it and re-run the scan; the difference between the two runs' step counts is the measurement.

**A later segment's screen positions depend on the earlier segments' screen counts.** A segment is one run of the game with its own seed and keystrokes, replayed by a separate `runSegment()` call; a session is one or more segments in order. The runner concatenates every segment's output and compares it positionally (`frozen/ps_test_runner.mjs:371`), so a segment that emits fewer screens than C recorded shifts every later segment out of alignment, scoring zero regardless of replay accuracy. Within a segment, partial progress scores normally.

### Reading the reconciliation before you rank

The report answers two questions per session from one replay, labelling each figure with its source. The observed estimate reports where the port stopped: the boundary raised, the byte refused, and the undrawn screens. The modeled estimate reports what the session still needs: it diffs the session's recorded input against dispatched commands, then adds boundaries raised inside a dispatched command (which keystroke-level diffing does not identify). The report calls the result that session's debt. Those debts fill the behavior table, whose `supports` and `unlocks` columns the next section ranks.

Two censuses group the observed stops: the boundary census groups by the boundary raised, the refused-command census by the command the refused byte is bound to. Each row carries the sessions in its group and the screens behind them.

The refused-command census resolves each refused byte through the session's binding model, which answers for every byte, including those that answer prompts, pick menu entries, or dismiss `--More--`. Both estimates read the recorded cursor, which rests on the hero while the game waits for a command. The census labels any row whose byte did not begin a command; never rank a labelled row. At `28c62d0` four of them carry 1,596 screens, the largest `open` at 699, where a session answered the apply prompt with `o`, also bound to `open`.

The reconciliation section lists rows the two estimates identify differently, under "Refused-command census rows the behavior table cannot hold". Read a row's arrow before ranking it.

The report also lists stops where the modeled estimate identifies no behavior at the refused step. The behavior table has no row for such a stop, so decide what to do with each before you rank. Two remain at `0063528`, both sessions that opened a count prefix, which the report cannot represent.

### Ranking the behavior table

**Require a C-path witness for every contributing session.** Before counting a session toward a goal, trace its seed, date, options, configuration, and stop step through the C source. Confirm that it reaches the goal's defining branch and preconditions. A JavaScript boundary and matching screen are insufficient: different C and JavaScript branches can produce the same visible screen. A session that does not execute the proposed branch contributes zero; rename or widen the goal to the branch it actually executes.

**Rank by the look-ahead forecast.** The port is fail-closed: a session does not score screens past its first stop, so a candidate is worth what it unblocks. Start from `unlocks`, the steps from a stopped session's boundary to its next unmet behavior. This file calls that run the session's **stretch**. Cap each stretch at the first recorded message implying a second unported or partially ported behavior, sum the capped stretches, and take the highest; break ties by session count. Uncapped, `unlocks` overstated three closed goals by 5.8, 4.8 and 26 times. The table's default order ranks by `unlocks`, and `node scripts/scan-sessions.mjs --ahead-all` prints every candidate's message streams for the capping read (`--ahead=<behavior>` prints one). The other column, `supports`, measures how broadly sessions depend on a behavior, and stays as context. For the descent goal, `supports` reported 3,515 screens; the goal delivered 9 (`125601d`).

**Divergence zeroing is automatic.** `rankCandidates()` zeroes a session's `unlocks` contribution when its earliest divergence (screen or RNG, whichever comes first) is before the boundary step: those screens cannot match regardless of what the boundary ports. When the divergence is at the boundary step, the boundary itself may be the cause, so the contribution stays and the annotation flags it for investigation. The scan's "Divergence candidates" section lists RNG-fix and screen-fix candidates with their blocked screen counts. Serialize-bug divergences (davidbau/teleport-contest#18, unfixable) are excluded automatically and listed separately.

**Cap divergence candidates the same way as boundary candidates.** `--ahead-all` prints each divergent session's message stream from its first mismatch to the end of its emitted screens. The raw `blocked` figure is an upper bound. Hand the stream to a classifier and cap at the first message that implies a second, independent issue — one that would prevent matching even after the divergence cause is fixed.

**Read the stretch with a classifier before trusting it.** Hand each session's `--ahead` stream to a `sonnet-worker` subagent with the port's fail-closed boundary list and supported-command set, and ask for the first message implying a behavior the port refuses or partly supports; that step caps the forecast. The classifier errs toward flagging: an optimistic forecast costs a mis-selected goal, a conservative one costs ranking precision. Read its ambiguous count: a command hiding in the bytes it declined to read pushes the cap past where it belongs. A second behavior that recurs across many sessions' stretches is scope the goal should include; count it in the forecast from the start.

**The forecast omits behavior that requires no player input.** The behavior table counts commands the session's remaining input still needs. Some behavior runs without a command: the hero dies, a monster acts, a trap fires. To verify a forecast, read C's recorded screens from the stop to the end of the stretch and look for such behavior. In seed0030, the hero dies at step 74, and while `end.c done()` stood unported the table credited the engraving move with every screen after that death.

**Use cached caps from `.cache/session-frontiers.json`.** The scan annotates each stopped session with `capStable: true` when its state tuple (boundary, screensEmitted, screenDivergenceAt, rngDivergenceStep) matches the cached entry. A cap-stable session does not need re-capping; its cached `cappedStretch` is valid. After capping a session with a classifier, persist the cap with `node scripts/scan-sessions.mjs --set-cap=<session>=<n>`. Cap all candidates; cached caps make stable sessions free.

**Select on a measured stop.** Rank a candidate on the sessions the census shows stopped there. An argument that a behavior ought to matter is not a forecast: the pickup goal gained one development screen; the trap goal promised that closing the dart-miss path would unblock `seed1500`, which stops earlier on pet cursed-object feedback. `docs/goal-history.md` preserves both.

**Rank on development look-ahead.** The sealed holdout guards against a large inadvertent regression. Do not rank, re-rank, or reopen a goal on a holdout figure, and do not read an unmoved holdout as a failed goal.
