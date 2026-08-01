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

Six goals now have holdout results. The run was +21 screens, then +17, then a
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

### In progress: the hero descends a staircase

`scripts/scan-debt.mjs --by=supports` rates `down` 3,515 screens of `supports`
across 8 of the 33 development sessions, the largest single dependency in the
set at 45% of the whole recorded population, with `unlocks` of 25. It is the
highest-`supports` behavior with a nonzero `unlocks`, which is the rule
`.agents/selection.md` states.

**This goal is larger than any taken so far, and the entry says so up front.**
`do.c dodown()` is 164 lines, but it ends in `goto_level()`, which is 520. That
function generates or restores the destination level, moves the hero and every
carried thing onto it, and rewrites most of the game state. Nothing in the port
does any of it: `dodown()`, `goto_level()` and `schedule_goto()` are all absent,
and only `stairway_at()` in `js/stairs.js` and `on_level()` in `js/dungeon.js`
exist. Expect several slices and at least one implementation checklist.

**Why it is still the right goal.** Eight sessions cannot finish without it and
it gates nearly half the recorded screens. Every role uses stairs, so no role
and no prefix gates it, which is the property that distinguished the two goals
whose holdout gain was non-zero. Its `unlocks` of 25 is small, and
`.agents/selection.md` records why that column does not rank.

**Slices. The first two are closed; their entries record what they measured.**

1. *The refusal boundary and the descent decision.* **Closed at `6d7aedd`.**
   `dodown()` from entry through the tests that decide whether the hero
   descends at all, ending at the point where it would call `goto_level()`.
   It earned no development screens: no session presses `>` where the refusal
   answers, so its evidence is the eight fresh segments in
   `scripts/run-descend-refusal.mjs`.
2. *Leaving the level.* **Closed at `bb4ef50`.** `goto_level()`'s opening: the
   guards, the context discard at 1601-1622, `keepdogs(FALSE)` at 1624 and
   `vision_recalc(2)` at 1631, ending before the destination is chosen.
   Closing it needed more than the line range above: `dodown()`'s own tail
   (1242-1292) and nine helpers across seven C files came with it, and
   `keepdogs()` did **not** need a slice of its own — `js/dog.js
   migrate_to_level()` had folded `mon_leave()` and `relmon()` into one
   function, and splitting them back out cost about 130 lines in that file.
   Three C calls in this phase have no port location to write, each recorded
   in a comment at its site: `reset_trapset()`'s `gt.trapinfo` and
   `iflags.travelcc`, and `recalc_mapseen()`'s `mapseen` chain.
3. *Arriving on a newly generated level.* **Closed at `1cd7c32`.**
   `goto_level()` 1692-1998 entire, so the hero presses `>` on D:1 and arrives
   on a D:2 the port generated. It gained one screen and 5,465 matched
   random-number calls in `seed0015-valk-level2-pit-dog-wait`; the calls are
   the real signal, being the first evidence that `js/mklev.js` generates a
   level correctly against a live game rather than a fixture.
   **The boundary took three attempts, and only a recording settled it.** This
   entry first ended the slice at `docrt()`, then at `goto_level()`'s return.
   Both were wrong. `docrt()` calls `cls()`, whose
   `display_nhwindow(WIN_MESSAGE, FALSE)` stops for a `--More--` over the level
   being *left*, `Dlvl:1` still on the status line; D:2 appears only once that
   prompt is dismissed. `scripts/run-leave-level.mjs` is strict
   `runFreshMatrix()` again at nine segments, and
   `scripts/leave-level-matrix.test.mjs` is deleted with the prefix verdict it
   pinned.
4. *Returning to a level already visited.* `getlev()`, absent. Out of scope
   until a session climbs back up: a first descent generates, and no recorded
   session descends twice. Slice 3 settled what `savelev()` owes: a port that
   writes no level file still owes its FREEING half, ported in `js/save.js`,
   because a D:1 corpse's rot timer and a D:1 candle's light would otherwise
   follow the hero to D:2.

**This goal is not closed.** `mklev()` had never run below D:1 before slice 3,
and depth two reaches statements depth one does not: `mk_knox_portal()` and,
decisively, `makelevel()`'s shop arm. A hero who cannot reliably reach the
level below has not finished descending a staircase, and
`.agents/selection.md` forbids narrowing a stated goal silently, so the shops
are this goal's work rather than a new goal.

**How often the shop arm fires, corrected.** This entry said "about half of
reachable D:2 levels". That was wrong. `makelevel()`'s shop test ends in
`rn2(u_depth) < 3`, and at depth two `rn2(2)` is 0 or 1, so the arm fires on
*every* D:2 with enough rooms. What varies is whether any room passes
`mkshop()`'s search: over 4,000 fresh seeds scanned for slice 5, 189 descents
reached a shop.

**The shop slices, ordered by how often the roll reaches them.** The shares are
exact, read from `shknam.c shtypes[]`'s `prob` column rather than sampled.

5. *The commonest shops.* **Closed at `3d8858c`.** `mkshop()`'s tail from the
   `!sroom->rlit` lighting loop through `needfill = FILL_NORMAL`, with
   `shtypes[]` generated whole from source by `scripts/generate-shtypes.mjs`
   and checked by a sixth generated-data check. General store, armor and
   weapon shops stock, 61% of rolls; the other nine rows refuse by name. It
   also restored `scripts/scan-debt.mjs`, which had stopped running entirely
   once slice 3 made `mkshop()` reachable, by adding
   `UnsupportedSpecialRoomError` to `js/jsmain.js`'s fail-closed boundary
   list. Two corrections it made to this entry's assumptions: the general
   store's table record was **absent**, not present as the plan assumed, and
   `shkinit()` was missing C's two `mongets()` arms, so the port had never
   spent the `rn2(5)` that `shknam.c:684-687` draws for every general store.
   The `||` chain short-circuits, which is why the two pre-existing themed
   shops never exposed it.
6. *The remaining name lists.* **Closed at `fdab09e`.** The liquor emporium,
   jewelers and hardware store, with `nameshk()`'s `shktools` arm
   (`shknam.c:518-520`), 16%. Nothing else needed porting: `get_shop_item()`
   already walked a three-entry `iprobs[]`, and `mkobj_at()` already made
   potions, rings, gems, amulets and tools. It killed both mutation survivors
   this list handed it, on the `mongets(SCR_CHARGING)` chain.
   **A scoping correction: this slice was written as "scroll, potion, ring and
   tool shops", and the scroll shop does not belong to it.** The scroll shop
   *is* the second-hand bookstore, sharing the `shkbooks` name list with rare
   books, so its 10% and rare books' 3% are slice 7's 13%. The 16% is exactly
   the three rows above.
7. *Bookstores.* **Closed at `a61ffab`.** The second-hand bookstore and rare
   books, which share `shkbooks`, with `mkshobj_at()`'s 3.6 tribute arm
   (`shknam.c:461-468`), 13%. Nothing else needed writing: `get_shop_item()`
   already walked both `iprobs[]` pairs, `mkobj_at()` already made scrolls and
   spellbooks, and `js/obj.js mksobj()` already carried the `SPE_NOVEL`
   finalization that draws the title through `noveltitle()`. Two questions it
   settled for slice 8: neither `js/makemon_create.js` refusal is reachable
   from a bookshop, because both rows list only non-negative class itypes; and
   the mimic arm closed at `43445e9` is reached by ordinary stocking rather
   than by `SPE_NOVEL`, confirmed at seeds 7500385 and 7515159, which disguise
   mimics as a scroll and a spellbook.
   Two values are set and unobservable, recorded so nobody hunts them: the
   `artif` argument to `mksobj_at(SPE_NOVEL, ...)` is dead, because `mksobj()`
   reads it only inside `mksobj_init()` which `init` false skips and a novel is
   not `oc_unique`; and `svc.context.tribute.bookstock` is not persisted across
   segments, which no case can observe while `mkshop()` makes at most one shop
   per level.
8. *Deli, wand and health-food shops.* These need `mkshobj_at()`'s
   negative-`otyp` `mksobj_at()` path and `shkveg()`, `veggy_item()` and
   `mkveggy_at()`, 10%.

Slices 6 to 8 inherit two mutation survivors from slice 5: `js/shknam.js:259`
and `:260`, the first two clauses of the `mongets(SCR_CHARGING)` chain, which
compare against the still-refused `shktools`, `shkwands` and `shkrings` and so
are false for every shop that stocks today.

