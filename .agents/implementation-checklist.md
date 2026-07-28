# Repeated simple commands: third re-audit checklist

## Boundary

- Starting event: an admitted repeated wait, one-square walk, or starting-pet
  collision at a ready D:1 prompt.
- Ending event: the next ready prompt, or the elapsed-turn stop that replaces
  the current fabricated move-one-billion handoff.
- Exclusions: every other command and every future-work monster, terrain,
  inventory, combat, transition, and endgame branch listed in `ROADMAP.md`.
- Observables: state and alias ownership, PRNG and call order, messages,
  complete screens and attributes, both cursor owners, queued input, and retry
  atomicity.

## Candidate construction

The full `$audit-diff-correctness` pass over
`e30ea05440a4850bee40881d3f65180c6ae7bb7b..5e4db311f275f3a28be791a4355e48de35f70993`
reported 23 raw, 19 deduplicated, and 18 confirmed findings with one rejected,
none unverified, and no warnings. Its four finders were correctness,
readability, tests, and variable-trace. Every row below is one confirmed
finding; the full report is at
`/tmp/claude-1000/-home-vtjeng-development-vtjeng-teleport-contest/d2bf1c39-aded-479e-b7c5-fa8fc575e4c2/scratchpad/findings.md`.

Two findings put the slice back in Implementation rather than Audit fix: row 1
changes rendering behavior and row 5 changes PRNG behavior.

## Implementation table

| # | Source family | JavaScript owner | What is wrong | Status |
| --- | --- | --- | --- | --- |
| 1 | `end.c:done(ESCAPED)` | `js/allmain.js` capitulation path | Synthesizes a `flush_screen(1)` plus a direct `_preNhgetchHook()` capture for an unported branch instead of stopping. C reaches `nh_terminate()` only after disclosure and topten, so the emitted frame exists in no C run. The new digests pin the port's own output. | done |
| 2 | `allmain.c` once-per-turn upkeep | `scripts/allmain-turn.test.mjs` | Both relocated planning stops delete cleanly with 1,684 tests still passing. | done |
| 3 | `allmain.c` once-per-turn upkeep | `js/allmain.js:484,496` | Guards named "burdened" are gated on `planning`; the equivalence is established 80 lines away and the unburdened path runs `run_regions()` and `automatic_search()` unpreflighted. | done |
| 4 | `attrib.c:exercise()` | `js/attrib.js:307` | Returns a number or a Promise depending on the attribute index, with no signature or comment saying so. | done |
| 5 | `attrib.c:exerper()` | `js/allmain.js:515` | Injects the `near_capacity()` snapshot taken before `gethungry()`, so `exerper` reads pre-weakness encumbrance where `attrib.c:554` reads it live. Costs an `rn2(19)` draw and possibly an `encumber_msg()` line on a `moves % 10 === 0` WEAK transition. | done |
| 6 | `cmd.c:rhack()` | `scripts/cmd.test.mjs` | The `!firstTime` half of `newLogicalCommand` is unpinned; a constant `false` leaves the suite green. | done |
| 7 | `hack.c` capacity | `js/hack.js:150` | `projected_capacity()` never states the one thing that differs from `near_capacity()`: it does not write `state.gw.wc`. Comment names the wrong C file. | done |
| 8 | `mon.c:movemon_singlemon()` | `js/unported_monster_actions.js:160` | `assertSimpleScanState()`'s new early `return true` skips every later `unsupported()` guard, and `true` now carries two meanings. | done |
| 9 | `timeout.c` timer queue | `js/unported_monster_actions.js:344` | `planningState()` leaves `state.gt` and `state.svt` aliased to the live game, so a monster generated during a planning round inserts a real timer into the live queue and bumps `timer_id`. Retry is no longer atomic. | done |
| 10 | `region.c:create_gas_cloud()` | `js/unported_monster_actions.js:565` | Planning stubs `blockPoint`/`canSee`/`newsym`, so a planned cloud never blocks vision while the live scan's `block_point()` rebuilds the transparency index. Later monsters in the same scan diverge between the two passes. Must fail closed instead. | done |
| 11 | `mon.c:movemon_singlemon()` | `scripts/unported-monster-actions.test.mjs` | No test pins the planning injection set against the live one. | done |
| 12 | `mon.c:movemon_singlemon()` conflict arm | `js/unported_monster_actions.js:585` | Planning injects `couldsee` where `mon.c` calls `cansee()` and the live scan injects `cansee`. | done |
| 13 | `mon.c:movemon()` | `js/unported_monster_actions.js:613` | The planning scan hand-rolls `movemon()`'s loop, so the four steps it omits are invisible. | done |
| 14 | `allmain.c` elapsed turn | `scripts/unported-monster-actions.test.mjs` | The preflight's second and later monster scans are never exercised; forcing `somebodyCanMove` false leaves the suite green. | done |
| 15 | `mon.c:movemon()` tail | `js/unported_monster_actions.js:623` | The plan omits `if (any_light_source(state)) state.vision_full_recalc = 1`, even though this range newly clones `gl.light_base`. | done |
| 16 | elapsed-turn preflight contract | `js/unported_monster_actions.js:638` | `terminal` is returned but never read; the caller re-derives a non-equivalent `reachesTurnLimit`. | done |
| 17 | recorder-final oracle | `scripts/allmain-turn.test.mjs:825` | The three-cursor comment credits the 64-column capture to the hero-time `encumber_msg()`, but the capitulation path returns before `finishHeroTimeEffects()` runs. That frame comes from the loop-top call. | done |
| 18 | `context.mon_moving` bracketing | `scripts/unported-monster-actions.test.mjs` | Deleting both assignments leaves the suite green while the planned cloud's `heros_fault` flips. | done |

