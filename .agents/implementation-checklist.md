# Implementation checklist: simple second command

## Boundary

- Roadmap item: Exploration, simple second command.
- Starting code commit:
  `3b6c38de148679a5cc8313d755ec906fa95627c3`.
- Starting event: A newly generated game is waiting at its first command
  prompt.
- Ending event: The game reaches the prompt after a second time-consuming
  command.
- Valid commands: Two waits, or one-square walks whose destination is
  unoccupied ordinary clear floor or corridor. A mixed wait/walk sequence is
  valid in either order.
- Monster behavior: Ordinary initial D:1 monsters and the starting little dog,
  kitten, or pony may take their normal movement ration and either move through
  ordinary clear squares or stay put.
- Observables: State changes, PRNG calls and order, messages, complete 24x80
  screens and attributes, cursors, persistence, and the next input boundary.
- Fail-closed rule: Before gameplay state or gameplay PRNG changes, stop if the
  selected source path requires combat, a trap, relocation, a level change,
  object interaction, a door or special terrain interaction, or a special
  monster action. Preserve the already-supported segment prefix and leave the
  pending elapsed phase retryable.

This is narrower than the superseded **Second stable-level non-trap command**
checkpoint. The old 38-family inventory is not the active closure standard.
Its known gaps are retained under explicit future work below.

## Source-derived branch inventory

The inventory starts at `allmain.c:moveloop_core()` and follows both accepted
commands through `cmd.c:dowait()` or the ordinary-clear branch of
`hack.c:domove()`. It then follows elapsed work through
`mon.c:movemon()`, `mon.c:movemon_singlemon()`,
`monmove.c:dochugw()`, `monmove.c:dochug()`,
`monmove.c:m_move()`, `monmove.c:postmov()`,
`dogmove.c:dog_goal()`, and `dogmove.c:dog_move()` before returning through
display, persistence, and the next command request.

`Status` describes committed closure for this narrower boundary. Worktree code
is evidence for the next checkpoint but is not marked done until committed and
validated.