**Expect the shop slices to earn no development screens.** No development
session stops at `mkshop()`; replaying every session's whole recorded input,
exactly one reaches it at all, `seed0030-ten-diverse-deaths`, in a segment
after its first stop at step 8 of 1,953. Slice 5 bore that out, moving 54
random-number values in that session alone and no screens anywhere. The gain is
the goal's closure and whatever carries to the holdout.

**One hazard no random-number log can catch, still live for slices 6 to 8.**
The type roll is `for (j = rnd(100), i = 0; (j -= shtypes[i].prob) > 0; i++)`:
an off-by-one shifts every shop type by one while drawing the same single
number, so only a screen comparison finds it. `nameshk()` is the same hazard
from the other side, deriving the keeper's name from `ubirthday` and `m_id`
and drawing nothing at all.

**Two loose ends this goal still owns.** Slice 3 connected `u_collide_m()`
without a recorded case: it needs a monster standing on D:2's up staircase,
which appeared in none of the fresh cases scanned, and the function is not
exported, so nothing pins it. And the `--More--` above means a descending
segment ends with a space, not with `>`; any later matrix over this path
inherits that. `mk_knox_portal()` needs no work: it is ported through its
`u_depth > 10` gate at `js/mklev.js:613-636` and returns silently at depth 2.


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

## Explicit future exploration work

- Riding movement and riding combat, which is where `seed0104-knight-ride-combat`
  stops now. `domove()` refuses a mounted hero: C carries the steed through
  `stucksteed()`, the `<mx,my>` updates, `exercise_steed()` and `u_on_newpos()`,
  none ported, and that refusal costs that session nine screens it would
  otherwise match. Whoever takes it inherits one traced constraint worth not
  re-deriving: **only a Knight can reach a saddled steed at all.**
  `dog.c:263-268` puts a saddle on a starting pet only when
  `pettype == PM_PONY`, `role.c:209` gives that `petnum` to the Knight alone,
  and `u.uroleplay.pauper` suppresses the saddle even then. Every other route to
  a tame saddled monster needs `#apply` or a taming effect. That is why
  `mount_steed()`'s `!Role_if(PM_KNIGHT)` tame decrement at `steed.c:308` has no
  recordable case and is pinned by a focused test instead.
- Hero or monster combat, including attacks, retaliation, monster-initiated
  displacement, knockback, damage, death, corpses, weapon selection, ranged
  attacks, spells, passives, and special damage.
- Hero- or monster-triggered traps, including holding, projectiles, status,
  magic, fire, land mines, teleportation, holes, trapdoors, migration, and
  living-statue effects.
- Hero or monster relocation and every level transition, including deferred
  transitions, D:2 generation, and rolling-boulder traps. Two sessions stop on
  `wizlevelport`, which belongs here. `#levelchange` does not, despite the name:
  `wizcmds.c wiz_level_change()` prompts "To what experience level do you want
  to be set?" and drives `exper.c pluslvl()` and `losexp()` on `u.ulevel`, and
  its body contains no `goto_level`, `u.uz` or `dunlev` reference at all. The
  five sessions and 1,785 steps behind it belong to an experience-level family,
  not to this one, and treating them as relocation work would overstate this
  family and understate that one when the next goal is selected.
- Objects and inventory behavior, including automatic pickup, pet food and
  fetching, monster pickup, equipment, naming, billing, and object damage. One
  session stops on a pet picking up a food ration.
- Regions, engravings, ice, pools, lava, fountains, sinks, graves, altars, gas
  clouds, liquid effects, and every other special-terrain or room effect.
- Closed, locked, trapped, broken, or obstructing doors; tunneling; boulder
  breaking; iron bars; and other non-clear destination handling beyond a
  no-time refusal against wall or rock. `svc.context.door_opened`, which
  `test_move()` clears on entry and the closed-door branch sets, is the seam
  this attaches to.
- `pickup.c:describe_decor()` and the `iflags.prev_decor` per-square memory it
  keys off, needed once `mention_decor` is set. It deliberately suppresses the
  open-door and doorway cases.
- The hero-destination stop for a decorated square that holds an object.
  `invent.c:dfeature_at()` and `stairs.c:stairs_description()` are ported now,
  so what remains is admitting that square in `js/hack.js` and recording the
  fresh differential for a walk onto a staircase or doorway holding one
  object.
- `hack.c:overexert_hp()`, the hit point `moveloop_core()` costs a hero who
  moved above `MOD_ENCUMBER` every thirtieth turn, and the `fall_asleep()`
  pass-out at one hit point. The elapsed turn stops there instead.
- Special monster movement or actions, including hiding, shapechanging,
  covetous tactics, fleeing teleportation, conflict, watch or quest behavior,
  speech, item use, and themed-room monster behavior beyond an inert wait.
- `js/dogmove.js` `heroDeaf()` does not match youprop.h:125, which defines
  `Deaf` as `(HDeaf || EDeaf || u.uroleplay.deaf)`. It reads `u.uprops[DEAF]`
  alone and adds a `blocked` term the macro has no counterpart for, so
  `OPTIONS=deaf` will diverge in dogmove.c's leashed-pet trap arm. The delta
  review recorded at `2adc5af` confirmed the mismatch and rejected it as a
  finding, because `js/unported_monster_actions.js` refuses a leashed pet
  before `dog_move()` runs, which makes the arm unreachable today. Fix it with
  the leashed-pet work; every other `Deaf` reader in the port already ORs the
  conduct in.
- Pet states beyond an ordinary active starting pet, including eating,
  carrying, leashes, steeds, arrival or wait strategies, conflict, confusion,
  stun, fear except for the source-bounded continuation after this milestone's
  safe-pet refusal, ranged attacks, and combat.
- Every remaining command, including count prefixes, travel, force-fight,
  pickup commands, and the extended-command set. `hack.c lookaround()`'s
  corridor-widening arm hangs on this: it needs `svc.context.run == 2`, which
  only `do_rush()` behind the `g` prefix sets, and `ADMITTED_RUN_MODES` in
  `js/cmd.js` admits 0, 1 and 3 only. Until the prefix is ported the arm and its
  `flags.mention_walls` message have no recorded case, and
  `scripts/hack.test.mjs` is their whole evidence.

Several source-faithful helpers for these families are already committed. They
remain preserved prerequisites; their existence does not make their live
behavior part of a goal in progress.

## Unresolved

### Display

#### `flush_screen()` rebuilds the whole screen

`js/display.js flush_screen()` calls `_buildScreenOutput()`, which clears the
terminal and repaints from `game.level`. `display.c`'s writes only the glyph
buffer entries whose `gnew` is set and never clears, and `select_menu()` sets
`gb.bot_disabled` so `bot()` is skipped while a menu owns the screen.

That difference became reachable when `js/getline.js` ported
`pline.c vpline()`'s `if (u.ux) flush_screen(...)`, which the `#` prompt
genuinely needs. The call is faithful; the function it calls is not. At the two
pre-existing menu-search call sites the rebuild erases the open menu, and the
correctness pass over `60bf3d0..f826ba5` reproduced it end to end.

`.agents/review.md` puts this outside audit-fix scope: it changes rendering
behavior and needs a mechanism the port lacks. Do not paper over it by dropping
the `flush_screen(1)` call, which `vpline()` really does make. Port the `gnew`
dirty discipline and `gb.bot_disabled` so `flush_screen()` repaints only changed
cells, then satisfy the readiness note again and run a new full correctness pass
over the expanded range, as that file requires.

**Every extended-command goal depends on this one.** Thirteen of the
thirty-three development sessions stop on an extended command: five on
`#levelchange`, two on `#ride`, and one each on `#loot`, `#name`, `#chat`,
`#twoweapon`, `#pray` and `#wizwish`. Each draws a prompt or a menu into the two
defects recorded here. `scripts/scan-debt.mjs` now ranks `#levelchange` first at
188 screens of `unlocks` and `#ride` second at 92, so the dependency is live
rather than deferred. Whoever takes either goal reads this entry first and
decides whether the prompt it draws reaches the menu-erasure path.

**What is now known about which goals it blocks.** Two traces settle more than
the caution above implies.

`goto_level()` calls `docrt()` (`do.c`, 363 lines into the function, commented
"does a full vision recalc"), so C repaints the whole screen on the
level-transition path. The port's always-full repaint coincides with C's there.
The descent goal does **not** wait on this entry. What the descent goal does owe
it is separate: `goto_level()` calls `flush_screen(-1)` twice, at 243 and 364,
where `-1` postpones the map flush, and the port has no notion of postponing
one. That is an ordering question for the descent goal to trace. This defect
does not own it.

