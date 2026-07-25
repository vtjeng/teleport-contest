# Implementation checklist: second stable-level non-trap command

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
  wait or one move into a square the hero can legally enter, provided that
  entering the square does not activate `trap.c:dotrap()` and play does not
  transition to another level before the ending event. Objects, regions,
  special terrain, and engravings do not make a square obstructed; every
  resulting non-trap effect is in scope.
- Observables: State changes, random-number calls and order, messages, complete
  24x80 screens and attributes, cursors, persistence, and the next input or
  termination boundary.
- Exclusions: Obstructed movement, commands other than waiting or moving,
  hero-triggered traps, hero level transitions, and behavior whose first
  effect occurs after the ending event. Hero-triggered traps and transitions
  remain required follow-up milestones for the full legal-entry objective.

### Accepted milestone split

The user confirmed that legal entry, not an empty clear square, defines the
movement boundary. `hack.c:domove()` can therefore enter an accessible square
containing objects, regions, special terrain, engravings, or a hidden trap.
The temporary scanner's predicate still requires no monster and no trap, so it
covers only a subset of the formal boundary.

The broad boundary is impractical as one reviewable implementation slice.
`hack.c:spoteffects()` and `trap.c:dotrap()` can add elapsed turns, move the
hero to D:2 and require another level's generation and catalogs, terminate the
game, or animate any of 105 difficulty-3-through-7 statue species before the
ending event. Those species reach broad spell, special-damage, death, and
object-effect families which ordinary D:1 generation does not.

The user accepted **Second stable-level non-trap command** as the current
implementation milestone:

- It retains the same first-prompt starting event and second-command prompt or
  termination ending event.
- It includes waits and legal moves onto objects, regions, engravings, and
  special terrain, with all resulting effects.
- An entered hero square must not activate `trap.c:dotrap()`, and play must not
  transition to another level before the ending event.
- Monster-triggered traps and termination from in-scope monster actions remain
  included.

This split does not shrink the full objective. Hero-triggered trap effects and
their transitions are explicit later named milestones.

## How the candidate list was built

The inventory below is the complete source-derived family list for the stated
boundary at this checkpoint. It replaces the former broad, explicitly
incomplete summary.

- Upstream entry points: `allmain.c:moveloop_core()`, `cmd.c:dowait()`,
  `hack.c:domove()`, `hack.c:spoteffects()`, `trap.c:dotrap()`,
  `mon.c:movemon()`, `mon.c:movemon_singlemon()`,
  `monmove.c:dochugw()`, `monmove.c:dochug()`, `monmove.c:m_move()`,
  `dogmove.c:dog_move()`, `mhitm.c:mattackm()`, `mhitu.c:mattacku()`, and
  the object, trap, movement, rendering, and persistence helpers they call
  before the ending event.
- Dispatch tables and catalogs: The ordinary D:1 generation catalog contains
  jackal, fox, kobold, goblin, sewer rat, grid bug, lichen, kobold zombie, and
  newt. Starting pets are little dog, kitten, and pony. Reachable themed-level
  additions include sleeping fog clouds, wood nymphs, a waiting ghost, and
  chest-disguised mimics.
- Statue-trap catalog: A living-statue trap at D:1 calls
  `rndmonnum_adj(3, 6)`, making 105 difficulty-3-through-7 species eligible.
  Their attack catalog reaches breath, engulfing, explosions, magic, theft,
  seduction, poison, paralysis, petrification, rust, decay, hallucination, and
  other special damage methods. The implementation plan therefore follows
  attack and damage owners rather than enumerated discovery seeds.
- Trap catalog: Ordinary D:1 generation reaches arrow, dart, falling-rock,
  squeaky-board, bear, rust, pit, hole, trapdoor, teleport, magic, and
  anti-magic traps. Themes add web, land mine, sleep gas, statue, and fixed
  teleport traps. A transition to D:2 makes the rolling-boulder trap eligible.
- Reachable helpers: Calls were grouped by the upstream subsystem that owns
  their state and PRNG order. Shared placement, tracking, object, naming,
  carrying, food, combat, trap, and turn-loop prerequisites are separate
  families or checkpoints rather than additions to `monster_action.js`.
