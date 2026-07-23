# Source-faithful port roadmap

This file records milestone order and unresolved work. `AGENTS.md` remains the
authority for implementation, validation, holdout, quality, and attribution
rules. `SCORE.md` records completed evidence; it is not a prospective backlog.

## How to choose work

Keep one active implementation frontier. Order work by source dependencies and
reuse, not by isolated development-screen gains or the next convenient fixture.
A coherent chunk should accomplish at least one of these:

- remove a reachable fallback or trace-derived replay path;
- advance the earliest fresh C-versus-JavaScript differential past a source
  boundary;
- complete a source-shaped primitive or subsystem used by multiple production
  callers.

When the next mismatch exposes broad prerequisites, make the prerequisite a
bounded subsystem chunk and finish it before returning to the frontier. Do not
patch around it or leave multiple partially integrated approaches. Use
development recordings as regressions and fresh recordings to validate general
behavior. Treat matched-screen count as a lagging indicator.

## Completed milestone: arbitrary new game to first command

**Status:** complete at production commit
`f0624a759f50fbf061ab7e48ff7e83a08ea57ef1`, with the test-only audit-fix tail
closed at `82615f42653158d8074f3903e7d2087545ffe05f`.

**Goal:** For arbitrary valid seeds, datetimes, character configurations, and
startup options, match the C recorder's PRNG log, terminal screens, attributes,
and cursor through the first command prompt.

Work in this order:

1. Close the in-flight Cloud/Storeroom implementation and its formal review,
   validation, quality record, and score evidence without expanding its scope.
2. Port the general initial-generation monster lifecycle needed by Statuary,
   including source-order random placement, inventory and equipment effects,
   side objects, removal/detachment, and reachable form-specific behavior.
3. Complete Statuary using that lifecycle; do not add a room-specific shortcut.
4. Port shared room-construction and nesting primitives required by the direct
   themed-room handlers, then complete those handlers in dependency families.
5. Enable the source optional-fill behavior for map-based themed rooms through
   the same fill dispatcher.
6. Remove the staged initial-generation fallbacks once their source paths are
   implemented.
7. Validate the closed milestone with focused and full tests plus fresh
   differentials spanning every themed fill and direct handler, varied seeds,
   all valid role/race combinations, genders, alignments, datetimes, and
   startup/display options.

Exit only when no known valid initial-generation path relies on a fallback,
fixture-specific replay, or unsupported source branch, and broad fresh
differentials reach the first command prompt exactly. Follow the quality and
score-recording requirements in `AGENTS.md` before marking the milestone done.

The boundary survey found no remaining reachable gap, the checked-in 107-case
matrix reached the first command exactly, the correctness ledger and audit-fix
tail are clear, and the final quality gate passes. Detailed validation and
score evidence remain in `SCORE.md` and `QUALITY.json`.

## Current milestone: one source-faithful command turn

**Status:** in progress.

Replace the per-step replay scaffold with the real source turn spine:

1. Port command decoding, counts, movement intent, and turn-consumption state.
2. Port `moveloop_core()` ordering, timeouts, regeneration, hunger, vision,
   status, and other per-turn state changes.
3. Port the monster and pet movement needed by an ordinary initial-level turn.
4. Make wait/no-op and one ordinary movement command match end to end, including
   PRNG, messages, screen, cursor, and resulting state.
5. Remove the corresponding obsolete `fastforward.js` calls.

## Later milestones

Proceed in source-dependency order, using earliest fresh divergence to choose
between equally reusable candidates:

1. **Exploration:** complete movement, running, search, doors, traps, pickup,
   stairs, terrain effects, vision, and status updates.
2. **Combat and creatures:** melee, damage and death, monster AI, pets, monster
   inventory, conditions, and common creature abilities.
3. **Item interaction:** inventory commands and menus, wield/wear, eat/quaff,
   read/zap, apply, throw, drop, identification, and equipment effects.
4. **Levels and persistence:** level transitions, deeper and special levels,
   save/restore, bones, and cross-segment state.
5. **Long tail:** shops, advanced spells and effects, rare monsters and items,
   endgame branches, and remaining valid commands and options.

Update statuses and unresolved ordering here when a milestone closes or source
tracing materially changes dependencies. Keep completed validation detail in
`SCORE.md` and the quality ledger rather than duplicating it here.
