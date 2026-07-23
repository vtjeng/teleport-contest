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

The boundary survey found no remaining reachable gap, the checked-in 107-case
matrix reached the first command exactly, the correctness ledger and audit-fix
tail are clear, and the final quality gate passes. Detailed validation and
score evidence remain in `SCORE.md` and `QUALITY.json`.

## Current milestone: first complete gameplay turn

**Status:** in progress.

**Goal:** Starting at a correctly generated first command prompt, match the C
game through the next command prompt after either waiting or making one
unobstructed move. Replace the temporary playback used during those turns with
the corresponding behavior translated from the upstream source.

This boundary includes the ordinary monster and starting-pet actions and normal
per-turn changes reached before the game next asks for input. Combat, opening
doors, triggering traps, pickup, stairs, item commands, and movement beyond the
single unobstructed step remain in later milestones unless the current boundary
directly requires a shared prerequisite.

Remaining work:

- Complete and connect the ordinary initial-level monster and pet behavior
  reached during the turn.
- Replace each part of the temporary `fastforward.js` playback once the
  translated behavior performs the same work. Do not extend or retune the
  playback.
- Make waiting and one unobstructed move reach the next input prompt without a
  fallback or unsupported branch.

Close the milestone with a checked-in fresh differential matrix. Vary inputs
that affect the turn, including independently chosen seeds and level layouts,
pet configuration, relevant character state, and both commands. Cover ordinary
cases and source-identified rare branches within the boundary, including cases
where a monster acts and where it does not. Require exact random-number logs,
complete screens and attributes, cursors, and the state used by the next input
cycle. The covered paths must no longer use temporary playback. Finish the
focused and full tests, quality work, score evidence, and any review required by
`AGENTS.md` before marking the milestone complete.

## Later milestones

Proceed in source-dependency order, using earliest fresh divergence to choose
between equally reusable candidates:

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
