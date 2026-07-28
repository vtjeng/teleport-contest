# Repeated simple commands: fourth re-audit checklist

## Boundary

Unchanged from the third cycle: an admitted repeated wait, one-square walk, or
starting-pet collision at a ready D:1 prompt, through the next ready prompt or
the elapsed-turn stop that replaces C's `done(ESCAPED)`.

## Candidate construction

The full `$audit-diff-correctness` pass over
`e30ea05440a4850bee40881d3f65180c6ae7bb7b..2f92a4a83197c7e233b24a3e2b3b341b6700fd63`
reported 22 raw, 20 deduplicated, and 15 confirmed findings, with five rejected,
none unverified, and no warnings. Six of the fifteen were defects the previous
cycle's own fixes introduced. The full report is at
`scratchpad/findings3.md`.

## Implementation table

| # | JavaScript owner | What is wrong | Status |
| --- | --- | --- | --- |
| 1 | `js/allmain.js` turn limit | The `done(ESCAPED)` stop was atomic only for a burdened hero; unburdened threw mid-turn with `moves` at the wrap value and an ISAAC draw spent. | done |
| 2 | `js/allmain.js` preflight catch | Three refusal classes the cloned round can raise escaped as hard failures instead of fail-closed boundaries. | done |
| 3 | `js/allmain.js:515` | The live `near_capacity()` switch for `gethungry()`/`exerchk()` has no oracle: reverting both injections leaves the suite green and the 12-case matrix exact. | done |
| 4 | `js/attrib.js` | The split moved the missing-`encumberMessage` rejection after the rn2 draw. | done |
| 5 | `js/unported_monster_actions.js` | The `gt`/`svt` clone has no test. | missing |
| 6, 7 | `js/unported_monster_actions.js` | The planning `cansee` injection is unreachable dead code; its test pinned a different guard. | done |
| 8, 9 | `js/unported_monster_actions.js` | The `movemon()` light-source recheck was inert; the divergence it claimed to close stayed open. | done |
| 10 | `scripts/allmain-turn.test.mjs` | No unburdened twin of the capitulation test. | done |
| 11 | `scripts/allmain-turn.test.mjs` | No test for the live-capacity switch. Same gap as row 3. | done |
| 12 | `scripts/allmain-turn.test.mjs` | The burdened-upkeep test checks three scalars where its siblings compare a complete snapshot plus an RNG snapshot. | missing |
| 13, 14 | `scripts/unported-monster-actions.test.mjs` | The isolation test claims "every monster-generation global" but omits `gt`/`svt`, and returns before `finishElapsedTurn` runs, so no monster is generated and no timer started. | missing |
| 15 | `scripts/unported-monster-actions.test.mjs` | The visibility test cannot observe `canSeeSquare`. | done |

## Validation

- Commit checked: pending
- Full suite and generated checks: 1,690 tests, four generated-data checks, and
  `check:namespace-members` pass at `0652be7`.
- Fresh 12-case differential: 83,269 PRNG calls and all 2,351 screens match.
- Development score: 98,385 PRNG values, 250 screens, 250 cursors, unchanged.
- Quality check: pending for the closing commit.

## Readiness

Current mode: Implementation

Reason: four of the fifteen findings remain, all test-coverage: rows 5, 12, 13,
and 14. Rows 3 and 11 are closed -- the live-capacity switch now has an oracle
that fails when either injection is reverted to the snapshot.

The slice also grew: `a0d6283` and `10613b8` admit STAIRS and non-blocking
doorways as hero destinations, raising the development score from 250 to 254
screens and 98,385 to 98,436 PRNG values. That work is unreviewed and sits past
the per-slice review window, so the next full correctness pass must cover it.

Note for the next cycle: two consecutive passes have found that this slice's
fixes introduce new defects at roughly a third the rate they close them. The
next pass over the expanded range is due before the slice closes, and before
any new roadmap slice starts.

## Rejected findings, not to reopen

Five findings were rejected with counter-evidence in the pass report retained at
`scratchpad/findings3.md`. The previous cycle's rejection also stands:
`capacity_from_excess()`'s `capacity <= 1` arm and `weight_cap()`'s
`max(carrcap, 1)` floor are structurally unreachable, and the identical mutation
survives at `e30ea05`. Do not reopen either without a source-reachable input and
a diff-causal line.
