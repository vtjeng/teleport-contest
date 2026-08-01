# Implementation checklist: the hero descends a staircase, slice 3

Working record of implementation evidence for slice 3 of the goal `ROADMAP.md`
opened at `4fe8028`: arriving on a newly generated level. It supplements the
required source review, tests, fresh differentials, and the workflows in
`.agents/workflow.md` and `.agents/review.md`.

Slices 1 and 2 are closed, at `6d7aedd` and `bb4ef50`. Slice 2 stopped
`goto_level()` at its destination choice; this slice runs from there to the
`--More--` the arrival stops on, and through the D:2 screen behind it. Slice 4,
the restore path, stays queued.

## Boundary

- Roadmap item: In progress: the hero descends a staircase, slice 3.
- Starting code commit: `cafc3ae`.
- Starting event: `goto_level()` reaches the destination choice at
  `do.c:1692`, where slice 2 left a fail-closed refusal.
- Ending event: the game has drawn D:2 and waits for the next command.
- Valid inputs: the hero on a down staircase on D:1 pressing `>`, arriving on a
  freshly generated D:2 in the main dungeon, then dismissing the arrival's
  `--More--`.
- Observables: every random-number call `mklev()` makes, which is the bulk of
  this slice's stream; the hero's arrival square; the pets that arrive with
  her; the `--More--` screen; the complete D:2 screen with attributes and
  cursor; and the transit message.

**The boundary has two screens, not one, and the first is not the new level.**
`ROADMAP.md` and this checklist's earlier draft both put the ending event at
"the first drawn screen of D:2". A recording shows otherwise. `goto_level()`
prints "You descend the stairs." at `do.c:1795` while `flush_screen(-1)` at
`1718` has map flushes postponed, and `docrt()` at `1838` calls `cls()`, whose
first statement is `display_nhwindow(WIN_MESSAGE, FALSE)`. The tty port's
`NHW_MESSAGE` arm calls `more()` when the top line still holds an
unacknowledged message, so the run stops there: the recorded screen is D:1's
map with `You descend the stairs.--More--` on the top line and `Dlvl:1` still
on the status line. The turn's monster and hunger processing has not run
either. D:2 appears only after the prompt is dismissed. Every segment of
`scripts/run-leave-level.mjs` therefore ends with a space.

- Exclusions, each justified from source in the table below:
  - `savelev()`'s file writing and all of `getlev()`, slice 4. Its freeing half
    is **not** excluded and is ported in `js/save.js`.
  - The portal, trap-door, level-teleport, endgame, quest, Knox, Sokoban,
    Mines, Rogue-level, big-room and Gehennom arms, none reachable on a D:1 to
    D:2 descent in the main dungeon.
  - Everything `mkshop()` does after choosing a room. D:2 is the shallowest
    level `makelevel()`'s shop test can fire on, and about half the levels
    reachable here ask for one.

## How the candidate list was built

- Upstream entry points: `do.c goto_level()` (1633-1998), from the destination
  choice through the function's return; and, once `mklev()` ran against a live
  `game` for the first time, `mklev.c makelevel()` (1290-1428) for the
  statements a depth greater than one reaches.
- Dispatch tables and catalogs: `svl.level_info[new_ledger].flags`, which
  selects `mklev()` against `getlev()` at `do.c:1692`; the arrival-message
  chain keyed on `In_endgame`, `In_quest`, `Is_knox`, `In_mines`, `In_sokoban`
  and the main-dungeon `else` at 1878-1932; and `makelevel()`'s eleven-arm
  special-room chain at `mklev.c:1344-1375`, whose first arm is the only one a
  depth of two reaches.
- Reachable helpers: traced by reading `do.c:1633-1998` in order, then
  `mklev.c:1290-1428` after the first differential put the divergence there.
