# Source-faithful port roadmap

This file records the open goal, the goals selected after it, and unresolved
debt. `AGENTS.md` remains the authority for implementation, validation,
holdout, quality, and attribution rules.

A closed milestone or goal is deleted from this file when it closes. Its score
evidence stays in `SCORE.md`, its review metadata in `QUALITY.json` and the
retained pass reports, and its implementation history in Git. Keeping only open
work here is deliberate: every task starts by reading this file, so it has to
stay short enough to read.

## How the next goal is chosen

`node scripts/scan-stops.mjs` reports where each development session first
stops, censused by fail-closed boundary and by the command the port refused.
The loop is:

1. Run the scan. Each boundary names an upstream owner a goal could port.
2. Select a goal, trace it to its C functions, and record its boundary and its
   exclusions here.
3. Implement from the C source. The scan says where to look; it never says what
   the behavior is.
4. Re-run the scan. The change in emitted screens is that goal's measured
   result, and the new census selects what follows.

The recorded steps standing behind a boundary are a ceiling on what a goal can
earn, never a forecast: a session blocked on one owner routinely blocks again
on another. `.agents/validation.md` holds the full rule.

## Current milestone: exploration

**Objective:** movement beyond the first unobstructed step, then running,
search, doors, traps, pickup, stairs, terrain effects, vision, and status
updates.

### Open goal: repeated simple commands

Starting at a correctly generated first command prompt, accept an unbounded
sequence of single-keystroke commands on D:1, each either a wait or a one-square
walk, and match through the prompt after every command. Walk destinations in
scope are an unoccupied object-free ordinary clear square, a `test_move()`
refusal against wall or rock that consumes no time, a swap with an ordinary
active starting pet, a square whose objects only produce a floor description,
`STAIRS`, and a `DOOR` that is not closed, locked, or trapped. Ordinary D:1
monsters, including ones generated part-way through the sequence, and the
starting little dog, kitten, or pony may move normally or stay put.

Excluded: the future-work list below, count prefixes, running, travel, every
other command, pickup, a diagonal entry into a doorway that is not doorless,
every closed, locked, or trapped door, and monster-initiated displacement of
the hero. Each excluded path fails closed before any gameplay state change or
PRNG consumption, preserving the supported prefix and leaving the pending phase
retryable.

**Status:** behaviorally complete, awaiting review. The full correctness pass
over `e30ea05440a4850bee40881d3f65180c6ae7bb7b..4fc57d807d8e780714c2a3725d1fb8b7eabca92c`
is the last thing between this goal and closure;
`.agents/implementation-checklist.md` holds its validation evidence and
readiness note. Two consecutive passes found that this slice's fixes introduce
new defects at roughly a third the rate they close them, so budget for a
follow-up cycle rather than assuming the pass closes it.

`js/fastforward.js` is gone at `263540f` and the turn-index special cases in
`moveloop_core()` are gone at `9afade25`, so no structural replay remains.

## Next goals, in order

Selected from the `scan-stops.mjs` census taken on 2026-07-28 at `8f0bbde`,
where the port emits 254 of 7,765 recorded screens. Session and step counts
below are ceilings.

### 1. Monster and pet movement onto stairs

`assertSimpleDestination()` in `js/unported_monster_actions.js` admits `ROOM`,
`CORR`, and a `DOOR` with `D_NODOOR`. Two sessions stop there with a tame
monster stepping onto `STAIRS`, the monster-side mirror of the hero admission
committed at `a0d6283`. Trace what an ordinary non-covetous monster does on a
stairs square before widening the guard: the goal rests on the answer being
"nothing special", and that has to come from the source rather than from the
stop message.

A third session on the same boundary is a monster at a `D_CLOSED` door, which
stays excluded along with closed doors generally.

### 2. Commands that consume no game time

Accept, at a ready D:1 prompt, the commands whose `rhack()` result carries no
`ECMD_TIME`, so `svc.context.move` stays FALSE, no monster moves, no gameplay
PRNG is drawn, and only the screen and message window change. That property is
the goal's boundary, and it is why these commands cannot regress the turn
behavior the milestone already owns.

In scope, because development sessions stop on exactly these:

- an unbound keystroke, which `cmd.c:rhack()` answers with
  `Unknown command '<key>'.` and no state change (one session, 1,952 steps);
- `invent.c:dolook()`, bound to `:` (one session, 36 steps);
- `invent.c:ddoinv()` and the inventory menu it displays, including dismissal
  (three sessions, 110 steps);
- `o_init.c:dodiscovered()`, `spell.c:dovspell()`, and
  `insight.c:doattributes()`, which those sessions reach immediately after `i`.

`doattributes()` is the heaviest member and has no ported file yet. Split it
into its own goal if tracing shows it reaches past what the sessions exercise.

