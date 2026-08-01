# Implementation checklist: the hero descends a staircase, slice 2

Working record of implementation evidence for slice 2 of the goal `ROADMAP.md`
opened at `4fe8028`: leaving the level. It supplements the required source
review, tests, fresh differentials, and the workflows in `.agents/workflow.md`
and `.agents/review.md`.

`goto_level()` is 520 C lines, so the goal splits it. This slice takes its
opening and stops before the destination is chosen. Slice 3 generates and draws
D:2; slice 4 is the restore path, which no recorded session reaches.

## Boundary

- Roadmap item: In progress: the hero descends a staircase, slice 2.
- Starting code commit: `53ed46c`.
- Starting event: `dodown()` reaches its call to `goto_level()`, where slice 1
  left a fail-closed refusal.
- Ending event: `goto_level()` has discarded the leaving level's context and is
  about to choose the destination. **No screen changes and nothing is
  generated.** The observable boundary is the refusal that replaces the
  destination choice, and the state the port holds when it reaches it.
- Valid inputs: the hero on a down staircase on D:1 pressing `>`. Exactly one
  development session does this.
- Observables: the `svc.context` fields the discard clears; `u.utrap`; the pet
  state `keepdogs(FALSE)` collects; what `vision_recalc(2)` writes; and that
  this path makes no random-number call before the destination is chosen.
  Verify that by measurement.
- Exclusions, each to be justified from source in the table below:
  - `mklev()`, the hero placement and `docrt()`, which are slice 3. The refusal
    sits before the destination is chosen.
  - `savelev()` and `getlev()`, slice 4. A first descent generates.
  - The amulet and quest guards, which need dungeon state D:1 cannot reach.

## How the candidate list was built

- Upstream entry points: `do.c goto_level()` (1478-1998). This slice covers its
  guards, the context discard, `keepdogs(FALSE)` and `vision_recalc(2)`.
- Dispatch tables and catalogs: none here. The destination tables are slice 3's.
- Reachable helpers: `docrt()` is ported in `js/display.js`, `mklev()` and
  `u_on_upstairs()` in `js/mklev.js`, none of which this slice calls.
  `reset_utrap()` is in `js/trap.js` from the steed goal and `vision_recalc()`
  in `js/vision.js`. Absent: `keepdogs()`, `maybe_reset_pick()`,
  `reset_trapset()`, `check_special_room()`.
- JavaScript cross-check: `grep -rln "function <name>" js/` for each helper
  above. The worker records its further searches, and must search for every
  reader of the `svc.context` fields the discard clears: clearing a field the
  port reads elsewhere is the failure mode here.
- Remaining limits: `keepdogs()` is unsized. It collects the pets that follow
  the hero and the port's pet handling is extensive. Size it before writing it,
  and tell the orchestrator if it alone justifies a slice.

### What the searches found

- `keepdogs()` was sized from `dog.c:787-885` and **did not need its own
  slice**. Its follow arm is `mon_leave()` + `relmon(&gm.mydogs)` and its
  migrate arm is `migrate_to_level()`, all three of which `js/dog.js` already
  carried as one folded `migrate_to_level()`. Splitting `mon_leave()` and
  `relmon()` back out of it and adding `keepdogs()` came to about 130 new lines
  in that file.
- Readers of the discarded `svc.context` fields, from
  `grep -rn "context\.polearm\|travelcc\|xlock\|trapinfo" js/`:
  `svc.context.polearm.hitmon` is read by `js/dog.js` alone and written by
  nothing, `gx.xlock` is read by `js/invent.js obfree()` and written by nothing,
  and `iflags.travelcc` and `gt.trapinfo` have no port location at all. No field
  the discard clears is read for a value this port ever sets, so the failure
  mode the checklist warned about did not occur.