- JavaScript cross-check: `grep -rn "mk_knox_portal\|makevtele\|do_mkroom\|
  room_threshold\|do_vault" js/` returned nothing, which is how the four
  statements `makelevel()` skips at depth one were found. `grep -rn
  "gm.mydogs\|mydogs" js/` returned `js/dog.js` alone, confirming that
  `keepdogs()` was the only writer and nothing drained the list. `grep -rn
  "mklev(" js/ scripts/*.mjs` returned `js/allmain.js`, `js/tutorial_startup.js`
  and two test files, confirming that no production caller had ever run it
  against a level other than D:1.
- Remaining limits: `u_collide_m()` has no recorded case. It needs a monster
  standing on D:2's up staircase, which appeared in none of the fresh cases
  scanned for the matrix; `scripts/level-arrival.test.mjs` does not pin it
  either, because the function is not exported.

## Status values

Assign exactly one status to every row: `done`, `no-effect-yet`, `later`,
`cannot-occur`, `missing`, or `undecided`, as
`.agents/implementation-checklist-template.md` defines them.

## Implementation table

| Upstream function or branch family | Reachability and ordering | JavaScript owner | State, randomness, and output | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| `update_mlstmv()`, `do.c:1642` | Runs when `!cant_go_back`, the ordinary case | `js/dog.js update_mlstmv()` | Ages the leaving level's monsters | `scripts/level-arrival.test.mjs` pins the walk and its DEADMONSTER skip | `done` | None |
| `savelev()`, `do.c:1650` | Runs on the way out even on a first descent | `js/save.js savelev()` | Marks the ledger VISITED, releases the level's timers and light sources | The decision is recorded in the file header: a port that writes no level file still owes the FREEING half, because a D:1 corpse's rot timer and a D:1 candle's light would otherwise follow the hero to D:2. `scripts/level-arrival.test.mjs` pins all three effects | `done` | None |
| `save_timers(RANGE_LEVEL)` and `save_light_sources(RANGE_LEVEL)` | Inside `savelev()` | `js/timeout.js`, `js/light.js` | Frees level-local timers and light sources | The two `mon_is_local` definitions differ between `timeout.c` and `light.c:373`; both are ported separately and pinned | `done` | None |
| The `cant_go_back` arm, `do.c:1652-1663` | Needs endgame or tutorial | `js/do.js` | Discards levels | Both are refused at `do.c:1504-1515` earlier in the same function | `cannot-occur` | None |
| `assign_graphics()` on a Rogue level, `do.c:1665` | Needs `Is_rogue_level` | `js/display.js` | Swaps the symbol set | `dat/dungeon.lua` puts the Rogue level between depths 15 and 18 | `cannot-occur` | None |
| `check_gold_symbol()`, `do.c:1667` | Unconditional | None | Writes `iflags.invis_goldsym` | Neither the flag nor a reader of it exists in the port, and a level change does not alter `gs.showsyms`; recorded in a comment at the call site | `no-effect-yet` | None |
| `recbranch_mapseen()`, `do.c:1671` | Needs `u.uz.dnum != newlevel->dnum` | `js/dungeon.js` | Branch memory | D:1 to D:2 keeps `dnum` | `cannot-occur` | None |
| The three `assign_level()` calls and `u.utotype`, `do.c:1673-1676` | Unconditional | `js/do.js goto_level()` | Moves `u.uz`, `u.uz0`, `u.utolev` | The matrix, whose D:2 screen depends on every later reader of `u.uz` | `done` | None |
| `dunlev_reached` update, `do.c:1677-1684` | `!builds_up()` arm on the main dungeon | `js/dungeon.js dunlev_reached()`/`set_dunlev_reached()` | Deepest level reached | `scripts/level-arrival.test.mjs`; the `builds_up` arm refuses, and no dungeon reachable by staircase from D:1 builds up | `done` | None |
| `stairway_free_all()`, `do.c:1686` | Unconditional | `js/stairs.js stairway_free_all()` | Frees the leaving level's stairs | `scripts/level-arrival.test.mjs` | `done` | None |
| The `updest`/`dndest` memsets, `do.c:1688-1690` | Unconditional | `js/do.js goto_level()` | Clears the default destination areas | `js/teleport.js teleJumpOk()` is the reader; both are reset to `{}` as `js/tutorial_startup.js` does | `done` | None |
| `mklev()`, `do.c:1699`, and the `LFILE_EXISTS` selector | First visit | `js/mklev.js`, `js/dungeon.js level_info()` | **Generates the level; the bulk of this slice's random-number calls** | The matrix matches C's whole `mklev()` stream for nine fresh D:2 levels | `done` | None |
| `mklev.c makelevel()`'s vault tail: `mk_knox_portal()` at 1331 | Runs whenever a vault is placed, which depth one never reached in the seeds the port was built on | `js/mklev.js mk_knox_portal()` | Draws `rn2(3)`; defers the Fort Ludios branch | Found by the first fresh differential, which diverged one call earlier than the vault teleporter. Its placement half needs a depth above ten and refuses | `done` | None |
| `makelevel()`'s special-room chain, `mklev.c:1344-1375` | `u_depth > 1` makes the shop arm live; every other arm needs `u_depth > 4` | `js/mklev.js`, `js/mkroom.js do_mkroom()` | `rn2(u_depth)`, then `mkshop()` | The matrix: nine D:2 levels reproduce the `rn2(2)` and the room search | `done` | None |
| `mkroom.c mkshop()` past its room search | Fires whenever the search finds an ordinary, stairless, single-door room | `js/mkroom.js mkshop()` | `rnd(100)` shop type, room lighting, `stock_room()`, `shkinit()` | Stops. The port stocks only the two themed "twin business" shop types `dat/themerms.lua` names; a shop chosen from the whole `shtypes[]` table is the shop work | `missing` | Port with the shop goal; about half of D:2 levels stop here |
| `reglyph_darkroom()`, `do.c:1713` | Unconditional | None | Rewrites dark-room glyphs | `mklev()` has just replaced the map, so every square is unexplored and no arm of its double loop matches; its closing `showsyms` assignment depends only on options a level change does not alter | `no-effect-yet` | None |
| `set_uinwater(0)`, `do.c:1714` | Unconditional | `js/hack.js set_uinwater()` | Clears `u.uinwater` | Connected at the call site | `done` | None |
| `vision_reset()`, `gv.vision_full_recalc = 0`, `flush_screen(-1)`, `do.c:1716-1718` | Unconditional, before the arrival arm | `js/vision.js`, `js/display.js flush_screen()` | Clears line of sight; **postpones the map flush** | `flush_screen(-1)` now toggles a module-level `delayFlushing` exactly as C's function-static does. The `--More--` screen is the evidence: it shows D:1's map and `Dlvl:1`, which is only possible if the map flush was postponed across the whole arrival | `done` | None |
| The portal arm, `do.c:1720-1745` | Needs `portal` | `js/do.js` | Places the hero at a portal | `portal` is FALSE on every `next_level()` call | `cannot-occur` | None |
| The `at_stairs` down arm's placement, `do.c:1766-1773` | `stairway_find_from()`, else `u_on_sstairs(0)`, else `u_on_upstairs()` | `js/stairs.js stairway_find_from()`, `js/dungeon.js u_on_newpos()` | Sets the arrival square and `u_traversed` | `mklev()` always makes an up staircase leading back the way the hero came, so the first arm is the one that runs; the other two refuse | `done` | None |
| The descent transit messages, `do.c:1774-1800` | Four arms: `!u.dz`, `Flying`, the fall arm, and ordinary descent | `js/do.js goto_level()` | Ordinary arm prints under `flags.verbose` | The matrix records "You descend the stairs." The fall arm calls `rnd(3)` and needs `near_capacity() > UNENCUMBERED`, `Punished` or `Fumbling`: a burdened hero has picked something up, which is unported; `Punished` is refused at `do.c:1616`; and no hero the port builds has `FUMBLING`. It refuses | `done` | None |
| The trap-door and level-teleport arm, `do.c:1802-1810` | Needs `falling` or level teleport | `js/do.js` | `u_on_rndspot()` | `falling` is refused at `do.c:1612` | `cannot-occur` | None |
| `placebc()`, `do.c:1812` | Needs `Punished` | `js/ball.js` | Places the ball and chain | Refused at `do.c:1616` in slice 2 | `cannot-occur` | None |
| `obj_delivery(FALSE)` and `obj_delivery(TRUE)`, `do.c:1813` and `1978` | Unconditional | `js/do.js obj_delivery()` | Delivers migrating objects | `gm.migrating_objs` has no writer in the port; the guard stops if one appears | `no-effect-yet` | None |
| `losedogs()`, `do.c:1814` | Unconditional | `js/dog.js losedogs()` | **Drains the `gm.mydogs` list slice 2 fills** | Two matrix segments walk a dog down the stairs and match the arrival screen cell for cell | `done` | None |
| `mon_arrive()`'s `With_you` arm | Called once per monster on `gm.mydogs` | `js/dog.js mon_arrive()` | `rn2(mtmp->mtame ? 10 : ...)`, then `rloc_to()` or `mnexto()` | The matrix. Its independent-arrival modes refuse, and a follower that is not tame refuses because `mnexto()` stands in for `set_apparxy()` | `done` | None |
| `kill_genocided_monsters()`, `do.c:1815` | Unconditional | `js/do.js kill_genocided_monsters()` | Removes genocided species | `G_GENOD` is set only by `read.c do_genocide()`, which no ported command reaches; the guard stops if one is set | `no-effect-yet` | None |
| `run_timers()`, `do.c:1821` | Unconditional, after the two deliveries | `js/timeout.js run_timers()` | Fires timers that expired while away | The level's own timers left with it in `savelev()`; a global timer due on the arrival turn stops, because no `timeout_funcs[]` table is ported | `done` | None |
| `u_collide_m()`, `do.c:1825` | Fires when a monster occupies the arrival square | `js/do.js u_collide_m()` | `rn2(2)`, `enexto()`, `next2u()`, then `u_on_newpos()` or `mnexto()` | Ported and connected; **no recorded case**. None of the fresh cases scanned for the matrix put a monster on D:2's up staircase. Its `rloc()`/`m_into_limbo()` tail refuses | `undecided` | Record a case, or pin it by test, when a later goal admits one |
| `movebubbles()`, `fumaroles()`, `do.c:1829-1832` | Needs the water or air level, or a fumarole flag | None | | Neither exists in the main dungeon above the Plane of Water | `cannot-occur` | None |
| `vision_reset()`, `reset_glyphmap()`, `notice_mon_off()`, `docrt()`, `flush_screen(-1)`, `do.c:1835-1839` | Unconditional; **the map is built here** | `js/vision.js`, `js/display.js docrt()`, `js/hack.js` | Full vision recalc and repaint; `docrt()`'s `cls()` is what stops for the `--More--` | The matrix's two screens. `docrt()` now performs C's `vision_recalc(2)`, `cls()` and `vision_recalc(0)`; `reset_glyphmap()` has no port counterpart, because the port maps each glyph as it draws it and `Is_rogue_level` is false either side of this descent | `done` | None |
| The Gehennom, endgame, quest, Knox, Mines, Sokoban and big-room arrival arms, `do.c:1858-1932` | Each keyed on a dungeon test | `js/do.js` | Messages and achievements | Each dungeon test is false for D:2 of the main dungeon; the quest-entrance and big-room arms are written out and refuse | `cannot-occur` | None |
| `deliver_splev_message()`, `do.c:1855`, and `temperature_change_msg()`, `do.c:1934` | Unconditional | `js/do.js` | May print | `gl.lev_message` and `svl.level.flags.temperature` are written only by a Lua level description; both guards stop if one is set | `no-effect-yet` | None |
| The `new` block, `do.c:1943-1965` | `new` is TRUE on a first descent | `js/do.js goto_level()` | `describe_level()` and `livelog_printf()` write no screen; the Tourist arm changes experience | The livelog is a file the port does not write; the Tourist arm refuses, because `more_experienced()` and `newexplevel()` are unported | `done` | None |
| `assign_level(&u.uz0, &u.uz)`, `notice_mon_on()`, `notice_all_mons(TRUE)`, `do.c:1967-1972` | Unconditional | `js/do.js`, `js/hack.js` | Reveals monsters | Connected at the call site; the matrix's D:2 screen is drawn through them | `done` | None |
| `print_level_annotation()`, `do.c:1974` | Unconditional | None | May print | The port keeps no `mapseen` chain, so `get_annotation()` has nothing to answer with; the same gap is recorded at `recalc_mapseen()` in slice 2 | `no-effect-yet` | None |
| `check_special_room(FALSE)`, `do.c:1976` | Unconditional | `js/rooms.js check_special_room()` | Room entrance message | Extended past its early return: the entered-room loop now runs, and every room type whose arm prints, wakes a monster or clears a level flag stops. An ordinary or themed room takes C's `default` arm, which does nothing | `done` | None |
| `in_out_region()`, `do.c:1981` | Unconditional | `js/region.js in_out_region()` | Region entry effects | Connected at the call site | `done` | None |
| `fix_shop_damage()`, `do.c:1986` | Needs `!new` | `js/shk.js` | Shop repair | `new` is TRUE on a first descent | `cannot-occur` | None |
| The `do_fall_dmg` arm, `do.c:1989-1992` | Needs `falling` | `js/do.js` | `d(dist, 6)` and `losehp()` | `falling` is refused at `do.c:1612` | `cannot-occur` | None |
| `pickup(1)`, `do.c:1993` | Unconditional, the last statement | `js/pickup.js pickup()` | **Picks up or lists objects on the arrival square** | The two arms that answer without taking anything are ported: the early return for an empty square, and the `autopickup && !flags.pickup` arm into `check_here()`. The selection half, which needs `autopickup` set, stops | `done` | None |

