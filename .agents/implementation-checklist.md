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
  pet, and a square whose objects only produce a floor description. Sighted
  and blind heroes are in scope, including accessible directional messages.
- Monster behavior: Ordinary D:1 monsters, including ones generated part-way
  through the sequence, and the starting little dog, kitten, or pony may move
  normally or stay put.
- Observables: State changes, PRNG calls and order, messages, complete 24x80
  screens and attributes, cursors, persistence, and the next input boundary.
- Exclusions: The `ROADMAP.md` future-work list, count prefixes, running,
  travel, every other command, pickup, hero traversal of active doorways, and
  monster-initiated displacement of the hero.
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
  seam in `js/hack.js`.
- Hero movement helpers: the in-boundary physical-obstacle, starting-pet, and
  floor-description paths have now been traced from `hack.c:domove()` through
  `test_move()`, `do_attack()`, `domove_swap_with_pet()`, and
  `invent.c:look_here()`.
- Remaining limits: None within the selected boundary. Natural mid-sequence
  generation is verified through a generated monster's movement, its
  source-accessible doorless doorway, and the later no-time safe-wait tail.
  The excluded action families retain their pre-mutation, pre-PRNG stops.

## Status values

Assign exactly one status to every row: `done`, `no-effect-yet`, `later`,
`cannot-occur`, `missing`, or `undecided`, as defined in
`.agents/implementation-checklist-template.md`. A JavaScript guard, fallback,
or passing development recording is evidence to investigate, not a status.

## Implementation table

