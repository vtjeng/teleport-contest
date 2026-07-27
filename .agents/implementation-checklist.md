# Implementation checklist: repeated simple commands

## Boundary

- Roadmap item: Exploration, repeated simple commands.
- Starting code commit: `3c552b45602ccea8c36569384f94026840c73147`.
- Starting event: A correctly generated game waiting at its first command
  prompt.
- Ending event: The prompt after each command, repeated without bound. There is
  no fixed command count; this slice is about the sequence, not its length.
- Valid inputs: An unbounded sequence of single-keystroke commands on D:1, each
  either a wait or a one-square walk. Walk destinations in scope are an
  unoccupied object-free ordinary clear square, a `test_move()` refusal against
  wall or rock that consumes no time, a swap with an ordinary active starting
  pet, and a square whose objects only produce a floor description.
- Monster behavior: Ordinary D:1 monsters, including ones generated part-way
  through the sequence, and the starting little dog, kitten, or pony may move
  normally or stay put.
- Observables: State changes, PRNG calls and order, messages, complete 24x80
  screens and attributes, cursors, persistence, and the next input boundary.
- Exclusions: The `ROADMAP.md` future-work list, count prefixes, running,
  travel, every other command, pickup, doorways, and monster-initiated
  displacement of the hero.
- Fail-closed rule: An excluded command, destination, or elapsed path stops
  before any gameplay state change or PRNG consumption, preserving the
  supported prefix and leaving the pending phase retryable.

### Closure conditions

This slice closes when both pieces of replay scaffolding are gone, not when a
particular score is reached:

1. `js/fastforward.js` is deleted, along with `scripts/fastforward.test.mjs`.
   It currently holds eight replay rows for source turns 3 through 10,
   containing 30 literal `rn2()` calls copied from
   `seed8000-tourist-starter`.
2. The turn-index special cases in `allmain.c:moveloop_core()` are gone. It
   currently branches on `elapsedReplayStep = g.moves || 1` into
   `advanceFirstFreshTurn()` for turn 1, `advanceSecondFreshTurn()` for turn 2,
   and a manual hero debit plus `fastforward_step()` for every later turn. One
   source-shaped path must serve every turn.

A development-score decrease is acceptable where real behavior stops earlier
than a deleted replay row did. Record the decrease and its cause rather than
keeping a replay row to protect the number.

## How the candidate list was built

The upstream entry point is `allmain.c:moveloop_core()`, which runs the elapsed
phase for the preceding command and then dispatches the next one. From there
the monster path is `mon.c:movemon()` into `monmove.c:dochug()`, and the hero
path is `cmd.c:rhack()` into `hack.c:domove()`.

- Upstream entry points: `allmain.c` `moveloop_core()`; `mon.c` `movemon()`;
  `monmove.c` `dochug()` and `m_move()`; `dogmove.c` `dog_move()`; `hack.c`
  `domove()` and `test_move()`.
- Dispatch tables and catalogs: the `cmd.c` command table for the accepted
  keystrokes; `dochug()`'s four documented phases; `m_move()`'s `not_special`
  candidate loop.
- Reachable helpers: traced for rows 1 through 5 only.
- JavaScript cross-check: `js/fastforward.js` and the `elapsedReplayStep`
  dispatch in `js/allmain.js` are the two replay sites. Fail-closed stops live
  in `js/unported_monster_actions.js`, which holds 50 `unsupported()` calls,
  and in `firstTurnBoundary()` in `js/allmain.js`.
- Remaining limits: **the candidate list is incomplete.** It was derived from
  the two closure conditions and from reading `dochug()` and `m_move()` against
  their ports. The hero-side `domove()` and `test_move()` branches and the
  mid-sequence monster generation path have not been traced. Rows 6 through 10
  name work rather than record a finished inventory.

## Status values

Assign exactly one status to every row: `done`, `no-effect-yet`, `later`,
`cannot-occur`, `missing`, or `undecided`, as defined in
`.agents/implementation-checklist-template.md`. A JavaScript guard, fallback,
or passing development recording is evidence to investigate, not a status.