## Missing work by owner

1. `js/mkroom.js mkshop()` and `js/shknam.js stock_room()`, the shop: the type
   roll from `shtypes[]`, the room lighting, the stocking and `shkinit()`.
   About half the D:2 levels this slice can reach stop here, so it is the next
   boundary the descent goal meets and is large enough to be a goal of its own.
2. `js/do.js u_collide_m()`: ported and connected, with no recorded case and no
   test. Its `rn2(2)` is the only unproven random-number call in the arrival.

## Validation

- Commit checked: recorded in the commit message for this slice.
- Source review: `do.c:1633-1998` and `mklev.c:1290-1428` traced in order
  against the port, with every branch classified in the table above.
- Focused tests: `node --test scripts/level-arrival.test.mjs`, 16 tests
  passing.
- Full suite: `npm run checkpoint`, 2,301 tests passing.
- Generated-file checks: all five pass inside `npm run checkpoint`.
- Fresh differentials: `node scripts/run-leave-level.mjs`, nine segments,
  reduced from slice 2's prefix assertion to `runFreshMatrix()`: 44,572
  random-number calls, 168 screens and 168 cursors, all strict.
  `scripts/leave-level-matrix.test.mjs`, which existed only to pin that weaker
  verdict, is deleted. Varied across the segments: seed (six), role (four),
  race (two), gender (two), alignment (three), starting pet (present and
  absent), the walk to the staircase, and whether the segment descends at all.
