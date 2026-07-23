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

## Current milestone: first complete gameplay turn

**Status:** in progress.

**Goal:** Starting at a correctly generated first command prompt, match the C
game through the next command prompt after either waiting or making one
unobstructed move. Replace the temporary playback in `fastforward.js` used
during those turns with the corresponding behavior translated from the
upstream source.

This boundary includes the ordinary monster and starting-pet actions and normal
per-turn changes reached before the game next asks for input. Combat, opening
doors, triggering traps, pickup, stairs, item commands, and movement beyond the
single unobstructed step remain in later milestones unless the current boundary
directly requires a shared prerequisite.

**Current focus:** Complete and connect the ordinary initial-level monster and
pet behavior reached during the turn.

Close the milestone with a checked-in fresh differential matrix that:

- varies inputs that affect the turn, including seeds that produce different
  layouts, pet configuration, relevant character state, and both commands;
- covers ordinary cases and rare branches identified in the C source within
  this boundary, including cases where a monster acts and where it does not;
- exactly matches random-number logs, complete screens and attributes, cursors,
  and game state at the next prompt; and
- reaches that prompt without temporary playback, a fallback, or an unsupported
  branch.

Meet the validation, quality, review, and score-recording requirements in
`AGENTS.md` before marking the milestone complete.

## Later milestones

After the current milestone, proceed in this order:

1. **Exploration:** complete movement beyond the first unobstructed step,
   running, search, doors, traps, pickup, stairs, terrain effects, vision, and
   status updates.
2. **Combat and creatures:** complete melee, damage and death, the remaining
   monster and pet behavior, monster inventory, conditions, and common creature
   abilities.
3. **Item interaction:** inventory commands and menus, wield/wear, eat/quaff,
   read/zap, apply, throw, drop, identification, and equipment effects.
4. **Levels and persistence:** level transitions, deeper and special levels,
   save/restore, bones, and cross-segment state.
5. **Long tail:** shops, advanced spells and effects, rare monsters and items,
   endgame branches, and remaining valid commands and options.

Update statuses and unresolved ordering here when a milestone closes or source
tracing materially changes dependencies. Keep completed validation detail in
`SCORE.md` and the quality ledger rather than duplicating it here.