- JavaScript cross-check: Explicit unsupported paths and incomplete callbacks
  were searched in the active turn, including monster and pet movement,
  special attacks, traps, object floor effects, hero death, and second-turn
  replay. The temporary discovery scanner now traverses its complete requested
  range and groups failures by unsupported reason. Strict case lists use
  `scripts/scan-fresh.mjs`.
- Remaining limits: Families 12 and 13 remain confirmed in the full legal-entry
  objective but cannot occur for the accepted stable-level non-trap inputs.
  The 27 partial families still require source closure and live-consumer
  differentials; a passing discovery range is not closure proof.

## Coverage summary

The source survey has 38 families:

- 2 covered families, represented as checklist status `done`;
- 27 partially implemented or partially proved families, represented as
  `undecided`;
- 7 confirmed implementation gaps, represented as `missing`; and
- 2 hero-trap follow-up families, represented as `cannot-occur` for this
  milestone.

Thus the checklist-status totals are 2 `done`, 7 `missing`, 27 `undecided`,
and 2 `cannot-occur`. No family is currently classified as `no-effect-yet` or
`later`.

## Status values

This checklist uses the status definitions in
`.agents/implementation-checklist-template.md`. The `Coverage` column retains
the more precise survey classification; `Status` uses only the template's
allowed labels.

## Complete 38-family implementation table

