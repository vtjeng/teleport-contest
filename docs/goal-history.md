# What the closed goals have carried over

Commit 600113b moved this analysis out of ROADMAP.md on 2026-08-01, when
goal state moved to GOALS.json. This is analysis for goal selection, read
when choosing work, and it is on no mandatory reading path. The falsified
predictions and measured overstatements recorded here are load-bearing: do
not re-derive them.

Twelve goal-closure rows in `SCORE.tsv` carry a holdout figure. Holdout
screens rose by 17, then by 6, then by 21, and the goal that gained 21 is
the one on which a first holdout session passed; after that the pickup,
monster-door and trap goals gained +1, +16 and +8 development screens and
carried nothing. The trap goal's authorized evaluation returned 138 of
3,640 screens, 30,048 of 182,022 random-number values and 1 of 11 sessions,
identical to the three measurements before it.

Three zeros is weaker evidence than it looks. Those three goals were selected
on boundaries blocking 2, 3 and 3 of 33 development sessions. Assume each
holdout session stops on a boundary independently, at the rate that boundary
shows across the 33 development sessions. The chance that none of 11 holdout
sessions stops on a 3-of-33 boundary is then about 0.91^11, near 0.35; across
the three goals the chance of seeing three zeros is roughly 0.06. That
probability is low. The three goals gained +1, +16 and +8 development screens,
so they were plausibly below an 11-session holdout's resolution. Three zeros is
then a statement about effect size. It is not evidence of a broken instrument:
the holdout cannot resolve a goal that small in either direction.

The descent goal tested that reading and contradicted it. Closed on 1
August 2026, it is the largest goal this port has taken: selected on 3,515
screens of `supports` across 8 of 33 sessions, 45% of the 7,765 recorded
development screens, and gated by no role and no prefix. That property
distinguished the two goals whose holdout gain was non-zero. It gained
9 development screens and 5,595 random-number values, and the port now
completes a level transition end to end, with 2,347 of 2,347 descents in
the fresh-seed scan recorded in `scripts/run-leave-level.mjs` reaching a
drawn D:2. The holdout returned 139 of 3,640 screens and 30,048 of 182,022
values: unchanged, digit for digit, from the goal before it. `SCORE.tsv`
records two goal closures between the trap goal and this one. `#ride`
returned 138 of 3,640 screens and 30,048 of 182,022 values, and `eat`
returned 139 of 3,640 screens and the same 30,048 of 182,022 values:
the one screen every evaluation since has repeated.

That is a fourth zero among the goals this file follows, and the size
explanation no longer covers it. The goal's own numbers explain the fourth zero
more simply, and they were available before the holdout ran: 3,515 screens of
`supports` yielded 9 development screens. Every development session that gained
had already been counted, and the 8 sessions the census named still stop. They
now stop on what *follows* a descent, on the step after the boundary the goal
opened.

This finding narrows to `supports`. The instrument measured this behavior
correctly: `supports` ranked it first, and the behavior really was the port's
largest single dependency; the column measures what depends on a boundary,
which is not what porting that boundary earns. Unblocking a boundary moves a
session to the next one. Expect a goal's gain to track the screens between its
boundary and the next stop in the same sessions, which `scripts/scan-sessions.mjs`
reports as `unlocks`, an upper bound. Whoever next selects a goal should treat
a large `supports` as evidence that a behavior is needed. It is not a forecast
of what it will score.

The census cannot count every boundary. It reports the first
fail-closed boundary per development session: the point where the port
ends the segment because the next step needs behavior that is not ported
yet. Within that scope it is accurate. A boundary hidden behind a different
refusal is invisible to it: 20 of 33 sessions stop on an unported hero
command, so everything downstream of a command cannot be counted. Object
squares are the extreme case, the commonest unported destination class
over the 60 freshly generated D:1 levels censused in `GOALS.json` (seeds
7100000-7100059), and the owner of a single census row.