- Development score: 488 of 7,765 screens and 106,354 of 610,816 random-number
  values, against 487 and 100,910 at `bb4ef50`.
  `seed0030-ten-diverse-deaths` needs its ratchet lowered from 6,455 matched
  calls to 6,434. Its first divergence is at index 6,336 both before and after
  this slice, and its emitted screens are unchanged at eight; what moved is the
  number of coincidental positional matches *after* that stop, because the port
  now descends in a later segment and draws different numbers there.
  `.agents/validation.md` records this property of `rngMatched` under "Facts
  about the measuring tools".
- Quality check: `npm run quality` is the orchestrator's to run.
- Browser check: not required. `.agents/validation.md` exempts shared engine
  changes when the renderer is unchanged. This slice draws a level the port has
  never rendered, but through the same `_buildScreenOutput()` and the same
  `newsym()`; the only display change is `flush_screen()`'s postponement flag
  and `docrt()`'s new `cls()` call, both of which the tty differential above
  compares cell for cell.

## Mutation survivors

`npm run checkpoint` mutates one operator at a time in the changed `js/` lines
and reports the mutants no test failed on. The first wave judges each mutant by
the test files that reach its module without passing through another `js/`
module, and the escalation re-runs every one against the whole suite. What
survives the escalation is recorded here, with the reason no test kills it.

