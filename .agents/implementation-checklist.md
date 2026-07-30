# Implementation checklist: a monster triggers a floor trap

This checklist is a working record of implementation evidence for the goal
`ROADMAP.md` opened at `f75a9da`. It supplements the required source review,
tests, fresh differentials, and the workflows in `.agents/workflow.md` and
`.agents/review.md`.

The goal holds two queued slices. Slice 1, the squeaky board, is the one this
checklist currently covers; slice 2 (dart trap, `t_missile()`, `thitm()`)
remains queued and its rows are marked `later`.

## Boundary

- Roadmap item: In progress: a monster triggers a floor trap — slice 1, a
  squeaky board under an unseen monster.
- Starting code commit: `f75a9da92ad9bcb0ea2180ea631ba3685db0f7c6`
- Starting event: `monmove.c postmov()` reaches its `mintrap()` call at
  `monmove.c:1509`, for a monster whose square holds a trap.
- Ending event: the top line the hero reads for that trap
  (`You hear an A note squeak in the distance.`) and the screen drawn at the
  end of the hero's command, with the monster scan complete.
- Valid inputs: any seed, datetime and option set that puts a SQKY_BOARD on
  dungeon level one under a moving monster or pet. No new command is involved;
  the hero's own input is an ordinary wait or move.
- Observables: the `You_hear()` or `pline_mon()` top line, `trap->tseen` and
  the trap glyph it exposes, every monster's `mtrapseen` and `msleeping`,
  `mstrategy`'s wait bits, the `rn2(4)` and `rnl(5)` draws inside `mintrap()`,
  the complete 24x80 screens and attributes, and the cursor.
- Exclusions:
  - Every hero arm of `trapeffect_*()`. `mintrap()` is the only caller in
    scope; `dotrap()` is not ported, so no hero arm has a live consumer.
  - Every trap type other than SQKY_BOARD. `trapeffect_selector()` refuses
    them, so no state changes, no draw is spent, and no output is written
    before the refusal.
  - `mintrap()`'s `mtmp->mtrapped` branch (escape, metallivore). A SQKY_BOARD
    never sets `mtrapped`, and `assertSimpleActionState()` in
    `js/unported_monster_actions.js:202` refuses any monster that already
    carries it, before the scan reaches `dochug()`.

## How the candidate list was built

- Upstream entry points: `trap.c mintrap()` (3733-3840),
  `trap.c trapeffect_selector()` (2937-2992),
  `trap.c trapeffect_sqky_board()` (1402-1476), `trap.c trapnote()`
  (3062-3077), `trap.c floor_trigger()` (1060-1082),
  `trap.c check_in_air()` (1085-1095), `mondata.c mon_learns_traps()` (1628)
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
- Remaining limits: the checklist covers SQKY_BOARD only. The other eight trap
  types the goal names are in the goal but not in this slice, and are recorded
  as `later` rather than traced branch by branch.

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
| `trapeffect_selector()` every other case | In the goal, not in this slice | `js/trap.js trapeffect_selector()` | Refuses before any draw or output | trap.c:2942-2989 | later | slice 2 onward |
| `trapeffect_sqky_board()` hero arm | `dotrap()` is the only caller that supplies the hero, and it is unported | `js/trap.js trapeffect_sqky_board()` | none | trap.c:1416-1436 | later | port with the hero trap goal |
| `trapeffect_sqky_board()` `m_in_air()` early return | A clinger that `check_in_air()` let through | `js/monmove.js m_in_air()` | Returns before output | trap.c:1440-1441 | done | none |
| `trapeffect_sqky_board()` in-sight, hearing arm | `canseemon()` true and `!Deaf` | `js/trap.js trapeffect_sqky_board()` | `pline_mon()` and `seetrap()`, which writes `tseen` and repaints | trap.c:1444-1451 | done | none |
| `trapeffect_sqky_board()` in-sight, deaf arm | `canseemon()` true, `Deaf`, `!mindless()` | `js/trap.js trapeffect_sqky_board()` | `pline_mon()` only; no `seetrap()` | trap.c:1452-1456 | done | none |
| `trapeffect_sqky_board()` out-of-sight arm | `canseemon()` false | `js/trap.js trapeffect_sqky_board()` | `You_hear()` with the near/far threshold | trap.c:1457-1471 | done | none |
| `trapnote()` | Both message arms | `js/trap.js trapnote()` | Pure | trap.c:3062-3077 | done | none |
| `wake_nearto(mx, my, 40)` | Unconditional tail of the monster arm | `js/mon.js wake_nearto()` | `wake_msg()` output, `msleeping`, `mstrategy`, buried zombies | trap.c:1473 | done | none |
| `t_missile()`, `thitm()`, `trapeffect_dart_trap()` | Slice 2 | None | — | trap.c | later | slice 2 |

