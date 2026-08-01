# Implementation checklist: the hero descends a staircase, slice 3

Working record of implementation evidence for slice 3 of the goal `ROADMAP.md`
opened at `4fe8028`: arriving on a newly generated level. It supplements the
required source review, tests, fresh differentials, and the workflows in
`.agents/workflow.md` and `.agents/review.md`.

Slices 1 and 2 are closed, at `6d7aedd` and `bb4ef50`. Slice 2 stopped
`goto_level()` at its destination choice; this slice runs from there to the
first drawn screen of D:2. Slice 4, the restore path, stays queued.

## Boundary

- Roadmap item: In progress: the hero descends a staircase, slice 3.
- Starting code commit: `bb4ef50`.
- Starting event: `goto_level()` reaches the destination choice at
  `do.c:1692`, where slice 2 left a fail-closed refusal.
- Ending event: the game has drawn the first screen of D:2 and waits for the
  next command.
- Valid inputs: the hero on a down staircase on D:1 pressing `>`, arriving on a
  freshly generated D:2 in the main dungeon.
- Observables: every random-number call `mklev()` makes, which is the bulk of
  this slice's stream; the hero's arrival square; the pets that arrive with
  her; the complete D:2 screen with attributes and cursor; and the transit and
  arrival messages.

**The roadmap's stated ending event is not observable, and this checklist
corrects it.** `ROADMAP.md` ends slice 3 "at `docrt()` and the first drawn
screen of D:2". Those are not the same point. `docrt()` at `do.c:1838` builds
the map, but `goto_level()` then prints arrival messages and runs
`check_special_room(FALSE)`, `obj_delivery(TRUE)` and `pickup(1)` before it
returns, and the screen the player sees is the one drawn after the command
completes. A refusal at `docrt()` would leave the port one screen short again,
which is the weak prefix oracle slice 2 was forced into. Take the slice to
`goto_level()`'s return so the D:2 screen can be compared strictly.

- Exclusions, each to be justified from source in the table below:
  - `savelev()`'s write half and all of `getlev()`, slice 4. `savelev()` is
    called on the way out at `do.c:1650` even on a first descent, so decide
    what part of it this slice owes; C's file I/O has no port counterpart, and
    game code may not touch the filesystem.
  - The portal, trap-door, level-teleport, endgame, quest, Knox, Sokoban,
    Mines, Rogue-level and Gehennom arms, none reachable on a D:1 to D:2
    descent in the main dungeon.

## How the candidate list was built

- Upstream entry points: `do.c goto_level()` (1633-1998), from the destination
  choice through the function's return.
- Dispatch tables and catalogs: `svl.level_info[new_ledger].flags`, which
  selects `mklev()` against `getlev()` at `do.c:1692`; and the arrival-message
  chain keyed on `In_endgame`, `In_quest`, `Is_knox`, `In_mines`,
  `In_sokoban` and the main-dungeon `else` at 1878-1932.
- Reachable helpers: traced by reading `do.c:1633-1998` in order. Present in
  the port: `mklev()` and `u_on_upstairs()` in `js/mklev.js`, `docrt()` in
  `js/display.js`, `vision_reset()` in `js/vision.js`, `notice_mon_off()` and
  `notice_all_mons()` in `js/hack.js`, `next_level()` and `u_on_newpos()` in
  `js/dungeon.js`, `in_out_region()` in `js/region.js`. Absent, confirmed by
  running `grep -rn "function <name>\b" js/` for each and getting no match:
  `losedogs()`, `obj_delivery()`, `run_timers()`, `savelev()`,
  `stairway_free_all()`, `check_gold_symbol()`, `update_mlstmv()`,
  `reglyph_darkroom()`, `u_collide_m()`, `u_on_sstairs()`, `pickup()`,
  `print_level_annotation()`, `placebc()`, `kill_genocided_monsters()` and
  `reset_glyphmap()`.