The first wave left 81 of 143 mutants alive; the single whole-suite escalation
cut that to 64, so 17 were false survivors killed by tests that reach their
module through another. Tests written against the remaining list bring the
first wave to 47 survivors of 143. What the reasons below cover is what is
left.

- **`js/mklev.js`, 21 survivors, all in `makelevel()`'s special-room chain
  (537-563, 624-630).** Every arm below the shop needs a depth greater than
  four, and `js/mkroom.js do_mkroom()` stops on each of those room types
  before it does anything, so no test can tell `u_depth > 4` from
  `u_depth >= 4`: both answers reach the same refusal. The shop arm itself,
  the one arm a test can run, is pinned by `scripts/level-arrival.test.mjs`
  and by nine matrix segments. The `mk_knox_portal()` survivors at 624-630
  are the deferral guard's depth window, which no level above depth ten can
  enter; the `rn2(3)` that precedes it is what the matrix compares.
- **`js/do.js`, 16 survivors, all in `goto_level()`'s arrival phase.** Its one
  covering test file is `scripts/dodown.test.mjs`, and its descending tests
  now run the whole arrival, so the mutants that survive are the guards whose
  two answers reach the same place: the `dunlev_reached` comparison on a level
  the hero has already reached, the `isNew` flag whose only readers are arms
  that refuse, the `false`/`true` arguments to `obj_delivery()` and
  `set_uinwater()` which are inert while their lists are empty, the fall arm's
  disjunction whose three terms are each unreachable, the quest-entrance
  guard's `u.uevent` terms, and `u_collide_m()`'s own guard, which has no
  recorded case at all. Each is named in the implementation table above with
  the source condition that makes it inert.