| # | Upstream function or branch family | Reachability and ordering | JavaScript owner | State, randomness, and output | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `monmove.c:dochug()`, merged from its two ports | Runs once per monster per elapsed phase, for tame and non-tame alike, as in C. | `js/monmove.js` `dochug()` | Reconciled four asymmetries: both kinds now redraw a hallucinated monster that did not move, both run the pre-move item and weapon gates, and both hold the `mflee` draws. | Merged at `73ada94`. At `7363380`, a safe-pet refusal establishes the source-reachable timed `mflee` state and the following waits continue through `rn2(40)`, timeout, and flee-aware pet movement. | done | None. |
| 2 | `monmove.c:m_move()` prologue and tame dispatch | `m_move()` owns the `mintrap()` and `meating` prologue and the tame `dog_move()` dispatch through `postmov()`. | `js/monmove.js` `m_move()` | `mintrap()` and `finish_meating()` change state; the dispatch selects the mover. | `m_move()` already held `mintrap()` and `set_apparxy()`; it gained the `meating` countdown and the tame dispatch at `73ada94`. Direct production-owner tests at `7363380` pin trapped, eating, and tame dispatch order instead of relying on the `dochug()` double; `2b96c56` separately pins the still-eating `2 -> 1` branch. | done | None. |
| 3 | `dochug()` omitted `mayMove` terms | The leprechaun gold term and `(Conflict && !mtmp->iswiz)` sit between `is_wanderer` and `!mcansee` in C's disjunction. Both ports omit them. | `js/monmove.js` `dochug()` | Omitting a short-circuiting term would change whether the later `!mcansee && rn2(4)` draw happens. | Conflict cannot be established by the allowed commands or starting inventory. D:1 runtime generation admits difficulty at most 1 for a level-one hero; the leprechaun has difficulty 4. Neither term is reachable before this boundary. | cannot-occur | Keep the source comment and revisit when a later command or level can establish either term. |
| 4 | `allmain.c:moveloop_core()` elapsed phase | Runs before each command dispatch when the preceding command consumed time. | `js/allmain.js` `moveloop_core()` | Owns the hero movement debit, monster allocation, random monster generation, sounds, hunger, engraving wear, and timeouts. | Completed at `9afade25`. `advanceElapsedTurn()` serves every turn and preserves C's outer hero-ration loop and the `!monscanmove && u.umovement < NORMAL_SPEED` once-per-turn gate. At `7869990`, cloned scans gate atomic hunger/timeout preflight. At `f509366`, `eat.c:newuhs(TRUE)` reaches both HUNGRY and WEAK, including temporary Strength, role/race/hallucination messages, running cancellation, and status refresh; FAINTING remains the next atomic boundary. | done | None. Closure condition 2 is met. |
| 5 | `js/fastforward.js` replay rows | Reached for every turn after the second. | Deleted. | 30 literal `rn2()` calls copied from one recording. | Deleted whole at `263540f`, with `scripts/fastforward.test.mjs`. The score rose rather than fell: 98,270 to 98,306 PRNG values, 241 to 242 screens, 256 to 258 cursors. | done | None. Closure condition 1 is met. |
| 6 | `attrib.c:exerper()` and `exerchk()` | `allmain.c:moveloop_core()` calls `exerchk()` once per allocated turn, after `age_spells()` and before `invault()` and engraving wear. `exerper()` runs status checks every 5 turns and hunger and encumbrance checks every 10; `exerchk()` also owns the scheduled check beginning at `context.next_attrib_check == 600`. | `js/attrib.js` `exerper()`, `exerchk()`, and their live `adjattrib()` consumer; `js/allmain.js:finishElapsedTurn()` calls the upkeep in source order. | The periodic call changes attribute exercise state and PRNG order before later generation, movement, or rendering. | Implemented at `6b721cd`. The original 60-wait fresh case exposed and then verified the move-10 periodic call. At `07366b7`, independent Ranger seed 50586 reaches move 600 through 600 live waits and matches C for all 18,410 PRNG calls and 601 complete screens, attributes, and cursors, including `exerchk()` rescheduling. Focused tests pin exact RNG primitives and arguments, gain and abuse checks, exercise reset, messages, status refresh, and rescheduling. | done | None. |
| 7 | `makemon.c` mid-sequence monster generation | `maybe_generate_rnd_mon()` runs once per allocated turn and can add a monster after current monsters receive movement. The new monster first receives a ration on the following allocation. | `js/allmain.js`, `js/makemon.js`, `js/makemon_create.js` | Consumes randomness, extends the monster list, and then feeds the new monster to `movemon()`. | At `aa57304216fd4e15b976bd7483e89a1ff55f8a93`, the strict seed-42510 RuntimeFind case with 140 waits matches 3,545 PRNG calls, 141 screens and attributes, and 141 cursors. Its recorded step 75 calls `rn2(70)=0` in `maybe_generate_rnd_mon()`, creates a jackal, and the new monster reaches its first move-or-stay work on step 77 without divergence. Direct tests separately force the zero gate and following allocation. | done | None. |
| 8 | `hack.c:test_move()` refusal against wall or rock | Reached when a walk targets an obstructed square. It consumes no time. With `mention_walls`, C describes the remembered background glyph through `pline_dir()`; without it, the refusal is silent. A blind hero first reaches `display.c:feel_location()`. | `js/hack.js:test_move()` owns the physical wall and rock subset; `js/display.js:feel_location()` owns the adjacent-obstacle tactile memory subset; `js/hack.js:domove()` owns command-state cleanup. | Blindness records the source `seenv`, remembered glyph, display glyph, and `lastseentyp` before optional output. Accessible messages retain the destination direction. The refusal consumes no gameplay PRNG or time. | Implemented sighted at `aa57304` and completed blind at `7869990`. Fresh seed 51001, datetime `20320405060708`, blind female Healer `BWall`, `mention_walls,accessiblemsg`, and west move prints `(west): It's a wall.`, records tactile wall memory, and strictly matches all 2,592 PRNG calls and both screens/cursors. Focused tests cover all eleven ordinary wall geometries, stone, the output gate, accessible direction, exact eight-direction `seenv`, target `lastseentyp`, unrelated-cell non-mutation, and tactile memory with messages disabled. | done | None. |
| 9 | `hack.c:domove()` ordinary starting-pet swap | A movement command into a visible safe starting pet calls `do_attack()` first. Its `rn2(7)` refusal gate can consume the move; otherwise `domove_swap_with_pet()` exchanges positions, prints the swap message, and applies the pet's destination effects. | `js/uhitm.js:do_attack()` owns the safe-pet gate and refusal; `js/hack.js` owns admission, `domove()`, and the successful exchange. | Consumes randomness, either makes the tame monster flee and stops with a message or changes hero and pet positions and redraws both squares; either outcome consumes time. A source-bounded `mfleetim` does not exclude a later collision. | Fresh seed 31009 `yy...` strictly matches all 2,967 PRNG calls and six screens/cursors through refusal and timer expiry. The live exact-seed marker now stops at each command boundary: the first collision leaves positions unchanged and sets `mfleetim` to 3; after one elapsed phase, the second collision prints the swap message, exchanges hero and kitten positions, consumes the move, and retains `mfleetim` at 2. Live tests also cover kitten, little dog, and pony. | done | None. |
| 10 | Floor description for an object on the destination | With autopickup disabled, `hack.c:domove()` reaches `spoteffects(TRUE)`, `pickup(1)`, `check_here()`, and `invent.c:look_here()` after the legal move. Blind `look_here()` emits its tactile preamble using `dungeon.c:surface()`, checks the engraving, then describes the object. | `js/hack.js` admits the destination and supplies the engraving owner; `js/invent.js:look_here_single_object()` owns both sighted and blind ordering; `js/dungeon.js:surface()` owns the ROOM/CORR wording. | Moves the hero, consumes time, and produces the sighted or blind one-object description without picking the object up. Piles and automatic pickup remain atomic stops. | The strict blind ROOM case still matches 2,597 calls and three screens/cursors. At `207ad47`, focused source-value tests distinguish ROOM `floor` from CORR `ground`, use controlled promises to pin the tactile-preamble, engraving, item-message, and `last_msg` await boundaries, and reject a missing engraving owner before output. | done | None. |
| 11 | Repeated wait | The simplest repeated command exercises the elapsed phase with no hero movement. | `js/cmd.js`, `js/allmain.js` | Consumes time and runs the full elapsed phase until `do.c:cmd_safety_prevention()` sees a nearby hostile; later unforced waits consume no time or PRNG and leave the hostile nearby. | The 250-input generation/safety case remains exact. At `f509366`, independent quiet seed 52284 reaches both hunger transitions and the next prompt: 855 waits match all 19,964 PRNG calls and 856 screens/cursors. The permanent 851-wait prefix retains the WEAK message boundary. | done | None. |
| 12 | `monmove.c:m_move()` ordinary movement through a doorless doorway | `mfndpos()` treats a `DOOR` square with `D_NODOOR` as accessible. An ordinary monster may select it during any elapsed phase; `postmov()` has no door-opening work when the mask is already doorless. | `js/unported_monster_actions.js:assertSimpleDestination()` admits `DOOR` only when its aliased `doormask` is `D_NODOOR`; selected active masks remain excluded. | Moves through a doorless doorway without state work. Tests keep `flags` and `doormask` independent; open, broken, closed, and trapped selected doors stop twice atomically, while an unopenable locked door is not selected and remains inert. | The checked-in 250-input extension strictly covers the live doorless move. At `f509366`, each representation independently covers `D_NODOOR` and every active mask with complete two-attempt snapshots. | done | None. |
| 13 | `cmd.c:rhack()` retry after a temporary unsupported boundary | A physical command byte may be rejected before parsing, or an accepted movement byte may reach a fail-closed destination seam. Retrying must preserve the correct phase without reading the next queued command. | `js/cmd.js:rhack()` stores a phase-tagged `context.pendingCommand`; `js/hack.js` owns movement-boundary errors and destination admission. | Physical exclusions retain only the unread logical byte; parsed movement retains its command/count state. Both retry without elapsed time, duplicate output, cursor or wait-epoch drift, or PRNG, and clear only after a non-retryable result. | At `64223f1`, counts, run/rush, search, pickup, and request-menu prefixes stop from their first physical byte. At `7869990`, two-retry snapshots include the live cursor and wait epoch; the number-pad count prefix proves its physical retry phase and detects a cursor-only mutation. Door admission tests cover every active and inactive source mask. | done | None. |
| 14 | `dogmove.c:dog_goal()` lost-sight goal scan during fail-closed planning | A starting pet that cannot see the hero calls `do_clear_area()` while the monster action is being planned against the cloned retry state. | `js/vision.js:do_clear_area()` shares the one active `vision.c` transparency index only with an alternate state whose level identifies the active geometry owner; `js/unported_monster_actions.js` marks its monster-only planning clone accordingly. | Computes the pet's goal visibility without mutating the active game. An alternate state with different geometry is rejected instead of consulting mismatched cached transparency. | At `64223f1`, the lost-sight starting kitten preflights twice with an identical complete retry snapshot, and a separate blocker test proves that an alternate level cannot claim unrelated transparency. The strict second-turn and repeated-command matrices remain exact. | done | None. |
| 15 | Repeated successful `hack.c:domove()` across ordinary clear squares | Any in-boundary command sequence can contain consecutive successful walks, so elapsed upkeep and destination admission must reconnect after every changed hero position. | `js/cmd.js:rhack()`, `js/hack.js:domove()`, and `js/allmain.js:moveloop_core()` | Each command changes the hero position, consumes one turn, updates track and vision state, and returns to the next physical input boundary. | The twelve-move clear-square case remains exact. With weakness and immediate fleeing-pet collision added, the strict eleven-case matrix at `f509366` matches all 64,581 PRNG calls and 1,750 complete screens, attributes, and cursors. | done | None. |