| # | Upstream function or branch family | Reachability, effects, and current evidence | JavaScript owner | Coverage | Status | Checkpoint or next proof |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | `allmain.c:moveloop_core()` per-input cleanup | Runs after each accepted wait or move; clears input-scoped flags and preserves command ordering. Existing live fresh cases execute it through both prompts. | `js/allmain.js` | covered | `done` | C15: retain direct source review and rerun the final matrix. |
| 2 | Elapsed gate, movement debit, and repeated monster scans | Either command can debit movement and run zero or more monster passes before hero control resumes; this owns major PRNG and ordering seams. Implemented subsets pass fresh cases, but all short circuits are not closed. | `js/allmain.js` | partial | `undecided` | C15: port the complete elapsed loop and prove varying speed/debit cases. |
| 3 | Monster distress, allocation, random generation, and move counters | Runs inside elapsed work; may regenerate/status-tick monsters, allocate a random monster, and update `moves`/`monstermoves`. Current helpers and replay share ownership. | `js/allmain.js`, `js/mondata.js`, `js/monst.js` | partial | `undecided` | C2 catalog plus the existing placement substrate, then C15 live turn-loop ownership. |
| 4 | Once-per-turn upkeep | Timeout, light, vision, and related once-per-turn work can change state, visibility, messages, and PRNG before the prompt. Only the reached subset is implemented. | `js/timeout.js`, `js/light.js`, `js/vision.js`, `js/allmain.js` | partial | `undecided` | C15: separate owner commits, then turn-loop wiring. |
| 5 | Per-hero-action effects | Source performs action-cadence effects independently of once-per-turn elapsed work; ordering matters when two commands consume different amounts of time. | `js/allmain.js`, affected state owners | partial | `undecided` | C15: enumerate cadence branches and compare mixed wait/move cases. |
| 6 | Final display and next prompt | Every surviving path flushes messages, redraws, saves state, and requests the next command at the ending boundary. Passing cases match, but missing action families can alter the result. | `js/allmain.js`, renderer and persistence owners | partial | `undecided` | C17: verify complete screens, attributes, cursors, storage, and termination. |
| 7 | `cmd.c:dowait()` | A wait command has no movement target and consumes time through the shared loop. Live first- and second-wait fresh cases reach the next prompt. | `js/cmd.js` | covered | `done` | C17: retain focused command tests and final exact differentials. |
| 8 | `hack.c:domove()` prechecks and hero-position update | Every allowed move enters the movement command, checks the target, and updates hero position before spot effects. The clear-square subset is active but not source-closed. | `js/cmd.js`, `js/allmain.js` | partial | `undecided` | C16: port the coherent `domove()` path after prerequisites. |
| 9 | Region entry, hero track, vision, and engraving smudge | A successful move can enter/leave regions, update `utrack`, recalculate vision, and smudge an engraving before elapsed monster work. Focused tracking exists; the live path is not closed. | `js/track.js`, `js/vision.js`, region and engraving owners | partial | `undecided` | C4 tracking, C15 vision, then C16 movement integration. |
| 10 | `hack.c:spoteffects()` terrain, rooms, and regions | An accessible destination can trigger terrain, room, and region effects before monsters move; sleeping gas can add elapsed turns. Scanner cases do not prove every variant. | `js/cmd.js`, region/terrain owners | partial | `undecided` | C16: trace and port non-trap spot effects, including extra-turn cases. |
| 11 | Destination objects, pickup/description, and engraving reading | A destination can contain an object or engraving without being obstructed; this changes messages, floor ownership, inventory, and rendering. Object substrate exists but the live movement consumer is incomplete. | `js/obj.js`, `js/objnam.js`, command/output owners | partial | `undecided` | C5-C6 substrate and naming, then C16 live pickup/read paths. |
| 12 | `trap.c:dotrap()` hero trap effects | The accepted valid-input condition requires that entering the destination not activate `dotrap()`, so this family cannot run in this milestone. It remains required for the later hero-trap milestone. | Trap and hero-state owners not yet integrated | outside current milestone | `cannot-occur` | Retain the source inventory and schedule every reachable hero trap effect in the follow-up milestone. |
| 13 | Hero teleport, statue animation, level transition, and termination | The accepted valid-input condition also excludes hero level transitions before the ending event. Hero trap relocation, statue animation, D:2 generation, and trap termination remain required follow-up work. | `js/teleport.js`, `js/monst.js`, turn/termination owners | outside current milestone | `cannot-occur` | Prove transition, termination, D:2 generation, and expanded attack catalogs in the follow-up milestone. |
| 14 | `mon.c:movemon_singlemon()` dead/off-map/every-turn/ration gates | Each monster scan filters dead, migrating, or ineligible monsters and handles rationed movement before dispatch. Active cases exercise common gates only. | `js/allmain.js`, `js/monster_action.js` pending extraction | partial | `undecided` | Reuse the existing placement state, then C15 turn-loop dispatch. |
| 15 | Bypass/split, `minliquid()`, equipment, and hider handling | Eligible monsters can clear bypass state, split, interact with liquid, equip, or hide before ordinary action selection. Some equipment and trap cases match; the family is incomplete. | Future `mon.c` owner plus object/equipment helpers | partial | `undecided` | C5-C7 prerequisites, C11 weapons, then source-shaped `mon.c` extraction. |
| 16 | `movemon()` terminal light, purge, and deferred transition | After scans, source updates monster-carried light, purges dead monsters, and performs deferred level transitions before prompt rendering. Only reached subsets are wired. | `js/allmain.js`, `js/light.js`, `js/monst.js` | partial | `undecided` | Reuse the existing placement substrate; complete light and turn-loop ownership in C15. |
| 17 | `mcalcdistress()` regeneration, shape, and timers | Before actions, monsters can heal, change shape, and tick status timers; species predicates and ordering control effects and PRNG. Catalog support is incomplete. | `js/mondata.js`, future `mon.c` distress owner | partial | `undecided` | C2 generated fields/predicates, then a source-owned distress commit. |
| 18 | `monmove.c:dochug()` phase 1: arrival, wait, sleep, status, flee, respond, release | Runs before movement for pets and ordinary monsters. Explicit unsupported branches remain for sleep/arrival/wait and flight behavior. | `js/monmove.js`; callers still in `js/monster_action.js` | confirmed gap | `missing` | C14 pre-action phase commit; include scary-square flight ordering where owned here. |
| 19 | `dochug()` phase 2: apparent hero, scary checks, defensive/miscellaneous actions, wielding, special actions | Monsters choose apparent hero coordinates, react to scary squares, use defensive or miscellaneous actions, and decide whether to wield before movement/attack. Several explicit unsupported branches remain. | `js/monmove.js`, `js/weapon.js`, future action owners | confirmed gap | `missing` | C11 weapon helpers, then C14 phase-2 commit and representative strict cases. |
| 20 | `dochug()` phase 3: movement, spell, ranged attack, and hero attack dispatch | The phase chooses mutually ordered movement, spell, ranged, or melee action. Current action code rejects spellcasting and special attacks. | `js/monmove.js`, `js/mhitu.js`, ranged/spell owners | confirmed gap | `missing` | C11 and C14 establish dispatch; close consumers in their source-owned modules. |
| 21 | `monmove.c:m_move()` trapped/eating/hide/setup branches | Movement setup can release a trapped monster, continue eating, reveal/hide, or stop before candidate selection. Web, bear, and pit subsets exist. | `js/monmove.js`; temporary code in `js/monster_action.js` | partial | `undecided` | C13 trap primitives, then C14 `m_move()` setup extraction. |
| 22 | Special movers, item goals, doors, and tunneling | Species and strategy can select covetous/special movement, object goals, doors, tunneling, or boulder handling instead of ordinary walking. Explicit unsupported paths remain. | Future `monmove.js` and subsystem owners | confirmed gap | `missing` | C14 special-mover checkpoint after object and weapon prerequisites. |
| 23 | Path selection, tracking, trap avoidance, collisions, aggression, and displacement | Ordinary movement ranks squares using hero/monster tracks, trap knowledge, occupancy, aggression, and displacement. Common walking exists; aggression/displacement still stop explicitly. | `js/track.js`, `js/monmove.js`; temporary action code | partial | `undecided` | C4 tracking, C13 trap routing, then C14 candidate selection. |
| 24 | Normal movement and `postmov()` doors, traps, objects, and hiding | Chosen movement updates position and track, then applies door, trap, object, hiding, redraw, and message effects in source order. Exact subsets match, not the complete family. | `js/monst.js`, `js/obj.js`, `js/monmove.js`; temporary action code | partial | `undecided` | Existing placement plus C5/C13 prerequisites, then C14 normal movement and `postmov()`. |
| 25 | `dogmove.c` hunger and inventory | A starting pet can become hungry, carry objects, select droppables, drop, or starve before/after movement. Ordinary carry/drop cases match; thresholds and special inventory effects remain. | `js/dogmove.js`, `js/moncarry.js`, `js/dogfood.js` | partial | `undecided` | C7-C9: carrying, food, then dog inventory/eating subcommit. |
| 26 | Pet goals and reachability | `dog_goal()` chooses hero, food, apport, and follow goals, subject to reachability and object safety. Artifact refusal and `do_clear_area()` traversal are complete; the full goal family is not. | `js/dogmove.js`, `js/track.js`, `js/moncarry.js`, `js/vision.js` | partial | `undecided` | C4/C7/C8 and the committed vision prerequisite, then C9 goals/reachability subcommit. |
| 27 | Pet candidate selection, trap/cursed-square avoidance, and scary-square flight | A pet ranks moves while avoiding known traps/cursed objects and reacts to a scare-monster scroll under the hero. Strict seed 979597 reaches the explicit unsupported pre-move flight callback after source-required PRNG draws. | `js/dogmove.js`, `js/monmove.js`; caller in `js/monster_action.js` | confirmed gap | `missing` | C9 candidate logic plus C14 `distfleeck()`/`monflee()` connection; rerun seed 979597. |
| 28 | Pet combat, ranged attacks, and displacement | Candidate selection can attack or displace a monster, use a ranged attack, or in altered states attack the hero. Explicit unsupported consumers remain. | `js/dogmove.js`, `js/mhitm.js`, `js/mhitu.js` | confirmed gap | `missing` | C9 movement dispatch after C10-C11 combat owners exist. |
| 29 | Pet movement, eating, dropping, and pickup execution | Once selected, a pet can move, eat, drop, or pick up, updating `edog`, floor objects, inventory, messages, and PRNG. Several exact cases match, including carried-gold drop; special floor/food effects remain. | `js/dogmove.js`, `js/dogfood.js`, `js/moncarry.js`, `js/obj.js` | partial | `undecided` | C5-C9, split so goals, inventory/eating, and active movement each stay under 500 production lines. |
| 30 | `dog.c`, `mon.c`, and object lifecycle: food, nutrition, consumption, corpse, carry, artifact, ownership, naming | Pet and combat paths classify and consume food, apply corpse effects, carry/split/stack objects, check artifacts, and name output. Non-hero artifact touch is complete at `3d33c40c0862755a1a989223128b649704bd2d75`; the combined family is not. | `js/dogfood.js`, `js/moncarry.js`, `js/obj.js`, `js/objnam.js`, `js/artifacts.js` | partial | `undecided` | C5-C8, retaining C1 artifact evidence and adding live food/corpse cases. |
| 31 | Monster trap immunity, avoidance, and routing | Species data and trap knowledge decide whether a monster avoids, resists, triggers, or escapes a trap while choosing/making a move. Several generated traps match, but all trap/species combinations are not closed. | `js/mondata.js`, future `trap.js`/`monmove.js` owners | partial | `undecided` | C2 predicates, then C13 routing and C14 consumer proof. |
| 32 | Projectile, holding, and status trap effects on monsters | Arrow/dart/rock attacks, bear/pit/web holding, rust, sleep, anti-magic, and related status changes can occur before the prompt. Exact subsets and persistence tests exist. | Future `trap.js`; temporary code in `js/monster_action.js` | partial | `undecided` | C13 projectile commit, then holding/status commit with grouped strict cases. |
| 33 | Magic/fire/item damage and ignition trap effects | Magic traps can select ordinary or fire-burst outcomes, damaging monsters, armor, inventory, and floor objects in strict PRNG order. Seeds 962639 and 966115 match implemented subsets. | Future `trap.js` plus object/damage owners; temporary action code | partial | `undecided` | C5 object support, then C13 magic/fire/item-damage commit. |
| 34 | Hole/trapdoor/teleport/migration, land mine, and rolling boulder | Monster traps can relocate or migrate a monster, consume one-shot traps, explode land mines, or launch boulders; D:2 expands reachability. Several relocation cases match, but the family is incomplete. | `js/teleport.js`, `js/monst.js`, future `trap.js`; temporary action code | partial | `undecided` | C3, C12 hurtling, then C13 relocation and land-mine/boulder commits. |
| 35 | `mhitm.c` attack iteration, contact/ranged/special attacks, and passives | Pet/monster encounters iterate attack descriptors in source order and can invoke contact, ranged, special, and passive effects. Physical subsets have focused and fresh evidence. | `js/mhitm.js` | partial | `undecided` | C10: attack-loop commit followed by a passives/special-effects commit. |
| 36 | `mhitm.c` damage, death, growth, corpse, knockback, collision, and retaliation | A hit can damage/kill either monster, grow the attacker, create a corpse, knock back/collide, or trigger retaliation. Strict visible/blind seed 962576 covers one-square hurtling; remaining branches are open. | `js/mhitm.js`, object/placement owners, future `dothrow.js` | partial | `undecided` | C10 damage/death and knockback commits, then C12 hurtling owner. |
| 37 | `mhitu.c` apparent image, to-hit, weapons, special damage, and hero death | A nearby ordinary monster can attack the hero or displaced image and can end the run before the prompt. Seed 971455 covers one armed miss and a focused hit covers weapon-die ordering; many damage types and death still stop explicitly. | `js/mhitu.js`, `js/weapon.js`, hero/termination owners | confirmed gap | `missing` | C11 weapon helpers and `mhitu()` commit with damage-type and termination matrices. |
| 38 | Messages, rendering, persistence, replay removal, input, and termination integration | Every family can affect ordered messages, full screen/attributes, cursor, saved state, replay ownership, next input, or termination. Current fresh cases cover subsets while second-turn replay remains. | `js/allmain.js`, live owners, `js/fastforward.js`, runner/test files | partial | `undecided` | C17 final integration and exact end-to-end validation at the committed head. |

