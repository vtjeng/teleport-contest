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
  refuses today at the command admission boundary in `js/cmd.js`.
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
- Reachable helpers: `stairway_at()` is ported in `js/stairs.js` and
  `on_level()` in `js/dungeon.js`. `dodown()`, `goto_level()` and
  `schedule_goto()` are absent. The worker records the searches it runs for
  `u_rooted()`, `stucksteed()`, `u_stuck_cannot_go()`, `ceiling_hider()` and
  `surface()`.
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
| `down` admitted at the command boundary | Before `dodown()` runs | `js/cmd.js` | | `ADMITTED_COMMANDS` omits it | `missing` | Add it, and keep every other refusal |
| `u_rooted()` | First early exit | `js/do.js` | Answers `ECMD_TIME` | Absent | `missing` | Port or refuse, with the source reason |
| `stucksteed(TRUE)` | Second | `js/steed.js` | Message | `u.usteed` can be set since the steed goal | `missing` | Establish whether a mounted hero can reach this |
| The `stairway_at()` test at 1147 | Decides the ordinary case | `js/stairs.js` | Reads the square | `stairway_at()` ported | `missing` | Port the test that consumes it |
| The `Levitation` arm (1154-1201) | Needs levitation | `js/do.js` | Messages; no descent | Nothing grants levitation today | `undecided` | Port or refuse; say which and why |
| `Upolyd && ceiling_hider()` (1204-1218) | Needs a polymorphed hider | `js/do.js` | Message, `ECMD_TIME` | `Upolyd()` is one definition in `js/const.js` | `undecided` | Refuse; cite what makes it unreachable |
| `u_stuck_cannot_go("down")` | Before the no-stairs arm | `js/do.js` | Message, `ECMD_TIME` | Absent | `missing` | Port or refuse |
| `!stairs_down && !ladder_down`, the `You can't go down here.` arm | **The slice's ordinary case** | `js/do.js` | Message, `ECMD_OK`, no turn | The recorded case | `missing` | Port |
| The trapdoor and hole arm inside it | Needs a trap underfoot | `js/do.js`, `js/trap.js` | | Trap code this slice does not own | `later` | Refuse, naming the trap types |
| `use_pick_axe2()` | Needs a wielded pick | `js/dig.js` | | Digging owns it | `later` | Refuse |
| The valley and Gehennom confirmation (1242) | Needs that level | `js/do.js` | Prompt | Unreachable on D:1 | `cannot-occur` | Cite the level test |
| `goto_level()` | The descent itself | `js/do.js` | Rewrites the level | Slice 2 | `later` | Refuse before the call |

## Validation

- Commit checked: not yet. Slice 1 has not started.
- Source review: pending.
- Focused tests: pending.
- Full suite: passes at `d863bcd` on Node 22 and Node 24, 2,226 tests.
- Generated-file checks: all five pass at `d863bcd`.
- Fresh differentials: pending. Choose seeds independently. At minimum: the
  no-stairs refusal on an ordinary room square, one case on a square carrying an
  up staircase, since `stway->up` distinguishes them, and one establishing that
  the path makes no random-number call.
- Development score: 487/7,765 screens and 100,910/610,816 random-number values
  at `d863bcd`, and `scripts/score-baseline.mjs` now holds a per-session
  baseline, so `npm run checkpoint` fails if any session drops.
- Quality check: gate clear and advisory clear at `d863bcd`.
- Browser check: `.agents/validation.md` exempts a shared-renderer change.

## Readiness

Current readiness: `Implementation`

Reason: no row is `done`; slice 1 has not started.
