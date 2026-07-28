# Repeated simple commands: fourth re-audit checklist

## Boundary

Unchanged from the third cycle: an admitted repeated wait, one-square walk, or
starting-pet collision at a ready D:1 prompt, through the next ready prompt or
the elapsed-turn stop that replaces C's `done(ESCAPED)`.

## Candidate construction

The full `$audit-diff-correctness` pass over
`e30ea05440a4850bee40881d3f65180c6ae7bb7b..4fc57d807d8e780714c2a3725d1fb8b7eabca92c`
reported 23 raw, 22 deduplicated, and 19 confirmed findings, with three
rejected, none unverified, and no warnings. It ran the four mandatory finders
plus concurrency, which was enabled because the range converts `exercise()`,
`exerper()`, `finishHeroTimeEffects()`, and `detect.js`'s `exerciseWisdom()`
injection to `async`.

## Implementation table

| # | JavaScript owner | What is wrong | Status |
| --- | --- | --- | --- |
| 1 | `js/allmain.js` elapsed turn | `moveloop_core()` omits C's `mvl_wtcap = UNENCUMBERED` substitution for an invulnerable hero and its `overexert_hp()` block, with no stop above `MOD_ENCUMBER`. | done |
| 2 | `js/allmain.js:516` | The `gethungry()` half of the live-capacity switch has no oracle; reverting it alone leaves the suite green. | done |
| 3 | `js/allmain.js:550` | The refusal-list comment claims a completeness the code does not have, and calls a pass-through an escape. | done |
| 4 | `js/allmain.js:553` | The cloned round reaches `makemon()`, whose `UnsupportedMonsterCreationError` was rethrown unconverted and escapes `runSegment()`. | done |
| 5 | `js/allmain.js`, `js/jsmain.js` | The range deleted the only in-play writer of `program_state.gameover` and added two more reads of it. | done |
| 6 | `js/attrib.js:420` | Only `exerper()`'s WEAK arm pinned its new `await`; the three encumbrance arms and the five-turn cadence could all drop theirs. | done |
| 7 | `js/hack.js:246` | The destination seam's contract comment still described ROOM and CORR only. | done |
| 8, 10, 13 | `js/hack.js` | Admitting `D_ISOPEN` doorways made `test_move()`'s "diagonal out of an intact doorway" arm reachable, and nothing implemented it: the port moved the hero and elapsed a turn C refuses. | done |
| 9 | `js/hack.js:268` | Arriving on `STAIRS` or a doorway holding one object skipped `look_here()`'s `dfeature_at()` line. | done |
| 11 | `js/hack.js:279` | The diagonal comment named `doorless_door()` but the code tested `mask !== 0`, which C treats differently for `D_BROKEN`. | done |
| 12 | `js/hack.js:282` | Neither refusal added beside the doorway admission had a test. | done |
| 14 | `js/unported_monster_actions.js:603` | The planning `minLiquid` stub was silently permissive where the live owner refuses. | done |
| 15 | `js/unported_monster_actions.js:662` | The light-source refusal could not fire on the allocation-to-allocation edge, which is the burdened path the preflight exists for. | done |
| 16 | `scripts/allmain-turn.test.mjs:401` | The only test for `finishHeroTimeEffects()`'s new `await` recorded its marker synchronously. | done |
| 17 | `scripts/repeated-simple-commands.test.mjs:70` | The five stairs and doorway segments were asserted for shape only. | done |
| 18 | `scripts/run-repeated-simple-commands.mjs:202` | The predicate admitted three doorway masks where the recordings and comments covered two. | done |
| 19 | `scripts/second-turn-snapshot.mjs:86` | The retryability oracle omitted every global the sibling isolation commits added to `planningState()`. | done |

Rows 1, 8/10/13, and 9 closed as fail-closed stops rather than ports, because
each needs an upstream function family this goal excludes. `ROADMAP.md` carries
them as future work. Row 18 closed by narrowing the admitted masks to the two
the recordings cover, so `D_BROKEN` refuses with the other masks.

## Validation

- Commit checked: pending for the fix commit
- Full suite and generated checks: 1,704 tests, four generated-data checks, and
  `check:namespace-members` pass.
- Fresh differentials: `node scripts/run-repeated-simple-commands.mjs` matches
  97,771 PRNG calls and 2,367 screens and cursors across 17 segments;
  `node scripts/run-second-complete-turn.mjs` matches 46,255 PRNG calls and 54
  screens and cursors across 17 segments.
- Development score: 98,436 PRNG values, 254 screens, 254 cursors, unchanged
  through every fix.
- Mutation evidence: every new guard was re-checked by re-applying the mutation
  it is meant to catch. Six mutations of the two diagonal doorway rules, the
  `dfeature_at()` stop, the `mention_decor` stop, and the `D_BROKEN`
  admission are caught; so are the overexertion stop, the `UNENCUMBERED`
  substitution, the monster-creation conversion, both halves of the
  light-source refusal, the dropped `await` in `finishHeroTimeEffects()`, each
  of the four `exerper()` physical arms, and removing `STAIRS` and doorways
  from the admitted destinations.

### Case recorded against C but not yet matching

Seed 990002, datetime `20300102030405`, the `DoorFind` rc of matrix segment 16,
inputs `ljjjy`. The fifth key is a diagonal step off the `D_ISOPEN` doorway the
first four reach. C refuses it in `test_move()` and consumes no time: all 2,633
PRNG calls match and C's sixth cursor is `[6,9,1]`, the hero's own square. The
port stops fail-closed there, so it emits five screens against C's six. It
matches once `test_move()`'s zero-time refusal is ported, and it is kept out of
the passing matrix until then.

Before the fix, the same recording showed the defect the pass predicted: the
port drew an `rn2(5)` C never draws, moved the hero to cursor `[5,8,1]`, and
painted `@` where C shows `.`.

### Oracle gap carried forward

The `gethungry()` half of the live-capacity switch at `js/allmain.js` still has
no reachable oracle. Nothing between `moveloop_core()`'s `mvl_wtcap` snapshot
and `eat.c gethungry()` can change `weight_cap()` in the ported subset: C's own
reason for the live read is a Levitation timeout expiring in `nh_timeout()`,
which is unported. Reverting that one injection to the snapshot leaves the whole
suite green, so do not read the commit title as coverage for it. The `exerchk()`
half twelve lines below is pinned through the WEAK transition.

## Readiness

Current mode: Implementation

Reason: the pass is complete and all nineteen findings are closed, but the fix
commit is itself unreviewed. Three of the last four passes over this slice
found defects that the previous pass's own fixes introduced, and this fix tail
is larger than the last: it changes production code in four files and adds a
refusal the previous cycles never had. It is correctness debt for the next
scheduled pass.

## Rejected findings, not to reopen

The pass rejected three findings with counter-evidence; `QUALITY.json` records
each with the evidence that settled it. The previous cycle's rejection also
stands: `capacity_from_excess()`'s `capacity <= 1` arm and `weight_cap()`'s
`max(carrcap, 1)` floor are structurally unreachable, and the identical mutation
survives at `e30ea05`. Do not reopen any of them without a source-reachable
input and a diff-causal line.