## Ordered source-owned checkpoints

Each implementation commit stays below 500 changed production lines. Functions
remain with their upstream subsystem. `js/monster_action.js` is temporary
assembly scaffolding and will never be committed as a combined movement, trap,
object, and combat module.

1. **C1 — `artifact.c:touch_artifact()` for non-hero callers.** Complete in
   code commit `3d33c40c0862755a1a989223128b649704bd2d75`; tracker commit
   `139027f` records its score evidence.
2. **C2 — generated monster attack/resistance fields and `mondata.c`
   predicates.** Complete in
   `89db11da70dbb42442a0688e50cf9d681d21a134`.
3. **C3 — `teleport.c:rloc()` ordinary live-monster relocation.** Complete
   in `ff24365bd6134a2f46d2b24dd015769f41b35a75`. The shared monster
   placement/index substrate was already committed. The shared
   `monmove.c:mon_track_add()` prerequisite is complete in
   `604b52ae2cd52ea5cc0bb7dad7b99132be7071f2` under its upstream owner.
4. **C4 — `track.c:gettrack()` hero-track lookup.** Complete in
   `a93f4dd2f89f5b1405294886d967e42a1e68c0d0`. The monster-local track
   update is now committed with `monmove.c` as noted above.
5. **C5 — `mkobj.c` stack-splitting and object-damage substrate.** Complete
   in `315fe27033c78c178e5fb715bef41309ad6989c9`.