## Missing work by owner

None.

## Validation

Record evidence for the exact committed head that will be reviewed.

- Commit checked: `bc8657fb04c6f7e4f362afe438d9f810bcf75286`
- Source review: retained the periodic-upkeep review and compared the newly
  live paths with `hack.c:test_move()` and `domove_swap_with_pet()`,
  `uhitm.c:do_attack()`, `pickup.c:pickup()` and `check_here()`, and
  `invent.c:look_here()`. The review covered output gates, safe-pet draw and
  refusal order, position and display updates, and the distinction between
  one-object description, piles, and automatic pickup. The final review traces
  `mfndpos()` accessibility and `postmov()` door handling for `D_NODOOR`, plus
  `do.c:cmd_safety_prevention()` for the stable no-time tail after a hostile
  becomes nearby. The post-audit source trace additionally follows
  `uhitm.c:do_attack()` through `monmove.c:monflee()` and `dochug()`,
  `mon.c:movemon_singlemon()` timeout, and `dogmove.c:dog_move()`.
  The expanded source review also traces `eat.c:gethungry()` across every
  reachable nutrition loss before the full elapsed phase, `cmd.c:rhack()`
  from its first physical byte through parsing and retryable command dispatch,
  and `dogmove.c:dog_goal()` through `vision.c:do_clear_area()` and its one
  cached transparency owner.
  All `hack.c` movement admission, running cancellation, collision, and
  destination behavior now resides in `js/hack.js`.
