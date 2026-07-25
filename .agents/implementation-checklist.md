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

The superseded broader legal-entry boundary was impractical as one reviewable
implementation slice. `hack.c:spoteffects()` and `trap.c:dotrap()` can add
elapsed turns, move the hero to D:2 and require another level's generation and
catalogs, terminate the game, or animate any of 105
difficulty-3-through-7 statue species before the ending event. Those paths are
retained below as future work.

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

Hero-triggered trap effects, their transitions, and the broader catalogs they
introduce are explicit future exploration work. They do not block this
checkpoint.

## How the candidate list was built

The inventory below separates the complete source-derived list into
current-goal families and explicit future work. The current-goal table includes
only behavior that can run before this checkpoint's ending event.

- Current upstream entry points: `allmain.c:moveloop_core()`,
  `cmd.c:dowait()`, `hack.c:domove()`, the non-trap branches of
  `hack.c:spoteffects()`, `mon.c:movemon()`,
  `mon.c:movemon_singlemon()`,
  `monmove.c:dochugw()`, `monmove.c:dochug()`, `monmove.c:m_move()`,
  `dogmove.c:dog_move()`, `mhitm.c:mattackm()`, `mhitu.c:mattacku()`, and
  the object, trap, movement, rendering, and persistence helpers they call
  before the ending event.
- Future entry points retained separately: `trap.c:dotrap()`, hero relocation
  and level transition, living-statue animation, and the catalogs those paths
  introduce.
- Dispatch tables and catalogs: The ordinary D:1 generation catalog contains
  jackal, fox, kobold, goblin, sewer rat, grid bug, lichen, kobold zombie, and
  newt. Starting pets are little dog, kitten, and pony. D:1 themed generation
  also reaches sleeping fog clouds and wood nymphs, a waiting ghost,
  chest-disguised mimics, the 21 Mausoleum mummy/vampire/lich/zombie
  candidates, and one of giant zombie, ettin zombie, or vampire lord in the
  water-surrounded vault. Mausoleum monsters retain `STRAT_WAITFORU`, and the
  water-vault monster starts isolated; their upkeep, shape, wait, and reachable
  movement paths are current, while actions that first require release or
  contact are future work.
- Trap catalog: Ordinary D:1 generation reaches arrow, dart, falling-rock,
  squeaky-board, bear, rust, pit, hole, trapdoor, teleport, magic, and
  anti-magic traps. Themes add web, land mine, sleep gas, and fixed teleport
  traps. D:1 themes also add ice, pools, lava, gas regions, fountains, graves,
  sinks, and altars. Those non-trap terrain and region effects remain current.
  Hero statue activation and difficulty-2-or-later rolling-boulder eligibility
  are future work because the current valid-input boundary excludes the first
  and D:1 generation excludes the second.
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
- Remaining limits: The current table has 28 partial families that still
  require source closure and live-consumer differentials. The future-work
  table retains excluded hero-trap, transition, deeper-generation, dormant
  themed-monster, later-pet, and catalog-only paths so they are not mistaken
  for current blockers or completed behavior. A passing discovery range is not
  closure proof.

## Coverage summary

The source survey retains 38 top-level families:

- 36 current-goal families: 2 `done`, 6 `missing`, and 28 `undecided`;
- 2 families moved to explicit future work because their first effect requires
  excluded hero trap activation or a hero level transition.

No current-goal family is classified as `no-effect-yet`, `later`, or
`cannot-occur`. Future-only subpaths inside mixed families are listed
separately below and do not count toward current-goal readiness.

## Status values

This checklist uses the status definitions in
`.agents/implementation-checklist-template.md`. The `Coverage` column retains
the more precise survey classification; `Status` uses only the template's
allowed labels.

## Complete 38-family inventory: 36 current-goal families

