# Implementation checklist: the hero descends a staircase, slice 1

Working record of implementation evidence for slice 1 of the goal `ROADMAP.md`
opened at `4fe8028`. It supplements the required source review, tests, fresh
differentials, and the workflows in `.agents/workflow.md` and
`.agents/review.md`.

It exists because the goal is the largest taken so far and its second slice
reaches `goto_level()`, 520 C lines that rewrite most of the game state. This
checklist covers slice 1 only, which stops before that call.

## Boundary

- Roadmap item: In progress: the hero descends a staircase, slice 1.
- Starting code commit: `d863bcd`.
- Starting event: the hero presses the key bound to `down`, which the port
  refused at `d863bcd` at the command admission boundary in `js/cmd.js`.
- Ending event: the complete screen and cursor after `dodown()` answers a hero
  who cannot descend, with the next command prompt drawn. The ordinary case is
  a hero standing where there are no down stairs, which prints
  `You can't go down here.` and returns `ECMD_OK`, spending no turn.
- Valid inputs: any seed, datetime, role and option set that puts the hero on a
  square with no down staircase and no ladder. That is nearly every square of
  a generated level.
- Observables: the message; that no turn is spent; the complete 24x80 screens,
  attributes and cursor. This path should make no random-number call. Verify
  that by measurement.
- Exclusions, each to be justified from source in the table below:
  - `goto_level()` and everything past it, which is slice 2. `dodown()` must
    stop before that call with a fail-closed refusal.
  - The `Levitation` arm at `do.c:1154-1201`, the `Upolyd && ceiling_hider`
    arm at 1204-1218, `u_rooted()`, `stucksteed()` and `u_stuck_cannot_go()`.
    Each is a distinct early exit; establish for each whether it can fire on
    an admitted path and either port it or refuse it with the source reason.
  - The trapdoor and hole arm inside the no-stairs branch, and
    `use_pick_axe2()`, which digging owns.
  - The valley and Gehennom confirmation at 1242.

## How the candidate list was built

- Upstream entry points: `do.c dodown()` (1130-1294). Its early exits in source
  order are `u_rooted()`, `stucksteed(TRUE)`, the `stairway_at()` test,
  `HLevitation || ELevitation`, `Upolyd && ceiling_hider() && u.uundetected`,
  `u_stuck_cannot_go("down")`, and the `!stairs_down && !ladder_down` arm that
  holds the ordinary refusal.
- Dispatch tables and catalogs: `stairway_at()` decides whether the square
  carries a down staircase, and the trap table decides the trapdoor and hole
  cases inside the no-stairs arm.
- Reachable helpers: at `d863bcd`, `stairway_at()` was ported in `js/stairs.js`
  and `on_level()` in `js/dungeon.js`, and `dodown()`, `goto_level()` and
  `schedule_goto()` were absent. `6d7aedd` adds `dodown()`, `u_rooted()`,
  `stucksteed()`, `uteetering_at_seen_pit()`, `uescaped_shaft()` and
  `set_move_cmd()`. `goto_level()`, `schedule_goto()`, `ceiling_hider()`,
  `surface()`, `floating_above()`, `float_down()`, `next_to_u()` and
  `y_monnam()` remain absent; the rows above name which arm each one blocks.
- JavaScript cross-check: `grep -rln "function <name>" js/` for each helper
  above. `down` is absent from `ADMITTED_COMMANDS` in `js/cmd.js`, which is
  where the port refuses today.
- Remaining limits: the candidate list is complete for `dodown()`'s early exits
  and incomplete for the trapdoor and hole arm, which reaches trap code this
  slice does not own.

## Status values

Assign exactly one status to every row: `done`, `no-effect-yet`, `later`,
`cannot-occur`, `missing`, or `undecided`, as
`.agents/implementation-checklist-template.md` defines them.

## Implementation table

