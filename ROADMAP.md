# Source-faithful port roadmap

This file records milestone order and unresolved work. `AGENTS.md` remains the
authority for implementation, validation, holdout, quality, and attribution
rules. `SCORE.md` records completed evidence; it is not a prospective backlog.

## Completed milestone: arbitrary new game to first command

**Status:** complete at production commit
`f0624a759f50fbf061ab7e48ff7e83a08ea57ef1`, with the final test-only follow-up
at `82615f42653158d8074f3903e7d2087545ffe05f`.

**Goal:** For arbitrary valid seeds, datetimes, character configurations, and
startup options, match the C recorder's random-number log, terminal screens,
attributes, and cursor through the first command prompt.

## Completed milestone: first complete gameplay turn

**Status:** complete at code commit
`3b6c38de148679a5cc8313d755ec906fa95627c3`.

**Goal:** Starting at a correctly generated first command prompt, match the C
game through the next command prompt after either waiting or making one
unobstructed move. Replace the temporary playback in `fastforward.js` used
during those turns with the corresponding behavior translated from the
upstream source.

## Current milestone: exploration

**Status:** in progress.

**Milestone objective:** Complete movement beyond the first unobstructed step,
then running, search, doors, traps, pickup, stairs, terrain effects, vision,
and status updates. The active checkpoint below is the only current
implementation goal; the rest of the exploration objective remains ordered
future work.

**Active implementation goal: Simple second command.** Starting at a correctly
generated first command prompt, accept two time-consuming commands where each
command is either a wait or a one-square walk onto ordinary clear floor or
corridor. Match through the prompt after the second command. During elapsed
work, ordinary initial D:1 monsters and the starting little dog, kitten, or
pony may move normally or stay put.

This checkpoint deliberately stops before any path that requires combat, trap
activation, teleportation or other relocation, a level change, item
interaction, a door or other special terrain interaction, or a monster
special ability. Those are explicit future work below. An excluded path must
fail closed before changing gameplay state or consuming gameplay PRNG so the
same input can be retried after its owner is implemented.

The active goal closes only when every current family in
`.agents/implementation-checklist.md` is source-closed, focused and repository
validation passes, several strict fresh comparisons reach the second prompt,
the committed range is reviewed, and the repository is clean.

**Current implementation sequence:** Commit the ordinary `monmove.c`
move-or-stay path, then the starting-pet `dogmove.c` move-or-stay path, then
the `allmain.c` second-command integration and replay removal. Commit the
second-turn runner, fixture, and integration test together only with the final
integration. Keep each implementation commit below the review-size limit and
keep functions with their upstream subsystem; do not turn
`js/monster_action.js` into a combined movement, trap, object, and combat
owner. The detailed source inventory, safe-stop seams, checkpoints, and
evidence live in `.agents/implementation-checklist.md`.

This checkpoint establishes the general active-monster and later-turn replay
boundary needed by multi-step exploration. The historical 302-to-204
development-score drop at
`68472ba3aa99786e5c3e01f4407b07bc853ea89b` intentionally removed matches
earned after those behaviors became unowned; do not recover that credit by
relaxing the fail-closed boundary.

**Explicit future exploration work, outside the active goal:**

- Hero or monster combat, including attacks, retaliation, displacement,
  knockback, damage, death, corpses, weapon selection, ranged attacks, spells,
  passives, and special damage.
- Hero- or monster-triggered traps, including holding, projectiles, status,
  magic, fire, land mines, teleportation, holes, trapdoors, migration, and
  living-statue effects.
- Hero or monster relocation and every level transition, including deferred
  transitions, D:2 generation, and rolling-boulder traps.
- Objects and inventory behavior, including automatic pickup, floor
  descriptions, pet food and fetching, monster pickup, equipment, naming,
  billing, and object damage.
- Regions, engravings, ice, pools, lava, fountains, sinks, graves, altars,
  gas clouds, liquid effects, and every other special-terrain or room effect.
- Closed, locked, trapped, broken, or obstructing doors; tunneling; boulder
  breaking; iron bars; and other non-clear destination handling.
- Special monster movement or actions, including hiding, shapechanging,
  covetous tactics, fleeing teleportation, conflict, watch or quest behavior,
  speech, item use, and themed-room monster behavior beyond an inert wait.
- Pet states beyond an ordinary active starting pet, including eating,
  carrying, leashes, steeds, arrival or wait strategies, conflict, confusion,
  stun, fear, ranged attacks, and combat.
- Running, search, obstructed movement, force-fight, travel, pickup commands,
  stairs, and all commands other than waiting or a one-square clear walk.

Several source-faithful helpers for these future families are already
committed. They remain preserved prerequisites, but their existence does not
make their live behavior part of the active checkpoint.

## Later milestones

After the current milestone, proceed in this order:

1. **Combat and creatures:** complete melee, damage and death, the remaining
   monster and pet behavior, monster inventory, conditions, and common creature
   abilities.
2. **Item interaction:** inventory commands and menus, wield/wear, eat/quaff,
   read/zap, apply, throw, drop, identification, and equipment effects.
3. **Levels and persistence:** level transitions, deeper and special levels,
   save/restore, bones, and cross-segment state.
4. **Long tail:** shops, advanced spells and effects, rare monsters and items,
   endgame branches, and remaining valid commands and options.

Update statuses and unresolved ordering here when a milestone closes or source
tracing materially changes dependencies. Keep completed validation detail in
`SCORE.md` and the quality ledger rather than duplicating it here.