- Focused tests: all affected command, display, object, monster-movement,
  attribute, timeout, and matrix suites pass. Deferred-promise tests pin output
  ordering; retry snapshots include terminal cursor and wait ownership.
  Physical-command rejection now compares hero, world, scheduler, and PRNG
  state across the first attempt, independently checks the captured cursor,
  and permits only the documented prompt capture and pending physical byte.
  Tactile expectations use the literal C `seenv_matrix`, and the timed-fleeing
  exact-seed marker asserts the refusal and swap at their immediate command
  boundaries before timer expiry.
- Full suite: all 1,656 tests pass.
- Generated-file checks: the same checkpoint passed `check:monsters`,
  `check:objects`, `check:symbols`, and `check:themerooms`.
- Audit tooling: the isolated-worktree validator accepts an explicit
  path-free “sealed holdout directory” prohibition, so required child-agent
  prompts can satisfy both audit readiness and the repository rule against
  transmitting the sealed path. Its five focused lifecycle tests pass.
- Fresh differentials:
  `node scripts/run-repeated-simple-commands.mjs` passed all eleven checked-in
  replay-input-only segments with 64,581 matching PRNG calls and 1,750 matching
  complete screens, attributes, and cursors. The matrix covers the 250-input
  natural-generation, doorless-doorway, and safe-wait sequence; the first
  scheduled move-600 attribute check; wall refusal with messages enabled and
  disabled; both starting-pet outcomes; the one-object description; and
  twelve consecutive successful clear-square walks. It now also covers blind
  accessible wall refusal, blind tactile object description, both hunger
  transitions, and a timed-fleeing second pet collision. Independent
  fresh strict runs for those two additions matched respectively 2,592 PRNG
  calls and two screens/cursors, and 2,597 calls and three screens/cursors.
  The independent 855-wait hunger run matches 19,964 calls and all 856
  screens/cursors. The `yy...` pet run matches 2,967 calls and six
  screens/cursors.
  `node scripts/run-second-complete-turn.mjs` passed all 17 segments
  with 46,255 PRNG calls and 54 complete screens/cursors after removing
  excluded leading gameplay commands while retaining three genuine startup
  dismissals. The TrapBoundary prefix matches C for its first 2,612 calls and
  two screens/cursors before C continues into the excluded action; the
  WeaponInventory case matches all 3,171 calls and three screens/cursors.
- Development suite: the same checkpoint reported 0/33 sessions; RNG
  98,385/610,816; screens 250/7,765; cursors 250/7,765. The shorter prefix is
  the intentional result of stopping counts, prefixes, and unrelated commands
  before parser output or dispatch.
- Quality check: `npm run quality -- --check` reports startup and monsters due,
  four advisory areas, and four watch areas. All affected production debt is
  inside the frozen audit range; there are no unassigned production files.
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

