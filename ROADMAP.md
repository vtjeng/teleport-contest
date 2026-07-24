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

**Goal:** Complete movement beyond the first unobstructed step, running,
search, doors, traps, pickup, stairs, terrain effects, vision, and status
updates.

**Current focus:** Extend source-faithful turn ownership past the completed
first turn, beginning with the general active-monster and later-turn replay
boundary needed by multi-step exploration. The historical 302-to-204
development-score drop at
`68472ba3aa99786e5c3e01f4407b07bc853ea89b` intentionally removed matches
earned after those behaviors became unowned; do not recover that credit by
relaxing the fail-closed boundary.

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