- JavaScript cross-check: the worker records its own searches. Two are required
  rather than optional. Search for every reader of `gm.mydogs`, the list
  `keepdogs(FALSE)` filled in slice 2 and `losedogs()` must now drain; and
  search for every caller of `js/mklev.js mklev()`, which has never run against
  a live `game` and whose existing callers are tests.
- Remaining limits: `mklev()`'s live behavior is the largest unknown. It is
  ported and tested, but slice 3 is its first production consumer, so a
  divergence there appears as a random-number mismatch rather than a refusal.
  `pickup(1)` at `do.c:1993` is a second: the hero arrives on D:2's up
  staircase, and if that square holds objects the port meets the object-pile
  work that `ROADMAP.md` still lists as a queued goal.

## Status values

Assign exactly one status to every row: `done`, `no-effect-yet`, `later`,
`cannot-occur`, `missing`, or `undecided`, as
`.agents/implementation-checklist-template.md` defines them.

## Implementation table

| Upstream function or branch family | Reachability and ordering | JavaScript owner | State, randomness, and output | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| `update_mlstmv()`, `do.c:1642` | Runs when `!cant_go_back`, the ordinary case | `js/mon.js` | Ages the leaving level's monsters | Absent | `missing` | Port or refuse |
| `savelev()`, `do.c:1650`, and the `bufon`/`close_nhfile` pair | Runs on the way out even on a first descent | `js/do.js` | Serializes the leaving level | Absent; C file I/O has no port counterpart | `undecided` | Decide what a port that cannot write files owes here |
| The `cant_go_back` arm, `do.c:1652-1663` | Needs endgame or tutorial | `js/do.js` | Discards levels | Unreachable from D:1 | `cannot-occur` | Cite the dungeon state |
| `assign_graphics()` on a Rogue level, `do.c:1665` | Needs `Is_rogue_level` | `js/display.js` | Swaps the symbol set | Unreachable | `cannot-occur` | Cite it |
| `check_gold_symbol()`, `do.c:1667` | Unconditional | `js/display.js` | Symbol selection | Absent | `missing` | Port or refuse |
| `recbranch_mapseen()`, `do.c:1671` | Needs `u.uz.dnum != newlevel->dnum` | `js/dungeon.js` | Branch memory | D:1 to D:2 keeps `dnum` | `cannot-occur` | Cite the test |
| The three `assign_level()` calls and `u.utotype`, `do.c:1673-1676` | Unconditional | `js/dungeon.js` | Moves `u.uz`, `u.uz0`, `u.utolev` | Absent | `missing` | Port |
| `dunlev_reached` update, `do.c:1677-1684` | `!builds_up()` arm on the main dungeon | `js/dungeon.js` | Deepest level reached | Absent | `missing` | Port; take the `builds_up` arm only if reachable |
| `stairway_free_all()`, `do.c:1686` | Unconditional | `js/stairs.js` | Frees the leaving level's stairs | Absent | `missing` | Port |
| The `updest`/`dndest` memsets, `do.c:1688-1690` | Unconditional | `js/do.js` | Clears the default destination areas | Absent | `missing` | Port or justify no port location |
| `mklev()`, `do.c:1699`, with `new` and `bones_include_name()` | First visit, the `LFILE_EXISTS` false arm | `js/mklev.js` | **Generates the level; the bulk of this slice's random-number calls** | Ported, never run live | `missing` | Connect it and compare the stream |
| `getlev()`, `oinit()` and the two `reseed_random()` calls, `do.c:1704-1711` | Returning to a visited level | | | Slice 4 | `later` | Refuse |
| `reglyph_darkroom()`, `do.c:1713` | Unconditional | `js/display.js` | Rewrites dark-room glyphs | Absent | `missing` | Port |
| `set_uinwater(0)`, `do.c:1714` | Unconditional | `js/hack.js` | Clears `u.uinwater` | Ported in slice 2 | `missing` | Connect it here |
| `vision_reset()`, `gv.vision_full_recalc = 0`, `flush_screen(-1)`, `do.c:1716-1718` | Unconditional, before the arrival arm | `js/vision.js`, `js/display.js` | Clears line of sight; **postpones the map flush** | `vision_reset()` ported; the port has no notion of a postponed flush | `missing` | Decide how `-1` is modeled; `ROADMAP.md` records this as the descent goal's debt to the `flush_screen()` entry |
| The portal arm, `do.c:1720-1745` | Needs `portal` | `js/do.js` | Places the hero at a portal | Unreachable by staircase | `cannot-occur` | Cite it |
| The `at_stairs` down arm's placement, `do.c:1766-1773` | `stairway_find_from()`, else `u_on_sstairs(0)`, else `u_on_upstairs()` | `js/stairs.js`, `js/mklev.js` | Sets the arrival square and `u_traversed` | `u_on_upstairs()` ported; `u_on_sstairs()` absent | `missing` | Port the selection and connect it |
| The descent transit messages, `do.c:1774-1800` | Four arms: `!u.dz`, `Flying`, the fall arm, and ordinary descent | `js/do.js` | Ordinary arm prints under `flags.verbose`; **the fall arm calls `rnd(3)`** | Absent | `missing` | Port the ordinary arm; establish whether the fall arm is reachable with a burdened or punished hero |
| The trap-door and level-teleport arm, `do.c:1802-1810` | Needs `falling` or level teleport | `js/do.js` | `u_on_rndspot()` | Not a staircase descent | `cannot-occur` | Cite it |
| `placebc()`, `do.c:1812` | Needs `Punished` | `js/ball.js` | Places the ball and chain | No starting hero is punished | `cannot-occur` | Cite it |
| `obj_delivery(FALSE)`, `do.c:1813` | Unconditional | `js/do.js` | Delivers migrating objects | Absent | `missing` | Port or refuse |
| `losedogs()`, `do.c:1814` | Unconditional | `js/dog.js` | **Drains the `gm.mydogs` list slice 2 fills** | Absent | `missing` | Port; nothing empties that list today |
| `kill_genocided_monsters()`, `do.c:1815` | Unconditional | `js/mon.js` | Removes genocided species | Absent | `missing` | Port or refuse |
| `run_timers()`, `do.c:1821` | Unconditional, after the two deliveries | `js/timeout.js` | Fires timers that expired while away | Absent | `missing` | Port or refuse |
| `u_collide_m()`, `do.c:1825` | Fires when a monster occupies the arrival square | `js/do.js` | Moves the hero or the monster; consumes randomness | Absent | `missing` | Port; establish how often `mklev()` places a monster on the up staircase |
| `movebubbles()`, `fumaroles()`, `do.c:1829-1832` | Needs the water or air level, or a fumarole flag | | | Unreachable on D:2 | `cannot-occur` | Cite it |
| `vision_reset()`, `reset_glyphmap()`, `notice_mon_off()`, `docrt()`, `flush_screen(-1)`, `do.c:1835-1839` | Unconditional; **the map is built here** | `js/vision.js`, `js/display.js`, `js/hack.js` | Full vision recalc and repaint | `vision_reset()`, `notice_mon_off()` and `docrt()` ported; `reset_glyphmap()` absent | `missing` | Connect the ported three, port the fourth |
| The Gehennom, endgame, quest, Knox, Mines and Sokoban arrival arms, `do.c:1858-1932` | Each keyed on a dungeon test | `js/do.js` | Messages and achievements | None reachable on D:2 in the main dungeon | `cannot-occur` | Cite each test |
| `deliver_splev_message()`, `do.c:1855`, and `temperature_change_msg()`, `do.c:1934` | Unconditional | `js/do.js` | May print | Absent | `missing` | Port or establish silence on D:2 |
| The `new` block, `do.c:1943-1965`: `describe_level()`, `livelog_printf()`, and the Tourist `more_experienced()`/`newexplevel()` | `new` is TRUE on a first descent | `js/do.js`, `js/exper.js` | Livelog writes no screen; the Tourist arm changes experience | Absent | `missing` | Port the Tourist arm or establish the role is out of scope |
| `assign_level(&u.uz0, &u.uz)`, `notice_mon_on()`, `notice_all_mons(TRUE)`, `do.c:1967-1972` | Unconditional | `js/dungeon.js`, `js/hack.js` | Reveals monsters | `notice_all_mons()` ported | `missing` | Connect them |
| `print_level_annotation()`, `do.c:1974` | Unconditional | `js/dungeon.js` | May print | Absent | `missing` | Port or refuse |
| `check_special_room(FALSE)`, `do.c:1976` | Unconditional | `js/mkroom.js` | Room entrance message | Slice 2 ported it down to its early return | `missing` | Extend it past that return, or establish the arrival square is in no special room |
| `obj_delivery(TRUE)`, `do.c:1978` | Unconditional | `js/do.js` | Second delivery pass | Absent | `missing` | Port with the first |
| `in_out_region()`, `do.c:1981` | Unconditional | `js/region.js` | Region entry effects | Ported | `missing` | Connect it |
| `fix_shop_damage()`, `do.c:1986` | Needs `!new` | `js/shk.js` | Shop repair | `new` is TRUE on a first descent | `cannot-occur` | Cite it |
| The `do_fall_dmg` arm, `do.c:1989-1992` | Needs `falling` | `js/do.js` | `d(dist, 6)` and `losehp()` | Not a staircase descent | `cannot-occur` | Cite it |
| `pickup(1)`, `do.c:1993` | Unconditional, the last statement | `js/pickup.js` | **Picks up or lists objects on the arrival square** | Absent | `undecided` | Establish whether D:2's up staircase can hold objects; if it can, this meets the queued object-pile goal |