| # | Source branch family | In-boundary behavior | JavaScript owner | Status | Next proof |
| ---: | --- | --- | --- | --- | --- |
| 1 | `allmain.c:moveloop_core()` input cleanup and dispatch | Clear per-input state, read one command, and preserve input ordering. | `js/allmain.js` | done | Retain command tests and final fresh matrix. |
| 2 | `cmd.c:dowait()` | Consume time without a movement target. | `js/cmd.js` | done | Two-wait and mixed-order fresh cases. |
| 3 | `hack.c:domove()` ordinary-clear branch | Run new-game prechecks, admit only an unoccupied object-free clear floor or corridor square, then update hero coordinates, vision, and movement flags. | `js/cmd.js` and existing movement owners | done | Atomic intent admission and repeated runner-level object, hidden-trap, and special-terrain refusals are committed at `daec422`. |
| 4 | `allmain.c` movement debit and repeated monster scans | Debit `u.umovement`, call `movemon()` until the source stopping condition, and respect a fast hero's retained ration. | `js/allmain.js` | done | Live at `2283141`; command tests and the fast-Monk differential cover both stopping conditions. |
| 5 | `mon.c:movemon_singlemon()` scan gates | Preserve dead/off-map, every-turn upkeep, movement-ration, vision, and ration-spend order for each list node. | `js/mon.js`, `js/allmain.js` adapter | done | Due and inert parked-guard ordering committed at `3104b21`. |
| 6 | `mon.c:movemon()` terminal cleanup | Clear transient state, purge dead entries, update light/vision state, and return whether another scan is needed. Level transition is a future safe-stop. | `js/mon.js`, `js/allmain.js` adapter | done | Repeated-scan command tests and live prompt completion. |
| 7 | `monmove.c:dochugw()` notice wrapper | Run the ordinary action while preserving the occupation-interruption seam. New games have no active occupation. | `js/monmove.js` | done | Source owner `e74c756`, live consumer `2283141`. |
| 8 | `monmove.c:dochug()` ordinary stay gates | Preserve immobile, waiting, sleeping/disturb, and no-action results for ordinary D:1 monsters. | `js/monmove_dochug.js` | done | Source-owned `wake_msg()` and awaited live wiring committed at `d327351`. |
| 9 | `monmove.c:dochug()` ordinary action decision | Set apparent hero position, compute range/fear, and decide whether the monster moves or stays. Stop before attack or special-action dispatch. | `js/monmove_dochug.js` | done | Focused action tests; excluded paths stop in the atomic planner. |
| 10 | `monmove.c:m_move()` ordinary goal and candidates | Compute approach, hero tracking, movement flags, `m_search_items()`, `mfndpos()` candidates, and source tie-breaking for ordinary clear destinations. | `js/monmove_move.js` plus a dedicated item-search owner if needed to stay reviewable | missing | The blocking-terrain predicate is fixed at `419b7c1`. Port the source-ordered read-only item-selection pass so ignored objects do not stop a supported move. |
| 11 | `monmove.c:m_move()` coordinate move and inert `postmov()` | Move one ordinary monster, update the map and monster track, emit source-ordered movement accessibility output, redraw, or return the source no-move status. Stop before combat, displacement, traps, selected object interactions, regions, doors, terrain, or special post-move effects. | `js/monmove_move.js`, the canonical accessibility option owner, and a thin `monmove.c` adapter | missing | Port `msg_mon_movement()` with its option state, conditions, wording, coordinates, and ordering. Add the no-move `notice_mon()` integration case. |
| 12 | `dogmove.c:dog_goal()` ordinary follow/stay goal | Choose the hero or existing track as the starting pet's goal without selecting food, carried objects, doors, or special locations. Preserve the source output-parameter contract for `gtyp`, `gx`, and `gy`. | `js/dogmove_goal.js` | missing | Document and test both the returned approach and the `state.gg` scratch result; pin the distance-seven `find_targ()` boundary with the pet owner. |
| 13 | `dogmove.c:dog_move()` starting-pet gates | Preserve ordinary hunger, distance, whistle, and no-action gates for an active little dog, kitten, or pony. Admit only the source-inert worn saddle created with a Knight's starting pony. Stop before every selected inventory action and before non-hero ranged-target scoring, eating, leash, steed, conflict, altered-state, or combat paths. | `js/dogmove.js`, `js/monmove_simple.js` | missing | Retain the committed source behavior and add complete two-retry snapshots for combat, displacement, eating, pickup, cursed feedback, and non-inert inventory seams across dog, kitten, and pony. |
| 14 | `dogmove.c:dog_move()` candidates and tie-breaking | Run `mon_allowflags()`, `mfndpos()`, candidate filtering, follow-distance scoring, and source tie-breaking over ordinary clear squares. | `js/dogmove.js` | done | Focused tie-breaking tests and four dog command combinations. |
| 15 | `dogmove.c:dog_move()` coordinate move | Move the pet, update its map slot and track, or preserve its square. Stop before combat, displacement, trap, object, region, door, terrain, and other special effects. | `js/dogmove.js` and a thin `monmove.c` adapter | done | Live dog action state test, strict dog/cat cases, and four source-valid Knight pony walk/wait cases. |
| 16 | `allmain.c` new-turn allocation and upkeep | Run monster distress, movement allocation, possible random generation, hero movement allocation, track update, turn counters, timeouts, regions, sounds, hunger, engraving wear, and the already-owned first-turn upkeep sequence. | Existing source owners, coordinated by `js/allmain.js` | done | Command allocation/upkeep tests and fast-hero differential. |
| 17 | `allmain.c` once-per-hero-action effects | Advance `hero_seq`, refresh encumbrance/display state, and run the already-owned post-action visibility work. | Existing source owners, coordinated by `js/allmain.js` | done | Direct `hero_seq`/hunger tests and all strict cases. |
| 18 | display, persistence, replay, and next input | Render and persist the complete result, remove only the second-turn replay now owned by gameplay, and request the next command. | `js/allmain.js`, `js/fastforward.js`, runner/test files | missing | Extend the three-file integration bundle with fast mixed walk/wait and kitten walk cases, plus hero-track and root scheduler fields in the complete snapshot. |

### Inventory count and readiness

- 18 in-boundary families: 13 done and five open after the second correctness
  audit.
- Closure verdict: **implementation in progress**. Families 10, 11, 12, 13,
  and 18 have confirmed production, contract, or coverage gaps. The slice
  must be revalidated through the next prompt and receive a new full
  correctness audit before it can close.

## Correctness-audit return to implementation

