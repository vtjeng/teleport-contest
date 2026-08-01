# Implementation checklist: the hero eats, slice 3

Working record of implementation evidence for slice 3 of the goal `ROADMAP.md`
opened at `7f448a5`, the multi-turn occupation. It supplements the required
source review, tests, fresh differentials, and the workflows in
`.agents/workflow.md` and `.agents/review.md`.

It exists because slice 1 changed roughly 840 production lines and slice 2
changed 534, both past the trigger, and because this slice is the first
occupation the port would own. `allmain.c moveloop_core()` runs every turn, so a
mistake here reaches every scored screen, and not only the eating path.

## Boundary

- Roadmap item: In progress: the hero eats, slice 3, the multi-turn occupation.
- Starting code commit: `02c6e59`.
- Starting event: `doeat()` selects a food whose `oc_delay` gives
  `svc.context.victual.reqtime` greater than 1, so `start_eating()` sets the
  occupation and the meal spans turns. The port refuses there today.
- Ending event: the complete screen and cursor after the last bite completes,
  `done_eating()` runs and the next command prompt is drawn.
- Valid inputs: any seed, datetime, role and option set that puts a food of
  `oc_delay` greater than 1 in the hero's inventory. A food ration is the
  ordinary case.
- Observables: `svc.context.victual.usedtime` advancing once per turn; the
  occupation being set and cleared; `multi` and `nomovemsg`; each turn's
  random-number calls, which must match C call for call across the whole meal;
  the complete 24x80 screens and cursor for every turn of it. The last of those
  turned out to be one screen, not several: `runmode_delay_output()` emits
  nothing while both `context.run` and `multi` are 0, which is what an eating
  occupation runs at, so C reads no key and captures no frame between the first
  bite and the last. The per-turn evidence is therefore the random-number log.
- Exclusions, each to be justified from source in the table below:
  - Interruption. `stop_occupation()` at `allmain.c:684` and the paths that
    reach it, including a monster appearing mid-meal. Refuse it, and say at the
    site which C callers reach it.
  - Corpses and tins, which slices 1 and 2 already refuse.
  - `eatmdone()`, the delayed-instrument callback.

## How the candidate list was built

- Upstream entry points: `allmain.c moveloop_core()` at 485-506, which calls
  `(*go.occupation)()` and clears it when the callback answers 0;
  `allmain.c stop_occupation()` (684); `eat.c eatfood()` (518-541), the
  callback, which increments `usedtime`, answers 1 while busy and calls
  `done_eating(TRUE)` when the meal ends; `set_occupation()`, which installs it.
- Dispatch tables and catalogs: `objects.h` `oc_delay` decides `reqtime` and so
  which foods reach this slice at all. Seven of its `FOOD` rows carry an
  `oc_delay` above 1: the tripe ration and the pancake and the lembas wafer at
  2, the cram ration at 3, the food ration at 5, the enormous meatball at 20,
  and the four globs at 2. The globs are `globby` and the meatball has
  generation probability 0, so five are reachable, and only the food ration,
  the tripe ration and the lembas wafer have a `fprefx()` arm of their own.
  `u_init.c` puts a food ration in six roles' packs and a cram ration in the
  Ranger's, which is what the matrix eats.
- Reachable helpers: `bite()` is ported in `js/eat.js` from slice 2, as are
  `done_eating()` and `state.context.victual`. Absent: `eatfood()`,
  `set_occupation()`, `stop_occupation()`, `reset_occupations()`, and any owner
  for `go.occupation` in `js/allmain.js`. `interrupt_multi()` exists at
  `js/allmain.js:413` and is a no-op today because a run is the only way this
  port reaches a positive `multi`; that changes here.
- JavaScript cross-check: `grep -rln "function <name>" js/` was run for each
  helper above. `grep -rn "occupation" js/allmain.js` returns only
  `interrupt_multi()`'s comment, so no part of the machinery exists yet. The
  worker ran three more searches.
  `grep -rn "occupation" nethack-c/upstream/src/*.c` returns the eleven files
  that own the construct and located `set_occupation()` in `cmd.c`, not
  `allmain.c`, which moves that row's owner to `js/cmd.js`.
  `grep -rn "\.multi\s*=\|nomul(" js/*.js` returns every writer of `multi` in
  the port, which the row below enumerates.
  `grep -rn "export function monster_nearby\|monsterNearby" js/*.js` found
  `hack.c monster_nearby()` already ported at `js/hack.js:326`, so the
  occupation block's interruption test needed no new code.
