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

**Selected goal: repeated simple commands.** Starting at a correctly generated
first command prompt, accept an unbounded sequence of single-keystroke commands
on D:1, each either a wait or a one-square walk, and match through the prompt
after every command. Walk destinations in scope are an unoccupied object-free
ordinary clear square, a `test_move()` refusal against wall or rock that
consumes no time, a swap with an ordinary active starting pet, and a square
whose objects only produce a floor description. Ordinary D:1 monsters,
including ones generated part-way through the sequence, and the starting little
dog, kitten, or pony may move normally or stay put.

Excluded: the future-work list below, count prefixes, running, travel, every
other command, pickup, hero traversal of active doorways, and
monster-initiated displacement of the hero. Each excluded path fails closed
before any gameplay state change or PRNG consumption, preserving the supported
prefix and leaving the pending phase retryable.

The two structural replay conditions are complete: `js/fastforward.js` is gone
at `263540f`, and the turn-index special cases in `moveloop_core()` are gone at
`9afade25`. Periodic attribute upkeep now restores the long-run PRNG order.
Natural runtime monster generation, doorless-doorway movement, the move-600
safe-wait tail, wall and stone refusal, ordinary and immediately fleeing
starting-pet interaction, sighted and blind single-object description, and the
HUNGRY-to-WEAK transition all match the checked-in eleven-case matrix through
`f509366`. That matrix covers 64,581 PRNG calls and 1,750 complete screens,
attributes, and cursors. The pre-audit boundary inventory had no remaining
missing or undecided row, but the full review through `7892b21` reopened
implementation with four live source gaps: weakness-driven encumbrance,
move-600 basal luck, the one-billion-turn termination, and trapped-monster
prologue admission. The same review identified six evidence and tooling gaps.
All ten findings from that review were implemented at `e30ea05`. The next full
review confirmed six production defects plus test, tooling, and handoff gaps;
their implementation is complete and the repository checkpoint is green at
1,668 tests. The twelve-case fresh matrix remains exact across 83,269 PRNG
calls and 2,351 complete screens, attributes, and cursors. The goal does not
close at a particular score. The second full re-audit reopened five focused
production and oracle rows; `.agents/implementation-checklist.md` is again the
active handoff. Rare branches and helper-only prerequisites remain deferred
under “Complete common gameplay first.”

### Unreviewed commits behind a review frontier

A review frontier is the latest commit a recorded correctness pass covers;
`npm run quality` treats everything behind it as reviewed. Until `5e7fb47`,
`npm run quality -- record-review` derived each area's frontier from the stored
ledger and took the audited commit range only as free-text `evidence`, which it
checked for non-emptiness and never parsed, so a pass could advance a frontier
past commits its reviewers never read. `5e7fb47` now requires `--range` and refuses a base that falls after
any claimed area's frontier, so this cannot recur. It cannot repair the existing
ledger, because `validateHistory` fails when a recorded base is not the stored
frontier and passes are therefore append-only in effect.

Sixteen recorded review passes advanced at least one area's frontier past the
base of the range they audited. Eleven commits changed area-owned production
code inside those gaps. Six of the eleven are debt; the other five are exempt
for the reasons below. Line counts are the production lines
`scripts/quality-status.mjs` charges to the area: its `js/` paths plus its
generator scripts, less its declared generated outputs.

| Commits | Area | Lines | Why the audit never read them |
| --- | --- | --- | --- |
| `5affc31` | monsters | +56/-42 | The pass recorded at `e30ea05` set the monsters base to `d29414a` but audited `3c552b45..e30ea05`, seven commits later. `5affc31` also carries `Audit-fix-for: d29414ad`. |
| `f8911ff`, `f2de7a7` | startup | +37/-12 | The same pass set the startup base to `f97bd58`, 29 commits before its audited base. |
| `84964f8` | commands | +6/-3 | The same 29-commit gap. It also carries `Audit-fix-for: f97bd58`. |
| `54a2b86`, `4607698` | hero | +133/-4 | The pass recorded at `f97bd58` moved the hero frontier up from `f140abf` while auditing only `3b6c38d..f97bd58`, a 221-commit gap. `4607698` also carries `Audit-fix-for: 10dd52be`. |

