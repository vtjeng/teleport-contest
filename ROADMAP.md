# Source-faithful port roadmap

This file records the goal in progress, the goals selected after it, and
unresolved debt. It holds state, not rules. `AGENTS.md` remains the authority
for implementation, validation, holdout, quality, and attribution rules, and
`.agents/selection.md` states how to read the `scan-stops.mjs` census, how the
census picks a goal inside the current milestone, how a goal is sized, and how
this file is kept short.

## Current milestone: exploration

**Objective:** movement beyond the first unobstructed step, then running,
search, doors, traps, pickup, stairs, terrain effects, vision, and status
updates. This is what a hero does moving around a level before fighting or using
items, and it comes first because a hero who cannot walk cannot reach a monster,
an object, or the stairs.

The goal below was selected from the `scan-stops.mjs` census at `5397a2f`.
Every session and step count in it is a ceiling taken from that census and goes
stale as the port advances; re-run the scan for current numbers. The traced
source findings do not go stale, which is why they are recorded here rather
than re-derived.

Two goals have now closed with zero holdout movement between them, on 17
development screens. Exploration's high-incidence work is done, and what the
census still holds inside this milestone is a tail of coincidence-gated
boundaries. Expect flat holdout returns until the milestone closes and combat
opens; that is a reason to keep choosing on the census rather than hunting for
a boundary that will carry over.

Every session and step count written into a goal is a ceiling taken from the
census that selected it, and goes stale as the port advances. Traced source
findings do not go stale, which is why they are recorded here rather than
re-derived.

### Closed: a monster triggers a floor trap

A monster or pet walks onto a trap and the trap fires. The hero hears
`You hear an A note squeak in the distance`, or sees
`The kitten is almost hit by a dart!`; the dart lands on the floor, and nearby
monsters wake.

In scope: `trap.c mintrap()` (3733-3840) through `trapeffect_selector()` (2937)
and the **monster arm** of each `trapeffect_*()` body, for the trap types
`mklev.c traptype_rnd()` can return at `level_difficulty() == 1` — that is,
whose case either does not exist or does not force `kind = NO_TRAP` when
`lvl == 1`: ARROW_TRAP, DART_TRAP, ROCKTRAP, SQKY_BOARD, BEAR_TRAP, RUST_TRAP,
PIT, MAGIC_TRAP and ANTI_MAGIC. With them come `t_missile()`, `thitm()`,
`trapnote()`, `floor_trigger()`, `check_in_air()`, and `mondata.c`'s
`mon_learns_traps()` and `mons_see_trap()`.

Excluded: every type `traptype_rnd()` forces to `NO_TRAP` at depth one; HOLE,
TRAPDOOR and TELEP_TRAP, whose monster arms relocate the victim and which the
relocation family below already owns; and **every hero arm**. The caller in
scope is `mintrap()`, not `dotrap()`, so each `trapeffect_*()`'s
`mtmp == &gy.youmonst` branch stays refused: it has no live consumer here and
needs `thitu()`, `losehp()` and `poisoned()`.

**Traced source findings.**

- The call site is `monmove.c:1509`, inside the `postmov()` the previous goal
  built, which is why that goal left the position open.
- All three blocked sessions reach only two trap types, read from their
  recorded top lines: SQKY_BOARD twice and DART_TRAP once. `seed1500`'s dart is
  a *miss*, `thitm()`'s `!strike` arm, so no monster-death path is needed to
  close any of them.
- Nearly every prerequisite has landed: `t_at()`, `maketrap()` and
  `choose_trapnote()` in `js/trap.js`; `mon_knows_traps()` in `js/mondata.js`;
  `wake_nearto()` in `js/mon.js`; `You_hear()` in `js/monmove.js`; and
  `stackobj()`/`place_object()`.

**Census.** Three sessions stop here with 177 steps behind them. Two of them
stop at step 4, so nearly whole sessions stand behind it, and
`seed0013-friday13-save-then-fullmoon-restore` is a save-then-restore session,
so closing it also exercises cross-segment storage. No new command sequence is
involved.

**The seam this goal must pay for.** Two refusals have to go: `js/monmove.js`'s
post-move trap guard and `assertSimpleDestination()`'s in
`js/unported_monster_actions.js` — and the second is the **planning clone**.
`mintrap()` draws inside the dry run: `rn2(4)` on `already_seen`, `rnl(5)` on
`madeby_u`, and `rn2(15)` and `rnd(20)` in `thitm()`. The clone must reproduce
every one call for call. That clone produced eight silent divergences across
the monster-door goal, two of them introduced by the fixes themselves, so
budget for it rather than treating it as incidental.

**Why this row.** It is the highest-ranked row that genuinely belongs to
exploration. The two above it do not: the repeated-command boundary decomposes
across item interaction, relocation and prefix work, and `#levelchange` is the
experience-level family this file already reassigned. `pet inventory` carries
more steps but its ceiling is measured — the pickup goal moved those same two
sessions exactly one step.