Families 12 and 13 are retained in the explicit future-work table after this
one. All other numbered families remain current-goal work until their source
branches and live consumers are closed.

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
| 9 | Region entry, hero track, vision, and engraving smudge | A successful move can enter/leave regions, update `utrack`, recalculate vision, and smudge or read an engraving before elapsed monster work. Destination reading is live at `c36479c5f51decaf0477a29ba0f6a7913661a027`, and post-move smudging is live at `a2c0a1e355ea6271c5f59f5e634f2fabc517bb87`. Second-turn track and full region/vision ordering are not closed. | `js/track.js`, `js/vision.js`, `js/hack.js`, region and engraving owners | partial | `undecided` | Finish C15/C16 movement ordering and prove the second-turn track consumer. |
| 10 | `hack.c:spoteffects()` terrain, rooms, and regions | An accessible destination can trigger terrain, room, and region effects before monsters move; sleeping gas can add elapsed turns. D:1 themed rooms make ice, pool, lava, gas-region, fountain, sink, grave, and altar paths current. The leading room-membership update is live at `ab62aa2fb388aea112678130a6da9a8f7a00dc86`, and reachable terrain-status switching is live at `a2be24a9cf170e45441e4601127ba4770cd4b3d6`. Liquid, sink, and region effects remain open. Scanner cases do not prove every variant. | `js/hack.js`, `js/dungeon.js`, `js/mkroom.js`, `js/display.js`, `js/cmd.js`, region/terrain owners | partial | `undecided` | Continue C16 with source-owned D:1 non-trap spot effects, including relocation, termination, and extra-turn cases. |
| 11 | Destination objects, automatic pickup/description, terrain decoration, and engraving reading | A destination can contain an object, passable feature, or engraving without being obstructed; this changes messages, floor ownership, inventory, and rendering. The ordinary sighted single-object description is live at `a61681496d5712aa17ddee750d1a72a5275ab627`, and destination engraving reading is live at `c36479c5f51decaf0477a29ba0f6a7913661a027`; piles, automatic pickup, decoration ordering, blindness, and special objects remain. | `js/invent.js`, `js/engrave.js`, `js/obj.js`, `js/objnam.js`, command/output owners | partial | `undecided` | Continue C16 with source-owned decoration, pile, automatic-pickup, and blind-floor paths. |
| 14 | `mon.c:movemon_singlemon()` dead/off-map/every-turn/ration gates | Each monster scan filters dead, migrating, or ineligible monsters and handles rationed movement before dispatch. Active cases exercise common gates only. | `js/allmain.js`, `js/monster_action.js` pending extraction | partial | `undecided` | Reuse the existing placement state, then C15 turn-loop dispatch. |
| 15 | Bypass/split-object cleanup, `minliquid()`, equipment, and hider handling | Eligible monsters clear transient object state, interact with D:1 themed liquid, equip, or hide before ordinary action selection. Water-vault vampshifter forms keep the liquid checks current. Some equipment and hider cases match; the family is incomplete. | Future `mon.c` owner plus object/equipment helpers | partial | `undecided` | C5-C7 prerequisites, C11 weapons, then source-shaped `mon.c` extraction. |
| 16 | `movemon()` terminal light, purge, and deferred transition | After scans, source updates monster-carried light, purges dead monsters, and performs deferred level transitions before prompt rendering. Only reached subsets are wired. | `js/allmain.js`, `js/light.js`, `js/monst.js` | partial | `undecided` | Reuse the existing placement substrate; complete light and turn-loop ownership in C15. |
| 17 | `mcalcdistress()` regeneration, shape, and timers | Before actions, monsters can heal, change shape, and tick status timers; species predicates and ordering control effects and PRNG. Catalog support is incomplete. | `js/mondata.js`, future `mon.c` distress owner | partial | `undecided` | C2 generated fields/predicates, then a source-owned distress commit. |
| 18 | `monmove.c:dochug()` phase 1: wait, sleep, status, and flee | Runs before movement for pets and ordinary monsters. The current catalog includes sleeping theme monsters, waiting Mausoleum monsters and a ghost, trap-frozen monsters, and scary-square flight. The reachable ordinary and starting-pet caller order is extracted in the worktree; current status recovery and wait/flee branches remain unsupported. Arrival, special response, and conflict-release callers require later state and are future work. | `js/monmove.js`; worktree `js/monmove_dochug.js` and `js/monmove_dochug_pet.js`; integration adapters remain in `js/monster_action.js` | confirmed gap | `missing` | Finish the current C14 pre-action phase without adding the future arrival/response/release catalogs. |
| 19 | `dochug()` phase 2: apparent hero, scary checks, defensive/miscellaneous actions, and wielding | Monsters choose apparent hero coordinates, react to scary squares, use reachable defensive or miscellaneous inventory, and decide whether to wield before movement/attack. The worktree callers own apparent-hero and scary-square ordering; current inventory use and wielding remain. Covetous tactics, demon/watch/mind-flayer actions, and other catalog-gated special actions are future work. | `js/monmove.js`, worktree `js/monmove_dochug.js` and `js/monmove_dochug_pet.js`, `js/weapon.js`, item-action owners | confirmed gap | `missing` | C11 weapon helpers, then finish the current C14 phase 2 and retain the strict scary-square batch. |
| 20 | `dochug()` phase 3: movement, ranged attack, and hero attack dispatch | The phase chooses mutually ordered movement, ranged, or melee action for active D:1 monsters and starting pets. Reachable ordinary and pet movement dispatch is extracted in the worktree; current ranged and hero attacks still stop explicitly. Spellcasters available only behind the Mausoleum wait boundary or excluded catalogs are future work. | Worktree `js/monmove_dochug.js` and `js/monmove_dochug_pet.js`, `js/mhitu.js`, ranged owners | confirmed gap | `missing` | C11 and C14 finish the current dispatch family; retain dormant and later-catalog spell dispatch in future work. |
| 21 | `monmove.c:m_move()` trapped/eating/hide/setup branches | Movement setup can release a trapped monster, continue eating, reveal/hide, or stop before candidate selection. Web, bear, and pit subsets exist. | `js/monmove.js`; temporary code in `js/monster_action.js` | partial | `undecided` | C13 trap primitives, then C14 `m_move()` setup extraction. |
| 22 | Item goals, doors, and ordinary obstacle handling | Reachable active D:1 species can select object goals or open doors instead of ordinary walking; explicit unsupported paths remain. Boulder breaking, covetous movement, tunneling, and shop/guard/priest movement have no eligible current caller and are future work. | Future `monmove.js` and subsystem owners | confirmed gap | `missing` | C14 closes current D:1 item goals and door handling after object and weapon prerequisites. |
| 23 | Path selection, tracking, trap avoidance, collisions, aggression, and displacement | Ordinary movement ranks squares using hero/monster tracks, trap knowledge, occupancy, aggression, and displacement. Common path selection and coordinate movement are extracted in the worktree; aggression/displacement still stop explicitly. | `js/track.js`, `js/monmove.js`, worktree `js/monmove_move.js` | partial | `undecided` | Finish C13 trap routing and C14 aggression/displacement candidate selection. |
| 24 | Normal movement and `postmov()` doors, traps, objects, and hiding | Chosen movement updates position and track, then applies door, trap, object, hiding, redraw, and message effects in source order. The ordinary coordinate update is extracted in the worktree; `postmov()` and its remaining door/object/hiding branches are not closed. | `js/monst.js`, `js/obj.js`, `js/monmove.js`, worktree `js/monmove_move.js`; `postmov()` integration remains in `js/monster_action.js` | partial | `undecided` | Existing placement plus C5/C13 prerequisites, then finish C14 `postmov()`. |
| 25 | `dogmove.c` hunger and inventory | A starting pet can become hungry, carry objects, select droppables, drop, or starve before/after movement. Ordinary carry/drop cases match; thresholds and special inventory effects remain. | `js/dogmove.js`, `js/moncarry.js`, `js/dogfood.js` | partial | `undecided` | C7-C9: carrying, food, then dog inventory/eating subcommit. |
| 26 | Pet goals and reachability | `dog_goal()` chooses hero, food, apport, and follow goals, subject to reachability and object safety. Artifact refusal and `do_clear_area()` traversal are complete; the full goal family is not. | `js/dogmove.js`, `js/track.js`, `js/moncarry.js`, `js/vision.js` | partial | `undecided` | C4/C7/C8 and the committed vision prerequisite, then C9 goals/reachability subcommit. |
| 27 | Pet candidate selection, trap/cursed-square avoidance, and scary-square flight | A pet ranks moves while avoiding known traps/cursed objects and reacts to a scare-monster scroll under the hero. The worktree connects `distfleeck()`/`monflee()`, preserves the next-command `rn2(40)` flee check, and extracts the pet caller into `monmove.c` ownership; a four-case strict seed-979597 batch passes after the split. Candidate-selection closure and a committed live owner remain open. | `js/dogmove.js`, `js/monmove.js`, worktree `js/monmove_dochug_pet.js` | worktree-covered subset | `undecided` | Finish C9 candidate logic, then retain seed 979597 in C17. |
| 28 | Starting-pet combat and displacement | Candidate selection can attack or displace a reachable monster. Those live consumers remain unsupported. The little dog, kitten, and pony have no ranged attack, and cannot attack the hero without a later conflict or altered-state source; those branches are future work. | `js/dogmove.js`, `js/mhitm.js` | confirmed gap | `missing` | C9 movement dispatch after the reachable C10 combat owner exists. |
| 29 | Pet movement, eating, dropping, and pickup execution | Once selected, a pet can move, eat, drop, or pick up, updating `edog`, floor objects, inventory, messages, and PRNG. Several exact cases match, including carried-gold drop; special floor/food effects remain. | `js/dogmove.js`, `js/dogfood.js`, `js/moncarry.js`, `js/obj.js` | partial | `undecided` | C5-C9, split so goals, inventory/eating, and active movement each stay under 500 production lines. |
| 30 | `dog.c`, `mon.c`, and object lifecycle: food, nutrition, consumption, corpse, carry, artifact, ownership, naming | Pet and combat paths classify and consume food, apply corpse effects, carry/split/stack objects, check artifacts, and name output. Non-hero artifact touch is complete at `3d33c40c0862755a1a989223128b649704bd2d75`; the combined family is not. | `js/dogfood.js`, `js/moncarry.js`, `js/obj.js`, `js/objnam.js`, `js/artifacts.js` | partial | `undecided` | C5-C8, retaining C1 artifact evidence and adding live food/corpse cases. |
| 31 | Monster trap immunity, avoidance, and routing | Species data and trap knowledge decide whether a monster avoids, resists, triggers, or escapes a trap while choosing/making a move. The generic `trap.c:mintrap()` selector is committed at `1f386ff4704a56ae3605f44507f8bebb211e9380`; trap/species routing and the live movement consumer are not closed. | `js/mondata.js`, `js/trap_monster.js`, and future `monmove.js` owners | partial | `undecided` | Finish C13 routing, then prove the C14 consumer with grouped strict cases. |
| 32 | Projectile, holding, and status trap effects on monsters | Arrow/dart/rock attacks, bear/pit/web holding, rust, sleep, anti-magic, and related status changes can occur before the prompt. Projectile, holding, sleep, squeaky-board, anti-magic, shared monster-item erosion, monster-carried light splashing, and forced monster-equipment water damage are committed; `mon.c:wake_nearto()` reaches the committed buried-zombie timer owner. Rust still needs its effect owner plus full live-consumer closure. | `js/trap_monster_projectiles.js`, `js/trap_monster_holding.js`, `js/trap_monster_shared.js`, `js/trap_monster_sleep.js`, `js/trap_monster_antimagic.js`, `js/trap_erode_obj.js`, `js/apply_splash_lit.js`, `js/trap_water_damage.js`, `js/mon.js`, `js/hack.js`, `js/artifacts.js`, and `js/mondata.js`; rust remains temporary in `js/monster_action.js` | partial | `undecided` | Finish the source-owned rust effect, then run grouped strict cases after the live C14 consumer is committed. |
| 33 | Magic/fire/item damage and ignition trap effects | D:1 magic traps can select ordinary or fire-burst outcomes, damaging monsters, armor, inventory, and floor objects in strict PRNG order. The `trap.c`, `zap.c`, `apply.c`, naming, and generic selector owners are committed, and seeds 962639 and 966115 match the live worktree consumer. The movement consumer remains uncommitted. | `js/trap_monster.js`, `js/trap_monster_fire.js`, `js/zap_destroy_items.js`, `js/apply_catch_lit.js`, and `js/do_name.js` | source owner complete; live closure pending | `undecided` | Commit the C14 movement consumer, then retain the grouped magic/fire batch as closure evidence. |
| 34 | Hole/trapdoor/teleport/migration and land mine | D:1 monster traps can relocate or migrate a monster or explode a themed-room land mine. Fixed/random teleport and stable-D:1 hole migration have a source-owned worktree module and focused tests. Random relocation now permits source-inert ordinary carried inventory while failing closed on carried shop state. Land mines remain current. Steeds, leashes, one-shot vault teleportation, and rolling-boulder traps are future work. | `js/teleport.js`, `js/monst.js`, worktree `js/trap_monster_relocation.js`; land-mine code remains temporary in `js/monster_action.js` | partial | `undecided` | Finish the current D:1 C13 relocation and land-mine family after C12 hurtling, then run grouped strict cases through the C14 consumer. |
| 35 | `mhitm.c` attack iteration, reachable contact/ranged/special attacks, and passives | Pet/monster encounters among the D:1 and starting-pet catalog iterate attack descriptors in source order and can invoke contact, ranged, special, and passive effects. Physical subsets have focused and fresh evidence. Statue-only attack methods are future work. | `js/mhitm.js` | partial | `undecided` | C10: reachable attack-loop commit followed by its passives and special effects. |
| 36 | `mhitm.c` damage, death, growth, corpse, knockback, collision, and retaliation | A reachable hit can damage or kill either monster, grow the attacker, create a corpse, knock back or collide, or trigger retaliation. Strict visible/blind seed 962576 covers one-square hurtling; remaining current-catalog branches are open. | `js/mhitm.js`, object/placement owners, future `dothrow.js` | partial | `undecided` | C10 reachable damage/death and knockback commits, then C12 hurtling owner. |
| 37 | `mhitu.c` apparent image, to-hit, weapons, reachable special damage, and hero death | A nearby D:1 monster can attack the hero or displaced image and can end the run before the prompt. Seed 971455 covers one armed miss and a focused hit covers weapon-die ordering; reachable damage types and death still stop explicitly. Statue-only damage types are future work. | `js/mhitu.js`, `js/weapon.js`, hero/termination owners | confirmed gap | `missing` | C11 weapon helpers and reachable `mhitu()` damage-type and termination matrices. |
| 38 | Messages, rendering, persistence, replay removal, input, and termination integration | Every family can affect ordered messages, full screen/attributes, cursor, saved state, replay ownership, next input, or termination. Current fresh cases cover subsets while second-turn replay remains. | `js/allmain.js`, live owners, `js/fastforward.js`, runner/test files | partial | `undecided` | C17 final integration and exact end-to-end validation at the committed head. |