The `#ride` goal's slice 1 drew a `getdir()` prompt straight at this defect and
it did not fire: all 11 matrix segments matched cell for cell. Both known
victims are menu *search* prompts, so the reachable surface is narrower than
this entry first suggested.

`#levelchange` is the goal that should not start before this lands. It sits at
128 `unlocks` across five sessions and draws both a prompt and a menu into the
two recorded victims.

`scripts/score-baseline.mjs` changes what the conversion costs to attempt. The
worry below is that `_buildScreenOutput()` is the port's only map renderer,
behind all eleven `flush_screen()` call sites, so converting it puts every
matching screen at risk. A regression used to surface as a total someone had to
examine per session; the ratchet now fails `npm run checkpoint` and names the
sessions that dropped.

Three findings from that pass are the same defect seen from three angles: the
menu erasure itself, the two menu call sites left untested against it, and the
missing `state === game` guard that the other port of the same C line carries.
A fourth, `clearMessageWindow()` blanking map rows where C repaints them
through `docorner()`, shares the cause and belongs with them.

This is a goal of its own, not a slice of the extended-command goal. Its
upstream owners are `display.c flush_screen()` (2207-2266) with the
`gbuf_start[]`/`gbuf_stop[]` bounding box that `show_glyph()`, `cls()` and the
`reset_glyph_bbox` macro maintain; `windows.c select_menu()` (1855-1865) and
`getlin()` (1867-1901), which save, set and restore `gb.bot_disabled`; and
`botl.c bot()` and `timebot()`, whose early returns read it. None of that is in
`cmd.c`, `extcmdlist[]`, or `win/tty/getline.c`; the `#` prompt is a witness
rather than the owner, and the two victims in `js/tty_menu.js` predate it.

Size it as a goal with a checklist. `_buildScreenOutput()` in
`js/display.js:2799-2863` is the port's only map renderer, behind `docrt()` and
all eleven `flush_screen()` call sites, so converting it to per-cell
`print_glyph` puts every currently matching screen at risk. It is not urgent:
it owns no fail-closed boundary, and every one of the 398 emitted screens
matches today, so nothing is emitted-and-wrong.

#### two more gaps on the same wrapped top line

The `clearMessageWindow()` finding folded into the entry above is not alone on
the row a wrapped prompt spills onto. Two further divergences land on the same
screen, and none of the three can be validated against a C recording without
the other two, because one prompt longer than the terminal row exercises them
together.

- `topl_putsym()`'s newline arm ports the `cl_end()` at `topl.c:322` and drops
  the one at `topl.c:340`, where `if (cw->curx == 0) cl_end()` wipes the whole
  row it moved onto, so the old map row stays visible to the right of a wrapped
  prompt.
- `ttyDisplay->toplin` never takes `TOPLINE_SPECIAL_PROMPT`, which C assigns at
  `getline.c:56`. Its readers at `topl.c:139`, `155` and `163` are each gated on
  a nonzero `ttyDisplay->cury`, so the missing state first matters on that same
  wrapped line.

Both sites now say in a comment what they omit and why. Fix them with the
`flush_screen()` goal, then record a differential for a prompt longer than 78
characters. `scripts/run-extended-command-prompt.mjs` stops one character short
of that wrap deliberately: `hooked_tty_getlin()`'s `BUFSZ` and `COLNO` length
cap sits beyond it and stays unreachable until this lands.

The other eight findings the pass recorded at `e892300` deferred are closed at
the commit that added this entry: four comments now describe the code they sit
on, and four tests now fail against the mutations they were supposed to catch —
`doextcmd()`'s default arm, the generated table's unpinned rows and flag values,
`##` recursion, and the input-length segment.

The pass record in `QUALITY.json` has one imprecision worth knowing when reading
it: its `productionDefects` list names the two `flush_screen()` companions but
omits the `clearMessageWindow()` defect above, listing a test finding in its
place. The counts are right and the ledger is append-only, so the correction
lives here rather than in the record.

#### `map_object()` does not recolour a remembered generic object

`display.c map_object()` (340-352) observes a nearby object whose remembered
glyph is the generic one and redraws it in that object's own colour;
`js/display.js` does not, so the port leaves the generic colour standing.

This is a **silent divergence and it is not a level-transition bug**. Reproduce
on D:1 with no descent at all: seed 7333427, moves `kkuukkkkk`, where C draws
colour 11 for a worthless piece of yellow glass and the port draws 8, with the
random-number stream matching exactly. The shop slice found it because two
candidate matrix seeds failed on it, and dropped those seeds rather than encode
the wrong colour.

It belongs to the display area rather than to the descent goal. Fix it with
whatever next reads `map_object()`.

**Two later slices sharpened what it costs.** Slice 6 stocked gems in two
matrix segments without tripping it, which narrows the surface: stocking an
object of an affected class is not sufficient. The mimic slice then hit it
again at **seed 7411559**, where a D:1 walk draws a potion in colour 8 where C
draws 6 with the random-number stream matching, and confirmed it fires on the
walk alone with no descent — a second reproduction independent of the first,
and again nothing to do with a level change.

It has now cost coverage rather than only seeds. Seed 7411559 was the only
jewelers-or-hardware candidate on the mimic stock arm across three scans, so
that pairing is exercised by no recorded case; `scripts/run-shop-mimic.mjs`
says so in its header. Whoever fixes the defect should record that case at the
same time.

#### `newsym()` omits the infrared arm

`display.c newsym()` has an out-of-sight arm that shows a monster when
`see_with_infrared(mon) && mon_visible(mon)`; `js/display.js newsym()` does not.
Reproduce with seed 7000063, a female chaotic orcish Rogue, moves `" L"`: C's
mid-run animation frames show `r` at `<11,13>`, a square the hero could see but
cannot, and the port leaves it blank.

The room-run slice found this and left it, because `newsym()` is load-bearing
for every screen the port draws and the slice's own boundary did not need it.
That case is deliberately absent from `scripts/run-room-runs.mjs`. Fix it with
the infravision work rather than inside a movement slice.

#### `vision_recalc(2)` skips the redraw C performs

`js/vision.js vision_recalc()` guards its main update loop at `js/vision.js:746`
so that `control === 2` skips it. C does not: at that control value it still
walks every previously visible cell calling `newsym()`, then calls
`newsym(u.ux, u.uy)` and `notice_all_mons(TRUE)` on the way out. The port
therefore leaves the left level's remembered glyphs as they were.

The descent goal's slice 2 connected the only caller that passes 2,
`goto_level()`'s call at `do.c:1631`, and left the gap unfixed deliberately.
Nothing flushes the screen between that call and slice 2's refusal, and slice 3
repaints through `docrt()` regardless, so no screen the port draws today can
show the difference.

It becomes reachable at slice 4, the restore path, which re-reads the glyphs
this call was supposed to update. Fix it with `getlev()`, or sooner if another
caller passes 2.

#### an indented inverse menu heading cannot match

The spell menu's column header records as `\x1b[20C\x1b[7m    Name`: C moves
the cursor to the window edge, turns inverse video on, prints four spaces, then
prints `Name`. `serialize()` in `frozen/terminal.js`, which the judge
substitutes for `js/terminal.js`, finds the first cell in the row whose
character is not a space and emits the cursor-forward jump ahead of any SGR
sequence, so those four cells decode as default-attribute spaces. The scorer
does not forgive that: `SPACE_VISIBLE_ATTRS` in `frozen/screen-decode.mjs`
counts inverse and underline as visible on a space, so `diffCell()` reports
`attr` and the screen misses on four cells.

Twelve recorded screens across nine development sessions carry that heading,
every one of them a spell list under the default
`menu_headings:[no-color&inverse]`. A heading whose text starts at a glyph, such
as the options menu's `General`, is unaffected, which is why the inventory menu
matches. The `+` segments added to `scripts/run-no-time-commands.mjs` at
`ff6efb9` set `menu_headings:none` to sidestep it.

No fix in game code exists, because `AGENTS.md` requires leaving
`js/terminal.js` unchanged and the judge replaces it regardless. Treat it as a
ceiling: a session that displays the spell menu under the default option loses
that screen however faithful the port is.

### Trap effects

#### `Monnam()` has no `do_it` branch, so an unspottable monster gets a name

C's `x_monnam()` returns `"it"` when `canspotmon()` is false and the article is
not `ARTICLE_YOUR` (`do_name.c:863`, `876-882`). `js/do_name.js`'s
`monsterCommonName()` and `capitalizedMonsterName()` have no such branch and
never consult visibility, so every message that names a monster the hero cannot
spot answers the species name where C answers `It`.

