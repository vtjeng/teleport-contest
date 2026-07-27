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

**Status:** the simple second-command checkpoint is complete at validated code
commit `33523218ed285430300f14e725bf43928b8b65e1`. The recorded full
correctness pass covered the exact implementation range through `f97bd58`; its
six confirmed findings were applied through `ea815b9`. The required full
clarity pass then confirmed 15 exposition-only findings, all applied through
the validated handoff. The quality gate and advisory are clear.

The next implementation goal has not been selected. Choose another common
exploration boundary from the explicit future-work list below before adding
code; rare branches and helper-only prerequisites remain deferred under
“Complete common gameplay first.”

### Historical review sequence

The following paragraphs preserve the review and return-to-Implementation
sequence that produced the completed checkpoint.

The first review covered
`3b6c38de148679a5cc8313d755ec906fa95627c3..4cd8bbccf60cd6c792444c457a2f358660b552d9`.
The review confirmed seven production gaps and six test gaps in the active
checkpoint. Hero destination admission and monster goal/selection fixes are
committed at `dad2732` and `11a724d`; elapsed preflight and shared-RNG fixes
are committed at `3104b21`; wake and post-move notice behavior is committed at
`d327351`; the starting-pet result contract is committed at `c6de861`; and
replay step ownership is committed at `604caa2`. Source tracing of valid
starting ponies added two small prerequisites: exact admission of their inert
worn saddle at `c1e5f89`, and a preflight stop before unsupported pet
ranged-target scoring at `723da26`. The complete retry and strict matrix
oracle is committed at `9288ced`.

The second review of
`3b6c38de148679a5cc8313d755ec906fa95627c3..9288ced3372da17588cc70ec30cf2f3fe6302e25`
confirmed omitted source behavior and missing coverage in six branch families.
The active slice is back in Implementation. Rejected hero walks are completely
atomic at `daec422`, and the `monmove.c` line predicate is fixed at `419b7c1`.
The source-ordered ordinary-monster item-search selector and its unsupported
interaction boundary are committed at `aa7b9e4`. Source-ordered ordinary
monster movement accessibility output is committed at `f9f7ab6`. The pet goal
and seven-square target contracts are committed at `d1b07b9`. Complete
no-move notice ordering and starting-pet safe-stop coverage are committed at
`402d68d`. The final three-file integration oracle is committed at `4927b9a`.
The third review of
`3b6c38de148679a5cc8313d755ec906fa95627c3..b754646b7aec6cd2dc934845b41aa6183c7fe315`
confirmed two production gaps and six test or maintenance gaps. The active
slice is back in Implementation. The production gaps are source-selected
weapon handling and post-move object handling: inert capability, inventory, or
objects must not stop an otherwise ordinary move. The live-environment adapter
is committed at `60099e6`; source-selected pre-move item and weapon handling is
committed at `9dfa7f2` and `eb71e3d`; source-selected post-move object handling
is committed at `322b6b5`; and the complete retry snapshot plus focused pet
food and corridor coverage is committed at `bdf14d8` and `2d03208`. Fresh
comparison then exposed the later `dochug()` branch into
`mthrowu.c:thrwmu()`: complete read-only ranged-weapon selection and its atomic
unsupported-action stop are committed at `2ce30ba`. The final runner, fixture,
and integration-test bundle is committed at `fe906f7`. Its 17-case fresh
matrix covers the live simple second-command boundary, and the paired
integration test keeps selected trap and ranged-weapon exclusions retryable.

**Milestone objective:** Complete movement beyond the first unobstructed step,
then running, search, doors, traps, pickup, stairs, terrain effects, vision,
and status updates. The completed checkpoint below is the first source-closed
slice of that objective; the rest remains ordered future work.

**Completed implementation goal: Simple second command.** Starting at a
correctly generated first command prompt, accept two time-consuming commands
where each command is either a wait or a one-square walk onto ordinary clear
floor or corridor. Match through the prompt after the second command. During
elapsed work, ordinary initial D:1 monsters and the starting little dog,
kitten, or pony may move normally or stay put.