Current mode: Ready for audit

Reason: both structural replay conditions remain complete; rows 1, 2, and 4
through 15 are `done`, and row 3 is `cannot-occur` from the source predicates
recorded above. The live game executes every supported branch, the checked-in
eleven-case matrix passes strictly, the complete test and generated-data checks
pass, and every reachable excluded path retains its atomic stop. The latest
substantive audit found no production defect; its two clarity defects and three
test-oracle gaps are resolved at the checked commit. Because that audit's
top-level metadata verification passed the sealed holdout directory path to a
tool as a pathspec, it is not protocol-clean and cannot close the gate. Policy
requires one new full correctness audit over the expanded exact range before
closure.

### Prior full-audit disposition

The fresh full audit of
`3c552b45602ccea8c36569384f94026840c73147..07366b76dd8eba8452b2bcafb92c788ef5f82170`
used independent correctness, readability-risk, test-quality, concurrency, and
variable-flow finders plus consolidated adjudication. It produced 17 raw and
deduplicated candidates: 16 confirmed and one rejected, with zero unverified.
Confirmed categories were five production, seven tests, and four clarity.
The rejected monster fear/no-attack claim contradicted the reachable source
state. Concurrency found no defect. All 16 confirmed findings were resolved in
`7869990`.

The next fresh full audit covered
`3c552b45602ccea8c36569384f94026840c73147..7869990c8219580d24cc855c3c6bce4003a1ab44`.
It used five independent finders plus consolidated adjudication and produced
12 raw and deduplicated candidates: ten confirmed, two rejected, and zero
unverified. Confirmed categories were three production, three tests, and four
clarity. The broad snapshot rename and self-oracle claims were rejected because
they predated the range and identified no missing invariant. Concurrency again
found no defect. Session `019fa5a1-f274-7150-b31e-7c6cdb4e2c37`; elapsed 1,616
seconds; final usage 6,155,366 input, 5,869,568 cached input, 29,344 output, and
12,457 reasoning tokens. All ten confirmed findings are resolved in
`f509366`.

The expanded audit through
`f5093669cc89fe395e327de8ebd74bfb716492e5` again used five independent
finders plus consolidated adjudication. It produced seven raw and deduplicated
candidates: five confirmed, two rejected, and zero unverified. No production
behavior defect was confirmed; the confirmed categories were two clarity and
three tests. Concurrency found no reachable overlap. Session
`019fa5d0-b46d-7190-ae7d-8012bb532c30`; elapsed 1,484 seconds; final usage
7,079,822 input, 6,900,480 cached input, 27,052 output, and 10,357 reasoning
tokens. All five findings are resolved in `207ad47`: the roadmap and elapsed
coordinator descriptions now match the live boundary, tactile tests pin
`lastseentyp`, status tests cover effective numeric highlighting, and object
tests hold each asynchronous output owner behind an independent promise. The
audit is retained as substantive evidence but not as the closure pass because
its top-level metadata check violated the literal sealed-path protocol.

The protocol-clean full audit covered
`3c552b45602ccea8c36569384f94026840c73147..bc8657fb04c6f7e4f362afe438d9f810bcf75286`.
It used all five independent finders plus consolidated adjudication and
produced seven raw and deduplicated candidates: five confirmed, two rejected,
and zero unverified. No production behavior defect was confirmed; categories
were three tests and two clarity. Concurrency found no reachable overlap. The
unreachable hallucinating-HUNGRY claim and a pre-existing preflight-contract
redesign were rejected. Inner audit session
`019fa5f3-93f2-7373-a30a-5243d162adc0`; elapsed 1,327 seconds; final inner
usage 8,094,857 input, 7,908,608 cached input, 32,936 output, and 9,907
reasoning tokens. Outer supervision session
`019fa5f0-4a0c-7fd0-872d-66dff2cdb3a5` used 5,587,304 input, 5,433,856
cached input, 17,970 output, and 8,516 reasoning tokens.

All five findings are resolved in the pending audit-fix commit: this checklist
records the exact reviewed head and current eleven-case totals; the roadmap
qualifies the admitted starting-pet fear continuation; tactile direction
expectations are independent source literals; initial physical-command
classification has a pre-attempt atomicity oracle; and the exact-seed
timed-flee marker asserts the second collision's immediate message, positions,
grid identities, consumed move, and positive timer. These fixes are confined
to documentation and tests, so a light delta correctness review is the
remaining closure gate.