6. **C6 — `objnam.c` early naming used by the active consumers.** Complete in
   `485357d66902cd4afed9a8d897f1b51ffa38a7ac`; its
   `artifact.c:find_artifact()` prerequisite is
   `09922c7b5d13d84331becd891a2f5f16c8606e2d`. Broader naming suffixes
   remain explicit family-11 seams for their later consumers.
7. **C7 — monster carrying and inventory transfer.**
   - **C7a — `mon.c:can_carry()`.** Complete in
     `3e1276beb2ca163890be7b27ead110d91d714799`.
   - **C7b — `steal.c:mpickobj()` transfer.** Complete in
     `303677046a65e6ffdac2a5bbc18caa5908d15755`. Bill, light, knowledge,
     carrying-effect, merge, and ownership order now share the source-owned
     transfer. The live pet pickup consumer still closes in C9.
8. **C8 — `dog.c:dogfood()` and its source-required food predicates.**
   Complete in `e558d75494a3479b29d73633fd6a5914e5bfa3df`.
9. **C9 — `dogmove.c` in bounded commits:** goals/reachability; inventory
   decisions; eating and object mutations; active movement. Combat and trap
   effects remain calls to their upstream owners. The inventory-decision
   prerequisite is complete in
   `8385846f3064fb3c6f5251e1493d1f914a7883d6`; the hunger-state
   prerequisite is complete in
   `a20cd18f4f243f41e7361709cb081ca38a36d3f1`; the
   `vision.c:do_clear_area()` prerequisite is complete in
   `db880ce6648710d234c6ec6c9ed6b181725144ec`.
