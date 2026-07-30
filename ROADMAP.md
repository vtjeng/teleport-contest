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

The goal below was selected from the `scan-stops.mjs` census at `861d2eb`.
Every session and step count in it is a ceiling taken from that census and goes
stale as the port advances; re-run the scan for current numbers. The traced
source findings do not go stale, which is why they are recorded here rather
than re-derived.

### In progress: a monster or pet picks up an object

A pet or an ordinary monster lifts an object off the floor square it stands on.
The player sees `The kitten picks up a gold piece.` or
`Slasher picks up a food ration.`, the square redraws, and play continues.

In scope: a pickup whose C body runs from `can_carry() > 0` through to
`check_gear_next_turn()` without leaving `dogmove.c dog_invent()` (443-474) or
`mon.c mpickstuff()` (1847-1912). Two conditions keep it there. The carrier has
no `AT_WEAP` attack, or its `weapon_check != NEED_WEAPON`, so
`mon_wield_item()` is never entered. And the object is not a `BOULDER`, so
`remove_object()` at `mkobj.c:2517-2518` does not call `recalc_block_point()`.

Excluded: `dog_eat()` and `postmov()`'s `meatmetal`, `meatobj` and
`meatcorpse` arms, which stay refused as pet eating and ordinary monster item
interaction; `relobj()` dropping; `mon_wield_item()`; and shop billing beyond
what `mpickobj()` already ports.

**Traced source findings.**

- The decision is ported and only the effect is missing.
  `js/dogmove.js:418-429` already evaluates `can_carry`, `!obj->cursed`,
  `could_reach_item()`, `rn2(20) < apport + 3` and
  `rn2(udist) || !rn2(apport)` in C's nesting order, then throws at the
  injected `pickObject`. `js/monmove.js:1995 select_postmove_object_action()`
  likewise spends `mpickstuff()`'s `rn2(25)` shop draw and selects the object
  before refusing. The PRNG stream up to the boundary is already correct, which
  is why this goal adds an effect rather than a decision.
- Nearly every helper has landed: `mpickobj()` with its preflight
  (`js/steal.js:139`), `obj_extract_self()` (`js/invent.js:828`),
  `remove_object()` (`js/obj.js:1731`), `splitobj()` (`js/obj.js:511`),
  `can_carry()` (`js/moncarry.js:30`), and the `objnam.c` naming trio. The
  genuinely new C is `objnam.c distant_name()` (347-409) and the message.
- `dog_goal()` already steers the pet onto the boundary. `dogmove.c:510-561`
  scans a radius-5 box for food and apport goals, and that scan is ported, so
  the port walks the pet to the object and stops there.
- No vision debt attaches, provided boulders stay excluded. Nothing on this
  path calls `vision_recalc()`, so the cloned planning scan's refusal recorded
  under `## Unresolved` is not in the way.

**Census.** Two sessions stop here with 1,989 steps behind them. That is a
ceiling, not a prediction: `seed0030` is a ten-deaths session and re-blocks on
combat quickly. The `mpickstuff()` half owns no first-stop row at all, so its
value is not visible in the census.

**Why this rather than a larger row.** The closed-door goal's holdout gained
21 screens on 11 sessions against development's 9 on 33, and the goals before
it carried over at half, two-thirds and nothing. The distinguishing property
looks like where a boundary sits: a closed door is met within a few steps of
most levels, while `s`, `#` and a run command are reached only by sessions that
get that far and choose them. This boundary fires inside background monster
movement at steps 7 and 8 of its two sessions, so a session that merely walks
around reaches it, with no player command required. Expect carry-over above the
development rate but below the closed door's, since a pickup also needs a
fetchable object within radius 5 and an apport roll where a doorway is
unconditional.

The two largest census rows lose on the same axis and are already reassigned.
`levelchange` (5 sessions, 1,785 steps) is a wizard extended command reached
only by tour sessions, and this file argues it belongs to an experience-level
family. The repeated-command row (9 sessions, 2,011 steps) is not one goal: it
decomposes into apply, eat, quaff and cast, which belong to item interaction,
`wizlevelport`, which belongs to relocation, and the `@` and `m` prefixes.

**Queued slices.**

1. `distant_name()` and the shared pickup body, wired at `dog_invent()`'s carry
   arm.
2. `mpickstuff()` at `postmov()`'s object arm, replacing the take half of the
   ordinary-monster refusal.
3. The `minvis` redraw, if slice 2's fresh case does not reach it. The
   split-stack arm this slice originally listed landed with slice 1:
   `can_carry()` caps a nohands pet at one item, so every gold pickup splits
   and refusing it would have been code deleted immediately.

One subsystem and well under 500 production lines, so no implementation
checklist is created. Revisit that if `preflightObjectName()` forces a broad
`objnam.c` expansion.