**On choosing the next one.** Six goals now have holdout results, and the last
two carried nothing on 17 development screens. `incidence x runway` predicted
that correctly, but the runway term has stopped discriminating: `seed1500`
re-blocks on `pet inventory` two steps past the dart. The census remains the
right instrument, because it is the only one that measures incidence at all;
the tiebreak that should replace runway is **downstream reuse** — how much of
the ported C a later milestone calls. Traps score well on it: `mintrap()` is
called from six other C files, `thitm()` serves three trap types, and each
`trapeffect_*()` body already contains the hero arm combat will need.

**Slices, both closed.**

1. A squeaky board under an unseen monster: the `mintrap()` wrapper,
   `trapeffect_selector()`, `trapeffect_sqky_board()`'s monster arm, and
   `trapnote()`. Closed at `bf96cda`; moved two sessions from 4 screens to 8.
2. A dart trap under a monster the dart misses: `t_missile()`, `thitm()`'s
   miss path, and `trapeffect_dart_trap()`. Closed at `b51b1d2`; moved no
   development session at all.

This goal crosses `trap.c`, `monmove.c`, `mon.c` and object placement, and is
expected to span sessions, so an implementation checklist is created when its
first slice opens.

**Closed at `628d9fe`.** Both slices ported and reviewed; the authorized
holdout evaluation returned 138 of 3,640 screens and 30,048 of 182,022 PRNG
values, 1 of 11 sessions — **identical to the previous three measurements**.
Development rose 459 to 467 screens and 99,980 to 100,825 calls, all from slice
1.

**Three consecutive goals have now carried over nothing.** The pickup goal
gained +1 development and +0 holdout; the door goal gained and carried nothing;
this one gained 8 screens and carried nothing. Before those, the run was +21,
+17 and a first passing holdout session. The instrument that picked all three
is the census — incidence times runway, then incidence times downstream reuse —
and it has now mispredicted carry-over three times running while continuing to
predict development movement correctly. That is a specific, falsifiable claim
about the selector, and the next goal selection should treat it as one: the
census measures what unblocks *development* sessions, and development and
holdout sessions stopped agreeing about three goals ago. Whatever replaces it
has to be validated against the holdout record above, not against development
movement.

**A prediction this goal got wrong, and the census did not cause it.** The
goal statement above said `seed1500`'s dart is a miss and that closing the miss
path would unblock it. It does not: `seed1500` stops earlier, on `simple
monster action requires pet cursed-object feedback`, with its random-number
prefix unchanged by the slice.

An earlier version of this note blamed the census for counting what a session
*contains* rather than what it stops on. That was wrong, and the correction
matters because it moves the fault. `scripts/scan-stops.mjs` reports "the
fail-closed boundary the port reaches **first**" for each session -- first
refusal is exactly what it measures. `.agents/selection.md` also states, in
terms, that the steps behind a boundary are an upper bound and that "sessions
blocked on one owner routinely block again on another", and it names the only
sound measurement: apply the candidate change and re-run the scan.

Two real mistakes produced the wrong prediction, and neither is the
instrument's. The trap types were read from the sessions' **recorded top
lines** instead of from the scan, which is the same move `AGENTS.md` forbids
for implementation -- a recorded trace points at an owner, it does not specify
one -- and it is no more reliable for selection. And the documented upper-bound
rule was not applied: nothing re-ran the scan against the candidate before the
slice was promised.

So the census's own caveats would have caught this. Do not replace an
instrument for a failure its documentation already warns about; use it as
written.

That is the second prediction this file has recorded and then falsified: the
pickup goal was chosen on "fires without a player command" and gained +1
development, +0 holdout. Both errors share a shape -- a property that is
necessary for the session to move but not sufficient.

## Explicit future exploration work, outside the goal in progress

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

### Process

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

## Later milestones

This list selects the next milestone; `scripts/scan-stops.mjs` selects goals
inside whichever milestone is current. After the current milestone, proceed in
this order:

**An open ordering question, to settle when exploration closes rather than
now.** The `flush_screen()` goal under `## Unresolved` is not urgent while all
emitted screens match, and it owns no fail-closed boundary. But it stops being
optional the moment the extended-command family opens: thirteen of the
thirty-three development sessions stop on an extended command — five on
`#levelchange`, two on `#ride`, and one each on `#loot`, `#name`, `#chat`,
`#twoweapon`, `#pray` and `#wizwish` — and every one of those goals draws a
prompt or a menu straight into the two defects that entry records. Whether it
therefore precedes combat is a milestone-order decision, and this file is where
it gets made. Exploration has roughly two goals left, so it is not due yet;
what is recorded here is the argument, so it does not have to be rediscovered.

Exploration is not exhausted. Three census rows still belong to it by the
objective's own wording of doors, traps and pickup — monster trap activation,
the floor object pile, and door or special terrain movement — plus two
fragments of the repeated-command row, the `m` prefix and `@` autopickup.
Everything else the census names belongs to a milestone below.

1. **Combat and creatures:** complete melee, damage and death, the remaining
   monster and pet behavior, monster inventory, conditions, and common creature
   abilities.
2. **Item interaction:** inventory commands and menus, wield/wear, eat/quaff,
   read/zap, apply, throw, drop, identification, and equipment effects.
3. **Levels and persistence:** level transitions, deeper and special levels,
   save/restore, bones, and cross-segment state.
4. **Long tail:** shops, advanced spells and effects, rare monsters and items,
   endgame branches, and remaining valid commands and options.
