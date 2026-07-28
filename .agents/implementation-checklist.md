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
| 1 | `end.c:done(ESCAPED)` | `js/allmain.js` capitulation path | Synthesizes a `flush_screen(1)` plus a direct `_preNhgetchHook()` capture for an unported branch instead of stopping. C reaches `nh_terminate()` only after disclosure and topten, so the emitted frame exists in no C run. The new digests pin the port's own output. | missing |
| 2 | `allmain.c` once-per-turn upkeep | `scripts/allmain-turn.test.mjs` | Both relocated planning stops delete cleanly with 1,684 tests still passing. | missing |
| 3 | `allmain.c` once-per-turn upkeep | `js/allmain.js:484,496` | Guards named "burdened" are gated on `planning`; the equivalence is established 80 lines away and the unburdened path runs `run_regions()` and `automatic_search()` unpreflighted. | missing |
| 4 | `attrib.c:exercise()` | `js/attrib.js:307` | Returns a number or a Promise depending on the attribute index, with no signature or comment saying so. | missing |
| 5 | `attrib.c:exerper()` | `js/allmain.js:515` | Injects the `near_capacity()` snapshot taken before `gethungry()`, so `exerper` reads pre-weakness encumbrance where `attrib.c:554` reads it live. Costs an `rn2(19)` draw and possibly an `encumber_msg()` line on a `moves % 10 === 0` WEAK transition. | missing |
| 6 | `cmd.c:rhack()` | `scripts/cmd.test.mjs` | The `!firstTime` half of `newLogicalCommand` is unpinned; a constant `false` leaves the suite green. | missing |
| 7 | `hack.c` capacity | `js/hack.js:150` | `projected_capacity()` never states the one thing that differs from `near_capacity()`: it does not write `state.gw.wc`. Comment names the wrong C file. | missing |
| 8 | `mon.c:movemon_singlemon()` | `js/unported_monster_actions.js:160` | `assertSimpleScanState()`'s new early `return true` skips every later `unsupported()` guard, and `true` now carries two meanings. | missing |
| 9 | `timeout.c` timer queue | `js/unported_monster_actions.js:344` | `planningState()` leaves `state.gt` and `state.svt` aliased to the live game, so a monster generated during a planning round inserts a real timer into the live queue and bumps `timer_id`. Retry is no longer atomic. | missing |
| 10 | `region.c:create_gas_cloud()` | `js/unported_monster_actions.js:565` | Planning stubs `blockPoint`/`canSee`/`newsym`, so a planned cloud never blocks vision while the live scan's `block_point()` rebuilds the transparency index. Later monsters in the same scan diverge between the two passes. Must fail closed instead. | missing |
| 11 | `mon.c:movemon_singlemon()` | `scripts/unported-monster-actions.test.mjs` | No test pins the planning injection set against the live one. | missing |
| 12 | `mon.c:movemon_singlemon()` conflict arm | `js/unported_monster_actions.js:585` | Planning injects `couldsee` where `mon.c` calls `cansee()` and the live scan injects `cansee`. | missing |
| 13 | `mon.c:movemon()` | `js/unported_monster_actions.js:613` | The planning scan hand-rolls `movemon()`'s loop, so the four steps it omits are invisible. | missing |
| 14 | `allmain.c` elapsed turn | `scripts/unported-monster-actions.test.mjs` | The preflight's second and later monster scans are never exercised; forcing `somebodyCanMove` false leaves the suite green. | missing |
| 15 | `mon.c:movemon()` tail | `js/unported_monster_actions.js:623` | The plan omits `if (any_light_source(state)) state.vision_full_recalc = 1`, even though this range newly clones `gl.light_base`. | missing |
| 16 | elapsed-turn preflight contract | `js/unported_monster_actions.js:638` | `terminal` is returned but never read; the caller re-derives a non-equivalent `reachesTurnLimit`. | missing |
| 17 | recorder-final oracle | `scripts/allmain-turn.test.mjs:825` | The three-cursor comment credits the 64-column capture to the hero-time `encumber_msg()`, but the capitulation path returns before `finishHeroTimeEffects()` runs. That frame comes from the loop-top call. | missing |
| 18 | `context.mon_moving` bracketing | `scripts/unported-monster-actions.test.mjs` | Deleting both assignments leaves the suite green while the planned cloud's `heros_fault` flips. | missing |

## Validation

- Commit checked: pending
- Direct review: pending
- Focused tests: pending
- Full suite and generated checks: pending
- Fresh 12-case differential: pending
- Development score: pending
- Quality check: pending
- Browser check: not required for shared engine behavior.

## Readiness

Current mode: Implementation

Reason: 18 confirmed findings are open. Rows 1 and 5 change rendering and PRNG
behavior, so this is Implementation rather than Audit fix, and the expanded
range needs a new full correctness pass once it closes.

## Rejected finding, not to reopen

`capacity_from_excess()`'s `capacity <= 1 -> OVERLOADED` arm and `weight_cap()`'s
`max(carrcap, 1)` floor are unpinned, but both are pre-existing and structurally
unreachable: `inv_weight()` overwrites `state.gw.wc` from `weight_cap()` before
`calc_capacity()` reads it, and `js/attrib.js` clamps Strength and Constitution
to a minimum of 3, making 200 the floor. The identical mutation survives at
`e30ea05`. Do not reopen without a source-reachable input and a diff-causal
line.