The modeled half of `scripts/scan-sessions.mjs` closes that gap. It reads
each session's whole recorded input, so an owner standing behind a command
is counted where the first-boundary census could not see it. It reports
`supports`, the screens that depend on each owner, and `unlocks`, the
screens porting it next earns. `.agents/selection.md` states how to run it.

Three closed goals have now measured how far `unlocks` overstates: the
trap goal predicted 46 and delivered 8, `#ride` predicted 82 and delivered
17, and `eat`'s first slice predicted 78 for `seed0900` and delivered 3.
The bound held above the delivered figure in all three measurements,
overstating by 5.8, 4.8 and 26 times. The largest of the three ratios came
from `eat`'s first slice, because a session whose whole visible debt is one
command has had the least opportunity to reveal what else it needs.
`.agents/selection.md` therefore ranks candidates by the look-ahead
forecast that starts from `unlocks` and caps each stopped session's
stretch, and lists the six mechanisms that break the bound. `supports`
stays in the `scripts/scan-sessions.mjs` report as context. Do not re-derive
these three ratios.

This file has recorded two predictions and then falsified both. The pickup
goal was chosen on "fires without a player command" and gained +1
development screen and +0 holdout screens. The trap goal stated that
`seed1500`'s dart is a miss and that closing the miss path would unblock
that session; it did not, because `seed1500` stops earlier, on `simple
monster action requires pet cursed-object feedback`, with its
random-number prefix unchanged by the slice. Both goals treated a property
that is necessary for the session to move as sufficient.

Neither error was the instrument's. `scripts/scan-sessions.mjs` reports the
fail-closed boundary each session reaches first, which is what it claims
to report, and `.agents/selection.md` already states that the steps behind
a boundary are an upper bound, that "sessions blocked on one owner
routinely block again on another", and that the only sound measurement is
to apply the candidate change and re-run the scan. The trap goal's trap
types were read from the sessions' recorded top lines. `AGENTS.md` forbids
that move for implementation, and it is no more reliable for selection.
The scan was not the source for those types, and nothing re-ran it against
the candidate before the slice was promised. Do not replace an instrument
for a failure its own documentation already warns about; use it as
written.

The pet-inventory goal was the test of a different selection method, and
it returned the fifth of those zeros. Closed on 1 August 2026, it was
chosen against the population the holdout samples. Earlier goals had been
chosen by `supports`; this one was chosen by that sampled population: over 600
fresh seeds walking 96 keystrokes on D:1, one of three starting-pet
boundaries was the port's first stop in 51 to 53% of walks. The three are
pet inventory, pet ranged targeting and pet combat evaluation, and pet
inventory was the only one that could be closed. It gained 24 development
screens, from 496 of 7,765 to 520 of 7,765, and 722 random-number values.
The holdout returned 139 of 3,640 screens, 30,048 of 182,022 values and 1
of 11 sessions: identical, digit for digit, to the descent goal's result
and to the `eat` goal's result before it. The two goal closures before
those returned 138 of 3,640 screens.

The goal recorded its prediction before the measurement, and the
measurement answered it: a boundary family standing in front of half of
the censused fresh D:1 walks still failed to move an 11-session holdout,
so the fresh-population census is no better than `supports`, the column it
replaced. `.agents/selection.md` admits a fresh census only to nominate a
candidate; do not promote it there to a ranking rule, and do not treat a
large fresh-population incidence as a forecast of holdout gain any more
than a large `supports`.

The generalization-failure protocol in `.agents/scoring.md` is not
triggered. It runs only where a review confirms behavior special-cased to
a recorded session or hardcoded, and this goal ported whole C functions:
`relobj()`, `mdrop_obj()`, `extract_from_minvent()`, `flooreffects()`, and
`stackobj()`. Each was validated against seeds recorded fresh for the
purpose. Nothing here was fitted to a development session.

