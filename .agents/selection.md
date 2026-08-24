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

### Re-using the candidate queue

The goal-selector queues every candidate it capped in `GOALS.json`, each with its forecast, witnesses, and detail. Closing a goal changes only that goal's sessions; every other candidate's stretch is unchanged.

At the next goal close, the orchestrator re-uses the queue instead of running the full selector:

1. Run the census scan (`node scripts/scan-sessions.mjs`).
2. Compare the scan's boundary candidates against the queued entries. A queued entry is current when the census shows the same sessions stopped on its boundary. Discard a queued entry with `node scripts/goal-log.mjs discard-goal --id <id> --reason <text>` when either condition holds:
   - The census no longer shows any session stopped on the entry's boundary (another goal resolved it as a side effect).
   - The set of sessions stopped on the entry's boundary changed (a session was added because a prior goal unblocked it, or one was removed).

   Treat a census boundary with no current queue entry as a new candidate.
3. If no new candidates appeared, open the queued entry with the highest capped forecast. No selector run is needed.
4. If new candidates appeared, re-cap only those candidates by handing their `--ahead` streams to parallel `sonnet-worker` classifiers, using the same capping rules as the full selector. Merge the re-capped candidates into the queue, pick the leader, and open it.
5. Run the full selector only when the queue is empty.

Queued forecasts are conservative: when a later goal resolves a boundary inside a queued candidate's stretch, the stored forecast understates the stretch. Re-capping every queued entry is the cost this queue avoids. The underestimate may delay a candidate by one goal cycle but cannot cause a mis-selection in the other direction, and a full selector run recalculates every forecast when the queue empties.

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

**Cap a session that already mismatches.** A session that matches fewer screens than it emits carries a silent divergence; `.cache/session-results.json` reports both figures per session. When its RNG log still matches in full, the loss is the divergent screens alone. When its RNG log has desynchronized, screens past the divergence cannot match until it is fixed: count that session only up to its first mismatch, and rank the divergence itself as a candidate, priced by the screens behind it. The scan's "Silent divergences" section reports each affected session's first differing screen, cursor, and RNG call, and the step each sits on.

**Read the stretch with a classifier before trusting it.** Hand each session's `--ahead` stream to a `sonnet-worker` subagent with the port's fail-closed boundary list and supported-command set, and ask for the first message implying a behavior the port refuses or partly supports; that step caps the forecast. The classifier errs toward flagging: an optimistic forecast costs a mis-selected goal, a conservative one costs ranking precision. Read its ambiguous count: a command hiding in the bytes it declined to read pushes the cap past where it belongs. A second behavior that recurs across many sessions' stretches is scope the goal should include; count it in the forecast from the start.

**The forecast omits behavior that requires no player input.** The behavior table counts commands the session's remaining input still needs. Some behavior runs without a command: the hero dies, a monster acts, a trap fires. To verify a forecast, read C's recorded screens from the stop to the end of the stretch and look for such behavior. In seed0030, the hero dies at step 74, and while `end.c done()` stood unported the table credited the engraving move with every screen after that death.

**Stop capping at the first candidate whose raw figure falls below the best capped figure.** Capping never raises a figure, so the `unlocks` column already bounds every candidate from above. Cap the leader, then work down the column until a candidate's raw figure falls below the best capped figure; that candidate and everything below it have lost. Leave the rest at their raw figures.

**Select on a measured stop.** Rank a candidate on the sessions the census shows stopped there. An argument that a behavior ought to matter is not a forecast: the pickup goal gained one development screen; the trap goal promised that closing the dart-miss path would unblock `seed1500`, which stops earlier on pet cursed-object feedback. `docs/goal-history.md` preserves both.

**Rank on development look-ahead.** The sealed holdout guards against a large inadvertent regression. Do not rank, re-rank, or reopen a goal on a holdout figure, and do not read an unmoved holdout as a failed goal.