The full audit of
`3b6c38de148679a5cc8313d755ec906fa95627c3..4cd8bbccf60cd6c792444c457a2f358660b552d9`
produced 23 raw candidates, 20 after same-site deduplication, 14 confirmed,
six rejected, and none unverified. The confirmed set contains seven production
defects, six test defects, and one maintenance-contract defect. A1 through A6,
plus two source-derived pony prerequisites exposed by fresh discovery, are
committed. A7 is committed at `9288ced`.

The second full audit of
`3b6c38de148679a5cc8313d755ec906fa95627c3..9288ced3372da17588cc70ec30cf2f3fe6302e25`
produced 18 raw candidates, 17 after same-site deduplication, 12 confirmed,
five rejected, and none unverified. It confirmed five production sites, six
test gaps, and one maintenance-contract gap. The omitted
`monmove.c:m_search_items()` and `msg_mon_movement()` behavior changes PRNG or
rendered output, so the audit verdict is **not ready** and the slice returns to
Implementation. This audit is not a recorded correctness pass.

Implement and commit the second follow-up in this order. Each checkpoint keeps
its tests with the upstream owner, names its live player-action consumer, and
stays below the review-size limit. Do not resume broad seed discovery until
this sequence is current; use the batch scanner for each fixed strict case
list.

| Checkpoint | Status | Complete source-owned change | Planned files |
| --- | --- | --- | --- |
| B1 — atomic hero command admission | done at `daec422` | For the current one-square walk consumer, perform local destination admission before setting elapsed command intent. Prove that two identical refused walks and a following legal command preserve complete state, RNG, screens, cursors, and retained output. | `js/cmd.js`, `scripts/cmd.test.mjs` |
| B2 — monster line predicate | done at `419b7c1` | For `m_move()` during the second command, keep blocking terrain distinct from earlier boulders and reject wall or door lines before the boulder RNG branch. | `js/monmove_move.js`, `scripts/monmove.test.mjs` |
| B3 — monster item-search selection | pending | For the same live `m_move()` preflight, port the source-ordered read-only `m_search_items()` selection pass. Continue ordinary movement past ignored objects; stop atomically only when upstream selects an unsupported item interaction. Use a dedicated `monmove.c` item-search module if the movement owner would exceed the review limit. | `js/monmove_items.js` or `js/monmove_move.js`, `js/monmove_simple.js`, focused item-search and atomic-preflight tests, and `QUALITY.json` only if a new production file is created |
| B4 — monster movement accessibility output | pending | For an ordinary monster move during the second command, canonicalize the `mon_movement` option in the accessibility owner and port `msg_mon_movement()` through output, redraw, persistence, and the next prompt. | `js/monmove_move.js`, `js/monmove_simple.js`, the existing accessibility option owner, and corresponding focused tests |
| B5 — pet goal and target contracts | pending | Clarify the `dog_goal()` return/scratch contract and pin the inclusive distance-seven `find_targ()` ray boundary without changing the live supported path. | `js/dogmove_goal.js`, `scripts/dogmove-goal.test.mjs`, `scripts/dogmove.test.mjs` |
| B6 — no-move and pet safe-stop coverage | pending | Drive visible `MMOVE_NOTHING` notice ordering through the complete adapter, then cover the pet combat, displacement, eating, pickup, cursed-feedback, and non-inert-inventory seams with complete two-retry state. | `scripts/monmove-simple.test.mjs` |
| B7 — complete integration oracle | pending | Keep the runner, fixture, and integration test together. Add fast mixed walking, kitten walking, hero-track order, and the root scheduler flags to exact fresh and retry oracles. | `scripts/run-second-complete-turn.mjs`, `scripts/fixtures/second-complete-turn.session.json`, `scripts/second-complete-turn.test.mjs` |

After B1 through B7, rerun focused tests, the full suite, all generated checks,
the expanded strict fresh matrix, development scoring, and the focused batch
scans identified above. Freeze the new exact head only when all six open
families are done, then run a new full correctness audit over the expanded
range. The `dog_goal()` output contract also creates a concrete
reviewer-facing clarity trigger after correctness is complete.

The first audit follow-up was committed in this order. Each checkpoint kept
its tests with the upstream owner and stayed below the review-size limit.