10. **C10 — `mhitm.c` in bounded commits:** attack iteration; damage/death and
    growth/corpses; passives/knockback/collision as line counts and source
    seams require.
11. **C11 — `weapon.c` monster weapon helpers, then `mhitu.c`.**
12. **C12 — `dothrow.c` hurtling and collision movement.**
13. **C13 — `trap.c` in source-owned groups:** projectiles; holding/status;
    magic/fire/item damage; hole/teleport/migration; land mine/rolling boulder.
14. **C14 — `monmove.c` in source-owned groups:** pre-action phases; ordinary
    movement; `postmov()`, with special movers kept separate if needed. This
    checkpoint connects scary-square `distfleeck()`/`monflee()` behavior.
15. **C15 — elapsed-loop owners:** separate `allmain.c`, `timeout.c`,
    `light.c`, and `vision.c` commits, followed by turn-loop wiring.
16. **C16 — `hack.c:domove()` and `spoteffects()`.** Close the accepted
    milestone's non-trap spot effects here. Hero-triggered traps and hero level
    transitions remain separate named follow-up milestones.
17. **C17 — final integration:** live wiring and replay removal, plus
    `scripts/run-second-complete-turn.mjs` refactored to `runFreshMatrix()`,
    `scripts/fixtures/second-complete-turn.session.json`, and
    `scripts/second-complete-turn.test.mjs` in one commit.

### Temporary-module extraction map

- Monster trap behavior moves to the C13 trap owners.
- Hurtling moves to the C12 `dothrow.c` owner.
- Pet action selection and execution move to the C9 `dogmove.c` owner.
- Ordinary action selection and movement move to the C14 `monmove.c` owner.
- Monster combat remains in C10/C11 `mhitm.c` and `mhitu.c` owners.
- Objects remain in C5-C8 `obj.c`, `objnam.c`, monster-carry, and `dogfood()`
  owners.

The second-turn runner, fixture, and integration test remain uncommitted until
C17. Temporary discovery may continue with `/tmp/scan-second-turn.mjs`; strict
case lists use `scripts/scan-fresh.mjs`. Grouped discovery may resume within the
accepted stable-level non-trap boundary; broad hero-trap discovery remains for
its follow-up milestone.

## Missing work by checkpoint owner

1. C5-C8 establish the remaining source-owned object, naming, carry, and food
   prerequisites used by active pet, trap, and combat paths. C2-C4 and the
   shared placement/index substrate are complete.
2. C9 resolves families 25-29 without absorbing trap or combat behavior.
3. C10-C12 resolve the attack, hero-combat, and hurtling seams in families
   28 and 35-37.
