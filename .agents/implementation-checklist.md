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
  monster action. The queued command and pre-command state must remain
  retryable.

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
| 3 | `hack.c:domove()` ordinary-clear branch | Run new-game prechecks, enter an unoccupied clear floor or corridor square, update hero coordinates, vision, and movement flags. | `js/cmd.js` and existing movement owners | done | Clear-walk cases in both command positions. |
| 4 | `allmain.c` movement debit and repeated monster scans | Debit `u.umovement`, call `movemon()` until the source stopping condition, and respect a fast hero's retained ration. | `js/allmain.js` | partial | Commit C3 after the two movement owners. |
| 5 | `mon.c:movemon_singlemon()` scan gates | Preserve dead/off-map, every-turn upkeep, movement-ration, vision, and ration-spend order for each list node. | `js/mon.js`, `js/allmain.js` adapter | partial | C1 focused scan-order tests and strict cases. |
| 6 | `mon.c:movemon()` terminal cleanup | Clear transient state, purge dead entries, update light/vision state, and return whether another scan is needed. Level transition is a future safe-stop. | `js/mon.js`, `js/allmain.js` adapter | partial | C1/C3 focused repeated-scan cases. |
| 7 | `monmove.c:dochugw()` notice wrapper | Run the ordinary action while preserving the occupation-interruption seam. New games have no active occupation. | `js/monmove.js` | partial | Source owner committed at `e74c756`; C3 live consumer proof remains. |
| 8 | `monmove.c:dochug()` ordinary stay gates | Preserve immobile, waiting, sleeping/disturb, and no-action results for ordinary D:1 monsters. | `js/monmove_dochug.js` | partial | Source owner committed at `e74c756`; C3 no-ration and sleep differentials remain. |
| 9 | `monmove.c:dochug()` ordinary action decision | Set apparent hero position, compute range/fear, and decide whether the monster moves or stays. Stop before attack or special-action dispatch. | `js/monmove_dochug.js` | partial | Source owner committed at `e74c756`; C3 safe-stop and strict cases remain. |
| 10 | `monmove.c:m_move()` ordinary goal and candidates | Compute approach, hero tracking, movement flags, `mfndpos()` candidates, and source tie-breaking for ordinary clear destinations. | `js/monmove_move.js` | partial | Source owner committed at `e74c756`; C3 live candidate proof remains. |
| 11 | `monmove.c:m_move()` coordinate move and inert `postmov()` | Move one ordinary monster, update the map and monster track, redraw, or return the source no-move status. Stop before combat, displacement, traps, objects, regions, doors, terrain, or special post-move effects. | `js/monmove_move.js` and a thin `monmove.c` adapter | partial | Source owner committed at `e74c756`; C3 atomic integration and strict cases remain. |
| 12 | `dogmove.c:dog_goal()` ordinary follow/stay goal | Choose the hero or existing track as the starting pet's goal without selecting food, carried objects, doors, or special locations. | `js/dogmove_goal.js` | partial | Source owner committed at `b01722b`; C3 safe-stop and live goal proof remain. |
| 13 | `dogmove.c:dog_move()` starting-pet gates | Preserve ordinary hunger, distance, whistle, and no-action gates for an active little dog, kitten, or pony. Stop before inventory, eating, leash, steed, conflict, altered-state, ranged, or combat paths. | `js/dogmove.js` | partial | C2 focused gate and atomicity tests. |
| 14 | `dogmove.c:dog_move()` candidates and tie-breaking | Run `mon_allowflags()`, `mfndpos()`, candidate filtering, follow-distance scoring, and source tie-breaking over ordinary clear squares. | `js/dogmove.js` | partial | C2 candidate-order tests and strict pet stay/move cases. |
| 15 | `dogmove.c:dog_move()` coordinate move | Move the pet, update its map slot and track, or preserve its square. Stop before combat, displacement, trap, object, region, door, terrain, and other special effects. | `js/dogmove.js` and a thin `monmove.c` adapter | partial | C2 safe-stop atomicity tests plus strict fresh cases. |
| 16 | `allmain.c` new-turn allocation and upkeep | Run monster distress, movement allocation, possible random generation, hero movement allocation, track update, turn counters, timeouts, regions, sounds, hunger, engraving wear, and the already-owned first-turn upkeep sequence. | Existing source owners, coordinated by `js/allmain.js` | partial | C3 mixed speed/allocation fresh cases. |
| 17 | `allmain.c` once-per-hero-action effects | Advance `hero_seq`, refresh encumbrance/display state, and run the already-owned post-action visibility work. | Existing source owners, coordinated by `js/allmain.js` | partial | C3 direct state tests and fresh comparisons. |
| 18 | display, persistence, replay, and next input | Render and persist the complete result, remove only the second-turn replay now owned by gameplay, and request the next command. | `js/allmain.js`, `js/fastforward.js`, runner/test files | partial | C3/C4 exact screens, attributes, cursors, storage, and prompt. |