## Explicit future work retained from the 38-family inventory

These paths are known gaps in the broader exploration objective, but their
first effect requires an input excluded from the current checkpoint. They do
not count toward current-goal readiness.

| Original family | Future boundary | Source authority | Why outside the current goal | Planned owner |
| ---: | --- | --- | --- | --- |
| 12 | Hero-triggered trap activation | `hack.c:spoteffects()`, `trap.c:dotrap()` | Current inputs must not activate `dotrap()`. | Future hero-trap checkpoint under trap and hero-state owners. |
| 13 | Hero trap relocation, living-statue animation, termination, and level transitions | `trap.c:dotrap()`, `teleport.c`, `makemon.c`, level-transition owners | Current inputs must remain on the stable level through the ending event. | Future hero-trap and level-transition checkpoints. |
| 13, 20, 22, 35-37 | Living-statue species and the additional spell, breath, engulfing, explosion, theft, seduction, poison, paralysis, petrification, rust, decay, hallucination, and other attack/effect branches they introduce beyond the current catalog | `trap.c` living-statue branch and `rndmonnum_adj(3, 6)`, then `monmove.c`, `mhitm.c`, and `mhitu.c` | The 105 difficulty-3-through-7 species become eligible only after excluded hero statue activation. | Future combat checkpoints after hero statue activation is live. |
| 13, 34 | D:2 generation and rolling-boulder traps | level-transition code, `trap.c` rolling-boulder branch | Rolling-boulder traps first become eligible after an excluded hero transition to D:2. | Future level-transition and D:2 trap checkpoints. |
| 10, 11, 15, 18, 19, 22, 34 | Ordinary shops, temples, swamps, shopkeepers, priests, vault guards, billing, and one-shot vault teleportation | `mklev.c`, `mkroom.c`, `invent.c`, `mon.c`, `monmove.c`, `trap.c` | Random shops require depth greater than 1, Twin businesses requires difficulty 4, and the other room and role gates are deeper still. The disconnected D:1 vault cannot create a guard or reach its one-shot teleport without excluded hero entry. | Future D:2-and-later room, shop, and role checkpoints. |
| 15, 18-20, 35-37 | Attack, speech, item-use, response, release, and spell branches of waiting Mausoleum monsters; contact-only combat for the isolated water-vault monster | `mon.c`, `monmove.c:dochug()`, `mhitm.c`, `mhitu.c` | Mausoleum actions first require clearing `STRAT_WAITFORU`; water-vault combat first requires leaving isolation and making contact after this checkpoint's ending event. Current upkeep, shape, wait gates, active inventory use, and reachable movement stay in the current table. | Future exploration or combat checkpoint that reaches and activates those monsters. |
| 18, 28, 34 | Pet arrival/wait strategies, teleport-capable flight, conflict or confusion attacks on the hero, ranged attacks, leashes, and steeds | `monmove.c:dochug()`, `dogmove.c:dog_move()`, `trap.c` | A new game has one little dog, kitten, or pony with no ranged attack, leash, mount, arrival state, conflict, or confusion source during two allowed commands. Sleep and ordinary trap status on that starting pet remain current. | Future pet-state and item-command checkpoints. |
| 19, 20, 22 | Covetous tactics, tunneling, boulder breaking, demon/watch/mind-flayer actions, and active spellcasting | `monmove.c:dochug()`, `monmove.c:m_move()` | No active current-goal monster satisfies those predicates. Mausoleum spellcasters stay behind their wait gate. | Future monster-movement checkpoint when an eligible caller is active. |
| 19, 20, 35-37 | Artifact and petrifying-corpse monster weapons, negative-AC and later hero-equipment branches, and later-catalog attack types | `weapon.c`, `mhitm.c`, `mhitu.c` | Initial D:1 generation and the two allowed commands cannot supply an artifact or petrifying corpse as a monster weapon, or produce the excluded hero equipment/state. Poisoned ordinary weapons remain current because trap-generated projectiles can supply them. | Future item-interaction and combat checkpoints with the first eligible source. |
| 32, 34, 36 | Boulder-filled monster pits, petrifying self-touch after a fall, and petrifying hurtle collisions | `trap.c`, `dothrow.c`, monster/object catalogs | D:1 cannot generate the rolling-boulder setup or a live petrifying monster/corpse source before this boundary. Ordinary pit holding, land mines, and non-petrifying hurtling remain current. | Future D:2 trap and petrifying-monster combat checkpoints. |
| — | Running, search commands, obstructed movement, doors, pickup commands, stairs, and later exploration inputs | Command handlers and their gameplay owners | The current valid inputs contain only waits and legal one-square moves. | Later exploration checkpoints after C17. |

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
10. **C10 — reachable `mhitm.c` in bounded commits:** attack iteration;
    damage/death and growth/corpses; passives/knockback/collision as line
    counts and source seams require. Statue-only attack methods remain future
    work.
