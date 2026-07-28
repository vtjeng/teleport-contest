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
| 5 | `js/unported_monster_actions.js` | The `gt`/`svt` clone has no test. | done |
| 6, 7 | `js/unported_monster_actions.js` | The planning `cansee` injection is unreachable dead code; its test pinned a different guard. | done |
| 8, 9 | `js/unported_monster_actions.js` | The `movemon()` light-source recheck was inert; the divergence it claimed to close stayed open. | done |
| 10 | `scripts/allmain-turn.test.mjs` | No unburdened twin of the capitulation test. | done |
| 11 | `scripts/allmain-turn.test.mjs` | No test for the live-capacity switch. Same gap as row 3. | done |
| 12 | `scripts/allmain-turn.test.mjs` | The burdened-upkeep test checked three scalars where its siblings compare a complete snapshot plus an RNG snapshot. | done |
| 13, 14 | `scripts/unported-monster-actions.test.mjs` | The isolation test claims "every monster-generation global" but omits `gt`/`svt`, and returns before `finishElapsedTurn` runs, so no monster is generated and no timer started. | done |
| 15 | `scripts/unported-monster-actions.test.mjs` | The visibility test cannot observe `canSeeSquare`. | done |

## Validation

- Commit checked: 4fc57d807d8e780714c2a3725d1fb8b7eabca92c
- Full suite and generated checks: 1,692 tests, four generated-data checks, and
  `check:namespace-members` pass at `4fc57d8`.
- Fresh differential: `node scripts/run-repeated-simple-commands.mjs` records
  the checked-in 17-segment matrix against C and matches 97,771 PRNG calls,
  2,367 screens, and 2,367 cursors.
- Development score: 98,436 PRNG values, 254 screens, 254 cursors, raised from
  250 screens by the two stairs and doorway commits.
- Quality check: `npm run quality -- --check` reports a clear review gate at
  `4fc57d8`, with four areas at the advisory checkpoint and no unassigned
  `js/` file.

## Readiness

Current mode: Ready for audit

Reason: all fifteen findings of the third pass are closed, and every new oracle
was checked by re-applying the mutation it is meant to catch. `a0d6283` and
`10613b8`, which admit STAIRS and non-blocking doorways as hero destinations,
are traced to `test_move()` and covered by the three stair and two doorway
segments of the checked-in matrix.

The pass reviews `e30ea05440a4850bee40881d3f65180c6ae7bb7b..4fc57d807d8e780714c2a3725d1fb8b7eabca92c`,
which is the whole slice since the last recorded frontier. That range covers
both the third cycle's fixes and the stairs and doorway commits, which sit past
the per-slice review window.

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