| Checkpoint | Status | Complete source-owned change | Planned files |
| --- | --- | --- | --- |
| A1 — hero destination admission | done at `dad2732` | Reject any object or pile before `domove()` mutates coordinates, rendering, pending state, or gameplay RNG. Add representative trap, object, pile, and special-terrain admission cases; only the object defect needs new production behavior. | `js/cmd.js`, `js/jsmain.js`, `scripts/cmd.test.mjs` |
| A2 — monster goal and selection | done at `11a724d` | Port the complete `getitems` approach/line predicate, spend an attack on an empty displacement image, and pin exact source candidate enumeration and reservoir tie-breaking. | `js/monmove_move.js`, `scripts/monmove.test.mjs` |
| A3 — elapsed preflight and RNG | done at `3104b21` | Check eligible parked guards before on-map/ration early returns. Share or exactly align live and cloned RNG wrapper edge behavior. Expand whole-scan selected-action atomicity coverage. | `js/rng.js`, `js/monmove_simple.js`, `js/monmove_move.js`, focused RNG and scan tests |
| A4 — wake and post-move notices | done at `d327351` | Await visible wake messages before state/action progress. Port source-ordered `notice_mon()` state and messages, including dry-plan state without output. | `js/mon.js`, `js/startup_a11y.js`, thin movement wiring, and corresponding focused monster tests |
| A5 — pet result contract | done at `c6de861` | Document the upstream `dog_move()` quirk where a completed opportunity may return `MMOVE_MOVED` without coordinate change, and pin the downstream `postmov()` behavior. | `js/dogmove.js`, corresponding focused pet test |
| A6 — replay ownership | done at `604caa2` | Make replay step 2 explicitly return no events and test both the removed-row and fallback boundaries. | `js/fastforward.js`, `scripts/fastforward.test.mjs` |
| A6a — starting-pony saddle | done at `c1e5f89` | Admit only the worn saddle created for the Knight's starting pony when `dogmove.c:droppables()` proves that inventory inert. Keep every other pet inventory state fail-closed. | `js/monmove_simple.js`, `scripts/monmove-simple.test.mjs` |
| A6b — pet ranged-target preflight | done at `723da26` | Port `dogmove.c:find_targ()` ray selection far enough to reject a non-hero target before `score_targ()` consumes live PRNG. Keep hero-only rays source-inert and pin the original fresh-derived case as an atomic safe stop. | `js/dogmove.js`, `js/monmove_simple.js`, focused dog and atomic-preflight tests |
| A7 — complete integration oracle | done at `9288ced` | Compare complete normalized retry state and retained output, then run every checked-in no-pet/pet/fast-hero and command-order case under `npm test`. The runner, fixture, and integration test remain one commit. | `scripts/run-second-complete-turn.mjs`, `scripts/fixtures/second-complete-turn.session.json`, `scripts/second-complete-turn.test.mjs` |

## Confirmed gap clusters

### C1 — ordinary `monmove.c` move or stay

The source-owned movement functions and focused tests are committed at
`e74c75679cfe3e03e91e9c9a900344a4c221441d`. The atomic adapter at `76db5c6`
classifies combat, displacement, trap, object, door, region, and special
post-move destinations before live monster action or gameplay PRNG.

Expected implementation files:

- `js/monmove_dochug.js`
- `js/monmove_move.js`
- the minimum corresponding `js/monmove.js` or `js/mon.js` wiring
- focused `scripts/monmove-*.test.mjs` files

`js/monster_action.js`, trap modules, combat modules, and pet-item modules
remain outside this completed checkpoint.

### C2 — starting-pet `dogmove.c` move or stay

The complete `dog_goal()` source owner and focused tests are committed at
`b01722b27afbfc79903920597d93a689ebf919e0`. The `dog_move()` source owner and
focused tests are committed at
`fe22783c04803b708ec6c111421fbf098ab108db`, and its thin `dochug` wrapper is
committed at `61d927638c668ffc542e34a5831cf12701778fac`. Read-only food and
object classification used to choose an ordinary goal is allowed; selected
pickup, eating, dropping, combat, displacement, traps, regions, doors, and
special terrain stop in the atomic adapter before live mutation. The exact
worn saddle created with a Knight's starting pony is admitted only when
`dogmove.c:droppables()` proves it inert. Source-shaped ranged-target tracing
stops before a non-hero target can enter unsupported scoring or attack logic.

Expected implementation files:

