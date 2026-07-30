# Implementation checklist: a monster triggers a floor trap

This checklist is a working record of implementation evidence for the goal
`ROADMAP.md` opened at `f75a9da`. It supplements the required source review,
tests, fresh differentials, and the workflows in `.agents/workflow.md` and
`.agents/review.md`.

The goal holds two slices, and this checklist now covers both. Slice 1, the
squeaky board, closed at `bf96cda`; slice 2, the dart trap, closed at
`b51b1d2`. With both closed the goal's own scope is complete, and what remains
`later` below belongs to other goals rather than to this one.

## Boundary

- Roadmap item: In progress: a monster triggers a floor trap — slice 1, a
  squeaky board under an unseen monster, and slice 2, a dart trap under a
  monster the dart misses.
- Starting code commit: `f75a9da92ad9bcb0ea2180ea631ba3685db0f7c6`
  (slice 2 starts at `16fe276673aa67dc25b0b871e008ce735c06db42`)
- Starting event: `monmove.c postmov()` reaches its `mintrap()` call at
  `monmove.c:1509`, for a monster whose square holds a trap.
- Ending event: the top line the hero reads for that trap
  (`You hear an A note squeak in the distance.`, or for slice 2
  `The kitten is almost hit by a dart!`) and the screen drawn at the end of the
  hero's command, with the monster scan complete. For slice 2 the dart also
  has to be on the floor where the target stood, or in a pack if a monster
  picked it up on a later turn.
- Valid inputs: any seed, datetime and option set that puts a SQKY_BOARD or a
  DART_TRAP on dungeon level one under a moving monster or pet. No new command is involved;
  the hero's own input is an ordinary wait or move.
- Observables: the `You_hear()` or `pline_mon()` top line, `trap->tseen` and
  the trap glyph it exposes, every monster's `mtrapseen` and `msleeping`,
  `mstrategy`'s wait bits, the `rn2(4)` and `rnl(5)` draws inside `mintrap()`,
  the complete 24x80 screens and attributes, and the cursor.
- Exclusions:
  - Every hero arm of `trapeffect_*()`. `mintrap()` is the only caller in
    scope; `dotrap()` is not ported, so no hero arm has a live consumer.
  - Every trap type other than SQKY_BOARD and DART_TRAP.
    `trapeffect_selector()` refuses them, so no state changes, no draw is
    spent, and no output is written before the refusal.
  - `thitm()`'s `strike` arm, and with it every monster-damage and
    monster-death path. It needs `weapon.c dmgval()` and `mon.c monkilled()`.
    The refusal stands after the `rnd(20)` C draws either way and before the
    message, the damage and the missile's disposal.
  - A dart trap that wears out (`trap.c:1299`). It needs `deltrap()`, and
    dropping the trap from the level list is the one write in that arm no
    later owner can reconstruct. The refusal stands after its `rn2(15)`.
  - `mintrap()`'s `mtmp->mtrapped` branch (escape, metallivore). A SQKY_BOARD
    never sets `mtrapped`, and `assertSimpleActionState()` in
    `js/unported_monster_actions.js:202` refuses any monster that already
    carries it, before the scan reaches `dochug()`.

## How the candidate list was built

- Upstream entry points: `trap.c mintrap()` (3733-3840),
  `trap.c trapeffect_selector()` (2937-2992),
  `trap.c trapeffect_sqky_board()` (1402-1476), `trap.c trapnote()`
  (3062-3077), `trap.c floor_trigger()` (1060-1082),
  `trap.c check_in_air()` (1085-1095), `trap.c trapeffect_dart_trap()`
  (1251-1321), `trap.c t_missile()` (1018-1027), `trap.c thitm()` (6711-6773),
  `worn.c find_mac()`, `mondata.c mon_learns_traps()` (1628)
  and `mons_see_trap()` (1640-1657), `mon.c wake_nearto_core()` (4373-4400),
  `monmove.c postmov()` (1453-1705).
- Dispatch tables and catalogs: `trapeffect_selector()`'s switch over
  `trap->ttyp` is the dispatch table; `mklev.c traptype_rnd()` bounds which of
  its cases dungeon level one can produce. `trapnote()`'s `tnnames[]` is the
  twelve-entry note table, indexed by `trap->tnote`, which
  `trap.c choose_trapnote()` (already ported) fills at generation.
- Reachable helpers: traced from `postmov()`'s `mintrap()` call through every
  branch of the `!mtmp->mtrapped` arm, into `trapeffect_selector()`'s
  SQKY_BOARD case and both halves of its monster arm, and out through
  `wake_nearto()`. `Soundeffect()` is a tty-sound hook that writes nothing to
  the terminal the recorder captures.
