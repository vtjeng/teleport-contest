# Implementation checklist: the shift-direction run inside one room

## Boundary

- Roadmap item: "Goal in progress: running and rushing", first slice
- Starting code commit: `2ec67af`
- Starting event: `L`, `H`, `J` or `K` pressed at a ready D:1 command prompt,
  with the hero standing in a room
- Ending event: the screen at the square where the run stops, and the command
  prompt after it. A run reads no input while it moves, so one keystroke is one
  recorded step.
- Valid inputs: the four shift-direction keys under their default bindings, from
  a hero standing in a room, with `svc.context.run` set to 1; any seed, date and
  time; any role, race, gender and alignment.
- Observables: the complete 24×80 screens and attributes at the stop, the cursor,
  the PRNG log across every turn the run spends, the elapsed turn count, and the
  per-turn refreshes that land in `animation_frames`, which
  `frozen/ps_test_runner.mjs` scores supplementally.
- Exclusions: corridor running, rush and `#run` (`context.run` 2 and 3), travel
  (8), traps, liquids, and every destination the walk slice already refuses.
  Each has to fail closed before any state change, PRNG call, or output.

## How the candidate list was built

This is the milestone's first goal whose command consumes game time. A run
advances the turn, moves monsters, and repeats the whole turn machinery once per
square, so the candidate list has two halves: the run's own C, and every already
ported path that reads `svc.context.run` and has so far only ever seen 0.

The second half is the regression surface and is the reason this slice has a
checklist. `grep -rn "context\.run" nethack-c/upstream/src/*.c` finds the C read
sites below; `grep -rn "context\.run" js/` finds only five sites in the port,
of which three assign 0 and one is the assignment in `executeMovement()`. Every
other ported path that C gates on `context.run` therefore carries no run term
today, and each one has to be checked rather than assumed.

- Upstream entry points: `hack.c:lookaround()` (3898–4050), `domove_core()`'s
  two run arms (2764–2777 and 2936–2941), `nomul()` (4160–4173),
  `runmode_delay_output()` (2996–3018), `pickup.c:check_here()` (449), and
  `allmain.c:moveloop_core()` (515–527).
- Dispatch tables and catalogs: `js/cmd.js` `MOVEMENT_COMMANDS` already carries
  `[u.dx, u.dy, context.run]` per key, and `ADMITTED_BOUNDARY` at
  `js/cmd.js:322` admits a movement only when its run value is 0. That constant
  is the boundary this slice moves.
- Reachable helpers: the run's own arms, plus each C read of
  `svc.context.run` listed in the table.
- JavaScript cross-check: `grep -rn "nopick" js/*.js` returns only two
  assignments in `js/cmd.js` and an options string, so `hack.c:2529` and
  `hack.c:2555`'s `(!svc.context.nopick || svc.context.run)` has no ported
  counterpart. `grep -n "flags.time" js/allmain.js` returns nothing, so
  `allmain.c:262` and `allmain.c:552` have none either.
- Remaining limits: `lookaround()`'s own branches are not yet split into rows;
  the worker splits them as it traces. One recorded anomaly is unexplained and
  has its own row below.

## Status values

See `.agents/implementation-checklist-template.md`, "Status values".

## Implementation table

| Upstream function or branch family | Reachability and ordering | JavaScript owner | State, randomness, and output | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| `lookaround()` | Runs once per turn of a run, from `moveloop_core()`. Decides where the run stops | `js/hack.js` `lookaround()` | Reads the squares around the hero; sets `context.run` to 0 to stop | `hack.c:3898` | missing | Port it and split this row per branch family as the trace proceeds |
| `domove_core()` run arms | The don't-attack-while-running check, and the post-move stop on `IS_DOOR \|\| IS_OBSTRUCTED \|\| IS_FURNITURE` | `js/hack.js` `domove_core()` | Stops the run before the move completes | `hack.c:2764`, `hack.c:2936` | missing | Port with `lookaround()` |
| `nomul()` | Ends the multi-turn occupation when the run stops | `js/hack.js` | Clears `multi` and `context.run` | `hack.c:4160` | missing | Port with the stop arms |
| `runmode_delay_output()` | Called per turn under `flags.runmode`; the refreshes land in `animation_frames` | `js/hack.js` or `js/allmain.js` | Screen output only | `hack.c:2996`, `allmain.c:515` | missing | Port and confirm the frames match where the scorer counts them |
| `pickup.c:check_here()`'s `if (svc.context.run) nomul(0)` | Runs when the hero steps onto objects mid-run | `js/pickup.js` | Stops the run | `pickup.c:449` | missing | Port; the walk slice already reaches `check_here()` with run 0 |
| `allmain.c:262` and `allmain.c:552`, `flags.time` under `context.run` | C suppresses the per-turn time display while running and shows it once after | None; `grep -n "flags.time" js/allmain.js` returns nothing | Bottom-line output | `allmain.c:262`, `allmain.c:552` | undecided | Establish whether the port renders the turn counter at all, and whether a run changes it |
| `allmain.c:978`, `gm.multi > 0 && !context.travel && !context.run` | Gates the multi-turn occupation message | `js/allmain.js` | Message output | `allmain.c:978` | undecided | Trace whether any ported path reaches it with multi > 0 |
| `hack.c:2529` and `hack.c:2555`, `(!context.nopick \|\| context.run)` | Paranoid trap and region confirmations, which a run suppresses differently from a walk | None ported; `grep -rn "nopick" js/*.js` finds only two assignments | Prompt suppression | `hack.c:2529` | undecided | Confirm the ported walk path does not reach these, and that a run does not either |
| `hack.c:1042`, `1097`, `1181`, `1217`, `1287`, `1409`, `2473`, `2497` | Autodig, autoopen, travel and lava arms, all gated on `context.run` values this slice excludes | None | None | `hack.c` as listed | undecided | Confirm each is unreachable at run 1, or stops before output |
| `engrave.c:401`, `if (svc.context.run > 0)` | Engraving text the hero walks over | `js/engrave.js` | Message output | `engrave.c:401` | undecided | The walk slice already reads engravings; check what changes at run 1 |
| The `seed0013` mid-run input boundary | Steps 4–5 record an input boundary three turns into a run with the hero in a doorway, then a `\f` redraw step carrying 20 further turns and six animation frames | None | Unknown | Recorded session, not yet reproduced | undecided | Record a fresh case before targeting this session; do not infer the rule from the recording alone |

## Missing work by owner

1. `js/hack.js`: `lookaround()`, `domove_core()`'s two run arms, `nomul()`, and
   `runmode_delay_output()`. They are one unit; the run cannot stop without all
   of them.
2. `js/pickup.js`: `check_here()`'s run stop.
3. `js/cmd.js`: admit run 1 in `ADMITTED_COMMANDS`/`ADMITTED_BOUNDARY`, which is
   the last step, once the run can stop correctly.
4. The nine `undecided` rows above, each of which is a ported or unported path
   that C gates on `context.run` and the port has so far only run at 0. Settle
   each before the slice closes.

## Validation

- Commit checked: [pending]
- Source review: [pending]
- Focused tests: [pending]
- Full suite: [pending]
- Generated-file checks: [pending]
- Fresh differentials: [pending; vary the direction, the stopping cause
  (doorway, wall, object, monster in front), and the role, and include a run
  that stops on its first square]
- Development suite: [pending; this is the first goal that consumes game time,
  so a regression here would show as a *fall* in matched screens on sessions
  that never run. Compare per session against the parent, not just the total]
- Quality check: [pending]
- Browser check: [pending]

## Readiness

Current mode: Implementation

Reason: nothing is ported and nine rows are `undecided`.