- Remaining limits: the candidate list was complete for `eatfood()` and for
  `moveloop_core()`'s occupation block, and it missed six candidates that the
  ordinary case reaches. A Valkyrie's food ration crosses 1500 nutrition on its
  fourth bite, so `lesshungry()`'s nearly-full warning and `done_eating()`'s
  `gn.nomovemsg` arm are on the ordinary path rather than beyond it; the same
  meal reaches `fprefx()`'s food ration arm, `done_eating()`'s "You finish
  eating" wording, and through it `food_xname()` and `objnam.c the()`; and
  `newuhs()` and `lesshungry()` each carry a `go.occupation == eatfood` term
  that this slice makes true for the first time. All six are rows below.

## Status values

Assign exactly one status to every row: `done`, `no-effect-yet`, `later`,
`cannot-occur`, `missing`, or `undecided`, as
`.agents/implementation-checklist-template.md` defines them.

## Implementation table

| Upstream function or branch family | Reachability and ordering | JavaScript owner | State, randomness, and output | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| `set_occupation()` (`cmd.c:205-217`) installing `eatfood` | End of `start_eating()` when the first bite leaves `usedtime < reqtime` | `js/cmd.js set_occupation()` | Writes `go.occupation`, `go.occtxt`, `go.occtime` on `state.go`, beside `go.oldcap`. It writes no `multi` and no `nomovemsg`: C's `xtime` arm is what touches `multi`, and eating passes 0 | `scripts/eat-occupation.test.mjs` compares the installed callback with the `eatfood` export and reads back `occtxt` and `occtime`; the whole matrix executes it | `done` | None |
| `set_occupation()`'s `xtime` arm and `cmd.c timed_occupation()` | `doextcmd()` at `cmd.c:3728` needs a count typed before an extended command | `js/cmd.js set_occupation()` | Would install `timed_occupation`, which counts `multi` down | Refused at the site; `runEatCommand()`'s neighbour in `js/cmd.js` already records that this port's boundary parses no such count | `cannot-occur` | None |
| `moveloop_core()`'s occupation block, `allmain.c:485-509` | Every turn while `multi >= 0` and an occupation is set. It returns before `u.umoved = FALSE`, before `rhack()`, and before the trailing `vision_recalc()`, so an occupation turn reads no key | `js/allmain.js moveloop_core()` | Calls the callback, clears `go.occupation` on 0, tests `monster_nearby()`, calls `runmode_delay_output()` and returns | Six recorded segments in `scripts/run-eat-occupation.mjs`; the whole development score is unchanged at 487/7,765 screens and 100,910/610,816 values, which is the check that this block did not disturb the turns it does not own | `done` | None |
| `eat.c eatfood()` (517-541) | The callback | `js/eat.js eatfood()` | Increments `usedtime`; answers 1 while busy; calls `done_eating(TRUE)` past `reqtime` | The matrix, plus a focused test that calls it a second time by hand and reads back `usedtime` | `done` | None |
| `eatfood()`'s `!food` and `!eating` early returns | Before the counter. `!food` needs `food_disappears()` to empty the victual under a live occupation, which only `obfree()` does; `!eating` needs `do_reset_eat()` | `js/eat.js eatfood()` | Both would call `do_reset_eat()` or answer 0 | Each stops with its C reason, and `scripts/eat-occupation.test.mjs` enters all three by hand | `later` | Port with the interruption work |
| `done_eating()` at the last bite | `usedtime > reqtime` | `js/eat.js done_eating()` | Clears `go.occupation` early so `newuhs()` restores the saved status; prints; `fpostfx()`; `useup()`; zeroes the victual | Every matrix segment ends here | `done` | None |
| `done_eating()`'s `gn.nomovemsg` arm and its "You finish eating" arm | The first when `lesshungry()` warned, the second otherwise. Both need `message`, which `reqtime > 1` always supplies | `js/eat.js done_eating()` | One `pline()`; `food_xname(piece, TRUE)` for the second | Recorded in segments 1 and 2 of the matrix; the fire-elemental wording is a transcribed ternary that a Valkyrie's recording pins from the false side | `done` | None |
| `eat.c food_xname()` (215-235) and `objnam.c the()` (2170-2237) | `done_eating()`'s message and `start_eating()`'s `occtxt` | `js/eat.js food_xname()`, `js/objnam.js the()` | Pure | Recorded through both messages; `the()`'s capitalized arm and its two range ends are pinned by a focused test | `done` | None |
| `lesshungry()`'s nearly-full warning (`eat.c:3305-3330`) | `u.uhunger >= 1500` without `Hunger` on a meal not yet warned. A hero at the usual 900 reaches it on a food ration's fourth bite | `js/eat.js lesshungry()` | `pline()`, `gn.nomovemsg`, `victual.fullwarn` | Segment 1 of the matrix records the message, the `--More--` it forces and the closing `gn.nomovemsg`; `scripts/eat-one-turn.test.mjs` pins `fullwarn` from both sides | `done` | None |
| The same warning's `gm.multi = -2` and `paranoid_query()` arms | The first needs no meal in progress, so only fruit juice reaches it and no potion is ported; the second needs `canchoke` and more than one bite left, so the hero must have begun the meal SATIATED | `js/eat.js lesshungry()` | `nomul()` with `afternmv`; a yes/no prompt | Both stop with their C reason and are entered by focused tests | `later` | Port with the interruption work |
| `fprefx()`'s `FOOD_RATION` arm (`eat.c:2124-2135`) | The first bite of a food ration, which is the commonest multi-turn food | `js/eat.js fprefx()` | Up to one `pline()`; no randomness | The silent branch and the `u.uhunger < 700` branch are both recorded (segments 1 and 5). The `u.uhunger <= 200` branch has no recorded case: reaching it needs about seven hundred quiet turns and ten seeds tried at that length all stopped first. A focused test drives `doeat()` against a hand-lowered `u.uhunger` and pins all three wordings and both thresholds | `done` | Record the `<= 200` wording when a case reaches 200 nutrition |
| `fprefx()`'s `TRIPE_RATION` and `LEMBAS_WAFER` arms | The other two multi-turn foods an ordinary pack can hold | `js/eat.js fprefx()` | Tripe needs `more_experienced()`, `newexplevel()`, `rn2(2)` and `make_vomiting()`; lembas needs only two `pline()`s but no case can eat one without reaching the `paranoid_query()` arm above, because 800 nutrition over two bites crosses 1500 | Both stop with their C reason | `later` | Port tripe with the experience work |
| `newuhs()`'s and `lesshungry()`'s `go.occupation == eatfood` terms | Every turn of the meal. Without the first, the once-per-turn `gethungry()` would comment on a hunger boundary that C reports only when the meal ends | `js/eat.js eating_occupation()` | Selects the saving arm of `newuhs()` and `iseating` in `lesshungry()` | Segment 5's meal crosses no boundary, so the terms are pinned by two focused tests that enter each from both sides, and by mutation: removing either term fails the suite | `done` | None |
| `newuhs()`'s `stop_occupation()` on a HUNGRY or WEAK transition (`eat.c:3477`, `3496`) | `incr && go.occupation && go.occupation != eatfood && != opentin` | `js/eat.js newuhs()` | Would stop the occupation | C's own condition excludes `eatfood`, the only occupation this port installs, and the saving arm returns before this arm anyway | `cannot-occur` | None |
| `stop_occupation()` (`allmain.c:684`) and every path to it | Interruption. The reachable path is `moveloop_core()`'s own `monster_nearby()` test; `dogmove.c:386`, `dothrow.c:1046`, `do_wear.c:3254`, `dig.c:1407`, `eat.c:445` and `newuhs()`'s fainting arm are each behind unported code | `js/allmain.js moveloop_core()` | Would print `You stop <occtxt>.` unless `maybe_finished_meal()` finishes the meal, clear the occupation, set `disp.botl` and call `nomul(0)`; `reset_eat()` then sets `victual.doreset` | Refused at the site, naming both C functions. `scripts/eat-occupation.test.mjs` reaches the refusal with seed 5820043, where a monster generated mid-meal walks up to the hero | `later` | Port with the interruption work, together with `doeat()`'s resumed-meal arm |
| `interrupt_multi()` | `gm.multi > 0 && !travel && !run`, from `regen_hp()` and `regen_pw()` | `js/allmain.js:413` | Would call `nomul(0)` and `Norep()` | `set_occupation(eatfood, msgbuf, 0)` passes `xtime` 0, so C's `timed_occupation` arm never runs and nothing writes `multi` during a meal; `moveloop_core()`'s own gate is `multi >= 0`, and the meal runs at exactly 0. So the guard is false on every turn of a meal and the function stays the no-op its comment describes | `cannot-occur` | None |
| Every other writer of `multi` | During the meal | `js/cmd.js` (five sites), `js/hack.js nomul()` and `endRunning()`, `js/detect.js defaultNomulZero()`, `js/allmain.js moveloop_core()` | Each sets or decrements `multi` | The five `js/cmd.js` sites -- the count prefix at 620, `resetCommandVars()` at 763, the run sentinel at 801, the parsed-command restore at 829 and the unknown-command reset at 1291 -- all sit inside `rhack()`, which the occupation block returns before reaching, so none can fire mid-meal. `moveloop_core()`'s own two writes are in the `multi > 0` block below the same return. Three can fire: `automatic_search()` reaches `js/detect.js defaultNomulZero()` on a secret-door find, and `gethungry()` reaches `endRunning()` through `newuhs()`'s HUNGRY and WEAK arms; both write 0 over 0. `nomul()` with a negative value would suspend the meal rather than end it, which is what `moveloop_core()`'s `multi >= 0` gate is for, and its only mid-meal caller is `newuhs()`'s fainting arm, which stops. **No writer clears `multi` and the occupation independently**: C's `nomul()` does not touch `go.occupation` and this port's does not either, and `stop_occupation()`, the one function that writes both, is refused | `done` | None |
| Corpses, tins, `eatmdone()` | | `js/eat.js` | | Refused by slices 1 and 2 | `later` | Keep refused |