This is a **silent divergence, not a refusal**: nothing stops, and the first
evidence would be a screen mismatch. `js/trap_effects.js thitm()` is one
reachable writer, through `pline_mon(mon, "%s is almost hit by %s!",
Monnam(mon), ...)` at `trap.c:6732-6734`, and there will be others as combat
lands.

Nothing on dungeon level one sets `minvis`, and `assertSimpleActionState()`
refuses `is_hider`, so no admitted path reaches it today. It was found by a
test that made a monster `minvis` to separate two visibility gates and pinned
the species name as correct; that fixture now grants detection instead, which
keeps `canspotmon()` true, and `scripts/monmove.test.mjs` asserts both gates
directly. Port the `do_it` branch with the goal that first admits an
unspottable monster, and give it the mirror case.



#### thirteen squeaky-board findings are deferred

The correctness pass over `06a5629..bf96cda` confirmed sixteen findings; three
were applied at `8de4b76` and thirteen are recorded here.

**Assertions that do not discriminate**, each verified by mutation with the
suite green: neither diagonal-doorway predicate's `PASSES_WALLS` guard is
covered, and the test claiming to cover `cant_squeeze_thru()`'s four results
never takes its `passes_walls` early return; `floor_trigger()`'s fourteen-case
table has no direct test; `check_in_air()`'s `trflags` arms are unreachable
from every ported caller; five of `TRAP_NOTE_NAMES`' twelve entries are pinned
by neither the suite nor the matrix; the `tt === HOLE && !mindless()` half of
`already_seen` is reachable at depth one and untested; nothing pins
`mon_learns_traps()` and `mons_see_trap()` to their position after
`mintrap()`'s two early returns, so hoisting them above the gates passes; and
**nothing in the repository distinguishes `mons_see_trap()` from a no-op** —
deleting its only call site leaves the whole suite green.

**A second owner for one C state value.** `mon_learns_traps()` is now the
port's owner of the `mtrapseen` mask, but `js/shknam.js:232` still writes the
`ALL_TRAPS` sentinel by hand as `shk.mtrapseen = -1`, where `shknam.c:669`
calls `mon_learns_traps(shk, ALL_TRAPS)`. The encoding is a port choice — C
assigns `~0L` to an unsigned field — so the two spellings agree only by
coincidence, and the shopkeeper's mask is the one value a digest would notice.

**Comments that misdescribe their code:** `postmov()`'s coverage list is in C's
execution order except for `mintrap()`; its header claims an `unsupported`
refusal for `vamp_shift()` sequencing that exists nowhere; `js/trap_effects.js`'s
header states a five-owner env contract that omits `unsupported` and `random`;
and the comment replacing the deleted trap refusal in
`js/unported_monster_actions.js` says `postmov()` calls `mintrap()` "after the
move, and only there", which is false.

### Planning clone

#### the planning clone leaks by omission, and should be made loud or removed

`planningState()` in `js/unported_monster_actions.js` builds a copy of the game
state so `preflightSimpleMonsterActions()` can dry-run a whole monster turn
before it happens for real. The dry run has to consume the identical PRNG
stream the live pass will consume, and write nothing live. It is a port-side
invention: C never needs it, because C implements everything and never asks
whether it can support a turn.

**The evidence.** `QUALITY.json` records **nine** production defects in this
construct, across passes from `e30ea05` onward — monster-vital state, the
light-source refusal, the `minLiquid` stub, an unconverted refusal class, the
object discovery ledger, a spread that dropped eight non-enumerable catalog
aliases, a 6.4 ms per turn cost from fixing that spread by materializing, a
restore that set live `vision_full_recalc`, and `level.traps`. Two of the nine
were introduced by the fix for a previous one. No other construct in this
repository comes close.

**Why it keeps happening.** Isolation is opt-in and silent when omitted.
`planningState()` spreads the live state and then names about thirty fields to
copy; anything a new action writes that is not on that list is shared by
reference, and nothing fails. There is no upstream source to check the list
against, because the construct has no C counterpart — so a reviewer cannot
derive the correct answer, only notice the symptom. Every one of the nine was
found by symptom.

**Options, costed against measurement.** The figures below were measured on
this machine against the fixture the tests use, not estimated.

1. *Freeze the live state during planning.* Deep-freeze what the dry run can
   reach, so a leaked write throws at the leaking line instead of diverging
   silently. **It cannot run in production.** `Object.freeze()` is
   irreversible, so a frozen game cannot run the live pass that follows; the
   reversible substitute, `defineProperty({writable: false})` per property
   undone afterwards, measured 74 to 131 ms per turn against the 1.13 ms
   preflight it would guard. That is an order of magnitude worse than the
   6.4 ms catalog copy this construct was already forced to withdraw. It is
   also a weaker detector than first claimed. Of the nine, **five are not live
   writes at all** -- a missing refusal, a permissive stub, an unconverted
   refusal class, a clone that was too isolated rather than too little, and the
   6.4 ms materialization cost. Four are live writes, and the detector catches
   **three of those four**. The fourth, the restore that left live
   `vision_full_recalc` set, escapes because it is a root field the scan's own
   restore has to write, so no freeze can tell that write from a leak.
2. *Copy-on-write.* Put the planned state behind a proxy whose writes land on
   an overlay, so isolation is the default and the field list disappears. This
   was costed as the more expensive option; measuring option 1 removes that
   reason. Proxy overhead on this path has not been measured, so it is
   unranked on cost rather than preferred, but it is now the only candidate
   that could plausibly run per turn.
3. *Journal and roll back.* Run against the live state, record every mutation,
   undo on refusal. Removes the clone, but replaces one omission problem with
   another: an unrecorded mutation is exactly as silent as an uncopied field.

**What landed.** Option 1 as a test-only detector, which is where its cost
disappears and its irreversibility stops mattering:
`scripts/planning-isolation-test-support.mjs` freezes the live graph and five
cases run the dry run against it -- an ordinary move, a door opening, a pet
pickup on each of `distant_name()`'s two branches, and one burdened turn that
reaches the once-per-turn planning round through `moveloop_core()`. Each was
confirmed by a distinct mutation to `planningState()`. It found a tenth leak on
its first run: `gd` was shared, and `distant_name()` raises `gd.distantname`
through `dog_invent()`. That is balanced by its own `finally` and `gd` is
absent from a fresh game, so it was invisible both to inspection and to every
oracle; it leaks only once a live `distant_name()` has created `gd`. Fixed in
the same change.

Two exclusions are permanent and declared at the site. The live root stays
writable because the scan's own `finally` restore writes three fields on it.
The object catalog stays writable because the clone delegates to it with
`Object.create()`, and `[[Set]]` cannot shadow a frozen inherited property --
freezing it would report the copy's writes as live leaks.

**What the detector still cannot see.** `vision.c`'s module-level transparency
index (`viz_clear`, `left_ptrs`, `right_ptrs`) is not reachable from the state,
so no freeze reaches it; it stays covered by the `finally` restore and the
refusing `visionRecalc` owner. The three root fields that restore writes --
`_viz_rmin`, `_viz_rmax` and `vision_full_recalc` -- are uncovered for the same
reason, and the last of those is a recorded defect, so a dedicated case pins it
instead.

Two claims made here earlier were wrong and are corrected. `liveVisionBuffers`
*is* reachable: `js/vision.js:791` assigns `game.viz_array =
liveVisionBuffers.rows[0]`. What hid it was that its rows are `Uint8Array`, and
`Object.freeze()` throws on a typed array with elements, so the detector skipped
the views. It now snapshots every reachable view before the dry run and compares
afterwards, which catches a per-cell vision write -- confirmed by injecting one.
And a leak that *adds* a field does not escape: `Object.freeze()` already clears
`[[Extensible]]`, so an added field throws wherever the object is frozen. The
one place it can still happen is the live root, which is deliberately left
extensible, and `assertNoLeak()` checks the root's key set for exactly that.

**When.** Option 2 is not urgent by the usual test: the construct owns no
fail-closed boundary and the score is correct today. The detector removes the
reason it was urgent, by making the next omission fail loudly in the suite
rather than surface as a screen mismatch several goals later. Take option 2
when a leak escapes the five cases above, or when the field list next grows.

### Game behavior

#### five descent-and-shop findings are deferred

The correctness pass over `9a7aef5..17825d3` confirmed seventeen findings;
twelve were applied at the fix commit and five are recorded here.

**Two production gaps.**

