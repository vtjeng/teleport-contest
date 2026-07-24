# Implementation checklist: second complete gameplay turn

## Boundary

- Roadmap item: Exploration, beginning with general active-monster and
  later-turn ownership.
- Starting code commit:
  `3b6c38de148679a5cc8313d755ec906fa95627c3`.
- Starting event: A newly generated game is waiting at its first command
  prompt.
- Ending event: The game reaches the prompt after a second time-consuming
  command, or the upstream game ends before that prompt.
- Valid inputs: Arbitrary valid seeds, datetimes, character configurations,
  startup options, and any two-command combination in which each command is a
  wait or one unobstructed move.
- Observables: State changes, random-number calls and order, messages, complete
  screens and attributes, cursors, persistence, and the next input or
  termination boundary.
- Exclusions: Obstructed movement, commands other than waiting or moving, and
  behavior whose first effect occurs after the ending event.

## How the candidate list was built

This is an initial list of source owners reached by implementation and fresh
case discovery. It is not yet an exhaustive trace of every branch and helper
reachable before the ending event.

- Upstream entry points: `allmain.c:moveloop_core()`, `mon.c:movemon()`,
  `monmove.c:dochugw()`, `monmove.c:dochug()`, `monmove.c:m_move()`,
  `dogmove.c:dog_move()`, `mhitm.c:mattackm()`, `mhitu.c:mattacku()`, and
  `trap.c:mintrap()`.
- Dispatch tables and catalogs: Monster templates and attack descriptors,
  object and corpse data, trap types, starting-pet configuration, character
  configuration, and relevant option families.
- Reachable helpers: The current implementation has followed paths for pet
  goals, food, carrying and movement; ordinary monster movement and equipment;
  monster combat; trap effects and relocation; elapsed-turn work; rendering;
  and persistence. The main agent must still enumerate every source branch
  within those families.
- JavaScript cross-check: The final checklist must account for explicit
  unsupported errors, fail-closed paths, fallbacks, no-ops, and the remaining
  second-turn playback in `js/fastforward.js`.
- Remaining limits: The broad fresh scan is still finding omitted paths, and
  the complete source-based candidate list has not been written.

## Status values

This checklist uses the status definitions in
`.agents/implementation-checklist-template.md`.

## Implementation table

| Upstream function or branch family | Why it can run | JavaScript owner | State, randomness, and output | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| Command dispatch and elapsed-turn allocation | Both allowed commands consume time before the ending event. | `js/allmain.js` | Turn state, movement allocation, random-number order, and command prompts | Existing focused command tests and the checked-in fresh matrix must be rerun at the final committed head. | `undecided` | Enumerate all reachable second-turn short circuits and rerun validation. |
| Starting-pet goals, food classification, carrying, and movement | A starting pet can act after either allowed command. | `js/dogmove.js`, `js/dogfood.js`, `js/moncarry.js`, `js/track.js` | Pet state, object ownership, nutrition, movement, messages, rendering, and random-number order | Focused tests and several exact fresh cases exist in the active worktree. | `undecided` | Finish the source branch list, including corpse effects and related food paths. |
| Ordinary monster movement and action selection | Eligible level monsters act during elapsed turns. | `js/monster_action.js`, `js/mondata.js`, `js/monst.js` | Apparent hero position, strategy, movement, equipment, traps, state, and random-number order | The broad scan has exact cases for movement, waiting strategy, equipment, and several traps. | `undecided` | Enumerate remaining movement, strategy, and action branches. |
| Monster-versus-monster combat | Pets and ordinary monsters can meet during either elapsed turn. | `js/mhitm.js` | Attack selection, hit and damage results, death, growth, objects, messages, rendering, and random-number order | Focused combat tests and exact fresh collision cases exist in the active worktree. | `undecided` | Trace every attack and result family reachable within the boundary. |
| Monster-versus-hero combat and termination | A nearby monster can attack the hero before the second prompt. | `js/mhitu.js`, `js/allmain.js` | Hero state, adhesion, damage, death or continued play, messages, screens, and random-number order | Exact fresh cases include displaced-image and sticky-touch paths. | `undecided` | Enumerate reachable attack forms, damage types, and termination paths. |
| Monster trap effects, migration, and relocation | A moving pet or monster can enter a generated trap. | `js/monster_action.js`, `js/teleport.js` | Trap knowledge, damage, object creation, migration or relocation, redraw, and random-number order | Exact fresh cases include rust, hole, arrow, anti-magic, bear-trap, and random-teleport behavior. | `undecided` | Resolve the current screen mismatch and classify fixed-destination and one-shot teleport traps. |
| Object transfer, consumption, and corpse effects | Pet goals and combat can move, split, create, eat, or destroy objects. | `js/obj.js`, `js/dogfood.js`, `js/dogmove.js`, `js/moncarry.js` | Object identity, ownership, quantity, age, nutrition, corpse effects, persistence, and random-number order | Focused object tests and exact pickup or ordinary-food cases exist in the active worktree. | `undecided` | Complete the source list for edible corpses and conveyed effects. |
| Messages, rendering, cursors, and persisted state | Every elapsed action can affect observable output or the next segment. | `js/allmain.js`, `js/monster_action.js`, affected display and state owners | Message order, glyph removal or redraw, complete screens and attributes, cursors, and saved state | The fresh matrix and individual cases compare these outputs; the latest scan still has a screen mismatch. | `missing` | Identify and port the source owner of the boundary-three message mismatch, then rerun the case. |
| Removal of temporary second-turn playback | Live behavior replaces recorded calls only after it performs their state and random-number effects. | `js/fastforward.js` and live owners above | Replay removal, live state changes, and random-number order | The active diff reduces playback, but final source coverage and validation are incomplete. | `undecided` | Remove only calls made obsolete by completed live behavior and prove no live replay remains before the ending event. |

## Missing work by owner

1. Source enumeration: Expand each broad row into every meaningful reachable
   branch or branch family and decide its status.
2. Output ownership: Resolve the current boundary-three screen mismatch against
   its upstream message or floor-object owner.
3. Trap and object families: Decide remaining teleport-trap and edible-corpse
   paths from source and fresh cases.
4. Final validation: Commit the implementation, run all focused and broad
   checks at that exact head, and replace worktree-only evidence with
   reproducible commands and results.

## Validation

- Commit checked: Not yet available; implementation is uncommitted.
- Focused tests: Individual active-worktree tests have passed, but the final
  focused set has not run at a committed head.
- Full suite: Not yet run at the final committed head.
- Generated-file checks: Not yet run at the final committed head.
- Fresh differentials:
  `node scripts/run-second-complete-turn.mjs` is the intended checked-in matrix;
  final aggregate results are pending.
- Development suite: Not yet run at the final committed head.
- Quality check: Not yet run at the final committed head.
- Browser check: Not expected unless the final diff changes a browser-only
  renderer or DOM, input, or storage contract; reassess at readiness.

## Readiness

Current mode: Implementation

Reason: The source-based candidate list is incomplete, the table contains
`missing` and `undecided` entries, the active scan has an unresolved screen
mismatch, and validation has not run at a committed head.