11. **C11 — `weapon.c` monster weapon helpers, then reachable D:1
    `mhitu.c`.** Statue-only damage methods remain future work.
12. **C12 — `dothrow.c` hurtling and collision movement.**
13. **C13 — current D:1 `trap.c` in source-owned groups:** projectiles;
    holding; status; magic/fire/item damage; hole/teleport/migration; land
    mine. D:2-only rolling-boulder behavior remains future work.
    Projectiles are committed in `04898bab19eb3716ea73f956bf17a61de17d5ef1`.
    Holding traps are committed in
    `10e85bdd8801f59ef61e6e93fb362468099e870c`. Boulder-filled pits and
    dangerous-corpse self-touch have no D:1 source at this boundary and remain
    explicit future work. Sleeping-gas and squeaky-board effects plus
    `mon.c:wake_nearto()` are committed in
    `a624c4d499c305ffe0014fedaff2d3fbfb0fef51`. Anti-magic and stable-D:1
    relocation remain extracted in the worktree. The generic `mintrap()`
    selector is committed in
    `1f386ff4704a56ae3605f44507f8bebb211e9380`. Finish the remaining C13
    work in this order: rust with its source-owned water and lit-item helpers;
    stable-D:1 relocation; and land mines. Rust's shared monster-item erosion
    prerequisite is committed at
    `64087009e8265415c9f4f1e946996a84266a7be6`, and its monster-carried
    `apply.c:splash_lit()` prerequisite is committed at
    `f0fd81cb0e3c659054abf35e838a4ea89aea7db9`. Its forced
    monster-equipment `trap.c:water_damage()` path is committed at
    `ed1730ea4050be40d146444e0f924a84c81953bb`. Anti-magic is complete at
    `96a32c9e0f94e53427d083c7576543c22129c7b6`, with its `artifact.c` and
    `mondata.c` prerequisites at
    `0e5d6626ce00527f65cc375ab168cd41baca2b59` and
    `3871663d108410b1106442f3810030e7e24c3e11`. Connect these owners through
    the C14 movement consumer only after the owner commits pass their isolated
    checkpoints.