## Missing work by owner

1. `js/dungeon.js`, the level-identity update: the three `assign_level()`
   calls, `u.utotype`, `dunlev_reached`, and the closing
   `assign_level(&u.uz0, &u.uz)`. Everything downstream reads `u.uz`, so this
   comes first.
2. `js/do.js` and `js/mklev.js`, generation: `savelev()`'s decision,
   `stairway_free_all()`, the destination memsets, and `mklev()` connected to a
   live `game`. This is where the slice's random-number stream is decided, so
   it precedes every screen question.
3. `js/stairs.js` and `js/mklev.js`, arrival: `stairway_find_from()`,
   `u_on_sstairs()`, `u_on_upstairs()` and the transit messages.
4. `js/dog.js` and `js/do.js`, delivery: `losedogs()` draining `gm.mydogs`,
   both `obj_delivery()` passes, `kill_genocided_monsters()`, `run_timers()`
   and `u_collide_m()`.
5. `js/display.js` and `js/vision.js`, the repaint: `reglyph_darkroom()`,
   `check_gold_symbol()`, `reset_glyphmap()`, the two `vision_reset()` calls,
   `docrt()`, and how `flush_screen(-1)` is modeled.
6. `js/pickup.js` and `js/mkroom.js`, the arrival tail: `check_special_room()`
   past its early return, `in_out_region()`, and `pickup(1)`.

## Validation

- Commit checked: not yet. Slice 3 has not started.
- Source review: pending.
- Focused tests: pending.
- Full suite: passes at `bb4ef50` on Node 22.
- Generated-file checks: all five pass at `bb4ef50`.
- Fresh differentials: pending. Unlike slice 2, this slice **must compare
  strictly**. Reduce `scripts/run-leave-level.mjs` from the prefix assertion it
  uses today to `runFreshMatrix()` once D:2 is drawn, and retire or rewrite
  `scripts/leave-level-matrix.test.mjs`, which exists to pin the weaker verdict.
- Development score: 487/7,765 screens and 100,910/610,816 random-number values
  at `bb4ef50`, measured with `npm run checkpoint`.
  `scripts/score-baseline.mjs` holds a per-session baseline, so that command
  fails if any session drops.
- Quality check: gate clear at `bb4ef50`; advisory checkpoint on `startup`.
- Browser check: pending. This slice draws a level the port has never rendered,
  so `.agents/validation.md`'s shared-renderer exemption may not apply.

## Readiness

Current readiness: `Implementation`

Reason: no row is `done`; slice 3 has not started.