This checkpoint deliberately stops before any path that requires combat, trap
activation, teleportation or other relocation, a level change, item
interaction, a door or other special terrain interaction, or a monster
special ability. Those are explicit future work below. An excluded path must
fail closed before that elapsed branch changes gameplay state or consumes
gameplay PRNG. The segment runner retains the already-supported output, and
the pending elapsed phase remains retryable after its owner is implemented.

This goal closed after every family in
`.agents/implementation-checklist.md` was source-closed, focused and repository
validation passed, strict fresh comparisons reached the second prompt, the
committed range was reviewed, and the repository was clean.

**Implementation sequence:** The ordinary `monmove.c` move-or-stay owner,
starting-pet `dogmove.c` move-or-stay owner, atomic action adapter, and
`allmain.c` integration were committed as separate source-owned checkpoints.
The second-turn runner, fixture, and integration test were committed together
with the live integration. The audit follow-up is split by upstream owner:
hero destination admission; monster goal and displacement selection;
elapsed-turn preflight and cloned-RNG parity; wake and `notice_mon()`
post-move behavior; the starting-pet result contract; replay step ownership;
the inert starting-pony saddle admission; the pet ranged-target preflight;
then the complete retry and strict matrix oracles at `9288ced`. The second
audit follow-up is ordered as atomic hero command admission; the monster line
predicate; monster item-search selection; monster movement accessibility
output; pet goal and target contracts; no-move and pet safe-stop coverage; and
the final integration-oracle bundle. The third audit follow-up is ordered as
the live monster-action environment adapter; source-selected weapon handling;
post-move object selection; shared complete retry snapshots; pet-food and
corridor coverage; post-move ranged-weapon selection exposed by fresh
comparison; and one final runner, fixture, and integration-test bundle.
`js/monster_action.js` remains future work rather than a combined movement,
trap, object, and combat owner. The detailed source inventory, safe-stop
seams, checkpoints, and evidence live in
`.agents/implementation-checklist.md`.

This checkpoint establishes the general active-monster and later-turn replay
boundary needed by multi-step exploration. The historical 302-to-204
development-score drop at
`68472ba3aa99786e5c3e01f4407b07bc853ea89b` intentionally removed matches
earned after those behaviors became unowned; do not recover that credit by
relaxing the fail-closed boundary.

**Explicit future exploration work, outside the completed goal:**

- Hero or monster combat, including attacks, retaliation, monster-initiated
  displacement, knockback, damage, death, corpses, weapon selection, ranged
  attacks, spells, passives, and special damage.
- Hero- or monster-triggered traps, including holding, projectiles, status,
  magic, fire, land mines, teleportation, holes, trapdoors, migration, and
  living-statue effects.
- Hero or monster relocation and every level transition, including deferred
  transitions, D:2 generation, and rolling-boulder traps.
- Objects and inventory behavior, including automatic pickup, pet food and
  fetching, monster pickup, equipment, naming, billing, and object damage.
- Regions, engravings, ice, pools, lava, fountains, sinks, graves, altars,
  gas clouds, liquid effects, and every other special-terrain or room effect.
- Closed, locked, trapped, broken, or obstructing doors; tunneling; boulder
  breaking; iron bars; and other non-clear destination handling beyond a
  no-time refusal against wall or rock.
- Special monster movement or actions, including hiding, shapechanging,
  covetous tactics, fleeing teleportation, conflict, watch or quest behavior,
  speech, item use, and themed-room monster behavior beyond an inert wait.
- Pet states beyond an ordinary active starting pet, including eating,
  carrying, leashes, steeds, arrival or wait strategies, conflict, confusion,
  stun, fear, ranged attacks, and combat.
- Running, search, force-fight, travel, pickup commands, stairs, and all
  commands other than waiting or a one-square walk.

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
tracing materially changes dependencies. Keep completed boundary and score
snapshots in `SCORE.md`; keep formal-pass metadata and review frontiers in
`QUALITY.json` and the retained pass reports.