14. **C14 — reachable `monmove.c` in source-owned groups:** pre-action phases;
    ordinary movement; current item/door choices; and `postmov()`. This
    checkpoint connects scary-square `distfleeck()`/`monflee()` behavior. The
    ordinary and starting-pet `dochug()` callers plus ordinary `m_move()`
    selection are extracted in the worktree; `postmov()` and reachable
    sibling branches remain. Covetous, tunneling, boulder-breaking, and
    dormant-catalog special actions remain future work.
15. **C15 — elapsed-loop owners:** separate `allmain.c`, `timeout.c`,
    `light.c`, and `vision.c` commits, followed by turn-loop wiring. The
    behavior-preserving `allmain.c` extraction of shared fresh elapsed-turn
    upkeep is complete in
    `05c87bb0d718ee589a0c9ebe55f50e90fcb643c3`; second-turn dispatch and the
    remaining elapsed branches are still open.
16. **C16 — `hack.c:domove()` and non-trap `spoteffects()`.** Close the
    accepted checkpoint's non-trap spot effects here. The ordinary sighted
    `invent.c:look_here()` single-object branch is complete in
    `a61681496d5712aa17ddee750d1a72a5275ab627`, and destination
    `engrave.c:read_engr_at()` wiring is complete in
    `c36479c5f51decaf0477a29ba0f6a7913661a027`. The shared
    `hack.c:disturb_buried_zombies()` owner and heavy-tread `domove()` caller
    are complete in `c92c073976f192285d649b1a979d54b6b9d238f8`. The
    `check_special_room()` room-membership update is connected in
    `ab62aa2fb388aea112678130a6da9a8f7a00dc86`; current D:1 generation has
    no shop or message-producing special room, while deeper room effects
    remain with their first reachable consumers. Reachable terrain-status
    switching and visible physical-terrain memory are connected in
    `a2be24a9cf170e45441e4601127ba4770cd4b3d6`. Post-move engraving smudging
    is connected in `a2c0a1e355ea6271c5f59f5e634f2fabc517bb87`.
    Hero-triggered traps and hero level transitions remain explicit future
    exploration checkpoints.
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
3. C10-C12 resolve attack, hero-combat, and hurtling seams reachable from the
   D:1 and starting-pet catalog in families 28 and 35-37.
4. C13 resolves current D:1 monster-trap families 31-34 in grouped scanner
   batches. Boulder-filled pits, petrifying self-touch, and D:2 rolling
   boulders remain future work.
5. C14 resolves current-catalog monster action families 18-24, including
   strict seed 979597 for scary-square flight. Arrival/response/release,
   covetous, tunneling, boulder-breaking, dormant spellcasting, and deeper
   special-role actions remain future work.
6. C15 closes elapsed work and the pre-prompt turn loop in families 1-6 and
   14-17.
