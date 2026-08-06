# Choosing what to implement next

Read this file when deciding which behavior to port next: which goal to open,
and which slice of that goal comes first. (For more detail:
`.agents/workflow.md` defines the terms "goal" and "behavior slice", states the
evidence required to close a behavior slice, and outlines the review that
closing a goal triggers.)

## Choosing a goal

We have two categories of goals. Clear every deferred-area sweep the report
names before opening a fail-closed boundary port.

### Deferred-area sweeps

A deferred-area sweep resolves the open deferral entries one area has
accumulated. `npm run quality -- deferrals` reports an area holding ten or
more; it counts every category except `scope`, whose entries name unported
territory a boundary goal attacks. Resolve one of that area's entries before
opening the next boundary goal.

Order the entries by how the port behaves at each one. An entry where the port
skips a message-writing C branch silently comes before an entry where the port
stops on a named refusal, because `AGENTS.md` forbids the first and permits the
second.

Read every entry in the area before opening the goal, then close every entry
that reading showed to be small, even after the count falls below ten. The
reading costs more than the closing. Once below ten, stop at an entry that
turns out to need a fresh recording, a state-owner change, or a decision its
record does not settle: queue it as its own slice, and state in the closing
report what the reading found, because the ledger has no command that amends an
open entry.

An entry closes only when the behavior its record names as the closing
condition is ported. An entry waiting on an unported command therefore survives
the sweep. Name each surviving entry in the closing report with the behavior it
waits on.

### Fail-closed boundary ports

Once the report lists no area, pick a fail-closed boundary port. This goal
implements C behavior the port refuses.

Two sources nominate a boundary.

**The development-session census nominates every ordinary candidate.** It
ranks the boundaries that stop the 33 recorded sessions. "Appendix A:
Measuring what the port cannot do yet" states how to run it and how to rank
what it reports.

**A fresh-seed census nominates what the recorded sessions cannot show.** The
33 development sessions are a fixed sample, so a behavior that stops none of
them first carries an `unlocks` of 0 and never reaches the ranking, however
common it is in play. A census of 600 fresh D:1 walks recorded at `a6b32bd`
found 67 stopping on `pet combat evaluation` while its `unlocks` stood at 0.

Open a goal on a fresh-seed-census boundary only when the development-session
census has no candidate left, meaning every boundary it reports carries a capped
forecast of 0. Queue it with `--forecast-steps 0` and a `--forecast-basis`
naming the census: its seed range, how many games it counted, and how many
stopped on the boundary.

Five goal closes in a row left the holdout counts unchanged, and
`docs/goal-history.md` reads those zeros as one account: the counts move only
where the port gains behavior it cannot yet perform at all, and they held
wherever a goal improved behavior it already performs. Prefer a boundary that
opens a capability the port wholly lacks.

## Opening the goal

**Record the forecast when the goal opens and the delivery when it closes.**
Record the capped forecast and the sessions it covers with
`node scripts/goal-log.mjs queue-goal --forecast-steps <n>
--forecast-basis <text> --sessions <csv>`; `open-goal` captures the score
standing, and `close-goal` records delivered figures beside the forecast
from the score log. A slice earns a fraction of what its whole behavior does,
so compare a slice's delivery against the slice and the goal's against the
goal. Retire a ranking statistic from selection when the last three closed
goals in `GOALS.json` each delivered less than a tenth of its forecast. Use it
again only in a goal entry whose `--forecast-basis` states how those three
closes corrected it. The goal budget in `.agents/loop.md` bounds what a missed
forecast can cost.

**A goal may be larger than one agent session.** It then closes through several
behavior slices, each closed on its own. A goal may list the slices it is known
to need; where it does not, the slice-selector identifies each in turn while the
goal is in progress. A sweep needs no slice selection: each open entry is a
slice, scoped when it was deferred. Group several entries into one slice when
one body of evidence closes all of them. Leave an entry in its own slice when
closing it needs a fresh recording, changes a state owner, or revives a dead
refusal. `AGENTS.md` states when a goal needs a
checklist: work that continues across agent sessions, touches more than one
game system, or approaches 500 changed lines of game code. `QUALITY.json`'s
thresholds schedule reviews inside a goal and set no ceiling on its size; size
never justifies refusing, deferring, or silently narrowing a stated goal. Start
at the first queued slice.

**The agent selecting work chooses the goal.** Do not ask the user which goal
to take.

## Where goal state lives

`GOALS.json` holds every goal, written only through
`node scripts/goal-log.mjs`. A closed goal's entry stays there as the
calibration record; its score evidence stays in `SCORE.tsv`, its review
metadata in `QUALITY.json`, and its implementation history in Git.
`ROADMAP.md` describes the systems the current goals belong to, and
`docs/goal-history.md` holds what the closed goals carried over. Every task
starts with `node scripts/goal-log.mjs --current`, so goal entries stay terse:
the boundary, the forecast, and the traced findings in `detail`.

