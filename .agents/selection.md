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

### Fail-closed boundary ports

Once the report lists no area, pick a fail-closed boundary port. This goal
implements C behavior the port refuses.

Two sources nominate a boundary.

**The development-session census nominates every ordinary candidate.** It
ranks the boundaries that stop the 33 recorded sessions. "Appendix A:
Measuring what the port cannot do yet" states how to run it, read it, and
discount its forecast. Take the top-ranked behavior whichever system it
belongs to.

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
where the port gains behavior it cannot yet perform at all. Ask which boundary
stands in front of many sessions at once that resemble the eleven hidden
holdout sessions; no instrument in this repository reports that directly.

## Opening the goal

**Record the forecast when the goal opens and the delivery when it closes.**
Record the capped forecast and the sessions it covers with
`node scripts/goal-log.mjs queue-goal --forecast-steps <n>
--forecast-basis <text> --sessions <csv>`; `open-goal` captures the score
standing, and `close-goal` records delivered figures beside the forecast
from the score log. Retire a ranking statistic from selection when the last
three closed goals in `GOALS.json` each delivered less than a tenth of its
forecast, until it is recalibrated against those closes. The goal budget in
`.agents/loop.md` bounds what a missed forecast can cost.

**A goal may be larger than one agent session.** It then closes through several
behavior slices, each closed on its own. A goal may list the slices it is known
to need; where it does not, the slice-selector identifies each in turn while the
goal is in progress. A sweep needs no slice selection: each open entry is a
slice, scoped when it was deferred. Size decides whether a goal needs a
checklist and how its slices are ordered. `QUALITY.json`'s thresholds schedule
reviews inside a goal and set no ceiling on its size; size never justifies
refusing, deferring, or silently narrowing a stated goal. Start at the first
queued slice.

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
for that stop at all. That count is 0 today; if it is not, fix it before
ranking.

### Ranking the behavior table

**Rank by the look-ahead forecast.** The port is fail-closed: a session earns
no screen past its first stop, so a candidate pays what it unblocks. Start
from `unlocks`, the recorded steps from the boundary to each stopped
session's next unmet behavior, and cap each session's stretch at the first
recorded message implying a second unported or partially ported behavior
inside it. Sum the capped stretches across sessions and take the highest;
break ties by the number of sessions stopped on the boundary. The table's
default order already ranks by `unlocks`, and
`node scripts/scan-sessions.mjs --ahead=<behavior>` prints each stopped
session's message stream for the capping read.

**Read the stretch with a classifier before trusting it.** Hand each
session's `--ahead` stream to a `sonnet-worker` subagent together with the
port's fail-closed boundary list and the supported-command set, and ask for
the first message implying a behavior the port refuses or only partly
supports; that step caps the session's forecast. The classifier errs toward
flagging: an optimistic forecast costs a mis-selected goal, a conservative
one costs ranking precision. A second behavior recurring across many
sessions' stretches is scope the goal should include, priced in from the
start.

### Discounting the forecast

**The raw `unlocks` count is optimistic by construction.** Against three
closed goals it overstated by 5.8, 4.8 and 26 times. It assumes the behavior
is atomic, that nothing the port newly refuses appears, and that every screen
in the gap already matches. Six things break those assumptions:

1. A second behavior can hide inside the gap, invisible because the port stops
   at the first one it cannot do. This caused the 26-fold miss.
2. A command can be partly supported. `executedCommands()` marks a command
   supported once the port runs it, but `eat` succeeds on a ration and refuses
   on a corpse, so the remaining debt is invisible.
3. Porting a behavior can create a refusal that did not exist. `domove()` began
   refusing a mounted hero and cost `seed0104` nine screens it had matched.
4. Goals close in slices, and a slice earns a fraction of what its behavior
   does. Comparing a slice against `unlocks` is a category error.
5. The classifier declines to read some recorded bytes. A command hiding there
   pushes the cap past where it belongs, so the forecast overstates the gain.
6. Screens after the gap can be emitted and wrong. `unlocks` counts distance and
   assumes correctness.

The classifier cap addresses the first two directly; the budget and the
calibration record bound the rest.

**A property the session needs proves too little on its own.** Two recorded
predictions failed this way, and `docs/goal-history.md` preserves both so
nobody re-derives them. The pickup goal was chosen because its behavior
"fires without a player command" and gained one development screen. The trap
goal promised that closing the dart-miss path would unblock `seed1500`,
which stops earlier, on pet cursed-object feedback, with its random-number
prefix unchanged by the slice. Both goals treated a property the session
needs as if reaching it were enough. The sound measurement stays the one
stated above: apply the candidate change and re-run the scan.

`supports` measures dependency breadth. It ranked the descent goal by 3,515
screens that closed as 9 (`125601d`), and stays in the report as context.