- JavaScript cross-check:
  - `grep -n "trap activation" js/` returned `js/monmove.js:2407` and
    `js/unported_monster_actions.js:588` — the two refusals this slice pays
    for.
  - `grep -rn "wake_nearto\|mons_see_trap\|mon_learns_traps\|seetrap" js/`
    returned only `js/mon.js:789 wake_nearto`; the other three were absent.
  - `grep -n "FLOOR_TRIGGER_TRAPS\|fixedTeleportTrap" js/monmove.js` returned
    the two private copies of `trap.c` predicates that this slice moves into
    `js/trap.js`.
- Remaining limits: the checklist covers SQKY_BOARD and DART_TRAP. The other
  seven trap types the goal names are in the goal but in neither slice, and are
  recorded as `later` rather than traced branch by branch.

## Status values

Statuses follow `.agents/implementation-checklist-template.md`.

## Implementation table

| Upstream function or branch family | Reachability and ordering | JavaScript owner | State, randomness, and output | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| `postmov()`'s `mintrap()` call and return handling (monmove.c:1509-1516) | Runs for every `MMOVE_MOVED`, after `newsym(omx, omy)` and before the door block | `js/monmove.js postmov()` | No draw of its own; `Trap_Killed_Mon`/`Trap_Moved_Mon` return `MMOVE_DIED`, `mon_offmap()` returns `MMOVE_DONE` | monmove.c:1508-1517; `scripts/monmove.test.mjs` | done | none |
| `mintrap()` wrapper, `!trap` arm | `t_at()` empty; C clears `mtrapped` | `js/trap.js mintrap()` | Writes `mtmp->mtrapped = 0` | trap.c:3739-3740 | done | none |
| `mintrap()` wrapper, `mtmp->mtrapped` arm | Needs a monster already held; `assertSimpleActionState()` refuses one before `dochug()` | `js/trap.js mintrap()` | Would draw `rn2(40)`, `rn2(2)` | trap.c:3741-3789; js/unported_monster_actions.js:202 | cannot-occur | none |
| `mintrap()` `fixed_tele_trap()` force | TELEP_TRAP with a fixed destination only | `js/trap.js fixed_tele_trap()` | Sets FORCETRAP | trap.c:3798-3801 | done | none |
| `mintrap()` steed and Sokoban skips | `u.usteed` needs `#ride`; `Sokoban` needs the Sokoban branch | `js/trap.js mintrap()` | No state change; both are empty C statements | trap.c:3803-3807 | done | none |
| `mintrap()` `floor_trigger() && check_in_air()` early return | Any floor trap under a flyer or floater | `js/trap.js floor_trigger()`, `check_in_air()` | Returns before any draw or output | trap.c:3808-3811 | done | none |
| `mintrap()` `already_seen && rn2(4)` early return | Needs `mon_knows_traps(mtmp, tt)`, which `mons_see_trap()` sets for onlookers | `js/trap.js mintrap()` | Draws `rn2(4)` | trap.c:3812-3813 | done | none |
| `mon_learns_traps()` and `mons_see_trap()` | Always, once past the early returns | `js/mondata.js` | Writes `mtrapseen` on the victim and on every eyed, sighted, non-mindless monster within range | mondata.c:1628-1657 | done | none |
| `mintrap()` `trap->madeby_u && rnl(5)` | Needs a hero-set trap; `maketrap()` clears `madeby_u` for generated traps | `js/trap.js mintrap()` | Draws `rnl(5)`, then `setmangry()` | trap.c:3820-3821; js/trap.js resetTrap() | done | none |
| `mintrap()` `maybe_unhide_at` tail | Needs `mtmp->mtrapped` set by the effect; SQKY_BOARD never sets it | `js/trap.js mintrap()` | `maybe_unhide_at()`, `pline_mon()` | trap.c:3827-3835 | cannot-occur | none |
| `trapeffect_selector()` SQKY_BOARD case | The slice's case | `js/trap.js trapeffect_selector()` | Dispatch only | trap.c:2950 | done | none |
| `trapeffect_selector()` DART_TRAP case | Slice 2's case | `js/trap_effects.js trapeffect_selector()` | Dispatch only | trap.c:2946 | done | none |
| `trapeffect_selector()` every other case | In the goal, in neither slice | `js/trap_effects.js trapeffect_selector()` | Refuses before any draw or output | trap.c:2942-2989 | later | a later trap goal |
| `trapeffect_sqky_board()` hero arm | `dotrap()` is the only caller that supplies the hero, and it is unported | `js/trap.js trapeffect_sqky_board()` | none | trap.c:1416-1436 | later | port with the hero trap goal |
| `trapeffect_sqky_board()` `m_in_air()` early return | A clinger that `check_in_air()` let through | `js/monmove.js m_in_air()` | Returns before output | trap.c:1440-1441 | done | none |
| `trapeffect_sqky_board()` in-sight, hearing arm | `canseemon()` true and `!Deaf` | `js/trap.js trapeffect_sqky_board()` | `pline_mon()` and `seetrap()`, which writes `tseen` and repaints | trap.c:1444-1451 | done | none |
| `trapeffect_sqky_board()` in-sight, deaf arm | `canseemon()` true, `Deaf`, `!mindless()` | `js/trap.js trapeffect_sqky_board()` | `pline_mon()` only; no `seetrap()` | trap.c:1452-1456 | done | none |
| `trapeffect_sqky_board()` out-of-sight arm | `canseemon()` false | `js/trap.js trapeffect_sqky_board()` | `You_hear()` with the near/far threshold | trap.c:1457-1471 | done | none |
| `trapnote()` | Both message arms | `js/trap.js trapnote()` | Pure | trap.c:3062-3077 | done | none |
| `wake_nearto(mx, my, 40)` | Unconditional tail of the monster arm | `js/mon.js wake_nearto()` | `wake_msg()` output, `msleeping`, `mstrategy`, buried zombies | trap.c:1473 | done | none |
| `trapeffect_dart_trap()` hero arm | `dotrap()` is the only caller that supplies the hero, and it is unported | `js/trap_effects.js trapeffect_dart_trap()` | none | trap.c:1259-1292 | later | port with the hero trap goal |
| `trapeffect_dart_trap()` misfire arm | Needs `trap->once && trap->tseen`, so a second firing on a trap the hero has already seen | `js/trap_effects.js trapeffect_dart_trap()` | Draws `rn2(15)`, then refuses before the message and `deltrap()` | trap.c:1298-1307 | later | needs `deltrap()`; unit-tested only, see Validation |
| `trapeffect_dart_trap()` monster arm body | The slice's path: `trap->once = 1`, `t_missile()`, `rn2(6)` poison, `seetrap()` when in sight | `js/trap_effects.js trapeffect_dart_trap()` | Writes `trap->once`; draws `rn2(6)`; `seetrap()` writes `tseen` and repaints | trap.c:1308-1313 | done | none |
| `t_missile()` | Both callers; only the DART one is reachable here | `js/trap_effects.js t_missile()` | `mksobj()` draws; writes `quan`, `owt`, `opoisoned`, `ox`, `oy` | trap.c:1018-1027 | done | none |
| `thitm()` to-hit roll | Always, once the dart exists | `js/trap_effects.js thitm()` | Draws `rnd(20)`; reads `find_mac()` | trap.c:6720-6725 | done | none |
| `thitm()` `!strike` arm | The slice's path | `js/trap_effects.js thitm()` | `pline_mon()` when `cansee()`, via `doname()` which discovers the type; `place_object()` and `stackobj()` | trap.c:6730-6734, 6766-6769 | done | none |
| `thitm()` `strike` arm | Needs the roll to land | `js/trap_effects.js thitm()` | Refuses after the `rnd(20)`, before message, `dmgval()`, `monkilled()` and `dealloc_obj()` | trap.c:6735-6765 | later | needs `dmgval()` and `monkilled()` |
| `thitm()` `d_override` and `nocorpse` parameters | No caller in scope passes either; `trapeffect_dart_trap()` passes 0 and FALSE | `js/trap_effects.js thitm()` | — | trap.c:6711-6716 | cannot-occur | none |
| `worn.c find_mac()` and `ARM_BONUS()` | `thitm()`'s to-hit roll reads the target's armor class | `js/worn.js find_mac()`, `js/obj.js ARM_BONUS()`, `greatest_erosion()` | Pure | worn.c; `scripts/worn.test.mjs` | done | none |