-------------------------------------------------------------------------------

## Appendix A: Measuring what the port cannot do yet

Run `node scripts/scan-sessions.mjs`. It replays the 33 development sessions
once and prints six sections and a legend: where each session first stops, a
boundary census, a refused-command census, the behaviors each session's
remaining recorded input needs that the port does not support, a reconciliation
of those two halves, and a behavior table. The legend and the script's header
comment define every section and column, and `--help` lists the options. This
appendix states only what the report cannot decide for you.

The scanned directory is fixed and the script accepts no path argument, so it
cannot be aimed at `sessions/holdout/`.

Emitted screens are not matched screens: `scripts/score-development.mjs` is the
authority on how many of them match C.

### From a boundary census row to a C function

Trace the upstream owner, the C code whose behavior the port has not yet
reproduced, in `nethack-c/upstream/`. C's message at the stop is a search key.
Grep the C source for its text, open the function containing it, and port that
function; "Implement NetHack behavior from source" in `AGENTS.md` states why
the message itself specifies nothing.

The steps standing behind a boundary are an upper bound. They do not predict
how many steps porting that boundary will unblock. Sessions blocked on one
owner routinely block again on another, and the keystrokes after a stop include
prompt answers, count prefixes, and menu selections. To measure what a
candidate change earns, apply it and re-run the scan; the difference between
the two runs' step counts is the measurement.

### Reading the reconciliation before you rank

The observed and modeled halves are derived by different routes, so the report
states where they disagree. Where a refused-command census row has no
counterpart in the behavior table, it names a command no session issued, and
ranking it would be an error: `rushsouth` stands at 8 sessions and 2,179 steps
there because `\n` is Ctrl-J, which the binding table names `rushsouth` while
those sessions were stopped inside an extended-command prompt. A stop with no
modeled behavior at the step the port refused is the serious case: the model
believes the port supports what the port just refused, so no candidate stands
for that stop at all. That count is 0 today. If it is not, the behavior table
holds no row for that stop, so find why the model counts that command as
supported before you rank.

### Ranking the behavior table

**Require a C-path witness for every contributing session.** Before counting a
session toward a source-bounded goal, trace that session's seed, date, options,
configuration, and stop step through the C source. Confirm that it reaches the
goal's defining branch and preconditions. A JavaScript boundary and matching
screen are insufficient: different C and JavaScript branches can produce the
same visible screen. A session that does not execute the proposed branch
contributes zero; rename or widen the goal to the branch it actually executes.

**Rank by the look-ahead forecast.** The port is fail-closed: a session earns
no screen past its first stop, so a candidate pays what it unblocks. Start
from `unlocks`, the recorded steps running from a stopped session's boundary
to its next unmet behavior. This file calls that run the session's **stretch**.
Cap each stretch at the first recorded message implying a second unported or
partially ported behavior inside it, sum the capped stretches across sessions,
and take the highest; break ties by the number of sessions stopped on the
boundary. Uncapped, `unlocks` overstated three closed goals by 5.8, 4.8 and 26
times. The table's default order already ranks by `unlocks`, and
`node scripts/scan-sessions.mjs --ahead=<behavior>` prints each stopped
session's message stream for the capping read. The other column, `supports`,
measures dependency breadth and stays in the report as context; it ranked the
descent goal by 3,515 screens that closed as 9 (`125601d`).

**Read the stretch with a classifier before trusting it.** Hand each
session's `--ahead` stream to a `sonnet-worker` subagent together with the
port's fail-closed boundary list and the supported-command set, and ask for
the first message implying a behavior the port refuses or only partly
supports; that step caps the session's forecast. The classifier errs toward
flagging: an optimistic forecast costs a mis-selected goal, a conservative
one costs ranking precision. Read its ambiguous count too: a command hiding in
the bytes it declined to read pushes the cap past where it belongs. A second
behavior recurring across many sessions' stretches is scope the goal should
include, priced in from the start.

**Select on a measured stop.** Rank a candidate on the sessions the census
shows stopped there. An argument that a behavior ought to matter is not a
forecast: the pickup goal was chosen because its behavior "fires without a
player command" and gained one development screen; the trap goal promised that
closing the dart-miss path would unblock `seed1500`, which stops earlier, on
pet cursed-object feedback. `docs/goal-history.md` preserves both.

**Rank on development look-ahead.** The sealed holdout guards against a
significant inadvertent regression. Do not rank, re-rank, or reopen a goal on a
holdout figure, and do not read an unmoved holdout as a failed goal.
