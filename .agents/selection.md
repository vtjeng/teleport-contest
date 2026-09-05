# Choosing what to implement next

Read this file when deciding which behavior to port next: which goal to open
and which slice comes first. `.agents/glossary.md` defines "goal" and
"behavior slice".

## Choosing a goal

Every goal is a fail-closed boundary port: it implements C behavior the port refuses. Two sources nominate a boundary.

**The development-session census nominates every candidate that stops at least one development session.** It ranks the boundaries that stop the 33 recorded sessions. "Appendix A: Measuring what the port cannot do yet" covers how to run it and rank the results.

**A fresh-seed census nominates what the recorded sessions cannot show.** The 33 development sessions are a fixed sample, so a behavior that stops none of them carries an `unlocks` of 0 and never reaches the ranking. Open a goal on a fresh-seed-census boundary only when the development-session census has no candidate left, meaning every boundary it reports carries a capped forecast of 0. Queue it with `--forecast-steps 0` and a `--forecast-basis` naming the census: its seed range, how many games it counted, and how many stopped on the boundary.

## Opening the goal

Record the capped forecast and sessions with `node scripts/goal-log.mjs queue-goal`; `open-goal` captures the score standing, and `close-goal` records delivered figures beside the forecast for reference. The capped forecast is an upper bound: hidden divergences and entangled systems routinely cause delivery to fall well short, and underdelivery does not need to be justified.

A goal may be larger than one agent session. It closes through several behavior slices, each closed on its own. Close slices that port rows of one C table or arms of one C function family as a single slice. `QUALITY.json`'s thresholds schedule reviews inside a goal; size never justifies refusing, deferring, or narrowing a goal. Narrow a goal only through the slice-closure mechanism in `.agents/loop.md`. Start at the first queued slice.

State the boundary in terms the sessions contributing to its forecast reach. A criterion that the witness sessions do not exercise ("every option", "every row of a table") belongs in its own queued goal with its own forecast, where the ranking prices it.

The agent selecting work chooses the goal. Do not ask the user which goal to take.

## Where goal state lives

`GOALS.json` holds every goal, written only through `node scripts/goal-log.mjs`. `ROADMAP.md` describes the systems the current goals belong to, and `docs/goal-history.md` holds notes and findings that outlived the goals that produced them. Every task starts with `node scripts/goal-log.mjs --current`, so goal entries stay terse: the boundary, the forecast, and the traced findings in `detail`.

-------------------------------------------------------------------------------

## Appendix A: Measuring what the port cannot do yet

Run `node scripts/scan-sessions.mjs`. It replays the 33 development sessions and prints a behavior table; `--help` lists the options and the legend defines every column. This appendix covers the judgments the report leaves to the reader.

The scanned directory is fixed and the script accepts no path argument, so it cannot be aimed at `sessions/holdout/`.

Emitted screens are not matched screens: `scripts/score-development.mjs` is the authority on how many of them match C.

### From a boundary census row to a C function

Trace the upstream owner in `nethack-c/upstream/`. Grep the C source for the message at the stop, open the function, and port it; "Implement NetHack behavior from source" in `AGENTS.md` states why the message alone does not specify the behavior.

The steps behind a boundary are an upper bound: sessions blocked on one owner routinely block again on another. To measure what a candidate unblocks, apply it and re-run the scan.

**A later segment's screen positions depend on the earlier segments' screen counts.** A segment is one run of the game with its own seed and keystrokes, replayed by a separate `runSegment()` call; a session is one or more segments in order. The runner concatenates every segment's output and compares it positionally, so a segment that emits fewer screens than C recorded shifts every later segment out of alignment, scoring zero regardless of replay accuracy. Within a segment, partial progress scores normally.

### Ranking the behavior table

`node scripts/pipeline-candidates.mjs --ready-winner` automates the ranking and produces a ready candidate. The rules below govern how its inputs are prepared.

**Require a C-path witness for every contributing session.** Before counting a session toward a goal, trace its seed, date, options, configuration, and stop step through the C source. Confirm that it reaches the goal's defining branch and preconditions. A session that does not execute the proposed branch contributes zero; rename or widen the goal to the branch it actually executes. The `candidate-pipeline` workflow traces witnesses automatically.

**Rank by the look-ahead forecast.** The port is fail-closed: a session does not score screens past its first stop, so a candidate is worth what it unblocks. Start from `unlocks`, the steps from a stopped session's boundary to its next unmet behavior; that run is the session's **stretch**. Cap each stretch at the first recorded message implying a second unported or partially ported behavior, sum the capped stretches, and take the highest; break ties by session count. `node scripts/scan-sessions.mjs --ahead-all` prints every candidate's message streams for the capping read (`--ahead=<behavior>` prints one).

**Divergence zeroing is automatic.** `rankCandidates()` zeroes a session's `unlocks` contribution when its earliest divergence (screen or RNG, whichever comes first) is before the boundary step. When the divergence is at the boundary step, the boundary itself may be the cause, so the contribution stays and the annotation flags it for investigation. Serialize-bug divergences (davidbau/teleport-contest#18, unfixable) are excluded automatically.

**Cap divergence candidates the same way as boundary candidates.** `--ahead-all` prints each divergent session's message stream from its first mismatch. Cap at the first message that implies a second, independent issue.

**Read the stretch with a classifier before trusting it.** Hand each session's `--ahead` stream to a `sonnet-worker` subagent with the port's boundary list and supported-command set; the first message implying refused or unported behavior caps the forecast. The classifier errs toward flagging.

**The forecast omits behavior that requires no player input.** Some behavior runs without a command: the hero dies, a monster acts, a trap fires. To verify a forecast, read C's recorded screens from the stop to the end of the stretch and look for such behavior.

**Use cached caps from `.cache/session-frontiers.json`.** The scan annotates each stopped session with `capStable: true` when its state tuple (boundary, screensEmitted, screenDivergenceAt, rngDivergenceStep) matches the cached entry. After capping a session with a classifier, persist the cap with `node scripts/scan-sessions.mjs --set-cap=<session>=<n>`.

**Select on a measured stop.** Rank a candidate on the sessions the census shows stopped there. An argument that a behavior ought to matter is not a forecast.

**Rank on development look-ahead.** The sealed holdout guards against a large inadvertent regression. Do not rank, re-rank, or reopen a goal on a holdout figure, and do not read an unmoved holdout as a failed goal.