## Implementation table

| # | Upstream function or branch family | Reachability and ordering | JavaScript owner | State, randomness, and output | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `monmove.c:dochug()`, merged from its two ports | Runs once per monster per elapsed phase, for tame and non-tame alike, as in C. | `js/monmove.js` `dochug()` | Reconciled four asymmetries: both kinds now redraw a hallucinated monster that did not move, both run the pre-move item and weapon gates, and both hold the `mflee` draws. | Merged at `73ada94`. Full suite 1,625 tests; development score identical across all 33 sessions. | done | None. Row 3 still owes the two omitted `mayMove` terms. |
| 2 | `monmove.c:m_move()` prologue and tame dispatch | `m_move()` owns the `mintrap()` and `meating` prologue and the tame `dog_move()` dispatch through `postmov()`. | `js/monmove.js` `m_move()` | `mintrap()` and `finish_meating()` change state; the dispatch selects the mover. | `m_move()` already held `mintrap()` and `set_apparxy()`; it gained the `meating` countdown and the tame dispatch at `73ada94`. Both `dochug()` paths now make one `m_move()` call. | done | Give `m_move()`'s prologue its own focused test; the pet cases currently exercise it through a double. |
| 3 | `dochug()` omitted `mayMove` terms | The leprechaun gold term and `(Conflict && !mtmp->iswiz)` sit between `is_wanderer` and `!mcansee` in C's disjunction. Both ports omit them. | `js/monmove.js` `dochug()` | Omitting a short-circuiting term changes whether the later `!mcansee && rn2(4)` draw happens. | Read from `monmove.c:dochug()` phase three. | undecided | Determine whether the boundary excludes Conflict and leprechauns. If so, state the exact source condition; otherwise port both terms. |
| 4 | `allmain.c:moveloop_core()` elapsed phase | Runs before each command dispatch when the preceding command consumed time. | `js/allmain.js` `moveloop_core()` | Owns the hero movement debit, monster allocation, random monster generation, sounds, hunger, engraving wear, and timeouts. | Three branches became two at `263540f`; `advanceFreshTurn()` serves every turn after the first. The final collapse was attempted and reverted. Diagnosis: `finishHeroTimeEffects()` (`js/allmain.js:350`) requires an initialized `hero_seq`, but `hero_seq` is only assigned at `js/allmain.js:551` inside `finishFreshElapsedTurn()`, which a fast hero skips because `umovement >= NORMAL_SPEED`. The first-turn helper hid this by rejecting earlier through its own stubs. Separately, `assertSimpleActionState()` (`js/unported_monster_actions.js:168`) early-returns on `!monster.mcanmove`, so the synthetic fixture in `scripts/cmd.test.mjs:1321`, which omits `mcanmove` entirely, is admitted without any checks. | missing | Two attempts, both reverted, both with concrete evidence. C's `gh.hero_seq` is a zero-initialized global assigned `moves << 3` in the once-per-turn block and incremented after the loop, so a hero with surplus movement reaches the increment without the assignment. Adding `g.hero_seq ??= 0` to `newgame_pre_mklev()` clears the raw error but is **not** behavior-neutral: it turns the MonkSpeed fail-closed stop into execution and breaks the checked-in second-turn case. Separately, the earlier claim that the two finish gates agree on turn 1 is **false for a fast role**: `advanceFirstFreshTurn()` requires `!monstersCanMove` as well as a spent ration, and a Monk starts with surplus movement, so collapsing changes MonkSpeed even with `hero_seq` fixed. Next: work out what C does for a fast hero on turn 1, check that against the MonkSpeed oracle, and only then reconcile the gates. Closure condition 2. |
| 5 | `js/fastforward.js` replay rows | Reached for every turn after the second. | Deleted. | 30 literal `rn2()` calls copied from one recording. | Deleted whole at `263540f`, with `scripts/fastforward.test.mjs`. The score rose rather than fell: 98,270 to 98,306 PRNG values, 241 to 242 screens, 256 to 258 cursors. | done | None. Closure condition 1 is met. |
| 6 | `makemon.c` mid-sequence monster generation | `maybe_generate_rnd_mon()` runs once per elapsed turn and can add a monster part-way through the sequence. | `js/allmain.js`, `js/makemon.js` | Consumes randomness and extends the monster list, which then feeds `movemon()`. | Called today only from inside the replay branch. | undecided | Trace the generation path and how a newly generated monster meets the action boundary. |
| 7 | `hack.c:test_move()` refusal against wall or rock | Reached when a walk targets an obstructed square. Consumes no time, so no elapsed phase follows. | `js/hack.js`, `js/cmd.js` | Produces a message; leaves the turn counter unchanged. | Named in the goal as in scope. | undecided | Trace `test_move()`'s refusal branches and which produce output. |
| 8 | `hack.c:domove()` pet swap | Reached when a walk targets a square holding an ordinary active starting pet. | `js/hack.js`, `js/dogmove.js` | Swaps positions, produces a message, consumes time. | Named in the goal as in scope. | undecided | Trace the swap branch, its message, and the displacement refusal that the goal excludes. |
| 9 | Floor description for objects on the destination | Reached when a walk enters a square whose objects only produce a floor description. | `js/hack.js`, `js/invent.js` | Produces output only; pickup is excluded. | Named in the goal as in scope. | undecided | Trace the look-here path and find exactly where pickup would begin, so the exclusion fails closed there. |
| 10 | Repeated wait | The simplest repeated command; exercises the elapsed phase with no hero movement. | `js/cmd.js`, `js/allmain.js` | Consumes time and runs the full elapsed phase. | Already reached at turns 1 and 2. | undecided | Confirm the third and later waits once rows 1, 2, and 4 land. |

