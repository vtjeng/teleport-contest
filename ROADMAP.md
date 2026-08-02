# Source-faithful port roadmap

This file records the goal in progress, the goals selected after it, and
unresolved debt. It holds state, not rules. `AGENTS.md` remains the authority
for implementation, validation, holdout, quality, and attribution rules, and
`.agents/selection.md` states how `scripts/scan-debt.mjs` selects a goal, how a
goal is sized, and how this file is kept short.

## Exploration

Movement beyond the first unobstructed step, then running, search, doors, traps,
pickup, stairs, terrain effects, vision, and status updates. This is what a hero
does moving around a level before fighting or using items. The heading labels
the system these goals belong to and orders nothing; `scripts/scan-debt.mjs`
selects each goal from every owner the development sessions need.

Every session and step count written into a goal below is a ceiling taken from
the measurement that selected that goal, and goes stale as the port advances;
re-run `scripts/scan-debt.mjs` for current numbers. Traced source findings do
not go stale, which is why they are recorded here rather than re-derived.

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

### Queued: the hero walks onto a floor square holding more than one object

Set aside on 31 July 2026 when `scripts/scan-debt.mjs` landed. The scan rates
this behavior 383 screens of `supports` and 61 of `unlocks` in one session,
`seed0004-feeding-pony`, against 188 for `#levelchange`. Slice 1 was drafted and
never validated; that draft is parked on the branch `wip/object-pile-window` and
no line of it is verified against the C source.

A walking hero steps onto a square holding two or more objects with
`!autopickup`. `pickup.c pickup()` takes its `(autopickup && !flags.pickup)`
early return into `check_here(FALSE)`, the run stops, and `invent.c
look_here()` opens the `Things that are here:` window.

In scope: the `look_here()` branches reachable when the square holds more than
one object and no guard requiring `Blind`, `u.uswallow`, `is_pool`/`is_lava`,
`visible_region_at()`, a seen trap, `will_feel_cockatrice()` or a nonzero
`dfeature_at()` holds -- the `otmp->nexthere` window (`invent.c:4288-4313`) and
the `skip_objects` count line (`4251-4276`) that `flags.pile_limit` selects --
plus `pickup()`'s no-autopickup arm and its `nomul(0)` run stop. Excluded:
`autopick()` and `pickup_object()`, the whole autopickup arm.

`invent.c look_here()` (4104-4315) is already ported apart from those two
branches, and `js/pickup.js check_here()` is live at `js/hack.js:1158` behind
`domove_core()`, so the consumer exists. The work is widening
`requireSimpleHeroDestination()` (`js/hack.js:414-444`) and finishing
`look_here()`'s `'the object-pile menu'` throw at `js/invent.js:454`. Roughly
150 new C lines, two or three slices.

**Why it was selected, and what replaced that reasoning.** Over 60 freshly
generated D:1 levels (seeds 7100000-7100059) the port produces 19.4 squares
holding an object per level, in 100% of levels, and 1.28 squares holding a
*pile*, in 72%, against 1.12 traps, 0.75 fountains and 0.10 sinks. Object
squares outnumber every other unported destination class by an order of
magnitude, and 20 of 33 development sessions set `!autopickup`. That argument
measured incidence on a generated level, which no development session samples.
`scripts/scan-debt.mjs` measures the recorded sessions themselves and reaches a
different answer: one session needs this owner, and it earns 61 screens there.

`seed0004-feeding-pony` stops here at 26 of 409 steps.

**The `flush_screen()` question, traced but not yet recorded.** Whether the
pile window trips the menu-erasure defect under `## Unresolved` was left open
when this goal was queued. A source trace says it does not. `pline.c:274`'s
`if (u.ux) flush_screen()` is the only such call inside `vpline()`, and between
`create_nhwindow()` and `destroy_nhwindow()` at `invent.c:4288-4313` there is
no `pline()`, `You()` or `There()` -- only `putstr()`, `doname_with_price()`
and `display_nhwindow()`. `check_here()`'s own `flush_screen(1)`
(`pickup.c:451`) runs before the window opens. The one message that can follow
is `read_engr_at()`'s, after `destroy_nhwindow()` has already repaired the
corner through `docorner()`, and `js/hack.js:453` refuses an engraving on an
admitted square regardless. The defect's two known victims are menu *search*
prompts, which a window with no menu items cannot reach. That is a trace, not
evidence; slice 1's differential converts it, and converts it automatically,
because a wrong reading shows up as a mismatched pile screen.

**Slices.**

1. *The window itself.* A walking hero's one-square step onto a ROOM or CORR
   square holding two to four objects, ending at the dismissed
   `Things that are here:` window and the next command prompt. Upstream:
   `look_here()`'s final `else` arm (`invent.c:4288-4313`) and its tty
   realization -- `wintty.c tty_putstr()`'s NHW_MENU case (2360-2410, with
   `compress_str()` and the `n0 > CO` line break), `tty_display_nhwindow()`'s
   NHW_MENU arm, `dmore()`, and `tty_dismiss_nhwindow()` into
   `erase_menu_or_text()`'s `docorner(offx, maxrow + 1, 0)`.
2. *The count line.* `skip_objects` at `invent.c:4251-4276`
   (`There are two/a few/several/many objects here.`), which `flags.pile_limit`
   selects, plus explicit non-default settings including `pile_limit:0` and
   `pile_limit:1`. Message only; no window, and none of slice 1's rendering.
3. *A pile on a decorated square.* Lifting `js/hack.js:445`'s
   `terrain feature description` refusal for a staircase or doorway holding a
   pile, which adds the `dfeature` header `putstr()` pair at 4291-4294 and its
   blank separator. This merges with the separately listed hero-destination
   stop for a decorated square holding an object, whose `dfeature_at()` and
   `stairs_description()` are ported already.

The count line is second rather than first because the default `pile_limit` is
5: an ordinary walk meets a two-to-four pile, and a pile of five or more is the
rarer case that "complete common gameplay first" defers.

**Where slice 1's difficulty sits: rendering, not game logic.** Three traced
hazards, recorded here because each is invisible until it is fatal.
`tty_display_nhwindow()` routes this NHW_MENU to `process_text_window()`
because `cw->data` is non-NULL, while still using *menu* geometry --
`offx = max(10, cols - maxcol - 1)`, `offy = 0`, `dmore()` offset 2 and the
`(end)` prompt -- so neither `renderTtyMenu()` nor `displayTtyTextWindow()` is
the right donor alone; the port needs the first one's layout and the second
one's line loop. `maxcol` is `strlen(str) + 1` after `compress_str()`,
maximized over every line including the heading, and one character off shifts
the window a column and misses every cell in it, discontinuously, because
`offx === 10` flips to a full-screen clear. And `tty_putstr()` splits a line
wider than `CO` at the last space before column 79 and re-submits it, adding a
row and changing `maxcol`, before `display_nhwindow()` computes any layout.
`js/tty_menu.js:340` `displayTtyTextWindow()` hardcodes `offx = 0`;
`dismissTtyMenu()` (`js/tty_menu.js:278-311`) already models the
`maxrow + 1` repair that erases the `(end)` row, and is the better donor for
it. `display_nhwindow(WIN_MESSAGE, FALSE)`'s
`toplin == TOPLINE_NEED_MORE -> more()` arm has no owner in the port at all.