## Missing work by owner

None.

## Validation

Record evidence for the exact committed head that will be reviewed.

- Commit checked: bf96cda5edec310cfa12590706216ca5263af2f1
- Source review: every branch reachable from `postmov()`'s `mintrap()` call
  through the end of the hero's command was traced against
  `nethack-c/upstream/src/trap.c`, `mondata.c` and `mon.c` at that commit, in
  the order C evaluates them, including which gates precede the `rn2(4)` draw.
  Two upstream findings corrected the port on the way: `m_harmless_trap()`'s
  inline flight test and its private `FLOOR_TRIGGER_TRAPS` set were duplicates
  of `check_in_air(mtmp, 0L)` and `floor_trigger()`, and `postmov()`'s
  `species` was latched at entry where `monmove.c:1517` reassigns `ptr` after
  `mintrap()`. Remaining stops inside the boundary are
  `trapeffect_selector()`'s 22 unported types, `mintrap()`'s `mtmp->mtrapped`
  arm, its `setmangry()` call behind `trap->madeby_u`, and its
  `maybe_unhide_at()` tail; each stops before changing state, drawing, or
  writing a message.
- Focused tests: `node --test scripts/monmove.test.mjs` (108 pass),
  `node --test scripts/monster-squeaky-board.test.mjs` (2 pass).
- Full suite: `npm run checkpoint -- --focus scripts/monmove.test.mjs --focus
  scripts/monster-squeaky-board.test.mjs` reports `PASS full test suite`.
- Generated-file checks: the same checkpoint run reports `PASS` for
  `check:extcmds`, `check:monsters`, `check:objects`, `check:symbols`,
  `check:themerooms` and `check:namespace-members`. No generator in this
  slice's areas produces a file it changed.
- Fresh differentials: `scripts/run-monster-squeaky-board.mjs`, which calls
  `scripts/diff-fresh.mjs` through `runFreshMatrix()`. Its recipe carries
  replay inputs only, has no `steps` key, and references no path under
  `sessions/holdout/`; `scripts/monster-squeaky-board.test.mjs` asserts the
  first two. `TZ=America/New_York node scripts/run-monster-squeaky-board.mjs`
  reports `PASS: 10 segments, 47504 PRNG calls, 2084 screens, 2084 cursors, 0
  animation frames`, so random-number logs, complete 24x80 screens and
  attributes, and cursors all match. The dimensions varied across the ten
  recordings are the seed (6200225, 6200257, 6200333, 6300280, 6400318,
  6400692, 6905575), the option set (default, `deaf`, `!acoustics`), the pet
  (`pettype:none` and `pettype:dog`), and the turn budget (60, 120, 144 and
  250 waits). The datetime is `20310203040506` and the character is a female
  neutral human Valkyrie throughout, because neither can affect which arm
  fires. Persisted state is covered by the port-side replay in
  `scripts/monster-squeaky-board.test.mjs`, which reads `mtrapseen` back from
  the level's monster list after each segment.
- Development suite: `node scripts/score-development.mjs` matches 467 of 7,765
  screens, 467 cursors and 100,825 of 610,816 random-number values, against 459
  screens and 99,980 values at the parent `f75a9da` measured in a detached
  worktree. Two sessions improved, both seed 13, from 4 screens to 8; the other
  31 are unchanged and none regressed.
- Quality check: the orchestrator owns `npm run quality`, per
  `.claude/agents/slice-worker.md`. `js/trap_effects.js` is assigned to the
  `world-effects` area in `QUALITY.json` at the commit above.
- Browser check: not required. `.agents/validation.md` limits browser checks to
  browser-specific code, DOM/CSS, input/storage, and browser-only
  presentation; this slice changes engine code and writes through the existing
  message and glyph owners.

## Readiness

Current mode: Ready for audit

Reason: every row is `done`, `later` or `cannot-occur` with its evidence; the
source review above traces every branch reachable through the ending event; all
required validation passes at `bf96cda`; the production game executes every
`done` path, shown by the ten-segment fresh matrix and by the two development
sessions that advanced; and the branches this slice excludes -- the 22 unported
trap types, `mintrap()`'s trapped-monster arm, and every hero arm -- each stop
before changing state, consuming randomness, or producing output.

The one qualification worth carrying into a pass: slice 2 of this goal, the
dart trap, is still queued, so the goal is not complete even though this slice
is. Its rows are marked `later` above.