- `mon_arrive()` at `js/dog.js:750` refuses every follower that is neither
  tame nor `u.ustuck`, but C's `set_apparxy()` returns the hero's own square
  for those monsters too, so the port stops where C continues without drawing a
  single random number. The `rn2(monster.mtame ? 10 : monster.mpeaceful ? 5 : 2)`
  selector below the refusal already encodes the untame cases, which is the
  evidence the refusal is too wide. Deferred rather than applied because
  deleting a refusal changes what the game does and needs its own fresh
  differential with a non-tame follower, which no recorded case supplies yet.
- `set_mimic_sym()`'s `rt >= SHOPBASE` arm is **closed at `43445e9`**, ported
  from `makemon.c:2467-2486`. It was deferred here as new upstream work, and
  slice 6 then made it the largest remaining shop stop, so it was taken ahead
  of slice 7 rather than after the shop slices. The one-third estimate that
  justified that reordering was checked rather than inherited: over 8,500 fresh
  seeds, 37 of 112 D:2 shops of a stocked type held a mimic, 33.0%, which also
  matches the closed form `1 - 0.98^n` for a shop of n stocked squares. A first
  sample of 25 read 24%, so the figure is not tight. Two of C's four exits stay
  unported and refuse by name — a negative `iprobs[]` itype and the health food
  store's `VEGETARIAN_CLASS` — because both belong to rows `SUPPORTED_SHOPS`
  refuses outright and the second draws an `rn2(2)` no consumer would spend.
  **Slice 8 must delete both refusals.**

**Three assertions that do not discriminate.**

- `compareScoreToBaseline()` in `scripts/checkpoint-checks.mjs` became gating
  in this range and has no test, and the new
  `summary.passed ?? (result.status === 0)` rule has none either. The one test
  touching the score check still builds it with `informational: true`. Cover
  the five outcomes: ratchet met, a drop, a session missing from the run, the
  marker absent, and unparseable JSON.
- `scripts/mkroom-shop.test.mjs:445` pins the shopkeeper names `Akranes` and
  `Akureyri`, which only a run of the port can have produced: `eshk.shknam`
  reaches neither the screen nor the random-number stream, so the differential
  the comment credits cannot have validated them. Derive the expectation from
  C instead — `name_wanted = m_id + ledger_no(u.uz) + (ubirthday/257 % 13)
  - (ubirthday/257 % 5)`, reduced modulo the name list's length.
- Nothing exercises `do.c u_collide_m()` or the `dog.c mon_arrive()` arm that
  reaches it, although a descent with a pet reaches them about one time in ten
  rather than the near-never this file assumed when slice 3 closed. Add a
  descent segment to `scripts/run-leave-level.mjs` whose seed lands the pet on
  the hero's arrival square.

One clarity item is deferred with them, folded into the second bullet above
rather than counted separately: `UnsupportedHeroTimeoutBoundaryError`'s message
still opens `elapsed-turn nh_timeout requires` at all four of its sites, which
is wrong for the `run_timers()` arrival site. The fix commit gave that site a
distinct reason so the two are no longer indistinguishable in a log; renaming
the shared prefix would reword three messages that read correctly today and is
left for whatever next touches that class.

#### `artifactTouchable()` crashes a segment instead of ending it

`js/weapon.js:264-268 requiredOperation()` throws a bare `TypeError`, where
every other unported path in this port throws a named fail-closed class. When
`artifactTouchable()` (`js/weapon.js:289`) meets an artifact with no
`touchArtifact` operation in its environment, that `TypeError` escapes
`runSegment()`, so the scorer records a session error and loses the segment's
matching prefix rather than stopping on it — and, because `pushAll` runs after
the await, every later segment of the session with it.

The shop slice found it while scanning seeds: it fires on an **ordinary D:1
walk with no descent**, in roughly one seed in twelve thousand. The four the
scan named are 7379930, 7386909, 7393793 and 7398316. That frequency is the
scan's, not a measurement this file repeated.

This is the same defect class the correctness pass over `9a7aef5..17825d3`
fixed four times in `js/cmd.js failClosedCommandRefusals()`, and the fix is the
same shape: give `js/weapon.js` a named boundary class and add it to that list.
Doing so converts a lost session into a clean stop; it does not make the
artifact path work. Take it with whatever next reads `js/weapon.js`, or sooner
if a recorded session lands on one of those seeds.

#### a drawbridge wall answers "It's a wall."

`hack.c:1048` prints `"That drawbridge is up!"` when `is_db_wall(x, y)` holds
inside `test_move()`'s closing obstacle arm. `DBWALL` satisfies `IS_WALL()`, so
`js/hack.js`'s type refusal lets it through and the port prints `"It's a wall."`
instead. This is a silent divergence. Nothing stops, and the first evidence
would be a screen mismatch.

The audit-fix agent for the `c706db8a6..ed43517` pass found this while applying
a neighbouring finding and left it, correctly, because it sat outside the
confirmed set. No level this port generates holds a drawbridge today, so no
recorded case reaches it. Fold it into whichever correctness range next reads
`test_move()`, or into the drawbridge work, whichever comes first.


#### `nomul()` has two owners and they disagree

`hack.c nomul()` is ported twice. `js/hack.js:274-283` `nomul()` is the faithful
one: it sets `disp.botl`, `u.uinvulnerable`, `u.usleep` and `multi`, then calls
`endRunning()`, which carries `hack.c:4130-4157`'s `disp.time_botl` write and
the `iflags.terrain_typ`/`classify_terrain()` pair. `js/detect.js:350-370`
`defaultNomulZero()` is the older inline copy and has neither.

`dosearch0()` calls `env.nomulZero(env)` on the secret-door and secret-corridor
finds, so with `flags.time` set, a hero running past a secret door that the
automatic search converts should get a time update and does not.

The correctness pass over `e30ea05..d1a71f7` confirmed the divergence and
`0d4a4ac` is where the second owner appeared, inside that range. It is deferred
rather than fixed there because `.agents/review.md` returns a finding that
changes a state owner to Implementation: the fix consolidates two owners into
one and needs its own fresh differential, with `flags.time` on, a Ranger's
SEARCHING intrinsic, and a secret door beside the run.

#### the mfndpos rollback restores what nothing changed

`snapshotMfndposMutation()` in `js/monmove.js:900` captures each of the nine
`poss` slots and `info` values before `mfndposCore()` runs, and
`restoreMfndposMutation()` writes them back. Both loops are dead:
`resetMfndposData()` now reassigns `data.poss` and `data.info` to fresh arrays
as its first act, so the core never touches the captured objects, and restoring
the two array references alone reproduces the pre-call state. The comment above
the snapshot justifies the per-slot work with a caller state the same commit
made impossible.

`scripts/monmove.test.mjs:2021-2036` cannot tell: its three assertions are all
satisfied by the two reference restores, so deleting the per-slot branches
leaves it green. Deferred to a `/simplify-codebase` pass, which is what
`.agents/review.md` routes dead declarations to.

#### three arms of the door message switch are dormant

`lock.c doopen_indir()`'s `!(doormask & D_CLOSED)` switch has four arms, and a
walk can reach only the locked arms. What narrows the input is the seam's own
mask guard in `js/hack.js`, which admits `D_CLOSED`, `D_LOCKED` and
`D_LOCKED | D_TRAPPED`; `monmove.c closed_door()` does not, being a bit test
that answers TRUE for any mask carrying either bit, `D_TRAPPED` combinations
included. The broken, doorless and already-open arms arrive solely through
`#open`, which is not ported.

The switch is one C statement and was translated whole, which `AGENTS.md`
prefers to splitting a source construct. The consequence is three arms that
write output and are reached by no fresh recording; `scripts/lock.test.mjs`
pins them and is their whole evidence. Record a differential for each when
`#open` lands.

#### an explicit `autounlock` setting is refused

`flags.autounlock` is unmodeled. `options.c:1074` initializes it to
`AUTOUNLOCK_APPLY_KEY`, and `js/options.js` keeps an explicit setting as raw
text rather than parsing `optfn_autounlock`. The closed-door seam therefore
refuses on any explicit setting.

That is wider than it needs to be in one direction: C treats `!autounlock` as
the default, so a session setting it would run identically and the port stops
instead. Porting the parser is the fix, and it belongs with `pick_lock()` and
`autokey()`, which are what the flag selects between.

#### five monster-pickup findings remain deferred

The correctness pass over `5879bed..2fea8eb` confirmed fourteen findings; three
were applied there and eleven were recorded here. Four of the eleven are closed
at `247675b`, which pinned each by breaking the line it covers and watching the
test fail: `select_postmove_object_action()`'s `carryamt`, `panicattk`'s
`range.scared` condition, `dochug()`'s `!noattacks(monster.data)` term, and
`pickupState()`'s false claim that a gnome is `M2_GREEDY`. The rest divide into
three groups.

