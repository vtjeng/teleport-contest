# Choosing what to implement next

Read this file when deciding which behavior to port next: which goal to open and which slice of that goal comes first. `.agents/workflow.md` defines "goal" and "behavior slice", states the evidence required to close a slice, and outlines the review that closing a goal triggers.

## Choosing a goal

Every goal is a fail-closed boundary port: it implements C behavior the port refuses. Two sources nominate a boundary.

**The development-session census nominates every candidate that stops at least one development session.** It ranks the boundaries that stop the 33 recorded sessions. "Appendix A: Measuring what the port cannot do yet" states how to run it and how to rank what it reports.

**A fresh-seed census nominates what the recorded sessions cannot show.** The 33 development sessions are a fixed sample, so a behavior that stops none of them first carries an `unlocks` (recorded steps from the boundary to the session's next unmet behavior) of 0 and never reaches the ranking, however common it is in play. A census of 600 fresh D:1 walks recorded at `a6b32bd` found 67 stopping on `pet combat evaluation` while its `unlocks` stood at 0.

Open a goal on a fresh-seed-census boundary only when the development-session census has no candidate left, meaning every boundary it reports carries a capped forecast of 0. Queue it with `--forecast-steps 0` and a `--forecast-basis` naming the census: its seed range, how many games it counted, and how many stopped on the boundary.

The deferral ledger records known gaps for later reference without scheduling when they are resolved, so that later reviews and traces do not re-derive them. An open entry is retired by the goal whose port reaches its subject, or resolved at a goal close when that goal's commits already closed it. Record what an entry waits on with `npm run quality -- block-deferral --id <id> --blocked-on <symbol>`, so a reader learns it from the entry instead of repeating the trace.

## Opening the goal

**Record the forecast when the goal opens and the delivery when it closes.** Record the capped forecast and the sessions it covers with `node scripts/goal-log.mjs queue-goal --forecast-steps <n> --forecast-basis <text> --sessions <csv>`; `open-goal` captures the score standing, and `close-goal` records delivered figures beside the forecast from the score log. A slice scores a fraction of what its whole behavior does, so compare a slice's delivery against its forecast, and compare the goal's delivery against the goal's forecast. Retire a ranking statistic from selection when the last three closed goals in `GOALS.json` each delivered less than a tenth of its forecast. Use it again only in a goal entry whose `--forecast-basis` states how those three closes corrected it.

**A goal may be larger than one agent session.** It then closes through several behavior slices, each closed on its own. A goal may list the slices it is known to need; where it does not, the agent working on the goal identifies each slice in turn while the goal is in progress. Close slices that port rows of one C table or arms of one C function family as one slice whose recordings together cover the table's rows or the function family's arms. `AGENTS.md` states when a goal needs a checklist: work that continues across agent sessions, touches more than one game system, or approaches 500 changed lines of game code. `QUALITY.json`'s thresholds schedule reviews inside a goal and set no ceiling on its size; size never justifies refusing, deferring, or silently narrowing a stated goal; narrow a goal only through the recorded split that `.agents/loop.md` step 4 defines. Start at the first queued slice.

**State the boundary in terms the sessions contributing to its forecast reach.** A criterion that the witness sessions do not exercise ("every option", "every row of a table") belongs in its own queued goal with its own forecast, where the ranking prices it.

**The agent selecting work chooses the goal.** Do not ask the user which goal to take.

## Where goal state lives

`GOALS.json` holds every goal, written only through `node scripts/goal-log.mjs`. A closed goal's entry stays there as the calibration record; its score evidence stays in `SCORE.tsv`, its review metadata in `QUALITY.json`, and its implementation history in Git. `ROADMAP.md` describes the systems the current goals belong to, and `docs/goal-history.md` holds the notes and findings that outlived the goals that produced them. Every task starts with `node scripts/goal-log.mjs --current`, so goal entries stay terse: the boundary, the forecast, and the traced findings in `detail`.

-------------------------------------------------------------------------------

## Appendix A: Measuring what the port cannot do yet

Run `node scripts/scan-sessions.mjs`. It replays the 33 development sessions once and prints six sections and a legend: where each session first stops, a boundary census, a refused-command census, the behaviors each session's remaining recorded input needs that the port does not support, a reconciliation of the observed stops and the modeled needs, and a behavior table. The legend and the script's header comment define every section and column, and `--help` lists the options. This appendix covers the judgments the report leaves to the reader.

The scanned directory is fixed and the script accepts no path argument, so it cannot be aimed at `sessions/holdout/`.

Emitted screens are not matched screens: `scripts/score-development.mjs` is the authority on how many of them match C.

### From a boundary census row to a C function

Trace the upstream owner (the C code whose behavior the port has not yet reproduced) in `nethack-c/upstream/`. Grep the C source for the message at the stop, open the function containing it, and port that function; "Implement NetHack behavior from source" in `AGENTS.md` states why the message itself does not specify the behavior.

The steps standing behind a boundary are an upper bound, not a prediction of how many steps porting that boundary will unblock. Sessions blocked on one owner routinely block again on another, and the keystrokes after a stop include prompt answers, count prefixes, and menu selections. To measure what a candidate change unblocks, apply it and re-run the scan; the difference between the two runs' step counts is the measurement.

**A later segment's screen positions depend on the earlier segments' screen counts.** A segment is one run of the game with its own seed and keystrokes, replayed by a separate `runSegment()` call; a session is one or more segments in order. The runner concatenates every segment's output and compares it positionally (`frozen/ps_test_runner.mjs:371`), so a segment that emits fewer screens than C recorded shifts every later segment out of alignment and those segments score zero regardless of how well the port replays them. In a session with more than one segment, a candidate that stops short of finishing its segment scores zero from the segments after it. Within a segment, partial progress scores normally.

### Reading the reconciliation before you rank

The report answers two questions about each session from one replay, and labels every figure with the question it came from. The observed estimate states where the port stopped: it replays each session to its first refusal, then reports the boundary raised, the byte refused, and how many recorded screens went undrawn. The modeled estimate states what the session still needs, from two sources: it diffs the session's whole recorded input against the commands the port dispatches, then adds the boundaries the port raised inside a command it did dispatch, which keystroke-level diffing does not identify. The report calls the result that session's debt. Those debts are the rows of the behavior table, whose `supports` and `unlocks` columns the next section ranks.

Two censuses group the observed stops: the boundary census groups by the boundary the port raised, and the refused-command census groups by the command the refused byte is bound to. Each row of either census carries the sessions in its group and the screens standing behind them.

The refused-command census resolves each refused byte through the session's binding model, which answers for every byte, including the roughly half that answer prompts, pick menu entries, or dismiss `--More--`. Both estimates read the recorded cursor, which rests on the hero exactly while the game waits for a command. The census labels any row whose byte did not begin a command; never rank a labelled row. At `28c62d0` four of them carry 1,596 screens between them, the largest `open` at 699, where a session answered the apply prompt with the inventory letter `o`, which is also bound to `open`.

The reconciliation section lists the rows the two estimates still identify differently, under "Refused-command census rows the behavior table cannot hold". Read a row's arrow (the symbol showing which behavior the modeled estimate maps the row to) before ranking it.

The report also lists stops where the modeled estimate does not identify a behavior at the step the port refused. The behavior table has no row for such a stop, so decide what to do with each one before you rank. Two remain at `0063528`, both sessions that opened a count prefix, which the report cannot represent.

### Ranking the behavior table

**Require a C-path witness for every contributing session.** Before counting a session toward a source-bounded goal, trace that session's seed, date, options, configuration, and stop step through the C source. Confirm that it reaches the goal's defining branch and preconditions. A JavaScript boundary and matching screen are insufficient: different C and JavaScript branches can produce the same visible screen. A session that does not execute the proposed branch contributes zero; rename or widen the goal to the branch it actually executes.

**Rank by the look-ahead forecast.** The port is fail-closed: a session does not score screens past its first stop, so a candidate is worth what it unblocks. Start from `unlocks`, the recorded steps running from a stopped session's boundary to its next unmet behavior. This file calls that run the session's **stretch**. Cap each stretch at the first recorded message implying a second unported or partially ported behavior inside it, sum the capped stretches across sessions, and take the highest; break ties by the number of sessions stopped on the boundary. Uncapped, `unlocks` overstated three closed goals by 5.8, 4.8 and 26 times. The table's default order already ranks by `unlocks`, and `node scripts/scan-sessions.mjs --ahead=<behavior>` prints each stopped session's message stream for the capping read. The other column, `supports`, measures how broadly sessions depend on a behavior, and stays in the report as context. For the descent goal, `supports` reported 3,515 screens; the goal delivered 9 (`125601d`).

**Cap a session that already mismatches.** A session that matches fewer screens than it emits carries a silent divergence inside its replayed input; the last scoring run's `.cache/session-results.json` reports both figures per session. When its RNG log still matches in full, the loss is the divergent screens alone. When its RNG log has desynchronized, screens past the divergence cannot match until the divergence is fixed: count that session toward a boundary candidate only up to its first mismatch, and rank the divergence itself as a candidate, priced by the screens standing behind it. The scan's "Silent divergences" section reports each affected session's first differing screen, cursor, and RNG call inside its replayed input, and the step each sits on.

**Read the stretch with a classifier before trusting it.** Hand each session's `--ahead` stream to a `sonnet-worker` subagent together with the port's fail-closed boundary list and the supported-command set, and ask for the first message implying a behavior the port refuses or only partly supports; that step caps the session's forecast. The classifier errs toward flagging: an optimistic forecast costs a mis-selected goal, a conservative one costs ranking precision. Read its ambiguous count too: a command hiding in the bytes it declined to read pushes the cap past where it belongs. A second behavior that recurs across many sessions' stretches is scope that the goal should include; count it in the forecast from the start.

**The forecast omits behavior that requires no player input.** The behavior table counts the commands a session's remaining input still needs. Some behavior runs without a command: the hero dies, a monster acts, a trap fires. This behavior does not reach the table. To verify a forecast, read C's recorded screens from the stop to the end of the stretch and look for such behavior. In seed0030, the hero dies at step 74, and while `end.c done()` stood unported the table still credited the engraving move with every screen after that death.

**Stop capping at the first candidate whose raw figure falls below the best capped figure.** Capping never raises a figure, so the `unlocks` column already bounds every candidate from above. Cap the leader, then work down the column until a candidate's raw figure falls below the best capped figure; that candidate and everything below it have lost. Leave the rest at their raw figures.

**Select on a measured stop.** Rank a candidate on the sessions the census shows stopped there. An argument that a behavior ought to matter is not a forecast: the pickup goal was chosen because its behavior "fires without a player command" and gained one development screen; the trap goal promised that closing the dart-miss path would unblock `seed1500`, which stops earlier, on pet cursed-object feedback. `docs/goal-history.md` preserves both.

**Rank on development look-ahead.** The sealed holdout guards against a large inadvertent regression. Do not rank, re-rank, or reopen a goal on a holdout figure, and do not read an unmoved holdout as a failed goal.