| Upstream function or branch family | Reachability and ordering | JavaScript owner | State, randomness, and output | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| `down` admitted at the command boundary | Before `dodown()` runs | `js/cmd.js` | | `ADMITTED_COMMANDS` lists it; `rhack()` and `doextcmd()` both dispatch `dodown`, and every other refusal is unchanged | `done` | None |
| `set_move_cmd(DIR_DOWN, 0)` (1137) | The first statement | `js/cmd.js` | Writes `u.dz`, `u.dx`, `u.dy`, `context.travel`, `context.travel1`, and `context.nopick` under the prefix | Ported as one function and shared with `executeMovement()`; four focused tests | `done` | None. The table omitted this row; see "Candidates the table omitted" below |
| `u_rooted()` | First early exit | `js/hack.js` | Message, `nomul(0)`, answers `ECMD_TIME` | Ported whole. `js/u_init.js:396` is the port's only writer of `u.umonnum` and sets it equal to `u.umonster`, so `mmove` is the role's and never 0; four focused tests fabricate an immobile form | `done` | None |
| `stucksteed(TRUE)` | Second | `js/steed.js` | Message | Ported. `#ride` is admitted, so a mounted hero does reach the call, but `maybewakesteed()` clears `msleeping` and stops on any steed that was immobile when mounted, and both `meating` writers (`js/dog.js:146`, `js/dogmove.js:382`) clear it. Both message arms stop on the unported `YMonnam()` | `done` | Port `y_monnam()` with whatever first makes a steed helpless |
| The `stairway_at()` test at 1147 | Decides the ordinary case | `js/do.js` over `js/stairs.js` | Reads the square | Recorded: matrix segment 2 stands on the up staircase, segment 1 on a bare room square | `done` | None |
| The `Levitation` arm (1154-1201) | Needs levitation | `js/do.js` | Messages; no descent | Refused. `js/worn.js setworn()` is the port's only writer of an extrinsic property and no starting item grants `LEVITATION`; `js/u_init_inventory_attrs.js:267` grants only `JUMPING` intrinsically. The arm needs `float_down()`, `rnz()`, `artifact_has_invprop()`, `surface()` and `floating_above()`, none ported | `later` | Port it with levitation, which owns `float_down()` |
| `Upolyd && ceiling_hider()` (1204-1218) | Needs a polymorphed hider | `js/do.js` | Message, `ECMD_TIME` | `Upolyd()` is `u.umonnum !== u.umonster` (`you.h:554`) and `js/u_init.js:396` is the only writer of either field, so it is false for every hero the port can build. The stop guards on `Upolyd()` alone, which is wider than C's three-term test on purpose | `cannot-occur` | None until polymorph lands |
| `u_stuck_cannot_go("down")` | Before the no-stairs arm | `js/do.js` | Message, `ECMD_TIME` | `js/mon.js set_ustuck()` has one caller in the port, `js/teleport.js:1017`, and it passes null, so `u.ustuck` is null on every admitted path | `cannot-occur` | None until a monster can hold the hero |
| `!stairs_down && !ladder_down`, the `You can't go down here.` arm | **The slice's ordinary case** | `js/do.js` | Message, `ECMD_OK`, no turn | Recorded: seven matrix segments in `scripts/run-descend-refusal.mjs` match C on every screen, cursor and random-number call | `done` | None |
| The trapdoor and hole arm inside it | Needs a trap underfoot | `js/do.js`, `js/trap.js` | | `uteetering_at_seen_pit()` and `uescaped_shaft()` are ported in `js/trap.js` and decide the arm; `dotrap(trap, TOOKPLUNGE)` stops. No D:1 generator places a seen hole or trap door under the hero at command time | `later` | Port `dotrap()`'s plunge path with the trap-effect work |
| `use_pick_axe2()` | Needs a wielded pick | `js/dig.js` | | `flags.autodig` does parse (contrary to the comment at `js/hack.js:993`), so the wielded weapon is the only dormant term: `u_init.c:44` wields the bullwhip that precedes the Archeologist's pick-axe at `u_init.c:48`, and no other role starts with one. Matrix segment 6 records `autodig` on | `later` | Port with digging, once a wield command exists |
| The valley and Gehennom confirmation (1242) | Needs that level | `js/do.js` | Prompt | Past the slice's stop: `dodown()` reaches 1242 only when `stairs_down`, `ladder_down`, or a known hole holds, and the stop is placed before it | `later` | Port with slice 2 |
| `next_to_u()` (1251) | Needs a leashed pet or a steed with the Amulet | `js/do.js`, `js/apply.js` | `You("are held back by your pet!")`, `ECMD_OK` | Behind the same stop as the valley test, for the same reason | `later` | Port with slice 2. The table omitted this row; see below |
| `goto_level()` | The descent itself | `js/do.js` | Rewrites the level | Slice 2. `js/do.js` throws `UnsupportedLevelChangeError` before it | `later` | Refuse before the call |