Five zeros support one account of the holdout: its counts move only
where the port gains behavior it cannot yet perform at all. Where a goal
improved behavior the port already performs, the counts held. If four
of the eleven holdout sessions all stopped at a single boundary, the
aggregate would not shift by one screen until that boundary opened. The
next selection should ask which boundary, if any, stands in front of many
sessions at once that resemble the eleven hidden holdout sessions. No
instrument in this repository reports that directly.

`apply-tool-command` closed on 6 August 2026 and is the sixth zero. It ported
`apply.c doapply()`'s entry with its stethoscope and lock-pick arms, forecast
26 steps, and delivered 25 development screens and 104 random-number values,
taking `seed0077-rogue-chargen` to 33 of 33 and the port to two fully matched
development sessions. The holdout returned 195 of 3,640 screens and 32,614 of
182,022 values, identical digit for digit to the evaluation before it. The
boundary stopped 2 of 33 development sessions, and each was gated on a starting
pack -- the Healer's stethoscope, the Rogue's lock pick -- so it sits behind a
role as well as behind a command.

The question the paragraph above leaves open is now settled, and not by a new
instrument. The user decided on 6 August 2026 that ranking stays on the
development look-ahead forecast and that the holdout's job is to catch a
significant inadvertent regression. `.agents/selection.md`, "Ranking the
behavior table", carries that rule; this file keeps the measurements behind it.
Six zeros remain consistent with the effect-size reading given above: this
goal's 25 screens are 0.3% of the recorded development total.

`options` closed on 7 August 2026 and is the seventh zero, and it is the one
that tests the account above rather than confirming it. That account reads the
zeros as effect size: "the counts move only where the port gains behavior it
cannot yet perform at all." This goal did gain such a behavior. Before it the
port could not display an options menu at all; after it, `O` builds seven
pages, applies eight boolean picks, and runs a class menu through
`choose_classes_menu()`, with two new ported files and 395 new random-number
calls. It delivered 29 development screens against a forecast of 30, the
largest single-goal gain since the descent goal. The holdout returned 195 of
3,640 screens and 32,614 of 182,022 values, identical digit for digit to the
four evaluations before it.

So a wholly new capability is not sufficient either. What distinguishes
`options` is that it is reached only by typing `O`, and exactly one of the
thirty-three development sessions does. The boundary was ranked on that one
session's stretch, which is what `.agents/selection.md` prescribes and what the
user reaffirmed on 6 August 2026. The runner-up that day, pet melee combat,
was the first stop in 102 of 600 fresh D:1 walks; the selector proposed
admitting that census as a tiebreak and the proposal was declined, on the
ground that the fresh census predicts breadth across unseen play, which is the
holdout's job rather than the ranking's.

That decision stands and this entry is not an argument against it. It records
the price: ranking on development look-ahead selects boundaries the recorded
players happened to reach, and a boundary reached by one rare keystroke cannot
move an eleven-session holdout however much behavior it adds. Seven zeros now
say that about effect size, capability, and reachability in turn.

`twoweapon-command` closed on 7 August 2026 and is the eighth zero. It met its
forecast exactly -- 25 steps predicted, 25 delivered, `seed0107` from 15 to 40
of 98 screens -- and the holdout returned 195 of 3,640 screens and 32,614 of
182,022 values, identical to the four evaluations before it.

This one adds nothing to the account and that is the point. `options` tested
capability and found it insufficient; this goal is smaller, gated on a single
extended command that one of thirty-three development sessions issues, and the
zero it returns is what the reachability reading already predicted. Recorded so
nobody re-derives it.

What the goal is worth is not in the holdout column. Its second slice earned no
development screens at all, by construction: every one of `can_twoweapon()`'s
refusal arms needs a role the contributing session does not have. It was worth
running because the goal's boundary named those arms, and closing on the
forecast alone would have filed the goal complete with a documented gap inside
its own scope. The evidence that they are correct is fourteen fresh C segments
across seven roles -- 42,032 random-number calls and 243 screens -- which no
score column records.