7. C16 closes non-trap movement spot effects. Hero `dotrap()`, statue
   animation, and level transitions are explicit future work and are not C16
   closure requirements.
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
  eight commits and 991 committed lines. No fresh second-turn differential
  is claimed until the live movement consumers commit.
- Checkpoint validation is automated in
  `84d8cc531e4cea61f8e796055c0d8e69408d8f49`: `npm run checkpoint --
  --focus <test>` runs the focused test, full suite, declared generated-data
  checks, and development score while preserving every result in its summary.
- Effective-Charisma pet apport is committed as
  `4cd8bbb23ebfad5d71ae142432f6151ec8ed98e8`; candelabrum light range is
  committed as `4dfccdd6444265a4865539dc96f6c63affa768eb`; and the remaining
  candelabrum, magic-lamp, and diluted-oil burn-source branches are committed
  as `61237dad85379671df77bd1901b0ed32c8ed6c47`. Their focused tests, exact
  full suites, and declared generated-data checks passed before commit.
- The C13 projectile-trap prerequisite is committed as
  `04898bab19eb3716ea73f956bf17a61de17d5ef1` with exactly
  `QUALITY.json`, `js/trap_monster_shared.js`,
  `js/trap_monster_projectiles.js`, and
  `scripts/trap-monster-projectiles.test.mjs`. Two focused tests, the exact
  1,388-test full suite, and all four generated-data checks pass.
- The C13 holding-trap prerequisite is committed as
  `10e85bdd8801f59ef61e6e93fb362468099e870c` with exactly
  `QUALITY.json`, `js/trap_monster_holding.js`,
  `js/trap_monster_shared.js`, and
  `scripts/trap-monster-holding.test.mjs`. Five focused tests, the exact
  1,393-test full suite, and all four generated-data checks pass. The
  production diff is 424 changed lines. The exact candidate quality gate is
  clear and world-effects is advisory at six commits and 935 changed lines.
  Boulder-fill floor effects and dangerous-corpse self-touch have no eligible
  current D:1 source and remain explicit future-owner seams.
- The first C15 `allmain.c` extraction is committed as
  `05c87bb0d718ee589a0c9ebe55f50e90fcb643c3` with exactly
  `js/allmain.js`. It moves the already-live fresh elapsed-turn upkeep into a
  shared source-owned helper without changing first-turn behavior. Seventeen
  focused turn-loop tests, the exact 1,394-test full suite, and all four
  generated-data checks pass. The exact candidate quality gate is clear at
  one startup commit and 110 changed lines. The fixed development set remains
  at 77,588 PRNG values, 205 screens, and 243 cursors; second-turn dispatch
  and the remaining elapsed-loop branches are still open.
- The C13 sleeping-gas and squeaky-board checkpoint is committed as
  `a624c4d499c305ffe0014fedaff2d3fbfb0fef51` with exactly
  `QUALITY.json`, `js/mon.js`, `js/trap_monster_sleep.js`,
  `scripts/mon.test.mjs`, and `scripts/trap-monster-sleep.test.mjs`.
  Thirty-six focused tests, the exact isolated 1,411-test full suite, and all
  four generated-data checks pass. The committed monsters and world-effects
  windows are due; the incomplete boundary stays in Implementation mode.
  Anti-magic and stable-D:1 relocation remain separated in worktree
  `trap.c`-owned modules. Anti-magic passes 6/6 and relocation passes 3/3.
  The anti-magic live adapter supplies its `mhitm.c` death owner, and random
  relocation permits ordinary carried inventory while retaining an explicit
  shop-state seam.
- The C13 `zap.c` fire-inventory prerequisite is committed as
  `04aef34ac83d20d036b3b71a68a6286d1f79d6a8` with exactly
  `QUALITY.json`, `js/do_name.js`, `js/zap_destroy_items.js`,
  `scripts/do-name.test.mjs`, and `scripts/zap-destroy-items.test.mjs`.
  Thirteen focused tests, the exact isolated 1,414-test full suite, and all
  four generated-data checks pass. A six-case strict live batch covering the
  current trap, pet-item, fixed-teleport, and scary-flight paths passes 6/6.
  The worktree `trap.c:mintrap()` selector has also been extracted to
  `js/trap_monster.js` and passes 4/4 focused tests. The fire-trap consumer,
  armor burning, and floor burning remain uncommitted, so this
  prerequisite does not close family 33.
- The current monster/floor subset of `apply.c:catch_lit()` is committed as
  `364e1f12c5fe9b06736c2c8686362ecb59d1146c` with exactly
  `QUALITY.json`, `js/apply_catch_lit.js`, and
  `scripts/apply-catch-lit.test.mjs`. Five focused tests, the exact isolated
  1,419-test full suite, and all four generated-data checks pass. The same
  six-case strict live batch passes after the extraction. Hero-inventory and
  shop billing branches remain outside the current non-trap boundary; the
  uncommitted caller fails closed there.
- The monster-caused subset of `zap.c:burn_floor_objects()` is committed as
  `2a1ebdf173adaec29c22d329295c5ed75d13beaf` with exactly
  `js/zap_destroy_items.js` and `scripts/zap-destroy-items.test.mjs`.
  Four focused tests, the exact isolated 1,421-test full suite, and all four
  generated-data checks pass. The same six-case strict live batch passes
  after wiring. This fixes the previously unexercised stale floor-removal
  call; hero-caused shop charging remains outside the current boundary.
- The monster branches of `trap.c` magic and fire traps are committed as
  `29ac6c82773fd9dc66ad0eaf16d191e0792d5691` with exactly
  `QUALITY.json`, `js/trap_monster_fire.js`, and
  `scripts/trap-monster-fire.test.mjs`. Four focused tests, the exact
  isolated 1,425-test full suite, and all four generated-data checks pass.
  The same six-case strict live batch passes after wiring. At that checkpoint,
  family 33's source owners were complete and the generic selector and live
  movement consumer remained uncommitted.
