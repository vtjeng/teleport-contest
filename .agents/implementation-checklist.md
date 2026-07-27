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

The two structural replay conditions are complete, but they are not sufficient
for behavioral closure. This slice closes only after they remain complete and
every reachable in-boundary row below is `done`, `no-effect-yet`, or
`cannot-occur`, with strict fresh evidence through the repeated prompt. It does
not close at a particular score.

1. `js/fastforward.js` is deleted, along with `scripts/fastforward.test.mjs`.
   This was completed at `263540f`.
2. The turn-index special cases in `allmain.c:moveloop_core()` are gone. It
   now has one source-shaped elapsed path for every turn, completed at
   `9afade25`.

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
- Once-per-turn helpers: traced from `allmain.c:moveloop_core()` through
  `attrib.c:exerchk()` and `exerper()`. The source calls `exerchk()` after
  `age_spells()` and before `invault()` and engraving wear.
- JavaScript cross-check: both replay sites are gone. Fail-closed stops remain
  in `js/unported_monster_actions.js` and in the hero-destination admission
  seam in `js/cmd.js`.
- Hero movement helpers: the in-boundary physical-obstacle, starting-pet, and
  floor-description paths have now been traced from `hack.c:domove()` through
  `test_move()`, `do_attack()`, `domove_swap_with_pet()`, and
  `invent.c:look_here()`.
- Remaining limits: natural mid-sequence monster generation is now verified
  through the generated monster's first move-or-stay result. Extending the
  same fresh case by one wait exposed a separate in-boundary stop when an
  ordinary monster selected a doorless doorway; row 12 records that gap.

## Status values

Assign exactly one status to every row: `done`, `no-effect-yet`, `later`,
`cannot-occur`, `missing`, or `undecided`, as defined in
`.agents/implementation-checklist-template.md`. A JavaScript guard, fallback,
or passing development recording is evidence to investigate, not a status.

## Implementation table