## Missing work by owner

None.

## Validation

Record evidence for the exact committed head that will be reviewed.

- Commit checked:
  b51b1d2f
- Source review: every branch reachable from `postmov()`'s `mintrap()` call
  through the end of the hero's command was traced against
  `nethack-c/upstream/src/trap.c`, `mondata.c`, `mon.c` and `worn.c` at that
  commit, in the order C evaluates them, including which gates precede each
  draw. Slice 1's two upstream findings stand: `m_harmless_trap()`'s inline
  flight test and its private `FLOOR_TRIGGER_TRAPS` set were duplicates of
  `check_in_air(mtmp, 0L)` and `floor_trigger()`, and `postmov()`'s `species`
  was latched at entry where `monmove.c:1517` reassigns `ptr` after
  `mintrap()`. Slice 2 added one: three private copies of `ARM_BONUS()` existed
  in `find_ac()` and `m_dowear()` before `find_mac()` needed a fourth, so the
  port now has one. Remaining stops inside the boundary are
  `trapeffect_selector()`'s 21 unported types, `thitm()`'s `strike` arm, the
  dart trap's misfire arm, `mintrap()`'s `mtmp->mtrapped` arm, its
  `setmangry()` call behind `trap->madeby_u`, and its `maybe_unhide_at()` tail;
  each stops before changing state, drawing, or writing a message, and each
  raises a converted class rather than a bare `TypeError`.
