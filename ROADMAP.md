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

**Active implementation goal: Second stable-level non-trap command.** Starting
at the first command prompt, match through the prompt or termination after any
two waits or legal one-square moves. Entering objects, regions, engravings,
ice, pools, lava, fountains, sinks, graves, altars, and other passable terrain
remains in scope. So do automatic pickup, same-level relocation, or termination
caused by those non-trap paths. The entered hero square must not activate
`trap.c:dotrap()`, and the hero must not change levels before the ending
boundary. Monster-triggered traps, themed D:1 monster upkeep and movement, and
termination from in-scope monster actions remain in scope.

This named checkpoint is the complete current goal. It closes only when every
current-goal family in `.agents/implementation-checklist.md` is source-closed
and the final fresh comparison matrix passes at the committed integration
head. The future-work paths below are retained as known gaps in the broader
exploration milestone, but do not block this checkpoint.

This checkpoint establishes the general active-monster and later-turn replay
boundary needed by multi-step exploration. The historical 302-to-204
development-score drop at
`68472ba3aa99786e5c3e01f4407b07bc853ea89b` intentionally removed matches
earned after those behaviors became unowned; do not recover that credit by
relaxing the fail-closed boundary.

**Explicit future exploration work, outside the active goal:**

- Hero-triggered traps, including teleport and living-statue effects.
- Hero level transitions, D:2 generation, and rolling-boulder traps.
- The broader monster and combat catalogs introduced only by those excluded
  trap and transition paths.
- Combat, spellcasting, item use, speech, and special movement whose first
  eligible caller is a still-waiting Mausoleum monster or a deeper-level
  shopkeeper, priest, guard, covetous monster, tunneler, or boulder breaker.
  Contact-only combat for the isolated water-vault monster is also future;
  its current upkeep, shape, inventory use, and reachable movement are not.
- Mounted, leashed, arriving, conflicted, confused, or ranged-pet behavior
  that cannot arise for the starting pet during two waits or legal moves.
- Artifact and petrifying-corpse monster weapon paths, petrifying hurtle
  collisions, and boulder-filled monster pits, none of which has an eligible
  object or monster source at this D:1 boundary.
- D:1-ineligible shops and room types, including their billing, guard, priest,
  swamp, and one-shot vault-teleport behavior. D:1 themed pools, lava, ice,
  gas regions, and passable room features remain current work.
- Running, search commands, obstructed movement, doors, pickup, stairs, and
  other exploration commands beyond the current two-command checkpoint.
  Automatic pickup caused by an in-scope move remains current work.

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