- `js/dogmove_goal.js`
- `js/dogmove.js`
- the minimum corresponding `js/monmove_dochug_pet.js` wiring
- focused `scripts/dogmove*.test.mjs` and
  `scripts/monmove-dochug-pet.test.mjs`

Keep pet inventory, leash, ranged, combat, and trap files for future work.

### C3 — `allmain.c` second-command integration

Own families 4, 6, and 16 through 18 after C1 and C2 are committed. Wire the
source-owned movement functions into the repeated monster scan, retain
pre-command atomicity for every excluded branch, run the already-owned elapsed
upkeep, and remove replay row 2.

The source-gated ordinary item-search assertion, selected region-crossing
operation, and pet cursed-object predicate needed by the atomic preflight are
committed at `1f004deb020d763e857485998de1885ae1f5b44e`. The dry action planner
and live action adapter are committed at
`76db5c6fab8078e2d6a603d22a29c5ea2bcadf14`. Live `allmain.c` consumption and
replay removal are committed at `2283141`; `4cd8bbc` preserves the supported
segment prefix when an excluded path stops the pending elapsed phase.

Expected implementation files:

- `js/allmain.js`
- `js/fastforward.js`
- the minimum live adapters not already committed with C1/C2
- focused `scripts/cmd.test.mjs` and `scripts/fastforward.test.mjs`

### C4 — final integration matrix

These files were committed together with the completed behavior at `2283141`:

- `scripts/run-second-complete-turn.mjs`
- `scripts/fixtures/second-complete-turn.session.json`
- `scripts/second-complete-turn.test.mjs`

The runner uses `runFreshMatrix()` from `scripts/fresh-matrix.mjs`. At
`9288ced`, the fixture pairs its replay-only recipe with exact end-state and
output oracles for all 11 cases. The integration test covers all cases under
`npm test` and compares two rejected retries against complete normalized
state and retained output. The selected trap remains excluded behavior.

## Explicit future work

These are known gaps or already-started helpers outside the active goal. They
must not be pulled into C1 through C4 merely because a generated level makes
one reachable; the current command must fail closed when the source selects
one.

| Future boundary | Representative source owners | Preserved work |
| --- | --- | --- |
| Hero and monster combat, attacks, retaliation, damage, death, knockback, corpses, weapons, ranged attacks, spells, and passives | `uhitm.c`, `mhitu.c`, `mhitm.c`, `dothrow.c`, `weapon.c` | Preserve worktree combat modules and committed prerequisites for a named combat checkpoint. |
| Hero and monster traps, land mines, holding, projectiles, status, magic/fire, teleport, holes, trapdoors, and migration | `trap.c`, `teleport.c`, `dog.c` | Preserve committed trap/teleport/migration helpers and uncommitted thin integration for a named trap checkpoint. |
| Hero or monster relocation and level transitions | `teleport.c`, `dog.c`, level-transition owners | Preserve committed relocation helpers; no live call in the simple checkpoint. |
| Objects, automatic pickup, floor descriptions, pet food/fetch/drop/eat, monster pickup, equipment, naming, billing, and damage | `invent.c`, `dogmove.c`, `dog.c`, `obj.c`, `objnam.c`, `weapon.c` | Preserve committed object helpers and worktree pet-item modules for an item-interaction checkpoint. |
| Regions, engravings, liquids, ice, gas, fountains, sinks, graves, altars, and themed-room effects | `region.c`, `engrave.c`, `hack.c`, room and terrain owners | Existing first-turn/clear-square behavior stays; entry or monster interaction is future. |
| Doors, tunneling, boulders, iron bars, and obstructed terrain | `monmove.c`, `hack.c`, door and terrain owners | Destination selection stops before these branches. |
| Hiding, shapechanging, covetous tactics, fleeing teleportation, conflict, quest/watch/speech, item use, and other monster special actions | `mon.c`, `monmove.c`, `muse.c`, role-specific owners | Preserve worktree special-action modules for later source-owned checkpoints. |
| Pet inventory actions, food, leashes, steeds, arrival/wait strategy, altered state, fear, ranged scoring or attacks, combat, and special movement | `dogmove.c`, `dog.c`, `monmove.c` | Preserve worktree pet modules; only ordinary move/stay and the inert worn starting saddle are current. |
| Hero traps, special terrain entry, objects, pickup, running, search, travel, force-fight, stairs, obstructed moves, and other commands | `hack.c`, `cmd.c`, trap, object, terrain, and level owners | Later exploration checkpoints. |

