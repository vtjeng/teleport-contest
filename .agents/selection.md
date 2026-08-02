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

Our **development-session census** (implemented as
`node scripts/scan-stops.mjs`) replays every development session, records where
the port refuses to continue, and categorizes the refusals in two ways: 1) by
the unported C behavior that stopped the session, identifying the code
required, and 2) by the player command at that step, identifying what the
player was trying to do.

### Running the development-session census

Run the script with no arguments; runs take 1-4 seconds.

For each development session the scan reports the fail-closed boundary, that
is, the first unsupported feature the port reaches, the recorded keystroke the
port refused, that keystroke's command under the session's own bindings, and
C's message on that step. It then groups those rows twice, by boundary and by
refused command. Each census row lists the sessions in that class, the recorded
steps behind the boundary, and the class name. This abridged output comes from
a run at `460f194`:

```
Boundary census (sessions, screens standing behind it)
   9   1950  unsupported hero command: the repeated-command boundary admits ...
   5   1785  unsupported hero command: the extended command 'levelchange' is not ported
   4   2081  simple monster action requires pet ranged targeting

Refused command census
   8   2179  rushsouth
   4    321  (none)
   3    173  runeast
```

`--json` emits, in machine-readable form, the same information reported for
each development session.

The scan reports the screens each session emitted.
`scripts/score-development.mjs` is the authority on how many of those screens
match C's recorded screens.

The scanned directory is fixed and the script accepts no path argument, so it
cannot be aimed at `sessions/holdout/`.

### Reading the census

The census identifies the upstream owner of each stop: the C code whose
behavior the port has not yet reproduced. Trace that code in
`nethack-c/upstream/`. Its output sorts by session count and breaks ties by
step count. That ordering controls display only. It does not rank the rows by
priority. Two rules constrain how to interpret the census's output:

- The steps standing behind a boundary represent an upper bound. They do not
  predict how many steps porting that boundary will unblock. Sessions
  blocked on one owner routinely block again on another, and the keystrokes
  after a stop include prompt answers, count prefixes, and menu selections.
  Not every keystroke after a stop is a command. To measure a candidate
  change, apply it and re-run the scan; the difference between the two runs'
  step counts is the measurement.
- C's message at a stop is a search key. Grep the C source for its text, open
  the function containing it, and port that function; "Implement NetHack
  behavior from source" in `AGENTS.md` states why the message itself specifies
  nothing.

### Ranking candidates

`scripts/scan-debt.mjs` differences each development session's whole recorded
input against the commands the port dispatches. For every behavior it reports
`supports` and `unlocks`, which the report's own legend defines.

**Rank by the look-ahead forecast.** The port is fail-closed: a session earns
no screen past its first stop, so a candidate pays what it unblocks. Start
from `unlocks`, the recorded steps from the boundary to each stopped
session's next unmet behavior, and cap each session's stretch at the first
recorded message implying a second unported or partially ported behavior
inside it. Sum the capped stretches across sessions and take the highest;
break ties by the number of sessions stopped on the boundary.
`node scripts/scan-debt.mjs --by=unlocks` orders the candidates, and
`node scripts/scan-ahead.mjs <behavior>` prints each stopped session's
message stream for the capping read.

**Read the stretch with a classifier before trusting it.** Hand each
session's `scan-ahead` stream to a `sonnet-worker` subagent together with the
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