- The generic `trap.c:mintrap()` selector is committed as
  `1f386ff4704a56ae3605f44507f8bebb211e9380` with exactly
  `QUALITY.json`, `js/trap_monster.js`, and
  `scripts/trap-monster.test.mjs`. Four focused tests, the exact isolated
  1,429-test full suite, and all four generated-data checks pass. The same
  six-case strict live batch passes after wiring. Family 33 now waits only on
  the C14 movement consumer; routing variants in family 31 and the remaining
  C13 status and relocation owners stay open.
- The anti-magic `artifact.c:defends()` prerequisite is committed as
  `0e5d6626ce00527f65cc375ab168cd41baca2b59` with exactly
  `js/artifacts.js` and `scripts/artifacts.test.mjs`. Eight focused tests, the
  exact isolated 1,430-test full suite, and all four generated-data checks
  pass. Its `mondata.c` predicate and `trap.c` consumer remain uncommitted, so
  no fresh differential or family closure is claimed.
- The anti-magic `mondata.c:resists_magm()` prerequisite is committed as
  `3871663d108410b1106442f3810030e7e24c3e11` with exactly
  `js/mondata.js` and `scripts/mondata-magic-resistance.test.mjs`. Two focused
  tests, the exact isolated 1,432-test full suite, and all four generated-data
  checks pass. The `trap.c` consumer remains uncommitted, so no fresh
  differential or family closure is claimed.
- The monster branch of `trap.c:trapeffect_anti_magic()` is committed as
  `96a32c9e0f94e53427d083c7576543c22129c7b6` with exactly
  `QUALITY.json`, `js/trap_monster_antimagic.js`, and
  `scripts/trap-monster-antimagic.test.mjs`. Six focused tests, the exact
  isolated 1,438-test full suite, and all four generated-data checks pass.
  The six-case strict live batch also passes after wiring. Family 32 remains
  open for rust and the C14 movement consumer.
- The monster-inventory arm of `trap.c:erode_obj()` is committed as
  `64087009e8265415c9f4f1e946996a84266a7be6` with exactly
  `QUALITY.json`, `js/trap_erode_obj.js`, `js/trap_monster_fire.js`,
  `scripts/trap-erode-obj.test.mjs`, and
  `scripts/trap-monster-fire.test.mjs`. Nine focused tests, the exact isolated
  1,443-test full suite, and all four generated-data checks pass. The six-case
  strict live batch also passes after replacing the duplicate fire owner.
  Rust's effect owner remains open.
- The monster-carried arms of `apply.c:snuff_candle()`, `snuff_lit()`, and
  `splash_lit()` are committed as
  `f0fd81cb0e3c659054abf35e838a4ea89aea7db9` with exactly `QUALITY.json`,
  `js/apply_splash_lit.js`, and `scripts/apply-splash-lit.test.mjs`. Four
  focused tests, the exact isolated 1,447-test full suite, and all four
  generated-data checks pass. The fixed development set remains at 77,588
  PRNG values, 206 screens, and 243 cursors. The rust water-damage/effect
  owners and live movement consumer were uncommitted at that checkpoint, so
  no fresh second-turn claim was made.
- The forced monster-equipment arm of `trap.c:water_damage()` is committed as
  `ed1730ea4050be40d146444e0f924a84c81953bb` with exactly `QUALITY.json`,
  `js/trap_water_damage.js`, and `scripts/trap-water-damage.test.mjs`. Five
  focused tests, the exact isolated 1,452-test full suite, and all four
  generated-data checks pass. The fixed development set remains at 77,588
  PRNG values, 206 screens, and 243 cursors. No fresh second-turn claim is
  made until the rust effect and live movement consumer commit.
- The `hack.c:disturb_buried_zombies()` owner and its heavy-tread
  `hack.c:domove()` caller are committed in
  `c92c073976f192285d649b1a979d54b6b9d238f8`. The exact candidate passes 3/3
  focused tests, the 1,398-test full suite, and all four generated-data
  checks. The `mon.c:wake_nearto()` consumer is now committed with the C13
  sleeping-gas and squeaky-board effects above.
- The C16 room-membership wiring is committed in
  `ab62aa2fb388aea112678130a6da9a8f7a00dc86`, containing `js/cmd.js` and
  `scripts/rooms.test.mjs`. It places the existing
  `check_special_room_state(false)` subset after movement vision and before
  destination engraving and object handling. The exact candidate passes 8/8
  focused tests, the 1,399-test full suite, all four generated-data checks,
  and the quality gate. Development remains at 77,588 PRNG values, 206
  screens, and 243 cursors; no fresh screen gain is claimed because ordinary
  D:1 generation has no shop or other message-producing special room. After
  the temporary scanner's closed-door predicate was corrected to read the
  live `flags` union alias, a four-case strict fresh batch of
  doorway-to-corridor departures passed with no failure groups. The corrected
  full 995000-through-997999 discovery range completed 3,000/3,000 cases,
  including 70 legal room crossings.
- The C16 terrain-status checkpoint is committed in
  `a2be24a9cf170e45441e4601127ba4770cd4b3d6`. Source-owned
  `mkroom.c:cmap_to_type()` and `dungeon.c:update_lastseentyp()` now preserve
  physical and visible furniture-mimic terrain memory, while the live legal
  movement path runs the reachable `hack.c:switch_terrain()` status tail.
  The exact candidate passes 104/104 focused tests, the 1,402-test full suite,
  all four generated-data checks, and the quality gate. A three-case strict
  fresh batch covering fountain and sink status transitions passes 3/3 with
  no failure groups. Two mixed terrain cases still fail in later object and
  decoration effects and remain separate C16 work.