| # | Upstream function or branch family | Reachability and ordering | JavaScript owner | State, randomness, and output | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `monmove.c:dochug()`, merged from its two ports | Runs once per monster per elapsed phase, for tame and non-tame alike, as in C. | `js/monmove.js` `dochug()` | Reconciled four asymmetries: both kinds now redraw a hallucinated monster that did not move, both run the pre-move item and weapon gates, and both hold the `mflee` draws. | Merged at `73ada94`. Full suite 1,625 tests; development score identical across all 33 sessions. | done | None. |
| 2 | `monmove.c:m_move()` prologue and tame dispatch | `m_move()` owns the `mintrap()` and `meating` prologue and the tame `dog_move()` dispatch through `postmov()`. | `js/monmove.js` `m_move()` | `mintrap()` and `finish_meating()` change state; the dispatch selects the mover. | `m_move()` already held `mintrap()` and `set_apparxy()`; it gained the `meating` countdown and the tame dispatch at `73ada94`. Both `dochug()` paths now make one `m_move()` call. | done | Give `m_move()`'s prologue its own focused test; the pet cases currently exercise it through a double. |
| 3 | `dochug()` omitted `mayMove` terms | The leprechaun gold term and `(Conflict && !mtmp->iswiz)` sit between `is_wanderer` and `!mcansee` in C's disjunction. Both ports omit them. | `js/monmove.js` `dochug()` | Omitting a short-circuiting term would change whether the later `!mcansee && rn2(4)` draw happens. | Conflict cannot be established by the allowed commands or starting inventory. D:1 runtime generation admits difficulty at most 1 for a level-one hero; the leprechaun has difficulty 4. Neither term is reachable before this boundary. | cannot-occur | Keep the source comment and revisit when a later command or level can establish either term. |
| 4 | `allmain.c:moveloop_core()` elapsed phase | Runs before each command dispatch when the preceding command consumed time. | `js/allmain.js` `moveloop_core()` | Owns the hero movement debit, monster allocation, random monster generation, sounds, hunger, engraving wear, and timeouts. | Completed at `9afade25`. `advanceFreshTurn()` now serves every turn, including the first; it preserves C's outer hero-ration loop and the `!monscanmove && u.umovement < NORMAL_SPEED` once-per-turn gate. The MonkSpeed oracle, all 1,622 tests, and the development score pass unchanged from `263540f`. | done | None. Closure condition 2 is met. |
| 5 | `js/fastforward.js` replay rows | Reached for every turn after the second. | Deleted. | 30 literal `rn2()` calls copied from one recording. | Deleted whole at `263540f`, with `scripts/fastforward.test.mjs`. The score rose rather than fell: 98,270 to 98,306 PRNG values, 241 to 242 screens, 256 to 258 cursors. | done | None. Closure condition 1 is met. |
| 6 | `attrib.c:exerper()` and `exerchk()` | `allmain.c:moveloop_core()` calls `exerchk()` once per allocated turn, after `age_spells()` and before `invault()` and engraving wear. `exerper()` runs status checks every 5 turns and hunger and encumbrance checks every 10; `exerchk()` also owns the scheduled check beginning at `context.next_attrib_check == 600`. | `js/attrib.js` `exerper()`, `exerchk()`, and their live `adjattrib()` consumer; `js/allmain.js:finishFreshElapsedTurn()` calls the upkeep in source order. | The periodic call changes attribute exercise state and PRNG order before later generation, movement, or rendering. | Implemented at `6b721cd`. Before the port, `node scripts/diff-fresh.mjs --seed 42510 --datetime 20310203040506 --moves ............................................................ --name RuntimeFind --role Healer --race human --gender male --align neutral --options pettype:none,!acoustics` matched all 61 screens and cursors but first differed at PRNG call 2,823 on step 10: C called `rn2(19)=12` from `exercise(attrib.c:509)` while JS called the later engraving-wear `rn2(64)=40`; totals were C 2,983 and JS 3,041. With the source-owned upkeep installed, the same strict command matches all 2,983 PRNG calls, 61 screens, and 61 cursors. Focused tests pin ten-turn hunger and encumbrance order, five-turn status property semantics, attribute adjustment, the move-600 scheduled check, exercise decay, messages, and rescheduling. | done | None. |
| 7 | `makemon.c` mid-sequence monster generation | `maybe_generate_rnd_mon()` runs once per allocated turn and can add a monster after current monsters receive movement. The new monster first receives a ration on the following allocation. | `js/allmain.js`, `js/makemon.js`, `js/makemon_create.js` | Consumes randomness, extends the monster list, and then feeds the new monster to `movemon()`. | At `aa57304216fd4e15b976bd7483e89a1ff55f8a93`, the strict seed-42510 RuntimeFind case with 140 waits matches 3,545 PRNG calls, 141 screens and attributes, and 141 cursors. Its recorded step 75 calls `rn2(70)=0` in `maybe_generate_rnd_mon()`, creates a jackal, and the new monster reaches its first move-or-stay work on step 77 without divergence. Direct tests separately force the zero gate and following allocation. | done | None. |
| 8 | `hack.c:test_move()` refusal against wall or rock | Reached when a walk targets an obstructed square. It consumes no time. With `mention_walls`, C describes the remembered background glyph through `pline_dir()`; without it, the refusal is silent. | `js/hack.js:test_move()` owns the physical wall and rock subset; `js/cmd.js:domove()` retains command-state cleanup. | Prints the source wall or solid-stone message when enabled, consumes no PRNG, consumes no time, and clears the attempted movement state. | Implemented at `aa57304216fd4e15b976bd7483e89a1ff55f8a93`. Fresh seed 31001, datetime `20300102030405`, Healer `WallWestA`, `mention_walls`, and 12 west moves matches all 3,183 PRNG calls, 13 screens and attributes, and 13 cursors. The `!mention_walls` four-west-move companion matches all 3,183 calls, five screens, and five cursors. A focused test pins wall, solid-stone, silent, and legal-square results. | done | None. |
| 9 | `hack.c:domove()` ordinary starting-pet swap | A movement command into a visible safe starting pet calls `do_attack()` first. Its `rn2(7)` refusal gate can consume the move; otherwise `domove_swap_with_pet()` exchanges positions, prints the swap message, and applies the pet's destination effects. | `js/uhitm.js:do_attack()` owns the safe-pet gate and refusal; `js/hack.js:domove_swap_with_pet()` owns the successful exchange; `js/cmd.js` admits only the ordinary active starting-pet subset. | Consumes randomness, either makes the tame monster flee and stops with a message or changes hero and pet positions and redraws both squares; either outcome consumes time. | Implemented at `aa57304216fd4e15b976bd7483e89a1ff55f8a93`. Fresh Tourist seed 31006 reaches `rn2(7)=6`, swaps with the kitten, prints `You swap places with your kitten.`, and matches 2,756 PRNG calls and both screens/cursors. Independently selected seed 31009 reaches `rn2(7)=0`, then `rnd(6)=3`, prints `You stop.  Your kitten is in the way!`, and matches 2,841 calls and both screens/cursors. Focused tests pin both draw and state-transition orders. | done | None. |
| 10 | Floor description for an object on the destination | With autopickup disabled, `hack.c:domove()` reaches `spoteffects(TRUE)`, `pickup(1)`, `check_here()`, and `invent.c:look_here()` after the legal move. | `js/cmd.js:requireSimpleHeroDestination()` admits exactly one object only when autopickup is disabled; the live `domove()` calls `js/invent.js:look_here_single_object()`. | Moves the hero, consumes time, and produces the one-object floor description without picking the object up. Piles and automatic pickup remain atomic stops. | Implemented at `aa57304216fd4e15b976bd7483e89a1ff55f8a93`. Fresh seed 32003, datetime `20300102030405`, Tourist `ObjectFind`, west move, and `mention_walls,!autopickup` prints `You see here 5 gold pieces.` and matches all 2,301 PRNG calls and both screens/cursors. Focused tests retain atomic rejection for piles and automatic pickup and pin the single-object message owner. | done | None. |
| 11 | Repeated wait | The simplest repeated command exercises the elapsed phase with no hero movement. | `js/cmd.js`, `js/allmain.js` | Consumes time and runs the full elapsed phase. | Fresh Healer four-wait and Monk six-wait cases match completely. After row 6, the exact 60-wait RuntimeFind command matches 2,983 PRNG calls and all 61 screens/cursors. At `aa57304216fd4e15b976bd7483e89a1ff55f8a93`, its 140-wait extension matches 3,545 calls and all 141 screens/cursors through natural generation and the new monster's first action. The 141st wait reaches row 12. | undecided | Resolve row 12, then continue the same source-selected long-run procedure to the next independent boundary. |
| 12 | `monmove.c:m_move()` ordinary movement through a doorless doorway | `mfndpos()` treats a `DOOR` square with `D_NODOOR` as accessible. An ordinary monster may select it during any elapsed phase; `postmov()` has no door-opening work when the mask is already doorless. | `js/unported_monster_actions.js:assertSimpleDestination()` currently admits only `ROOM` and `CORR`, despite `js/monmove.js` already modeling door accessibility. | The premature stop omits the selected monster move and all later PRNG, screen, and cursor output, but preserves the retryable prefix. | Extending the exact seed-42510 RuntimeFind reproduction from 140 to 141 waits stops atomically at the JavaScript reason `door or special terrain movement`. C continues at boundary 142 with `rn2(5)=3` in `distfleeck()`; totals are C 3,552 versus JS 3,545 PRNG calls, 142 versus 141 screens, and 142 versus 141 cursors. Direct state inspection identifies the selected destination as `DOOR` with `doormask=0`. | missing | Extend the ordinary monster destination and post-move subset to a doorless doorway, then rerun the 141-wait case and its adjacent source branches. |