- `flush_screen(-1)`: **outside this slice's boundary.** `grep -n flush_screen
  nethack-c/upstream/src/do.c` puts both calls at `do.c:1720` and `do.c:1841`,
  242 and 363 lines into `goto_level()`, both past `savelev()` and inside the
  destination-building tail slice 3 owns. Nothing between `goto_level()`'s entry
  and this slice's refusal flushes the screen, which is why the fresh
  differential shows the port emitting the same screens it emitted before.

## Status values

Assign exactly one status to every row: `done`, `no-effect-yet`, `later`,
`cannot-occur`, `missing`, or `undecided`, as
`.agents/implementation-checklist-template.md` defines them.

## Implementation table

| Upstream function or branch family | Reachability and ordering | JavaScript owner | State, randomness, and output | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| `dodown()`'s descent tail, `do.c:1242-1292` | After the no-way-down arm | `js/do.js` | Sets `ga.at_ladder`, may print | `scripts/run-leave-level.mjs`, `scripts/dodown.test.mjs` | `done` | — |
| `next_level()`, `dungeon.c:1496-1514` | `dodown()`'s last statement | `js/dungeon.js` | Marks the stairway traversed | `scripts/leaving-level-helpers.test.mjs` | `done` | — |
| `next_to_u()`, `apply.c:918-926` | `do.c:1251` | `js/apply_next_to_u.js` | Reads leashes and the steed | `scripts/leaving-level-helpers.test.mjs` | `done` | — |
| The Gehennom confirmation, `do.c:1242` | Needs the Valley | `js/do.js` | `y_n()` prompt | Refused; no level generated here is the Valley | `cannot-occur` | — |
| The hole and trap-door arm, `do.c:1256-1287` | Needs `trap` non-null | `js/do.js` | `y_n()`, `rn2(3)`, `losehp()` | Refused; `trap` is null on every stairway descent | `later` | Port with trap doors |
| The destination clamp, `do.c:1501-1502` | First in `goto_level()` | `js/do.js` | Rewrites `newlevel->dlevel` | `scripts/dodown.test.mjs`; the `>=` mutant is equivalent | `done` | — |
| The endgame and tutorial guards, `do.c:1503-1515` | Needs `newdungeon` | `js/do.js` | Refused | `scripts/dodown.test.mjs`, three cases | `cannot-occur` | — |
| `done(ESCAPED)`, `do.c:1518-1519` | Ledger zero | `js/do.js` | Refused | `scripts/dodown.test.mjs` | `cannot-occur` | — |
| The mysterious force, `do.c:1541-1573` | Needs Gehennom and the Amulet | `js/do.js` | Four random-number calls | `scripts/dodown.test.mjs`, one hit and four misses | `cannot-occur` | — |
| The quest guard, `do.c:1578-1581` | Needs `qstart_level` | `js/do.js` | Message | `scripts/dodown.test.mjs` | `cannot-occur` | — |
| The same-level return, `do.c:1583` | Any destination equal to `u.uz` | `js/do.js` | Returns `ECMD_TIME` | `scripts/dodown.test.mjs` | `done` | — |
| The `NHCB_LVL_LEAVE` callback, `do.c:1586-1591` | Needs a Lua registration | — | Lua | `grep -rn lvl_leave nethack-c/upstream/dat/` finds none | `cannot-occur` | — |
| The tethered-movement arm, `do.c:1594` | Needs `TT_BURIEDBALL` | `js/do.js` | `buried_ball_to_punishment()` | `scripts/dodown.test.mjs`; only a buried ball sets that trap type | `cannot-occur` | — |
| `currentlevel_rewrite()`, `do.c:1348-1372` | Before the discard | — | `mark_synch()` and a level file | Neither has a port counterpart; levels stay in memory | `no-effect-yet` | — |
| `maybe_reset_pick()`, `lock.c:268-285` | First of the discard | `js/lock.js` | Clears `gx.xlock` | `scripts/leaving-level-helpers.test.mjs`, all four arms | `done` | — |
| `reset_trapset()`, `apply.c:2812-2816` | Second | — | Clears `gt.trapinfo` | No port location: `use_trap()` and `set_trap()` are its only writers and neither is ported | `no-effect-yet` | Port with `#apply` |
| `iflags.travelcc`, `do.c:1607` | Third | — | Travel destination cache | No port location; travel is unported | `no-effect-yet` | Port with travel |
| `svc.context.polearm.hitmon`, `do.c:1608` | Fourth | `js/do.js` | Cleared | `scripts/dodown.test.mjs` | `done` | — |
| The digging-context discard, `do.c:1609-1610` | Fifth | — | None | C has a comment there, not code | `cannot-occur` | — |
| `impact_drop()`, `do.c:1612-1613` | Needs `falling` | `js/do.js` | Drops objects through the hole | Refused; a stairway descent passes `falling` FALSE | `later` | Port with trap doors |
| `check_special_room(TRUE)`, `hack.c:3624-3654` | Sixth | `js/rooms.js` | Clears the room strings | `scripts/leaving-level-helpers.test.mjs`, `scripts/dodown.test.mjs` | `done` | — |
| `unplacebc()`, `do.c:1616-1617` | Needs `Punished` | `js/do.js` | Removes the ball and chain | `scripts/dodown.test.mjs`; nothing here punishes the hero | `cannot-occur` | — |
| `reset_utrap(FALSE)`, `trap.c:1045` | Seventh | `js/trap.js` | Clears `u.utrap` | `scripts/dodown.test.mjs` | `done` | — |
| `fill_pit()`, `trap.c:4009-4020` | Eighth | `js/trap.js` | Settles a boulder | Ported by the trap goal; refuses a boulder over a pit | `done` | — |
| `set_ustuck(0)`, `mon.c:3421` | Ninth | `js/mon.js` | Clears `u.ustuck`, `u.uswallow` | `scripts/dodown.test.mjs`, through the swallow pair | `done` | — |
| `set_uinwater(0)`, `hack.c:3220-3227` | Tenth | `js/hack.js` | Clears `u.uinwater` | `scripts/leaving-level-helpers.test.mjs`, `scripts/dodown.test.mjs` | `done` | — |
| `u.uundetected = 0`, `do.c:1622` | Eleventh | `js/do.js` | Unhides the hero | `scripts/dodown.test.mjs` | `done` | — |
| `keepdogs(FALSE)`, `dog.c:787-885` | After the discard | `js/dog.js` | Moves followers to `gm.mydogs` | `scripts/dog-migrate.test.mjs`, `scripts/run-leave-level.mjs` segment 4 | `done` | — |
| `keepdogs()`'s `pets_only` arm | Ascension or escape | `js/dog.js` | `finish_meating()` and four clears | Refused; `end.c` is its only caller | `later` | Port with the endgame |
| `recalc_mapseen()`, `dungeon.c:3074-3260` | `do.c:1625` | — | `#overview` annotations | This port keeps no `mapseen` chain, so nothing writes or reads one | `no-effect-yet` | Port with `#overview` |
| `vision_recalc(2)`, `do.c:1631` | Last before the destination | `js/vision.js` | Zeroes the vision buffers | `scripts/dodown.test.mjs` | `done` | — |
| The destination choice, `mklev()`, placement, `docrt()` | After this slice | `js/do.js`, `js/mklev.js` | Generates and draws | Slice 3 | `later` | Refuse before the choice |
| `savelev()`, `getlev()` | Returning to a visited level | | | Slice 4 | `later` | Refuse |