- The C16 engraving-smudge checkpoint is committed in
  `a2c0a1e355ea6271c5f59f5e634f2fabc517bb87`. The exact candidate passes
  53/53 focused tests, the 1,404-test full suite, all four generated-data
  checks, and the quality gate. Four strict fresh cases covering dust and
  carved engraving entry, departure, and wait combinations pass 4/4 with no
  failure groups. One additional carved-engraving case reaches an unresolved
  More/monster-action boundary before the C smudge call and remains C17
  integration evidence rather than a smudge failure.
- Strict fresh seed 980221 covers the live anti-magic adapter, seed 980409
  covers buried-zombie disturbance, and seed 981228 covers random relocation
  of a pony carrying its saddle; all three pass. The grouped discovery range
  980000 through 982999 passes all 3,000 cases after those fixes. The next
  grouped range, 983000 through 985999, also passes all 3,000 cases with no
  failure groups; seed 984786 uses a wait-wait fallback because its selected
  command family had no legal non-trap first move. The
  consolidated focused checkpoint passes 60/60; the full worktree suite passes
  1,504/1,504; and all four declared generated-data checks pass. Development
  reaches 77,890 PRNG values, 213 screens, and 251 cursors.
- These pieces are not yet commits: rust and broader relocation siblings
  remain open, and the affected monsters and world-effects areas have reached
  mandatory review thresholds while the milestone checklist still requires
  Implementation mode.
- The C14 worktree now separates ordinary `m_move()` into
  `js/monmove_move.js`, ordinary `dochug()` into `js/monmove_dochug.js`, and
  the starting-pet caller into `js/monmove_dochug_pet.js`. Their combined
  focused checkpoint passes 84/84; the full worktree suite passes
  1,500/1,500; and all four generated-data checks pass. The strict
  seed-979597 scary-square batch passes 4/4 with no failure groups after the
  split. Development remains at 205 screens and 243 cursors. These owner
  extractions remain uncommitted because the monsters area is beyond its
  mandatory review threshold while the milestone checklist still requires
  Implementation mode.
- The first C16 destination-object subcommit is
  `a61681496d5712aa17ddee750d1a72a5275ab627`, with exactly
  `js/invent.js`, `js/cmd.js`, and `scripts/objnam.test.mjs`. Ten focused
  tests, the exact 1,395-test full suite, and all four generated-data checks
  pass. A strict fresh first-move case enters a solitary object square and
  matches the complete C output. The fixed development set reaches 206
  screens while retaining 77,588 PRNG values and 243 cursors. Piles, pickup,
  terrain, blindness, and special-object branches remain open.
- The C16 destination-engraving wiring is
  `c36479c5f51decaf0477a29ba0f6a7913661a027`, containing only `js/cmd.js`.
  Eleven focused engraving tests, the exact 1,395-test full suite, and all
  four generated-data checks pass. An exact first-move engraving differential
  and four live second-turn engraving cases pass. Development remains at
  77,588 PRNG values, 206 screens, and 243 cursors.
- The full-range temporary scan of seeds 977100 through 979999 completed all
  2,900 cases: 2,899 passed and one grouped unsupported reason remained.
  The worktree fix was then checked with `scripts/scan-fresh.mjs`: four strict
  seed-979597 cases, including a legal north move onto the scare-monster
  scroll and a still-fleeing pony on command two, all pass. Broad discovery
  remains paused while this behavior is extracted from `monster_action.js`.
- The temporary scanner also completed seeds 986000 through 988999: all
  3,000 cases reached the boundary without an unsupported error and no
  command-family fallback was needed. It found both solitary-object and
  object-pile destinations for C16 grouping. This is discovery evidence, not
  a C/JavaScript parity claim.
- After correcting the scanner to reject secret terrain and ordinary iron
  bars, seeds 989000 through 991999 completed all 3,000 discovery cases
  without an unsupported error; two cases used command-family fallbacks. The
  batch found 14 engraving-entry cases and 120 object-entry cases for C16
  grouping. This is discovery evidence, not a parity claim.
- Seeds 992000 through 994999 completed all 3,000 discovery cases without an
  unsupported error or command-family fallback. A second full-range pass over
  seeds 980000 through 982999 prioritized legal destinations adjacent to
  active buried-zombie timers; all 3,000 cases completed without an
  unsupported error, but neither batch found such a destination. The
  hero-tread branch therefore has focused source-condition evidence but no
  claimed fresh live hit yet. The current worktree checkpoint passes 3/3
  focused tests, the full 1,506-test suite, and all four declared
  generated-data checks.
- Seeds 998000 through 1000999 completed all 3,000 discovery cases without an
  unsupported error; one case used a command-family fallback. The batch found
  120 object destinations, 12 engraving destinations, 79 special-terrain
  destinations, and 40 room crossings. Its special terrain was 53 fountains,
  11 sinks, 4 graves, and 11 altars. This is discovery evidence, not parity or
  proof that source-reachable themed ice, pool, lava, and region paths are
  covered.
- Converting the current 46-segment C17 recipe to a strict
  `scripts/scan-fresh.mjs` plan produces a 46/46 passing worktree batch with no
  failure groups. The final runner still needs `runFreshMatrix()`, the source
  families above remain open, and this batch does not close the checkpoint.

## Validation required at final integration

- Commit checked: Not yet available; implementation remains in progress.
- Source review: Recheck all 36 current-goal families and every reachable
  helper at the exact C17 head; confirm that each future-work path still
  requires an excluded input before its first effect.
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

Reason: Six current-goal families have confirmed missing behavior, 28 are only
partially implemented or proved, and second-turn replay remains. Hero-triggered
traps, level transitions, deeper room and role gates, later pet states,
D:2 rolling boulders, dormant themed-monster actions, and catalog-only combat
paths are explicit future work and do not count toward this checkpoint's
readiness.