## Validation

- Commit checked: 2f92a4a83197c7e233b24a3e2b3b341b6700fd63
- Direct review: done, against `allmain.c`, `mon.c`, `monmove.c`, `region.c`,
  `pickup.c`, `eat.c`, `attrib.c`, and `hack.c`. It found one site the audit
  did not name: `gethungry()` reads `near_capacity()` live in C too, so it got
  the same live evaluator as `exerper()`.
- Focused tests: done. Every new oracle was checked by re-applying the exact
  mutation the audit used and confirming it now fails.
- Full suite and generated checks: done. 1,690 tests, four generated-data
  checks, and `check:namespace-members` pass.
- Fresh 12-case differential: done. 83,269 PRNG calls and all 2,351 screens,
  attributes, and cursors match.
- Development score: done. 98,385 PRNG values, 250 screens, 250 cursors,
  unchanged through every commit in this cycle.
- Quality check: done. `npm run quality -- --check` exits clean; two areas sit
  at the advisory checkpoint, which does not itself require a pass.
- Browser check: not required for shared engine behavior.

## Readiness

Current mode: Ready for audit

Reason: all 18 confirmed findings are closed and validated. Rows 1 and 5
changed rendering and PRNG behavior, so this cycle was Implementation rather
than Audit fix, and the expanded range `e30ea05..HEAD` needs a new full
correctness pass before the slice can close. That pass has not run.

Closing commits, with the development score held at 98,385 PRNG values, 250
screens, and 250 cursors and the 12-case matrix exact at 83,269 PRNG calls and
2,351 screens throughout:

- `9f2d76d` rows 1, 5, 17: the capitulation stop and live capacity evaluators.
- `eb04fb8` rows 9, 10, 12: timer-queue cloning, fail-closed planned gas clouds,
  and the conflict arm's visibility mask.
- `407f080` rows 3, 4, 7, 8, 13, 15, 16: production exposition and structure.
- This commit, rows 2, 6, 11, 14, 18: the five mutation-proven test gaps.

Row 10 narrowed supported behavior: fog-cloud upkeep used to run live and now
stops. That is the fail-closed rule applied to a path whose dry run cannot
model `block_point()`, and it cost no measured screens, but it is a deliberate
reduction rather than a pure fix.

Row 18's other half has no reachable observable any more. Its premise was that
a planned cloud's `heros_fault` would flip; after row 10 no region is created
during planning at all, so the test pins the reset that C performs before the
once-per-turn block, which is the half that remains checkable.

## Rejected finding, not to reopen

`capacity_from_excess()`'s `capacity <= 1 -> OVERLOADED` arm and `weight_cap()`'s
`max(carrcap, 1)` floor are unpinned, but both are pre-existing and structurally
unreachable: `inv_weight()` overwrites `state.gw.wc` from `weight_cap()` before
`calc_capacity()` reads it, and `js/attrib.js` clamps Strength and Constitution
to a minimum of 3, making 200 the floor. The identical mutation survives at
`e30ea05`. Do not reopen without a source-reachable input and a diff-causal
line.