## Validation

- Commit checked: the head of this slice.
- Source review: `do.c goto_level()` (1478-1998) and `dodown()` (1129-1294)
  read in full, together with `dungeon.c next_level()`, `dog.c keepdogs()`,
  `mon_leave()` and `keep_mon_accessible()`, `mon.c relmon()`,
  `mon_leaving_level()`, `set_ustuck()` and `get_iter_mons()`, `apply.c
  next_to_u()` and `mleashed_next2u()`, `lock.c reset_pick()` and
  `maybe_reset_pick()`, `hack.c check_special_room()` and `set_uinwater()`,
  `mondata.c levl_follower()`, `shk.c is_fshk()`, `wizard.c mon_has_amulet()`,
  `dungeon.c dunlevs_in_dungeon()` and `In_hell()`, and `vision.c
  vision_recalc()`'s `control == 2` path.
- Focused tests: `scripts/dodown.test.mjs` (34 tests),
  `scripts/leaving-level-helpers.test.mjs` (16, new),
  `scripts/dog-migrate.test.mjs` (15) and
  `scripts/leave-level-matrix.test.mjs` (8, new).
- Full suite: passes.
- Generated-file checks: all five pass.
- Fresh differentials: `scripts/run-leave-level.mjs`, five segments recorded
  against the C reference. Four descend and one is the control that walks a
  descending segment's path without pressing `>`. Each descending segment
  matches C value for value and cell for cell up to the `>` keystroke and then
  stops; C's first
  unmatched random-number call is `getbones(bones.c:645)`, which sits in the
  destination-building tail slice 3 owns. The control matches strictly, so the
  one missing screen belongs to the descent alone.
- Development score: 487/7,765 screens and 100,910/610,816 random-number
  values, unchanged from `53ed46c`. No development session reaches a down
  staircase before an earlier boundary stops it.
- Mutation check: two survivors remain over the uncommitted diff, each with a
  reason no test can kill it. The destination clamp's `>` against `>=`, where
  the two differ only when `dunlev(newlevel)` already equals
  `dunlevs_in_dungeon(newlevel)` and the mutant clamps that value to itself, so
  the mutant is equivalent; and `reset_utrap(false)`'s `msg` argument, whose
  only effect is a `float_up()` or "You can fly." that needs Levitation or
  Flying, which `dodown()`'s own levitation arm refuses before `goto_level()`
  runs.
- Statement coverage, which the mutation check does not measure, was confirmed
  by deleting each call in the discard and watching the focused tests fail:
  `maybe_reset_pick()`, the polearm clear, `check_special_room()`,
  `reset_utrap()`, `fill_pit()`, `set_ustuck()`, `set_uinwater()`,
  `u.uundetected`, `keepdogs()` and `vision_recalc(2)`, plus
  `next_level()`'s `u_traversed` write and `relmon()`'s list push. The same
  route confirmed three assertions in `scripts/leave-level-matrix.test.mjs`.
- Quality check: the orchestrator measures it.
- Browser check: `.agents/validation.md` exempts a shared-renderer change.

## Readiness

Current readiness: `Ready for audit`

Reason: every row is `done`, `no-effect-yet`, `later` or `cannot-occur` with
evidence named beside it; the source review above traces every branch and
helper reachable before the destination choice; the full suite, the five
generated-data checks, the namespace check, the development score and the
five recorded segments all pass at the committed head; the running game
executes every `done` path through `dodown()`; and each excluded branch throws
before it changes state, draws a random number or writes output.

Slice 3 is still queued, so this checklist stays in place for it. The goal's
correctness pass falls due when the goal's last slice closes, which the
orchestrator schedules.