### Inventory count and readiness

- 18 in-boundary families: 3 done and 15 partial.
- 0 in-boundary families are marked missing because each has an existing
  committed substrate or worktree implementation, but no partial family is
  closure evidence.
- Closure verdict: **not ready**. The ordinary movement owner is committed;
  the pet owner and integration remain uncommitted, and the fail-closed
  destination checks are incomplete.

## Confirmed gap clusters

### C1 — ordinary `monmove.c` move or stay

The source-owned movement functions and focused tests are committed at
`e74c75679cfe3e03e91e9c9a900344a4c221441d`. Their C3 live adapter still must
classify combat, displacement, trap, object, door, region, and special
post-move destinations before the command mutates state or consumes PRNG.

Expected implementation files:

- `js/monmove_dochug.js`
- `js/monmove_move.js`
- the minimum corresponding `js/monmove.js` or `js/mon.js` wiring
- focused `scripts/monmove-*.test.mjs` files

Do not include `js/monster_action.js`, trap modules, combat modules, pet
modules, or the final integration trio.

### C2 — starting-pet `dogmove.c` move or stay

The complete `dog_goal()` source owner and focused tests are committed at
`b01722b27afbfc79903920597d93a689ebf919e0`. Finish families 13 through 15 for
an ordinary active starting pet. The live adapter must stop before goal
selection when food or fetchable objects would make item interaction relevant,
and movement must stop before inventory, eating, combat, displacement, traps,
regions, doors, or special terrain.

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

Expected implementation files:

- `js/allmain.js`
- `js/fastforward.js`
- the minimum live adapters not already committed with C1/C2
- focused `scripts/cmd.test.mjs` and `scripts/fastforward.test.mjs`

### C4 — final integration matrix

Commit these files together only after the behavior is complete:

- `scripts/run-second-complete-turn.mjs`
- `scripts/fixtures/second-complete-turn.session.json`
- `scripts/second-complete-turn.test.mjs`

The runner must use `runFreshMatrix()` from `scripts/fresh-matrix.mjs`. The
fixture and integration test must contain only the simple-turn boundary; move
trap, combat, relocation, item, door, region, and special-action cases to
future-work discovery records rather than weakening their assertions.

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
| Pet inventory, food, leashes, steeds, arrival/wait strategy, altered state, fear, ranged attacks, combat, and special movement | `dogmove.c`, `dog.c`, `monmove.c` | Preserve worktree pet modules; only ordinary move/stay is current. |
| Hero traps, special terrain entry, objects, pickup, running, search, travel, force-fight, stairs, obstructed moves, and other commands | `hack.c`, `cmd.c`, trap, object, terrain, and level owners | Later exploration checkpoints. |

The completed artifact, generated monster-data, relocation, tracking, object,
pet-food, trap-effect, and other prerequisite commits remain valid. They do
not change the active scope or count as live simple-turn closure.

## Validation and commit gates

Stay in Implementation mode while any current family is partial or uncertain.
For each implementation checkpoint:

1. Keep changed production code below the review-size limit and functions with
   their upstream subsystem.
2. Before committing, report the exact file list and whether focused tests,
   the full suite, and all generated-data checks pass.
3. Run strict fresh comparisons from a checked-in case list with
   `scripts/scan-fresh.mjs`. Use the temporary scanner only for discovery and
   group its complete range by unsupported reason.
4. Record the required development score and quality evidence from
   `.agents/validation.md` and `.agents/quality-workflow.md`.
5. Commit tracker-only evidence separately from implementation when required.

At C4, run the focused integration tests, full test suite, all generated-data
checks, development score, and several fresh comparisons at the committed
integration head. Then perform the required review of the committed range and
leave no tracked modifications, untracked files, or temporary repository
artifacts.