**A production gap.** `refuseHeroAttack()` is presented as a complete stand-in
for `mhitu.c mattacku()` on the range2 path, but it enumerates only `AT_BREA`,
`AT_SPIT`, `AT_GAZE` and `AT_WEAP` and omits `mattacku()`'s
`find_offensive()`/`use_offensive()` path, so a monster that would use an
offensive item is admitted where C acts. Fix it with the combat work, which is
where `mattacku()` lands.

**An assertion that does not discriminate**, verified by mutation with the
suite green: `refuseHeroAttack()`'s `AT_WEAP` arm, the `select_rwep()` check,
has no test while its three siblings do.

**Comments that misdescribe their code:** `is_drawbridge_wall()`'s export
contradicts `js/invent.js:207`, which still documents the same predicate as
unported; `postSimpleMove()` reads injected message and redraw owners for the
movement notice then hardcodes `ttyPline`/`newsym` for the pickup; and the
comment calling `mattacku()`'s preamble inert cites `!ranged`, which C computes
from the hero's real position, where the guard below tests something else.

#### the postmov `minvis` redraw has no case that can reach it

`monmove.c postmov()` (1683-1687) repeats `newsym()` — and `see_wsegs()` for a
long worm — after the object arm whenever `mtmp->minvis` is set, whether or not
`mpickstuff()` took anything. `postSimpleMove()` in
`js/unported_monster_actions.js` omits it. Porting the arm is three lines;
recording a differential for it is what fails.

Nothing behind the current boundary sets `minvis` on D:1.

- `pm_invisible()` (mondata.h:192) covers only the stalker and the black light,
  difficulty 9 and 7. `rndmonst_adj()` caps generation at
  `monmax_difficulty(levdif) = (levdif + u.ulevel) / 2` (monst.h:259), which is
  1 on D:1 at experience level 1 and admits a black light only from level 13.
  No `dat/` Lua file names either species, and no `mkclass()` caller passes
  `S_LIGHT` or `S_ELEMENTAL`, so the cap-skipping `rn2(2)` arm at
  `makemon.c:1944` cannot reach them either.
- `MM_MINVIS` has one C caller, `read.c:3313`, behind wizard `^G`.
- The two routes that do fire in C on D:1 at experience level 1 are each
  refused earlier by the port. A monster that picks up a randomly generated
  cloak of invisibility wears it on its next turn through
  `movemon_singlemon()` → `m_dowear()` → `update_mon_extrinsics()`
  (worn.c:598); the port refuses `monster equipment changes` before that runs.
  A monster that quaffs a potion of invisibility reaches `mon_set_minvis()`
  through `muse.c use_misc()`; `js/muse.js` ports the selection and refuses
  `monster item use` before the effect.

The arm is therefore dormant behind two refusals rather than silently wrong,
and `AGENTS.md`'s rule to identify where the running game will use a piece of
code before writing it defers it. Port it with whichever of monster equipment
changes or monster item use lands first, and record the differential then.

One latent trap belongs with it. `updateMonsterArmorEffects()` at
`js/makemon_create.js:1606` implements only `MUMMY_WRAPPING` and `SPEED_BOOTS`
and omits `update_mon_extrinsics()`'s `INVIS` arm silently rather than
refusing. The post-creation wear path is masked by the boundary above, but the
creation path calls the same function, so a creation-time cloak of invisibility
would diverge without erroring. No creation-time route grants one today.

#### the planning clone's object copy is still expensive

One symptom of the mechanism described under `### Planning clone` above; fix
it there rather than in isolation if that plan is taken.

`cloneObjects()` builds each copy with `newObject({ ...original })`, which
constructs a 60-field default and installs 16 alias accessors before
overwriting them. Measured at 27-38 microseconds per object, about 0.9 ms per
turn. Hoisting the alias descriptors to module scope and using
`Object.defineProperties()` measured 2.2 times cheaper, and `Object.create()`
was below timer resolution.

The catalog copy beside it was fixed this way already: it had cost 6.4 ms per
elapsed turn, 80-92% of a scored turn, and prototype delegation removed that at
no correctness cost. The same treatment probably suits the object copy, but it
needs its own check, because unlike a catalog entry an object is written
through more paths.

That catalog fix left one loose end: `js/unported_monster_actions.js:85` still
imports `copyObjclassEntry`, which no line of the file calls now that the
catalog clone is `state.objects?.map((entry) => Object.create(entry))`. Delete
the import with the next simplification pass.

#### eight diagonal-doorway findings are deferred

The correctness pass over `4d54fa8..2776192` confirmed ten findings; two were
applied and eight are recorded here. The applied pair are described in
`SCORE.md` at the fix commit; these are what remains.

They divide into assertions that do not discriminate — the new diagonal arms,
the consolidated `cant_squeeze_thru()` and the obstacle-arm ordering each have
coverage that survives mutation — and comments that overstate what their code
establishes. Two vision comments in `js/unported_monster_actions.js` also
remain unsettled: the slice worker declined to invent a justification it could
not derive, and the pass did not settle them either.

Take them with whatever next reads `test_move()`; none owns a fail-closed
boundary today.

#### eight door-opening findings are deferred

The correctness pass over `c706db8..06a5629` confirmed ten findings; two were
applied and eight are recorded here. Most concern the vision isolation the
slice built as a precondition.

**The isolation's own seams.**

- `isolatePlannedVision()` guards the cloned terrain grid behind
  `state._visionBuffers`, so two unrelated isolations share one early return.
  Nothing sets that field early today — the adjudicator confirmed it is written
  in exactly one place, after both isolations — but a later change that
  allocates planning buffers first would silently leave `level.locations`
  pointing at the live array, and `postmov()` writes `D_ISOPEN` through it.
  Give the two isolations independent guards.
- No test plans two door openings in one scan, so the private COULD_SEE buffer
  pair the settled design rests on is never exercised twice.
- The transparency-index restore is in a `finally` specifically so it runs
  after a refusal, and no test covers the refusal path: moving the restore out
  of the `finally` leaves the suite green.
- `visionSnapshot()` and `preflightSnapshot()` omit `game.vision_full_recalc`,
  which is how the leak fixed at this cycle's head stayed invisible.

**Comments that outlived their code.** The third is closed at the commit that
added this sentence: `admitDoorOpening()` refuses nothing — it only isolates
the planning vision buffers — and two segments of
`scripts/run-monster-door-open.mjs` do record a hero watching a monster open a
door, so `scripts/monmove.test.mjs` now names the recorded evidence for the
first arm and the invisible-monster reason the second has none. Two remain,
and both need a re-derived justification rather than a reworded one:
`planningEveryTurnEffect()`'s refusal cites a guard in `rebuildVisionPoint()`
that this same range deleted, and `planSimpleMonsterScan()`'s `visionRecalc`
refusal still says the dry run cannot reproduce the live buffers, which
`planningVisionRecalc()` now does. Both refusals may well still be right; what
is missing is the evidence for why, and inventing one would be worse than the
stale text.

**One production gap.** `refuseHeroAttack()` gates on
`monnear(monster, monster.mux, monster.muy)`, C's `range2` — whether the
monster *thinks* it is near — where the arm it stands in front of needs the
real position. It belongs with the combat work that already owns
`refuseHeroAttack()`'s missing `find_offensive()` path.

#### nine postmov findings are deferred

The correctness pass over `c64d350..005ea20` confirmed eleven findings; two
were applied and nine are recorded here.

**Comments that state a false rule.** The copies of "every arm of C's door
block tests `D_LOCKED` or `D_CLOSED`" are closed at the commit that added this
sentence: `js/monmove.js`, `scripts/monmove.test.mjs` and
`scripts/run-monster-doorway.mjs` now name the magic-key disarm at
`monmove.c:1539`, which tests `D_TRAPPED` alone and writes the doormask, and
the `D_ISOPEN | D_TRAPPED` refusal already named a door trap. Two remain, and
both misdescribe their own code: the webmaker comment lists guards C applies
that the port does not, and `const species = monster.data` is latched at entry
where the header says `ptr` is refreshed after `mintrap()`.

**Assertions that do not discriminate**, each verified by mutation with the
suite green: the `IRONBARS` refusal is reached by no test; the engulfed-hero
refusal has none at all and drops C's `(mtmp->mx != omx || mtmp->my != omy)`
conjunct from `monmove.c:1650`; `m_move()`'s `can_tunnel` clearing is exercised
only in the direction that clears, so every conjunct and the literal 8 survive
mutation; and `simple preflight ignores an unselected rock during item search`
gained a comment asserting something about its new gnome fixture that the test
does not check.