**What slice 1 left for slice 2.** Every pickup poisons the following turn.
`check_gear_next_turn()` sets `I_SPECIAL`, so `assertSimpleScanState()` stops on
`monster equipment changes` and `assertSimpleActionState()` stops on
`pet inventory`. Both have to lift together, and lifting the second forces the
planning clone to cover monster inventories as well — `cloneFloorObjects()`
covers only the floor today.

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
  this attaches to. One session stops on a diagonal doorway refusal.
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
- `hack.c:test_move()`'s two zero-time diagonal doorway refusals, which set
  `svc.context.move` to FALSE, call `nomul(0)`, and print through
  `flags.mention_walls`. Both are refusals rather than moves, so the admission
  seam stops on them; porting them means owning a no-time refusal that still
  paints a frame.
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

#### eleven monster-pickup findings are deferred

The correctness pass over `5879bed..2fea8eb` confirmed fourteen findings; three
were applied and eleven are recorded here. They divide into three groups.

**A production gap.** `refuseHeroAttack()` is presented as a complete stand-in
for `mhitu.c mattacku()` on the range2 path, but it enumerates only `AT_BREA`,
`AT_SPIT`, `AT_GAZE` and `AT_WEAP` and omits `mattacku()`'s
`find_offensive()`/`use_offensive()` path, so a monster that would use an
offensive item is admitted where C acts. Fix it with the combat work, which is
where `mattacku()` lands.

**Assertions that do not discriminate**, each verified by mutation with the
suite green:

- `select_postmove_object_action()`'s new `carryamt` is pinned by no test and
  no matrix segment, so the whole split-stack arm of `mpickstuff()` can be
  disabled. Reporting the full stack would empty a floor square C leaves a
  remainder on, print a different quantity, and drop one `rnd(2)` draw, which
  desynchronises the rest of the segment.
- `panicattk`'s `range.scared` condition: the one `MMOVE_NOMOVES` case sets
  `scared` true, so the flag can be made unconditional.
- `dochug()`'s new `!noattacks(monster.data)` term: the four tests touching the
  gate were edited to satisfy it rather than to pin it, and an attackless
  species standing beside the hero would stop a segment C plays through.
- `refuseHeroAttack()`'s `AT_WEAP` arm, the `select_rwep()` check, has no test
  while its three siblings do.
- `scripts/mon.test.mjs pickupState()` states a false C fact — a gnome is not
  `M2_GREEDY` — and two of the six new `mpickstuff` tests build a
  gnome-plus-gold fixture on it.

**Comments that misdescribe their code:** `is_drawbridge_wall()`'s export
contradicts `js/invent.js:207`, which still documents the same predicate as
unported; `postSimpleMove()` reads injected message and redraw owners for the
movement notice then hardcodes `ttyPline`/`newsym` for the pickup; and the
comment calling `mattacku()`'s preamble inert cites `!ranged`, which C computes
from the hero's real position, where the guard below tests something else.

#### the planning clone's object copy is still expensive

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

`js/objects.js defineObjclassAliases()` installs eight aliases — `oc_skill`,
`oc_armcat`, `a_ac`, `a_can`, `oc_bimanual`, `oc_bulky`, `oc_hitbon` and
`oc_level` — as non-enumerable properties, so a spread copy silently drops
them. `planningState()` cloned the catalog with `{ ...entry }` from `8bd4d6a`
until `39e5df1`, which meant the dry run read `undefined` for all eight and
took different branches from the live pass.

`copyObjclassEntry()` in `js/objects.js` is now the only correct way to copy a
catalog entry, and the generator emits it. The general lesson is recorded here
because the same trap applies to any state the port clones: a spread is not a
copy when the source uses `Object.defineProperty`.

#### five pickup assertions do not discriminate

The correctness pass over `f826ba53..4d78313` confirmed five test gaps that its
fixes did not close, all of the same shape: the assertion holds whether or not
the behavior it names is present.

- `cloneLightList()` and `cloneTimerList()` gained object-remap arms
  (`?? objectMap.get(source.id)` and `?? objectMap.get(source.arg)`); removing
  either leaves the suite green.
- The `wieldPickedItem: () => unsupported('pet weapon selection')` refusal has
  no test, and the same diff deleted the `pony pickup` entry from the
  preflight's starting-pet case list.
- Nothing pins `newsym()` running when the hero cannot see the pet's square:
  gating the redraw on `cansee()` leaves every test passing.
- `dog_invent names nothing on a square the hero cannot see` exercises that
  branch without pinning it; every assertion holds either way. No fresh case
  covers it either, because 800 seeds produced none.
- `distant_name()`'s `obj.oartifact` disjunct, the arm that makes an artifact
  count as near however far it lies, has no test and can be removed with the
  suite green.

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

1. **Combat and creatures:** complete melee, damage and death, the remaining
   monster and pet behavior, monster inventory, conditions, and common creature
   abilities.
2. **Item interaction:** inventory commands and menus, wield/wear, eat/quaff,
   read/zap, apply, throw, drop, identification, and equipment effects.
3. **Levels and persistence:** level transitions, deeper and special levels,
   save/restore, bones, and cross-segment state.
4. **Long tail:** shops, advanced spells and effects, rare monsters and items,
   endgame branches, and remaining valid commands and options.
