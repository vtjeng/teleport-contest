# What the closed goals have carried over

Moved from ROADMAP.md on 2026-08-01 when goal state moved to GOALS.json.
This is analysis for goal selection, read when choosing work, and it is
on no mandatory reading path. The falsified predictions and measured
overstatements recorded here are load-bearing: do not re-derive them.

### What the closed goals have carried over, and what to make of it

Seven goals now have holdout results. The run was +21 screens, then +17, then a
first passing holdout session; after that the pickup, monster-door and trap
goals gained +1, 0 and +8 development screens and carried **nothing**. The trap
goal's authorized evaluation returned 138 of 3,640 screens, 30,048 of 182,022
random-number values and 1 of 11 sessions, identical to the three measurements
before it.

**Three zeros is weaker evidence than it looks.** Those three goals were
selected on boundaries blocking 2, 3 and 3 of 33 development sessions. Under
the census's own model, the chance that none of 11 holdout sessions stops on a
3-of-33 boundary is about 0.91^11, near 0.35; across the three goals the chance
of seeing three zeros is roughly 0.06. That is low but not damning, and
combined with the 1 to 8 screens each unblocked development session actually
gained, the last three goals were plausibly below an 11-session holdout's
resolution. Three zeros is then a statement about effect size, not proof of a
broken instrument, and the honest reading is that the holdout cannot resolve a
goal that small either way.

**The descent goal was the test of that reading, and it failed it.** Closed on
1 August 2026, it is the largest goal this port has taken: selected on 3,515
screens of `supports` across 8 of 33 sessions, 45% of the whole recorded
population, gated by no role and no prefix — the property that distinguished
the two goals whose holdout gain was non-zero. It gained 9 development screens
and 5,595 random-number values, and the port now completes a level transition
end to end, with 2,347 of 2,347 censused descents reaching a drawn D:2. **The
holdout returned 139 of 3,640 screens and 30,048 of 182,022 values: unchanged,
digit for digit, from the goal before it.**

That is a fourth zero, and the size explanation no longer covers it. What the
goal's own numbers say is simpler and was visible without the holdout: 3,515
screens of `supports` yielded 9. Every development session that gained had
already been counted, and the 8 sessions the census named still stop — now on
what *follows* a descent rather than on the descent itself.

**The lesson is about `supports`, not about the instrument being broken.** It
ranked this behavior first and the behavior really was the port's largest
single dependency; the column measures what depends on a boundary, which is not
what porting that boundary earns. Unblocking a boundary moves a session to the
next one. Expect a goal's gain to track the screens between its boundary and
the *next* stop in the same sessions, which no column currently reports, rather
than the screens behind it. Whoever next selects a goal should treat a large
`supports` as evidence that a behavior is needed, not as a forecast of what it
will score.

**The census is censored rather than wrong.** It measures the first fail-closed
boundary per development session, which is exactly the right quantity, but a
boundary hidden behind a different refusal is invisible to it: 23 of 33
sessions stop on an unported hero *command*, so everything downstream of a
command cannot be counted. Object squares are the extreme case, the commonest
unported destination on a generated level and the owner of a single census row.

`scripts/scan-debt.mjs` closes that gap. It reads each session's whole recorded
input, so an owner standing behind a command is counted where the first-boundary
census could not see it, and it reports the screens that depend on each owner
and the screens porting it next earns. `.agents/selection.md` states how to run
it.

Three closed goals have now measured how far `unlocks` overstates: the trap
goal predicted 46 and delivered 8, `#ride` predicted 82 and delivered 17, and
`eat`'s first slice predicted 78 for `seed0900` and delivered 3. The bound has
never been violated and it overstates by 4.8 to 26 times, worst where it looks
best, because a session whose whole visible debt is one command has had the
least opportunity to reveal what else it needs. `.agents/selection.md` therefore
filters on `unlocks` and ranks by `supports`, and lists the six mechanisms that
break the bound. Do not re-derive these three ratios.

**Two predictions this file has recorded and then falsified.** The pickup goal
was chosen on "fires without a player command" and gained +1 development and +0
holdout. The trap goal stated that `seed1500`'s dart is a miss and that closing
the miss path would unblock that session; it did not, because `seed1500` stops
earlier, on `simple monster action requires pet cursed-object feedback`, with
its random-number prefix unchanged by the slice. Both errors share a shape: a
property that is necessary for the session to move but not sufficient.

Neither error was the instrument's. `scripts/scan-stops.mjs` reports the
fail-closed boundary each session reaches **first**, which is what it claims to
report, and `.agents/selection.md` already states that the steps behind a
boundary are an upper bound, that "sessions blocked on one owner routinely
block again on another", and that the only sound measurement is to apply the
candidate change and re-run the scan. The trap goal's trap types were read from
the sessions' **recorded top lines** instead of from the scan, which is the
move `AGENTS.md` forbids for implementation and is no more reliable for
selection, and nothing re-ran the scan against the candidate before the slice
was promised. Do not replace an instrument for a failure its own documentation
already warns about; use it as written.

**The pet-inventory goal was the test of a different selection method, and it
returned the fifth consecutive zero.** Closed on 1 August 2026, it was chosen
against the population the holdout actually samples rather than by `supports`:
over 600 fresh seeds walking 96 keys on D:1, a starting-pet boundary was the
port's first stop in 51 to 53% of walks, and pet inventory was the only one of
the three that could be closed. It gained **24 development screens**, 496 to
520 of 7,765, and 722 random-number values. **The holdout returned 139 of 3,640
screens, 30,048 of 182,022 values and 1 of 11 sessions — identical, digit for
digit, to the descent goal's result and the three before it.**

The goal recorded its prediction before the measurement, and the measurement
answered it: a boundary family standing in front of half of all fresh D:1 walks
still failed to move an 11-session holdout, so **the fresh-population census is
no better than the column it replaced**. Do not write that method into
`.agents/selection.md`, and do not treat a large fresh-population incidence as a
forecast of holdout gain any more than a large `supports`.

The generalization-failure protocol in `.agents/validation.md` is **not**
triggered. It runs only where a review confirms behavior special-cased to a
recorded session or hardcoded, and this goal ported whole C functions —
`relobj()`, `mdrop_obj()`, `extract_from_minvent()`, `flooreffects()`,
`stackobj()` — each validated against seeds recorded fresh for the purpose.
Nothing here was fitted to a development session.

What five zeros now say together is that the holdout moves on what the port
*cannot yet do at all*, not on what it does slightly better. Four of the eleven
holdout sessions could be stopped at a single boundary and the aggregate would
not shift by one screen until that boundary opened. The next selection should
ask which boundary, if any, stands in front of many holdout-shaped sessions at
once — and accept that no instrument in this repository can see that directly,
which is the honest state of the problem rather than a gap to paper over.
