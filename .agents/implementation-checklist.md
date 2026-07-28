# Repeated simple commands: second re-audit checklist

## Boundary

- Starting event: an admitted repeated wait, one-square walk, or starting-pet
  collision at a ready D:1 prompt.
- Ending event: the next ready prompt, or the move-one-billion handoff to
  `done(ESCAPED)` after the urgent message and recorder-final boundary.
- Exclusions: every other command and every future-work monster, terrain,
  inventory, combat, transition, and endgame branch listed in `ROADMAP.md`.
- Observables: state and alias ownership, PRNG and call order, messages,
  complete screens and attributes, both cursor owners, queued input, and retry
  atomicity.

## Candidate construction

- Traced `allmain.c:moveloop_core`, `mon.c:movemon_singlemon`,
  `monmove.c:m_everyturn_effect`, `hack.c` capacity helpers, recorder patch 006,
  and the corresponding JavaScript consumers.
- Cross-checked the second full audit's five confirmed findings against the
  complete retry snapshots, fresh matrix, and direct source-state oracles.
- Manual search remains excluded by the authoritative selected goal.

## Implementation table

| Source family | Live reachability | JavaScript owner | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- |
| Post-action `encumber_msg` | HUNGRY-to-WEAK changes capacity before clairvoyance and the next prompt | `js/allmain.js:finishHeroTimeEffects` | Source-ordered helper test and live weakness/burden path | implemented | Validate exact head |
| Fog-cloud every-turn planning | Every living on-map fog cloud runs upkeep before its movement-ration test | `js/unported_monster_actions.js`; `js/mon.js` | Below- and at-ration cloned-region retry cases; live fog path | implemented | Validate exact head |
| Recorder-final terminal oracle | The final no-key capture must contain the complete rendered frame and independent cursor order | `scripts/allmain-turn.test.mjs` | Complete 24x80 attribute-grid digests and exact three-cursor tail | implemented | Validate exact head |
| Capacity branch oracle | Encoded Strength, saturation, coins, boulders, projection, and live cache are valid inputs | `scripts/u-init-inventory-attrs.test.mjs` | Source boundary table, overload cap, and cache ownership assertions | implemented | Validate exact head |
| Recursive light oracle | Planning must clone a multi-node list and remap every monster owner | `scripts/unported-monster-actions.test.mjs` | Three-node monster/object/monster remap plus nested leak mutations | implemented | Validate exact head |

## Validation

All evidence below is for the exact head `5e4db311f275f3a28be791a4355e48de35f70993`.

- Commit checked: done. Direct review against `allmain.c:moveloop_core`,
  `mon.c:movemon_singlemon`, `monmove.c:m_everyturn_effect`,
  `pickup.c:encumber_msg`, and the `hack.c`/`attrib.c` capacity arithmetic.
  It found one deviation, now fixed: the preflight held `context.mon_moving`
  across the once-per-turn upkeep, where C and the live loop both clear it
  before that block.
- Focused tests: done. 62 tests across `allmain-turn`, `second-complete-turn`,
  `u-init-inventory-attrs`, and `unported-monster-actions`.
- Full suite and generated checks: done. 1,684 tests, four generated-data
  checks, and `check:namespace-members` pass.
- Fresh 12-case differential: done.
  `node scripts/run-repeated-simple-commands.mjs` matches 83,269 PRNG calls
  and all 2,351 screens, attributes, and cursors across 12 segments.
- Development score: done. 98,385 PRNG values, 250 screens, and 250 cursors,
  identical to the parent commit call for call and screen for screen.
- Quality check: done. `npm run quality -- --check` exits clean with no
  unassigned `js/` files and no gate or advisory debt.
- Browser check: not required for shared engine behavior.

## Readiness

Current mode: Audit readiness

Reason: all five re-audit rows are implemented and validated at the exact head.

- **Boundary and live path:** unchanged from the Boundary section above. The
  live game runs both new paths: `advanceElapsedTurn` reaches the
  post-`hero_seq` `encumber_msg()`, and the elapsed-turn preflight plans every
  monster through `movemon_singlemon` before the live scan repeats it.
- **Source review:** every branch and helper reachable before the ending event
  was traced against upstream C, covering state and PRNG order. The excluded
  paths inside the boundary still stop before changing state, consuming
  randomness, or producing output.
- **Differential evidence:** the checked-in 12-case matrix above, which varies
  seed, datetime, role, gender, pet type, and the `mention_walls`,
  `safe_pet`, `autopickup`, `blind`, `accessiblemsg`, and `acoustics` options.
- **Completeness:** no known unsupported behavior remains inside the boundary.
- **Checks:** as listed under Validation.

Frozen range for the pass: `e30ea05..5e4db31`, which is every area's current
correctness frontier through this head. It holds two unreviewed implementation
commits (`dc0ae1b`, `5e4db31`) and 234 changed production lines, both inside
the per-slice review window.