## Candidates the table omitted

Two rows above are additions rather than status updates, and the orchestrator
owns whether they stay.

- `set_move_cmd(DIR_DOWN, 0)` at `do.c:1137` is `dodown()`'s first statement
  and writes six fields. The port already carried an inlined copy of the same
  C function inside `js/cmd.js executeMovement()`, so porting it named
  `set_move_cmd()` and routing both callers through it was the alternative to a
  second owner. That consolidation also supplies the `iflags.menu_requested`
  arm, which the inlined copy dropped; the development score is identical
  either way, because the `m` prefix stops earlier in the port.
- `next_to_u()` at `do.c:1251` sits between the Gehennom confirmation and the
  trap arm. It is `later` for the same reason the confirmation is.

## Validation

- Commit checked: `6d7aedd`.
- Source review: `do.c dodown()` (1129-1294) and `u_stuck_cannot_go()`
  (1109-1128); `cmd.c set_move_cmd()` (1386-1399) and `rhack()`'s result
  handling (3773-3822); `hack.c u_rooted()` (1693-1705); `steed.c stucksteed()`
  (876-895); `trap.c uteetering_at_seen_pit()` and `uescaped_shaft()`
  (6647-6664); `decl.c` `xdir[]`/`ydir[]`/`zdir[]` (78-80) against
  `hack.h`'s `DIR_*` enum (639-653); `youprop.h:240` for `Levitation`;
  `you.h:554` for `Upolyd`; `obj.h:220` for `is_pick`; `u_init.c:42-53` for the
  Archeologist's wielded weapon.
- Focused tests: `scripts/dodown.test.mjs`, 19 tests. Each was observed failing
  against a break in the line it covers before the commit; the mutations are
  listed in `6d7aedd`'s message.
- Full suite: passes at `6d7aedd`, 2,264 tests.
- Generated-file checks: all five pass at `6d7aedd`.
- Fresh differentials: `scripts/run-descend-refusal.mjs`, eight segments, all
  matching on screens, cursors and random-number calls. Seeds 4470311, 9152207
  and 3390808 were chosen for this slice. The `h..` control and the `h>..`
  segment record the same number of random-number calls and differ by one
  screen, which is the measurement behind the no-draw claim.
- Mutation coverage: `npm run mutate -- --worktree --kind
  relational,logical,boolean` reports 36 of 36 mutants killed on the first
  wave, no survivors.
- Development score: 487/7,765 screens and 100,910/610,816 random-number values
  at `6d7aedd`, unchanged from `d863bcd`. `scripts/scan-stops.mjs` says why:
  exactly one session presses `>`, it presses it standing on a *down*
  staircase, and its 25 screens now stand behind
  `dodown() descending from this square` rather than behind the command
  boundary. Slice 1 earns nothing on the development sessions; slice 2 is where
  those 25 screens are.
- Quality check: the orchestrator runs `npm run quality`.
- Browser check: `.agents/validation.md` exempts a shared-renderer change.

## Readiness

Current readiness: `Ready for audit`

Reason: every row is `done`, `later` or `cannot-occur`, each with the source
condition that fixes it. The production game executes every `done` path: `>`
and `#down` both reach `dodown()`, and eight fresh differentials compare the
result against C.
