# Choosing what to implement next

Read this file when deciding which behavior to port next: which goal to open
inside the current milestone, and which slice of that goal comes first.
`.agents/workflow.md` defines a milestone, a goal, and a behavior slice, and
states the evidence that closes a behavior slice and the review a closed goal
triggers.

## Reading the census

A fail-closed boundary is a point where the JavaScript port ends the segment
because the next step needs behavior that is not ported yet.

Run `node scripts/scan-stops.mjs`. For each development session it reports the
fail-closed boundary the port reaches first, the recorded keystroke the port
refused, that keystroke's command under the session's own bindings, and C's
message on that step. It then prints a boundary census and a refused-command
census, carrying the count of recorded steps standing behind each one; the two
together are the census this file refers to below. `--json` emits, in
machine-readable form, the same information reported for each development
session.

The census names the upstream owner of each stop: the C code whose behavior
the port has not yet reproduced. Trace that code in `nethack-c/upstream/`. Its
output sorts by session count and breaks ties by step count. That ordering
controls display only. It does not rank the rows by priority. Two rules
constrain how to interpret the census's output:

- The steps standing behind a boundary state an upper bound. They do not
  predict how many steps porting that boundary will unblock. Sessions
  blocked on one owner routinely block again on another, and the keystrokes
  after a stop include prompt answers, count prefixes, and menu selections.
  Not every keystroke after a stop is a command. To measure a candidate
  change, apply it and re-run the scan; the difference between the two runs'
  step counts is the measurement.
- C's message at a stop points at the upstream owner to trace. It is not a
  specification; "Implement NetHack behavior from source" in `AGENTS.md`
  states how to port the behavior the message points at.

The scan reports the screens each session emitted. `scripts/score-development.mjs`
is the authority on how many of those screens match C's recorded screens.

The scanned directory is fixed and the script accepts no path argument, so it
cannot be aimed at `sessions/holdout/`.

## Choosing a goal

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
message stream for the capping read. `supports` measures dependency breadth,
and ranked the descent goal by 3,515 screens that closed as 9 (`125601d`); it
stays in the report as context.

**Read the stretch with a classifier before trusting it.** Hand each
session's `scan-ahead` stream to a `sonnet-worker` subagent together with the
port's fail-closed boundary list and the supported-command set, and ask for
the first message implying a behavior the port refuses or only partly
supports; that step caps the session's forecast. The classifier errs toward
flagging: an optimistic forecast costs a mis-selected goal, a conservative
one costs ranking precision. A second behavior recurring across many
sessions' stretches is scope the goal should include, priced in from the
start.

**Record the forecast when the goal opens and the delivery when it closes.**
Write the capped forecast and the sessions it covers into `ROADMAP.md` with
the goal entry. At close, compare with
`node scripts/score-log.mjs --since <opening sha>` and record delivered
against forecast beside the goal's evidence. Retire a ranking statistic from
selection when its last three goals each delivered less than a tenth of its
forecast, until it is recalibrated against those closes. The goal budget in
`.agents/workflow.md`, "Continuous operation", bounds what a missed forecast
can cost.

**A fresh census can nominate a candidate the recorded sessions cannot.** A
behavior no development session stops on first can still be the most common
first stop for fresh seeds: a census of 600 fresh D:1 walks recorded at
`a6b32bd` found 67 stopping on `pet combat evaluation` as their earliest
boundary, while its `unlocks` stood at 0. Before opening a goal on a
fresh-census boundary, record the census that justifies it in the goal entry.

**The raw `unlocks` count is optimistic by construction.** Against three
closed goals it overstated by 5.8, 4.8 and 26 times. It assumes the behavior
is atomic, that nothing the port newly refuses appears, and that every screen
in the gap already matches. Six things break those assumptions:

1. A second behavior hidden inside the gap, invisible because the port stops at
   the first one it cannot do. This caused the 26-fold miss.
2. Partial support. `executedCommands()` marks a command supported once the port
   runs it, but `eat` succeeds on a ration and refuses on a corpse, so the
   remaining debt is invisible.
3. Porting a behavior can create a refusal that did not exist. `domove()` began
   refusing a mounted hero and cost `seed0104` nine screens it had matched.
4. Goals close in slices, and a slice earns a fraction of what its behavior
   does. Comparing a slice against `unlocks` is a category error.
5. The recorded bytes the classifier declines to read. A command hiding there
   makes the next behavior look later than it is.
6. Screens after the gap can be emitted and wrong. `unlocks` counts distance and
   assumes correctness.

The classifier cap addresses the first two directly; the budget and the
calibration record bound the rest. Re-run the scan after the change to
measure the real gain.

A milestone labels the system a behavior belongs to. It orders no work: take the
top behavior whatever milestone names it.

A goal may be larger than one agent session. When it is, it closes through
several behavior slices, each closed on its own. A goal may list slices it is
known to need, and it does not have to: the slice-selector identifies each slice
in turn while the goal is in progress. The thresholds in `QUALITY.json`
schedule reviews inside a goal; they do not limit how large a goal may be.
Size decides whether a goal needs a checklist and how its slices are ordered.
Size never justifies refusing a stated goal, deferring it, or narrowing it
silently. Start at the first queued slice.

The agent selecting work chooses the goal. Do not ask the user which goal to
take.

## Keeping the roadmap short

`ROADMAP.md` holds only open work. Delete a goal or milestone from
`ROADMAP.md` when that goal or milestone closes: its score evidence stays in
`SCORE.tsv`, its review metadata in `QUALITY.json`, and its implementation
history in Git. Every task starts by reading `ROADMAP.md`, so it has to stay short enough
to read.