**Duplication.** The inert door mask set is written twice, as
`INERT_DOOR_MASKS` in `js/monmove.js` and as an inline three-way comparison in
`js/unported_monster_actions.js`, with the explanatory comment copied along
with it.

#### `dochug()` returns where C breaks into PHASE FOUR

`dochug()`'s `MMOVE_MOVED` arm returns in the port where C breaks out of the
movement phase and continues into its attack phase, so a monster that moves and
*then* throws diverges silently — no refusal, no boundary, just a missing
action.

Reproduce with seed 8930452, `pettype:none`, moves `lllsssjjjss`. Two seeds
were dropped from `scripts/run-monster-pickup.mjs` for this rather than have
the matrix encode the wrong behavior.

The neighbouring gate was corrected at `77fa460`: `dochug()`'s standard-attack
test used adjacency where C uses `inrange && !scared`, which let ranged
attackers through in silence. This is the same phase structure seen from one
step further on, and it belongs with the combat work.

#### the planning clone must copy non-enumerable catalog aliases

One of the nine defects counted under `### Planning clone` above, kept here for
the general trap it records: a spread is not a copy when the source uses
`Object.defineProperty`.

`js/objects.js defineObjclassAliases()` installs eight aliases — `oc_skill`,
`oc_armcat`, `a_ac`, `a_can`, `oc_bimanual`, `oc_bulky`, `oc_hitbon` and
`oc_level` — as non-enumerable properties, so a spread copy silently drops
them. `planningState()` cloned the catalog with `{ ...entry }` from `8bd4d6a`
until `39e5df1`, which meant the dry run read `undefined` for all eight and
took different branches from the live pass.

`copyObjclassEntry()` in `js/objects.js` is the correct way to *materialize* a
copy of a catalog entry, and the generator emits it. The planning clone no
longer needs one: it uses `Object.create(entry)` prototype delegation, which
gave the same isolation without the 6.4 ms per turn a 482-entry copy cost. The
import in `js/unported_monster_actions.js` is dead as a result and is left for
a simplification pass. The general lesson is recorded here
because the same trap applies to any state the port clones: a spread is not a
copy when the source uses `Object.defineProperty`.

#### one pickup assertion still does not discriminate

The correctness pass over `f826ba53..4d78313` confirmed five test gaps that its
fixes did not close, all of the same shape: the assertion holds whether or not
the behavior it names is present. Four are closed at `247675b` and `5dd9bab` —
`cloneLightList()`'s and `cloneTimerList()`'s object-remap arms, the redraw that
runs whether or not the hero can see the square (in both `dog_invent()` and
`mpickstuff()`), and `distant_name()`'s `obj.oartifact` disjunct. One remains:

- The `wieldPickedItem: () => unsupported('pet weapon selection')` refusal has
  no test, and the same diff deleted the `pony pickup` entry from the
  preflight's starting-pet case list. No starting pet has an `AT_WEAP` attack,
  so pinning it needs a fabricated pet rather than a fresh case.

#### the pickup naming conversion is unpinned end to end

`js/allmain.js` now converts `UnsupportedObjectNameError`,
`UnsupportedObjectOperationError` and `UnsupportedMonsterPickupOperationError`
into a turn boundary, because the pet pickup arm can raise all three from
inside the monster scan and `js/jsmain.js` rethrows anything else, discarding
the segment.

`scripts/unported-monster-actions.test.mjs` pins the first half — that the
naming path really raises `UnsupportedObjectNameError` — and removing
`preflightObjectName()`'s unpaid branch fails it. The conversion itself is not
pinned: `advanceElapsedTurn()` is not exported, and driving `moveloop_core()`
from that fixture does not reach the arm. Removing the three classes from
`ELAPSED_TURN_PLANNING_REFUSALS` leaves the suite green.

Close it with a case that reaches the pickup through a real turn, or by giving
the elapsed turn a seam a test can drive without exporting internals.

#### a vision recalculation stops the cloned monster scan

Converting a secret door that stands in the hero's current vision sets
`vision_full_recalc`, and the cloned planning scan then refuses `visionRecalc`
at `js/unported_monster_actions.js:618`. That refusal is deliberate and its
comment says why: `mon.c movemon_singlemon()` runs `vision_recalc(0)` for the
first ration-spending monster after `movemon()`'s tail sets the flag, which
rebuilds `vision.c`'s live global buffers, and the dry run cannot reproduce
that rebuild.

The search slice met this while choosing fresh cases: 21 of 40 candidate seeds
stopped here rather than on anything the slice owned, so
`scripts/run-explicit-search.mjs` uses secret doors outside current vision. The
debt is the vision subsystem's, and it will reappear in any slice that changes
a blocking point.

Find the writers with `grep -rn vision_full_recalc js/` rather than from a list
here, which goes stale. As at `c706db8` six places set the flag and four clear
it. The two that matter most to this entry are easy to miss: `js/vision.js:165`
`rebuildVisionPoint()`, which owns `block_point()`, `unblock_point()` and
`recalc_block_point()`, and `js/detect.js:186`, a line-for-line duplicate of it.
`js/mon.js:129` is the `movemon()` tail described above.

#### no fresh case covers the secret-corridor arm

`dosearch0()`'s SCORR arm is ported and shares its shape with the SDOOR arm,
but it has focused tests only. The search slice generated 28,000 levels without
once placing the hero adjacent to a secret corridor, so no recorded case
exercises it end to end. Record one when a level generator or a starting
position that reaches an adjacent SCORR becomes available.

#### the `m` prefix loses a frame

C emits a screen and a cursor position for the `m` prefix and the port emits
none. The search slice's worker reported reproducing this at seed 9300001 with
`wait` as well as with `search`, which places it before that slice rather than
inside it; the reproduction has not been repeated independently, so treat the
seed as a lead rather than as recorded evidence.

`js/cmd.js` has no `m` prefix handling at all, so the refusal is the port's
general unbound-or-unadmitted path. It belongs with the prefix work that
`hack.c lookaround()`'s corridor-widening arm also waits on.

#### a live monster refusal escapes as a hard failure

`UnsupportedMonsterCreationError` is listed in
`ELAPSED_TURN_PLANNING_REFUSALS`, which converts it to a turn boundary, but
that conversion covers only the cloned planning round. `advanceElapsedTurn()`
supplies that round only when `projected_capacity(state) > 0`, so an
unencumbered hero never dry-runs the turn, and the same refusal thrown by the
live `maybe_generate_rnd_mon()` leaves `runSegment()` as a hard failure. A
segment then loses its matching screens instead of keeping the prefix.

The correctness pass recorded at `eb7e17e` confirmed this and verified it is
older than the range it audited: the identical probe at the parent produces
identical output. Converting on the live path alone would not be enough,
because moves and the regeneration draws are already spent by then, so the fix
is a preflight for the unburdened path, as `preflightGetHungry()` and
`preflight_nh_timeout_elapsed_turn()` already do for theirs.

#### `go.occupation` has one writer and three readers that never see it

`js/cmd.js set_occupation()` stores C's `go.occupation` at
`state.go.occupation`. The three JavaScript readers that already stood for that
C value read `state.occupation`, which nothing in `js/` assigns:
`grep -rn "\.occupation" js/` returns `js/monmove.js:529` and `:555`,
`js/unported_monster_actions.js:871` and `js/teleport.js:259` as the readers of
the bare name, and no assignment to it anywhere. Every writer of the value
names `state.go.occupation`: `js/cmd.js:180` installs one, and `js/eat.js:1221`
and `js/allmain.js:877` clear it.

The reader that matters is `monmove.c dochugw()` (213, 223-235), which calls
`stop_occupation()` when a hostile, spottable monster is within
`(BOLT_LIM + 1)^2` and either could not be seen before or was further away. C
therefore prints "You stop eating the food ration." and abandons the meal
several turns before the monster becomes adjacent. The port evaluates a falsy
`state.occupation`, short-circuits, and eats on to "You finish eating the food
ration." `moveloop_core()`'s own `monster_nearby()` test does not cover the
gap, because `hack.c monster_nearby()` (4106-4127) scans the eight adjacent
squares alone. This is a **silent divergence, not a refusal**: the fail-closed
stop the port installed for it,
`js/unported_monster_actions.js:797 stopOccupation`, can never run.