- Focused tests: `node --test scripts/monmove.test.mjs`,
  `scripts/monster-squeaky-board.test.mjs`, `scripts/monster-dart-trap.test.mjs`
  and `scripts/worn.test.mjs` all pass.
- Full suite: `npm test` reports 1,984 tests, 1,984 pass, 0 fail, measured by
  the orchestrator at the commit above.
- Generated-file checks: `check:extcmds`, `check:monsters`, `check:objects`,
  `check:symbols`, `check:themerooms` and `check:namespace-members` all pass.
  No generator in either slice's areas produces a file it changed.
- Fresh differentials, slice 2: `TZ=America/New_York node
  scripts/run-monster-dart-trap.mjs` reports `PASS: 9 segments, 47465 PRNG
  calls, 949 screens, 949 cursors, 0 animation frames`. Four cases put the
  victim in sight (plain, poisoned through the arm's `rn2(6)`, corroded through
  `mksobj_init()`'s erosion, and a second plain), five put it out of sight
  where the dart lands silently, and three carry a pet.
- Fresh differentials, slice 1, re-run at this head as a regression check:
  `TZ=America/New_York node scripts/run-monster-squeaky-board.mjs` still
  reports `PASS: 10 segments, 47504 PRNG calls, 2084 screens, 2084 cursors, 0
  animation frames`.
- Development suite: `node scripts/score-development.mjs` matches 467 of 7,765
  screens, 467 cursors and 100,825 of 610,816 random-number values, measured by
  the orchestrator at this head. That is identical to `16fe276`, call for call
  and screen for screen: **slice 2 moved no development session**. `ROADMAP.md`
  predicted `seed1500-rogue-explore-move`'s dart would unblock it. It does not
  — that session stops earlier, on `simple monster action requires pet
  cursed-object feedback`, with its random-number prefix unchanged. The slice's
  whole evidence is therefore its fresh matrix and its tests.
- Quality check: the orchestrator owns `npm run quality`, per
  `.claude/agents/slice-worker.md`. Gate and advisory are clear at this head.
  `js/trap_effects.js` is assigned to `world-effects` in `QUALITY.json`;
  `js/worn.js` and `js/obj.js` are `objects`, and
  `js/u_init_inventory_attrs.js` is `hero`, whose review frontiers this slice's
  window does not reach back to.
- Browser check: not required. `.agents/validation.md` limits browser checks to
  browser-specific code, DOM/CSS, input/storage, and browser-only
  presentation; both slices change engine code and write through the existing
  message and glyph owners.

## Readiness

Current mode: Ready for audit

Reason: every row is `done`, `later` or `cannot-occur` with its evidence; the
source review above traces every branch reachable through the ending event for
both slices; all required validation passes at `b51b1d2`; the production game
executes every `done` path, shown by the nineteen fresh segments across the two
matrices; and every branch the slices exclude -- the 21 unported trap types,
`thitm()`'s `strike` arm, the dart trap's misfire arm, `mintrap()`'s
trapped-monster arm, and every hero arm -- stops before changing state,
consuming randomness, or producing output, raising a class
`ELAPSED_TURN_PLANNING_REFUSALS` converts.

Two qualifications to carry into the pass, neither of which blocks it:

- The dart trap's misfire arm has unit coverage only. It needs a second firing
  on a trap the hero has already seen; a scan of roughly 6,000 seeds produced
  none, so the `rn2(15)` gate is pinned by test rather than by a fresh case.
  The same scan found no pet victim, so `thitm()` against a pet is likewise
  test-only. `scripts/run-monster-dart-trap.mjs` records both gaps in its
  header.
- Slice 2 moved no development session, so its fresh matrix and its tests are
  the whole of its end-to-end evidence. The roadmap's prediction that it would
  unblock `seed1500` was wrong, and the reason is recorded under Validation.