Beyond its own ceiling, this goal gates the closing sequence of 24 of the 33
development sessions, which end with `i`, `+`, `\`, and `^X` in that order, each
dismissed with ESC. No session finishes without it.

### 3. Running and rushing

`hack.c:domove_core()` under `svc.context.run`, with `hack.c:lookaround()`
deciding where a run stops. Six sessions stop here with 1,275 steps behind
them. Larger than the two goals above: `lookaround()` is a substantial function
and a run spans several turns.

### 4. Search

`detect.c:dosearch0(1)` is already ported. The explicit `s` command needs
`mfind0()`, `unmap_invisible()`, and the `aflag == 0` branches. Four sessions
stop here, but each reaches an extended command within one or two keystrokes,
so the immediate return is small.

## Explicit future exploration work, outside the open goal

- Hero or monster combat, including attacks, retaliation, monster-initiated
  displacement, knockback, damage, death, corpses, weapon selection, ranged
  attacks, spells, passives, and special damage.
- Hero- or monster-triggered traps, including holding, projectiles, status,
  magic, fire, land mines, teleportation, holes, trapdoors, migration, and
  living-statue effects.
- Hero or monster relocation and every level transition, including deferred
  transitions, D:2 generation, and rolling-boulder traps. Five sessions stop on
  `#levelchange` and two on `wizlevelport`, so this family stands in front of
  more recorded steps than any other, at a correspondingly larger cost. The
  other two sessions the census groups under `#` stop on `#name` and `#chat`,
  which belong to other families.
- Objects and inventory behavior, including automatic pickup, pet food and
  fetching, monster pickup, equipment, naming, billing, and object damage. One
  session stops on a pet picking up a food ration.
- Regions, engravings, ice, pools, lava, fountains, sinks, graves, altars, gas
  clouds, liquid effects, and every other special-terrain or room effect.
- Closed, locked, trapped, broken, or obstructing doors; tunneling; boulder
  breaking; iron bars; and other non-clear destination handling beyond a
  no-time refusal against wall or rock. `svc.context.door_opened`, which
  `test_move()` clears on entry and the closed-door branch sets, is the seam
  this attaches to. One session stops on a diagonal doorway refusal.
- `pickup.c:describe_decor()` and the `iflags.prev_decor` per-square memory it
  keys off, needed once `mention_decor` is set. It deliberately suppresses the
  open-door and doorway cases.
- Special monster movement or actions, including hiding, shapechanging,
  covetous tactics, fleeing teleportation, conflict, watch or quest behavior,
  speech, item use, and themed-room monster behavior beyond an inert wait.
- Pet states beyond an ordinary active starting pet, including eating,
  carrying, leashes, steeds, arrival or wait strategies, conflict, confusion,
  stun, fear except for the source-bounded continuation after this milestone's
  safe-pet refusal, ranged attacks, and combat.
- Every remaining command, including count prefixes, travel, force-fight,
  pickup commands, and the extended-command set.

Several source-faithful helpers for these families are already committed. They
remain preserved prerequisites; their existence does not make their live
behavior part of an open goal.

## Unresolved: unreviewed commits behind a review frontier

A review frontier is the latest commit a recorded correctness pass covers;
`npm run quality` treats everything behind it as reviewed. Until `5e7fb47`,
`npm run quality -- record-review` derived each frontier from the stored ledger
and never parsed the audited range, so a pass could advance a frontier past
commits its reviewers never read. `5e7fb47` now requires `--range` and refuses a
base that falls after any claimed area's frontier, so this cannot recur. It
cannot repair the existing ledger, because `validateHistory` fails when a
recorded base is not the stored frontier, which makes passes append-only in
effect.

Sixteen recorded passes advanced a frontier past the base of the range they
audited. Six commits changed area-owned production code inside those gaps and
are debt. Line counts are the production lines `scripts/quality-status.mjs`
charges to the area.

| Commits | Area | Lines | Why the audit never read them |
| --- | --- | --- | --- |
| `5affc31` | monsters | +56/-42 | The pass recorded at `e30ea05` set the monsters base to `d29414a` but audited `3c552b45..e30ea05`, seven commits later. `5affc31` also carries `Audit-fix-for: d29414ad`. |
| `f8911ff`, `f2de7a7` | startup | +37/-12 | The same pass set the startup base to `f97bd58`, 29 commits before its audited base. |
| `84964f8` | commands | +6/-3 | The same 29-commit gap. It also carries `Audit-fix-for: f97bd58`. |
| `54a2b86`, `4607698` | hero | +133/-4 | The pass recorded at `f97bd58` moved the hero frontier up from `f140abf` while auditing only `3b6c38d..f97bd58`, a 221-commit gap. `4607698` also carries `Audit-fix-for: 10dd52be`. |

Those six total 232 added and 61 removed production lines, and three are
audit-fix commits, which `.agents/quality-workflow.md` keeps as correctness debt
until a later pass covers them.

Five further commits in the same gaps need no pass. `8677023` adds 245 runtime
lines to `js/hacklib.js` as a bulk port of `hacklib.c` pure functions, which
`AGENTS.md` and the correctness thresholds exempt, and
`scripts/hacklib-strings.test.mjs` pins each to values read from the C source.
`17b1fb0`, `d8ab43c`, `5626cf0`, and `f3ebcc2` carry `Score-identical-with`
trailers, which `npm run quality` already subtracts and reports as relocated
lines.

**Action:** clear the six at the next milestone rather than scheduling a
re-audit now. Give the next full correctness pass in each area a `--range` base
at or before that area's oldest debt commit: `d29414a` for monsters, `f97bd58`
for startup and commands, and `f140abf` for hero. The recorder accepts a base at
or before the stored frontier, so this re-reads commits an earlier pass already
covered and needs no ledger edit. One pass claiming all four areas has to start
at `f140abf`; recording each area group separately keeps each range smaller.

This accounting covers the passes recorded after the 21 unstructured passes that
`legacyPassCount` in `QUALITY.json` names. Those record no per-area ranges, and
`.agents/quality-workflow.md` keeps historical `BASELINE` debt exempt until each
area's first recorded pass.

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