The correctness pass over `02c6e59..dc4e009` confirmed it and the audit fix at
that pass left it here, because repointing the readers changes a state owner
and makes a previously dead refusal live, which `.agents/review.md` puts
outside audit-fix scope. Two parts need a decision rather than a rename.
`js/unported_monster_actions.js:871` refuses the elapsed-turn monster scan
outright, so wiring it up unchanged would refuse every occupation turn;
`grep -n occupation nethack-c/upstream/src/allmain.c` returns only lines 332,
485-506 and 684-689, so C gates nothing in that block on `go.occupation` and
the term is stale scaffolding. `js/makemon_create.js:2484` documents
`makemon.c:1503`'s `if (go.occupation) dochugw(mtmp, FALSE)` as deferred and is
the same missing wiring.

Fix it with a fresh differential: a recorded case where a hostile monster first
enters the nine-square window mid-meal, which shows C printing "You stop
eating ..." on that turn. Guard the result with a repository-wide grep that
every reader names one field. Also correct the `stop_occupation()`
reachability row in the slice's checklist, which omits `monmove.c dochugw()`
and `makemon.c:1503`.

#### the status line repaints on every turn, where C gates it

`allmain.c moveloop_core()` (473-478) repaints the status line only when a
writer has marked it dirty: `if (disp.botl || disp.botlx) { bot();
curs_on_u(); } else if (disp.time_botl) { timebot(); curs_on_u(); }`, and
`botl.c timebot()` refreshes `BL_TIME` alone through `stat_update_time()`, so
the hunger cell keeps its last rendered text. `js/allmain.js:831` runs
`find_ac(g); await bot(); await flush_screen(1);` with no gate at all.

That became observable when the occupation landed. `eat.c newuhs()`'s
`if (go.occupation == eatfood || gf.force_save_hs)` arm assigns `u.uhs` and
returns before any `disp.botl = TRUE`, so a meal that crosses a hunger boundary
moves the status silently. Driving matrix segment 5820079 turn by turn shows
the port's last screen row carrying "Satiated" on the three turns after the
crossing while its own `disp.botl` is false, which is C's gate tracked
correctly and then ignored at the call site.

No captured screen differs today, because a mid-meal frame is captured only at
an input boundary and the two foods this slice ports cannot produce one inside
the window. A mid-meal `--More--` would: `fprefx()`'s "This satiates your
stomach!" left unseen, followed by a `dosounds()` "You hear ..." on a later
meal turn, is the reachable pairing. It would be the project's first
emitted-and-wrong screen.

The fix belongs where C puts it, in `moveloop_core()`, and needs `timebot()`
ported for the second arm. It changes rendering behavior on a line that runs
every turn of every session, so it needs its own differential and a whole-score
comparison rather than an audit fix. The cheap regression to carry with it:
assert that the last row of `game.nhDisplay.grid` holds no hunger word on the
turn after the crossing while `game.disp.botl` is false.

#### the two-meal segment never reaches its second meal

`scripts/run-eat-occupation.mjs:108` describes segment 5820041 (Ranger, moves
`.ef.ef.`) as installing, running down and clearing the occupation twice. It
installs it once. Replaying it through `runSegment()` stops at move 7 with
`u.uhunger` 1694, `victual.usedtime` 0 with `eating` 1, and slot `h` holding an
unbitten cram ration: the second meal's `fprefx()` label and `lesshungry()`'s
nearly-full warning do not share the top line, so `more()` asks for a key the
recipe does not supply. Adding one key reaches
`UnsupportedHeroCommandBoundaryError: ... lesshungry()'s paranoid_query() for
continued eating`, because the hero is already SATIATED when the second meal
starts, so `canchoke` is 1 and `reqtime - usedtime` is 3. The second meal
cannot complete at this seed and role at all.

No test anywhere completes a second meal, so `done_eating()`'s `nomovemsg`
reset is unpinned end to end: dropping it leaves the whole suite green, and in
a real second meal it makes `done_eating()` print the stale "You're finally
finished." where C prints "You finish eating the cram ration."

Repairing it needs a fresh C recording, which puts it outside audit-fix scope.
Choose a seed or wait count that leaves the hero below SATIATED when the second
meal starts, which clears both blockers at once, and give the recipe the extra
keys any `--More--` needs. Then assert that `game.nomovemsg` is null at the end
and read the final top line off the amended recording rather than assuming the
"You finish eating" wording.

### Process

#### the score ratchet's remaining gaps

`scripts/score-baseline.mjs` now holds a per-session baseline of matched screens
and matched random-number values, and `npm run checkpoint` fails when a session
falls below it. This entry previously claimed the checkpoint "cannot fail on the
development score" as though a gate had been widened. That was wrong: `passed`
was the scoring script's exit code, and that script is a reporter which exits 0
whatever the score, so no predicate could have caught a regression. Nothing
compared the score to anything.

Two limits remain. The ratchet reads only the matched counts, so a change that
keeps every match and alters an unmatched screen is invisible to it. And a
correct change that adds a refusal earlier than a session's current stop lowers
that session legitimately; `score-baseline.mjs lower` records the reason beside
the number, and a pattern of lowerings against one session is worth reading as a
list.

#### recording a debug-mode session needs local setup

Two constraints bind anyone recording a `playmode:debug` case, both found while
closing the `#` prompt slice at `f826ba5`.

The recorder denies debug mode unless its `sysconf` names the running user:
`WIZARDS=root games vtjeng`. That file is gitignored and uncommitted, so a fresh
checkout does not have it. Without it the recorder falls back to explore mode
and diverges from the intended run at PRNG call 202, which looks like a port
defect rather than a setup problem.

And a debug segment cannot be followed by another segment in one recording.
`set_playmode()` renames the hero to "wizard", and `record-session.mjs`
`clearStaleState` strips those files only before a recording's first segment, so
a second debug game in the same recording dies. Record debug cases one segment
at a time; the four in `scripts/run-extended-command-prompt.mjs` are.

This matters beyond the current slice: five development sessions stop at
`wiz_level_change`, so every one of them will need debug-mode recordings.

#### a mistyped substitution name disables a test

A test substitutes its own function for a real one by naming it in the `env`
object a ported function reads:

    const erodeObject = env.erodeObject ?? erode_monster_object;

The lookup accepts any name. `erodeObj` falls through to the real
implementation, so a substitution written to fail the test if it ever runs
never runs, and the suite reports green. Only a substitution with nothing but
that tripwire is silent; one whose call is recorded and asserted afterwards
fails when its name goes stale.

Six places are confirmed, each by renaming a key and watching the suite stay
green on 29 July 2026:

| File | What is disarmed |
| --- | --- |
| `scripts/dogmove.test.mjs` | four tripwires at lines 536, 607, 713, 739; two more at 606 and 639 resolve through `js/dogmove.js` itself |
| `scripts/dogmove-inventory.test.mjs` | the `classified` guard at line 194, and `canCarry` at 347, which passes for the wrong reason |
| `scripts/dogmove-goal.test.mjs` | `couldSee` at line 672, which reaches the asserted outcome through the default |
| `scripts/monmove-items.test.mjs` | the `monsterCanSee` tripwire at line 415 |
| `scripts/monmove-dochug.test.mjs` | five tripwires; line 162 has no positive counterpart at all |
| `scripts/trap-water-damage.test.mjs` | three tripwires at lines 39, 50, 76; no helper exists, the defaults live in `js/trap_water_damage.js:17` |

`scripts/mon.test.mjs` had the same defect and `fcdca9c` fixed it, by rejecting
any override key its helper does not define.

Two mechanisms need different fixes. Where a test helper holds the defaults,
the helper rejects unknown keys. Where production resolves the operation
itself, as `js/dogmove.js:209` and `js/trap_water_damage.js:17` do, the check
belongs in production against the names that file recognises, and it must run
before the first early return: a guard placed after one leaves every path that
returns earlier unprotected.

A worked fix for `js/trap_water_damage.js` turns all three of its silent
renames into failures. It moves the two fallbacks into one frozen table, drops
the third parameter from `waterOperation()`, and calls
`requireKnownWaterOperations(env)` as the first statement of the exported
function. 28 lines added, 12 removed.

`js/dogmove.js` is harder. It resolves operations through five idioms in one
file: an object literal at lines 207-214, bare `??` at line 333, and three
lookup helpers taking the name as a string at lines 397, 455, and 830. A check
there means routing every resolution through one helper backed by one table.
Budget an afternoon.

There are 223 `?? fallback` resolutions across 49 files in `js/`. Most are
covered by no tripwire and need nothing. These seams shrink as the port
advances, so fix the proven six and leave the rest.