Those six commits total 232 added and 61 removed production lines. Three of them
are audit-fix commits, which `.agents/quality-workflow.md` keeps as correctness
debt until a later correctness pass covers them.

The remaining five commits in the same gaps need no pass of their own:

- `8677023` adds 245 runtime lines to `js/hacklib.js`. It is a bulk port of
  `hacklib.c` pure functions, which "Port pure functions in bulk" in `AGENTS.md`
  and the correctness thresholds in `.agents/quality-workflow.md` exempt from
  triggering a pass. `scripts/hacklib-strings.test.mjs` pins each ported
  function to values read from the C source.
- `17b1fb0`, `d8ab43c`, `5626cf0`, and `f3ebcc2` carry `Score-identical-with`
  trailers: 680 added and 152 removed monsters lines, plus 1 added and 1 removed
  in startup, 41 added and 2 removed in commands, and 2 added and 1 removed in
  runtime. `npm run quality` already subtracts them from the gate and reports
  them as relocated lines.

Clear the six debt commits at the next milestone rather than scheduling a
re-audit now. Give the next full correctness pass in each area a `--range` base
at or before that area's oldest debt commit: `d29414a` for monsters, `f97bd58`
for startup and commands, and `f140abf` for hero. The recorder accepts a base at
or before the stored frontier, so this re-reads commits an earlier pass already
covered and needs no ledger edit. One pass claiming all four areas has to start
at the oldest of those bases, `f140abf`; recording each area group separately
keeps each range smaller. Recording those passes clears these rows and the
audit-fix debt on `5affc31`, `84964f8`, and `4607698`.

This accounting covers the passes recorded after the 21 unstructured passes that
`legacyPassCount` in `QUALITY.json` names. Those earlier passes record no
per-area ranges, and `.agents/quality-workflow.md` keeps historical `BASELINE`
debt exempt until each area's first recorded pass.

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

This goal closed after every family in the then-active implementation checklist
was source-closed, focused and repository validation passed, strict fresh
comparisons reached the second prompt, the committed range was reviewed, and
the repository was clean.

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
seams, checkpoints, and evidence are preserved in the checklist commits.

This checkpoint establishes the general active-monster and later-turn replay
boundary needed by multi-step exploration. The historical 302-to-204
development-score drop at
`68472ba3aa99786e5c3e01f4407b07bc853ea89b` intentionally removed matches
earned after those behaviors became unowned; do not recover that credit by
relaxing the fail-closed boundary.

### Measured ordering for the next exploration slice

Where each development session first stops, measured on 2026-07-28 by
instrumenting scratch copies of `js/jsmain.js` and the frozen runner inside a
scoring workspace. The scorer's `screens.matched` is a total, not a prefix
length, so the first mismatching index was computed separately; for all 33
sessions the two agree, which is what makes the attribution below sound.

| Sessions | Stop reason |
| --- | --- |
| 27 | an unsupported command |
| 5 | `door or special terrain movement` |
| 1 | `pet object pickup` |

The 27 command stops break down by keystroke as `#`x7, `L`/`H`/`K`x6, `s`x4,
`i`x2, `Ctrl-V`x2, and one each of `m`, `a`, `:`, `Z`, `q`, `y`, and Space.

The five terrain stops are the better next slice, because the sessions blocked
on them continue with long runs of ordinary movement, while the four `s`
sessions immediately reach `#ride`, `#twoweapon`, and `#wizwish`. By
destination terrain they are:

- `STAIRS`, three sessions, one of which has 409 screens;
- a doorless doorway (`DOOR` with `D_NODOOR`), one session;
- an open doorway (`DOOR` with `D_ISOPEN`), one session.

So the next slice is hero movement onto stairs and non-blocking doorways.
`requireSimpleHeroDestination()` in `js/hack.js` currently rejects every
destination that is not `ROOM` or `CORR`, even though the starting-pet swap
seam beside it already admits a `D_NODOOR` doorway. Running (`L`, `H`, `K`,
six sessions) and search (`s`, four sessions) follow; `dosearch0(1)` is already
ported, and the explicit command needs only `mfind0()` and
`unmap_invisible()` plus the `aflag == 0` branches.

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
  stun, fear except for the source-bounded continuation after this milestone's
  safe-pet refusal, ranged attacks, and combat.
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