## Missing work by owner

1. `monmove.c` ordinary doorway movement and repeated-wait closure: rows 12
   and 11. Admit only the source-accessible doorless doorway path first, then
   extend the same natural-generation reproduction to the next independent
   boundary.

## Validation

Record evidence for the exact committed head that will be reviewed.

- Commit checked: `aa57304216fd4e15b976bd7483e89a1ff55f8a93`.
- Source review: retained the periodic-upkeep review and compared the newly
  live paths with `hack.c:test_move()` and `domove_swap_with_pet()`,
  `uhitm.c:do_attack()`, `pickup.c:pickup()` and `check_here()`, and
  `invent.c:look_here()`. The review covered output gates, safe-pet draw and
  refusal order, position and display updates, and the distinction between
  one-object description, piles, and automatic pickup. Extending the natural
  generation case also identified the separate `monmove.c:m_move()`
  doorless-doorway gap in row 12.
- Focused tests: `npm run checkpoint -- --focus scripts/cmd.test.mjs`; all 31
  command tests passed. `node scripts/options.test.mjs`,
  `node scripts/objnam.test.mjs`, and `node scripts/uhitm.test.mjs` also passed
  all 40, 14, and two tests respectively.
- Full suite: the checkpoint ran all 1,629 tests; all passed.
- Generated-file checks: the same checkpoint passed `check:monsters`,
  `check:objects`, `check:symbols`, and `check:themerooms`.
- Fresh differentials: at the checked commit, the 140-wait RuntimeFind case,
  wall-message and silent-wall cases, both safe-pet outcomes, and the
  one-object description all passed strictly. Together they matched 17,809
  PRNG calls, 165 complete screens and attributes, and 165 cursors. The
  one-wait extension is retained as the expected row-12 failure, not counted
  as passing evidence.
- Development suite: the same checkpoint reported 0/33 sessions; RNG
  98,598/610,816; screens 259/7,765; cursors 277/7,765.
- Quality check: `npm run quality -- --check` passed at the exact commit with
  a clear gate and a two-area advisory checkpoint.
- Browser check: not required; this changes shared engine behavior without
  browser-specific code, DOM/CSS, input/storage, or renderer changes.

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
no reliable per-development-session divergence diagnostic yet.** The strict
fresh cases above supply source-selected branch evidence without relying on the
current development-screen selection.

## Readiness

Current mode: Implementation

Reason: both structural replay conditions are complete: row 5 at `263540f`
and row 4 at `9afade25`. Periodic upkeep, natural generation through the new
monster's first action, wall refusal, ordinary starting-pet interaction, and
single-object floor description are now `done`. Behavioral closure remains
blocked by the confirmed ordinary-monster doorless-doorway gap in row 12 and
the dependent unbounded repeated-wait classification in row 11. Rows 1, 2, 4
through 10 are `done`; row 3 is `cannot-occur`.