- **`js/dog.js`, 4 survivors.** `mon_arrive()`'s `!monster.mtame &&
  monster !== u.ustuck` refusal and `losedogs()`'s two list walks: the port
  admits only a tame follower, so the second term of each conjunction is
  unreachable while the first holds.
- **`js/teleport.js`, 5, and `js/pickup.js`, 14, both now closed.**
  `scripts/teleport.test.mjs` exercises each term of `rloc_to()`'s
  side-effect guard and its already-placed refusal;
  `scripts/pickup.test.mjs` exercises each arm of `pickup()`, including the
  three states that send an occupied square down the early return and the
  travel-command run the selection half leaves running.
- **`js/dungeon.js:641`, `js/mkroom.js:173, 238`, `js/rooms.js:239:36`.**
  Loop and range bounds one step outside what a fabricated fixture can reach:
  `dungeon_branch()`'s dungeon scan, `has_upstairs()`'s list walk,
  `mkshop()`'s `hx < 0` terminator, and `check_special_room()`'s
  `rt >= SHOPBASE`, which `move_update()` makes unreachable by routing a shop
  into `u.ushops_entered` first. The last has its own case in
  `scripts/level-arrival.test.mjs`, which asserts the shop guard answers
  instead.

## Readiness

Current readiness: `Implementation`

Reason: two rows are open. `mkroom.c mkshop()` past its room search is
`missing` and stops about half the D:2 levels this slice can reach.
`u_collide_m()` is `undecided`: it is connected on the live path but no
recorded case reaches it.