## Missing work by owner

1. `js/allmain.js` `moveloop_core()` and `js/fastforward.js`: rows 4 and 5. A
   replay row can only be deleted once the general path makes its calls, so
   these advance together. This is now the front of the queue.
2. Source tracing: rows 3 and 6 through 10. Each needs its upstream branches
   traced through the ending event before it can take a status other than
   `undecided`.

## Validation

Record evidence for the exact committed head that will be reviewed.

- Commit checked: [full commit SHA]
- Source review: [branches and helpers traced against upstream]
- Focused tests: [commands and results]
- Full suite: [command and result]
- Generated-file checks: [commands and results]
- Fresh differentials: [recipes, commands, results, varied dimensions]
- Development suite: [command and aggregate result; state any decrease and its
  cause]
- Quality check: [`npm run quality -- --check` result]
- Browser check: [result, or why repository policy does not require it]

### Baseline at the starting commit

The development suite at `3c552b45602ccea8c36569384f94026840c73147` matches
98,270 of 610,816 PRNG values, 241 of 7,765 screens, and 256 cursors, with 0 of
33 sessions passing. Nineteen of the 33 sessions match only four or five
screens, against session lengths of 23 to 1,953 moves. No local holdout
evaluation has been run for this slice.

Random-number matching runs about five times ahead of screen matching, 16.1
percent against 3.1 percent. That gap is unexplained and is worth
understanding before choosing where to spend effort.

An attempt to locate the first differing screen per session used an ad-hoc
script whose results contradicted the scorer, so it was discarded. **There is
no reliable per-screen divergence data yet.** Build that diagnostic from
`scripts/diff-fresh.mjs` and `scripts/scan-fresh.mjs` before drawing
conclusions about where the sequence breaks.

## Readiness

Current mode: Implementation

Reason: row 4 is `missing`, and rows 3 and 6 through 10 are
`undecided` pending source tracing. Neither closure condition is met:
closure condition 1 is met at `263540f` and closure condition 2 is not:
`moveloop_core()` still branches on `(g.moves || 1) === 1`. Rows 1, 2, and 5
are `done`.