The completed artifact, generated monster-data, relocation, tracking, object,
pet-food, trap-effect, and other prerequisite commits remain valid. They do
not change the active scope or count as live simple-turn closure.

## Last complete validation before the second audit

- Commit checked: `9288ced3372da17588cc70ec30cf2f3fe6302e25`
- Source review: All 18 families and A1 through A7 were checked against
  `allmain.c:moveloop_core()`, `cmd.c:dowait()`, `hack.c:domove()`,
  `mon.c:movemon_singlemon()`, `monmove.c:m_move()`, and `rnd.c`. The review
  covered destination admission, item-search and displacement selection,
  parked-guard order, wrapper return values, PRNG order, and fail-closed scan
  state, plus `mon.c:wake_msg()`, `hack.c:notice_mon()`, and source-ordered
  `postmov()` behavior, including an unchanged pet result reported as moved;
  `dog.c:makedog()` and `dogmove.c:droppables()` for the starting pony's worn
  saddle; and `dogmove.c:find_targ()` through the unsupported `score_targ()`
  boundary. The final integration review covered display, persistence, replay,
  the next input request, and complete excluded-path retry state.
- Focused tests: the nine command, monster, pet, replay, accessibility, and
  integration owner files pass. The integration file runs three tests,
  including all 11 strict recipes and two identical rejected retries.
- Full suite: `npm test` passes all 1,567 tests.
- Generated-file checks: `check:monsters`, `check:objects`, `check:symbols`,
  and `check:themerooms` all passed.
- Fresh differentials: `node scripts/run-second-complete-turn.mjs` passes all
  11 checked-in segments with 30,841 matching PRNG calls and 44 matching
  complete screens, attributes, and cursors. A four-case batch scan varying
  no-pet, dog, pony, and fast-hero `spot_monsters` cases has no failures.
  Temporary pony discovery completed all 1,600 cases and grouped failures by
  unsupported reason; after saddle admission, 70 source-valid candidates
  completed. A strict five-case follow-up produced four complete matches, and
  the remaining original case stops atomically at its source-derived non-hero
  ranged target. Earlier complete discovery found no initial sleeping monster
  in 10,000 D:1 starts and no notice transition in 4,000 legal two-command
  trials, so wake and notice ordering retain focused source-state coverage.
- Development suite: 0/33 sessions fully matched; 77,557/610,816 PRNG values,
  205/7,765 screens, and 236/7,765 cursors matched. Excluded later paths retain
  their supported prefix.
- Quality check: `npm run quality -- --check` reported no unassigned production
  files. It exits blocked because objects, monsters, and world effects have
  reached the review threshold inside the frozen
  `3b6c38de148679a5cc8313d755ec906fa95627c3..9288ced3372da17588cc70ec30cf2f3fe6302e25`
  range. The resulting audit found new implementation work; the frozen range
  therefore did not complete its review window.
- Browser check: not required because no browser renderer, DOM, input,
  storage, or browser-only presentation contract changed.
- Holdout: not accessed.

## Readiness

Current mode: Implementation

Reason: the second correctness audit confirmed missing source behavior and
coverage in families 10, 11, 12, 13, and 18. B3 is the next checkpoint.
Broad seed discovery remains paused until these persisted checkpoints guide
fixed case lists.

## Completed commit gates

Each implementation checkpoint followed these gates:

1. Keep changed production code below the review-size limit and functions with
   their upstream subsystem.
2. Before committing, report the exact file list and whether focused tests,
   the full suite, and all generated-data checks pass.
3. Run strict fresh comparisons from a checked-in case list with
   `scripts/scan-fresh.mjs`. Use the temporary scanner only for discovery and
   group its complete range by unsupported reason.
4. Collect the required development score and quality evidence from
   `.agents/validation.md` and `.agents/quality-workflow.md`.
5. Publish one `SCORE.md` snapshot when the live slice or review window
   completes. Commit evidence-only changes separately when required, without
   creating another snapshot for that commit.

At C4, the focused integration tests, full test suite, generated-data checks,
development score, and fresh comparisons passed at the committed integration
head. The required review and final cleanup remain.