4. C13 resolves monster trap families 31-34 in grouped scanner batches.
5. C14 resolves monster action families 18-24, including strict seed 979597
   for scary-square flight.
6. C15 closes elapsed work and the pre-prompt turn loop in families 1-6 and
   14-17.
7. C16 closes movement spot effects. Under the current broad boundary it also
   integrates families 12-13; under the proposed named milestone those
   families move to explicit follow-up milestones.
8. C17 removes obsolete replay and proves family 38 through the next observable
   boundary.

## Current checkpoint evidence

- C1 is committed and tracked as described above.
- C2 is committed as `89db11da70dbb42442a0688e50cf9d681d21a134`
  with exactly `scripts/generate-monsters.mjs`, generated `js/monsters.js`,
  `js/mondata.js`, `scripts/monsters.test.mjs`, and
  `scripts/mondata.test.mjs`.
- C2 focused tests pass 24/24, the full suite passes 1,346/1,346, and all six
  declared generated-data checks pass.
- No C2 fresh differential is claimed yet; its real consumers close in later
  checkpoints.
- C3 is committed as `ff24365bd6134a2f46d2b24dd015769f41b35a75`
  with exactly `js/teleport.js` and `scripts/teleport.test.mjs`. Fourteen
  focused tests, the 1,349-test full suite, and all six generated-data checks
  pass. Its extended `rloc_to_core()` seams remain explicit and its live trap
  consumer closes later.
- C4 is committed as `a93f4dd2f89f5b1405294886d967e42a1e68c0d0`
  with exactly `js/track.js` and `scripts/track.test.mjs`. Four focused tests,
  the 1,349-test full suite, and all six generated-data checks pass. Its live
  `monmove.c` consumer closes later.
- C5 is committed as `315fe27033c78c178e5fb715bef41309ad6989c9`
  with exactly `js/obj.js` and `scripts/object-substrate.test.mjs`. The
  53-test focused object suite, the 1,355-test full suite, and all six
  generated-data checks pass. `splitobj()` now preserves source ID pricing,
  chain insertion, extra copying, and bill/timer/light order. The pet, combat,
  and trap consumers close in later checkpoints, so no fresh differential is
  claimed for this prerequisite.
- C6 is committed as `485357d66902cd4afed9a8d897f1b51ffa38a7ac`
  with exactly `QUALITY.json`, `js/obj.js`, `js/objnam.js`, and
  `scripts/objnam.test.mjs`; its artifact prerequisite is
  `09922c7b5d13d84331becd891a2f5f16c8606e2d`. Nine focused naming tests,
  the canonical 1,366-test full suite, and all six generated-data checks pass.
  The production diff is 491 changed lines. The quality gate is clear and the
  objects area is advisory at four commits and 703 lines. No fresh differential
  is claimed until the named movement, pet, or combat consumer commits.
- C7a is committed as `3e1276beb2ca163890be7b27ead110d91d714799`
  with exactly `QUALITY.json`, `js/moncarry.js`, and
  `scripts/moncarry.test.mjs`. Five focused carrying tests, 23 related
  dog-movement and touch-safety tests, the canonical 1,368-test full suite, and
  all six generated-data checks pass. The production diff is 68 changed lines.
  The quality gate is clear and the monster area is advisory at four commits
  and 431 lines.
- C7b is committed as `303677046a65e6ffdac2a5bbc18caa5908d15755`
  with exactly `QUALITY.json`, `js/invent.js`, `js/light.js`, `js/obj.js`,
  `js/sp_lev_object.js`, `js/steal.js`, and `scripts/steal.test.mjs`.
  Ten focused pickup tests and the affected inventory, object-lifecycle,
  special-level, light, and burning suites pass. The exact staged full suite
  passes 1,346/1,346, the broader implementation worktree passes 1,378/1,378,
  and all six generated-data checks pass. The production diff is 350 changed
  lines. The quality gate is clear; objects are advisory at five commits and
  979 lines, and world-effects at three commits and 142 lines. The
  special-level loader is a real consumer; no fresh second-turn differential
  is claimed until C9 connects the live pet pickup consumer.
