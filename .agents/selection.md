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
input against the commands the port dispatches. For every owner it reports two
figures: `gated`, the screens a port matching all 7,765 recorded screens would
lose without that owner, and `advance`, the screens porting it next earns.

Run `node scripts/scan-debt.mjs` and take the owner at the top. The report
orders by `advance`. `--by=gated` reorders it by total dependency.

An owner with a high `gated` and an `advance` of 0 sits behind another owner. It
becomes a candidate once the owner ahead of it lands.

`advance` states an upper bound. The port stops at a session's first behavioral
owner and reports nothing behind it, so a gap measured to the next command can
hide a behavioral gate. Re-run the scan after the change to measure the gain.

A milestone labels the system an owner belongs to. It orders no work: take the
top owner whatever milestone names it.

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
`SCORE.md`, its review metadata in `QUALITY.json` and the formal-pass reports
that `.agents/review.md` requires retaining, and its implementation history in
Git. Every task starts by reading `ROADMAP.md`, so it has to stay short enough
to read.