## Validation

- Source review: `allmain.c` 470-540 and 683-695, `cmd.c` 170-217 and 3720-3745,
  `eat.c` 215-235, 305-330, 394-420, 517-573, 2091-2213, 2020-2074, 3126-3161,
  3287-3340 and 3361-3510, `hack.c` 4106-4173, `objects.h` 1033-1117 and
  `objnam.c` 2165-2237.
- Focused tests: `scripts/eat-occupation.test.mjs`, eleven tests, each observed
  failing against a break in the line it covers; three assertions added to
  `scripts/eat-one-turn.test.mjs` were observed failing the same way.
- Fresh differentials: `scripts/run-eat-occupation.mjs`, six segments, all
  strict passes -- a five-turn food ration, a three-turn cram ration, two cram
  rations in a row, a five-turn meal watched by a pet, a meal begun below 700
  nutrition, and the five-turn meal again under DECgraphics with a reversed
  message window. C reads no key between the first bite and the last, so a meal
  emits one screen; what covers the turns between is the random-number log,
  which every segment compares over its whole length.
- Uncommitted mutants: 16 sites, 16 killed, 0 survived under
  `npm run mutate -- --worktree --kind relational,logical,boolean
  --whole-suite`.
- Development score: 487/7,765 screens and 100,910/610,816 random-number values,
  unchanged from `02c6e59`. `scripts/scan-stops.mjs` explains why: no
  development session's first fail-closed boundary is owned by `eat` any more,
  so none of them reaches a multi-turn meal before stopping elsewhere.
- Browser check: `.agents/validation.md` exempts a shared-renderer change.

## Readiness

Current readiness: `Ready for audit`

Reason: every row is `done`, `later` or `cannot-occur`. The four `later` rows
are the interruption work the slice boundary excluded, plus the tripe and
lembas wordings; each stops with its C reason at the site.