- C8 is committed as `e558d75494a3479b29d73633fd6a5914e5bfa3df`
  with exactly `QUALITY.json`, `js/dogfood.js`, `js/mondata.js`,
  `scripts/dogfood.test.mjs`, and `scripts/mondata.test.mjs`. Twelve direct
  food-classification tests and the focused mondata suite pass; the exact
  staged full suite passes 1,359/1,359 and all six generated-data checks pass.
  The production diff is 395 changed lines. The quality gate is clear and the
  monster area is advisory at five commits and 826 lines. No fresh
  second-turn differential is claimed until C9 connects the live pet
  `dogmove.c` consumer.
- The C9 inventory-decision prerequisite is committed as
  `8385846f3064fb3c6f5251e1493d1f914a7883d6` with exactly `QUALITY.json`,
  `js/dogmove_inventory.js`, and `scripts/dogmove-inventory.test.mjs`. Nine
  direct inventory tests and 47 focused pet/object tests pass; the exact
  staged full suite passes 1,368/1,368 and all six generated-data checks pass.
  The production diff is 116 changed lines. The quality gate is clear and the
  monster area is advisory at six commits and 942 lines. No fresh
  second-turn differential is claimed until later C9 commits connect
  `dog_invent()` to the live `dog_move()` path.
- The C9 hunger-state prerequisite is committed as
  `a20cd18f4f243f41e7361709cb081ca38a36d3f1` with exactly `QUALITY.json`,
  `js/dogmove_hunger.js`, and `scripts/dogmove-hunger.test.mjs`. Six direct
  hunger tests and 53 focused C9 tests pass; the exact staged full suite passes
  1,374/1,374 and all six generated-data checks pass. The production diff is
  49 changed lines. The quality gate is clear and the monster area is advisory
  at seven commits and 974 committed lines. No fresh second-turn differential
  is claimed until later C9 commits connect `dog_hunger()` to the live
  `dog_move()` path.
- The C9 clear-area prerequisite is committed as
  `db880ce6648710d234c6ec6c9ed6b181725144ec` with exactly `js/vision.js`
  and `scripts/light-vision.test.mjs`. Focused vision and dependent pet tests
  pass; the exact staged full suite passes 1,376/1,376 and all six
  generated-data checks pass. The production diff is 135 changed lines. The
  quality gate is clear and world-effects is advisory at four commits and 192
  committed lines. No fresh second-turn differential is claimed until C9
  connects the live `dog_move()` consumer.
- The shared C9/C14 monster-track prerequisite is committed as
  `604b52ae2cd52ea5cc0bb7dad7b99132be7071f2` with exactly `js/monmove.js`
  and `scripts/monmove.test.mjs`. Focused `monmove`, pet-movement, and
  monster-instance tests pass; the exact staged full suite passes
  1,377/1,377 and all six generated-data checks pass. The production diff is
  14 changed lines. The quality gate is clear and monsters are advisory at
  eight commits and 988 committed lines. No fresh second-turn differential
  is claimed until the live movement consumers commit.
- The full-range temporary scan of seeds 977100 through 979999 completed all
  2,900 cases: 2,899 passed and one grouped unsupported reason remained.
  Strict seed 979597 reproduces that pet scary-square gap with
  `scripts/scan-fresh.mjs`.

## Validation required at final integration

- Commit checked: Not yet available; implementation remains in progress.
- Source review: Recheck all 38 families and every reachable helper at the
  exact C17 head.
- Focused tests: Run each owner suite during its checkpoint and the combined
  focused set at C17.
- Full suite: Run `npm test` before every implementation commit and at C17.
- Generated-file checks: Run the relevant check at every generated-data
  checkpoint and all declared checks at C17.
- Fresh differentials: Store the reproducible replay-input-only matrix in the
  C17 runner using `runFreshMatrix()`/`scripts/diff-fresh.mjs`; vary seeds,
  datetimes, characters, options, and both commands. Verify PRNG logs, complete
  screens and attributes, cursors, and persisted state.
- Development suite: Run `node scripts/score-development.mjs` at the milestone;
  do not access the sealed holdout.
- Quality check: Run the per-commit dashboard and
  `npm run quality -- --check` at the milestone.
- Browser check: Required only if browser-only renderer, DOM, input, or storage
  behavior changes; reassess at C17.

## Readiness

Current mode: Implementation

Reason: Seven families have confirmed missing behavior, 27 are only partially
implemented or proved, and second-turn replay remains. The accepted
stable-level non-trap milestone is active; hero-triggered trap and transition
families are scheduled follow-up work.
