# Source-faithful port roadmap

This file records the goal in progress, the goals selected after it, and
unresolved debt. It holds state, not rules. `AGENTS.md` remains the authority
for implementation, validation, holdout, quality, and attribution rules, and
`.agents/selection.md` states how to read the `scan-stops.mjs` census, how the
census picks a goal inside the current milestone, how a goal is sized, and how
this file is kept short.

## Current milestone: exploration

**Objective:** movement beyond the first unobstructed step, then running,
search, doors, traps, pickup, stairs, terrain effects, vision, and status
updates. This is what a hero does moving around a level before fighting or using
items, and it comes first because a hero who cannot walk cannot reach a monster,
an object, or the stairs.

The goals below were selected from the `scan-stops.mjs` census at `03c2add`,
except where a later scan is named. Every session and step count in those
sections is a ceiling taken from that census and goes stale as the port
advances; re-run the scan for current numbers. The traced source findings do not
go stale, which is why they are recorded here rather than re-derived.

### Awaiting closure: repeated simple commands

Starting at a correctly generated first command prompt, accept an unbounded
sequence of single-keystroke commands on D:1, each either a wait or a one-square
walk, and match through the prompt after every command. Walk destinations in
scope are an unoccupied object-free ordinary clear square, a `test_move()`
refusal against wall or rock that consumes no time, a swap with an ordinary
active starting pet, a square whose objects only produce a floor description,
and an object-free `STAIRS` square or `DOOR` whose mask is exactly `D_NODOOR`
or `D_ISOPEN`. Ordinary D:1 monsters, including ones generated part-way through
the sequence, and the starting little dog, kitten, or pony may move normally or
stay put.

Excluded: the future-work list below, count prefixes, running, travel, every
other command, pickup, a diagonal move into or out of a doorway that is not
doorless, every closed, locked, trapped, or broken door, a `STAIRS` or doorway
square holding an object, and monster-initiated displacement of the hero. Each
excluded path fails closed before any gameplay state change or PRNG
consumption, preserving the supported prefix and leaving the pending phase
retryable.

**Status:** behaviorally complete. The full correctness pass over
`e30ea05440a4850bee40881d3f65180c6ae7bb7b..4fc57d807d8e780714c2a3725d1fb8b7eabca92c`
ran and its nineteen confirmed findings are closed. The fix commit `88e2193`
records the results, and the future-work list below carries the cases the fixes
deferred. The fix commit itself is correctness debt for the next pass, which is
where the third of these findings that the previous cycle's own fixes
introduced would show up again.

No behavior slice remains in this goal, so nothing here is startable. Do not
schedule a pass over the fix tail on its own: `.agents/review.md`
folds audit-fix debt into the next scheduled correctness range, and the
thresholds pull it in when they fire. This goal stays listed only until its debt
clears and it closes, at which point it is deleted from this file. Its holdout
evaluation waits on that debt, because `.agents/review.md` makes a holdout
evaluation a review deadline and requires every outstanding review to be
complete first.

`js/fastforward.js` is gone at `263540f` and the turn-index special cases in
`moveloop_core()` are gone at `9afade25`, so no structural replay remains.

## Next goals, in order

### 1. Running and rushing

`hack.c:domove_core()` under `svc.context.run`, with `hack.c:lookaround()`
deciding where a run stops. Six sessions stop here with 1,275 steps behind
them. `lookaround()` is a substantial function and a run spans several turns,
so this is larger than either goal that closed before it.

### 2. The extended-command prompt

`cmd.c:doextcmd()` at `cmd.c:493`, with `extcmds_match()` at `2523`,
`can_do_extcmd()`, the `extcmdlist[]` table at `1667`, and
`win/tty/getline.c:tty_get_ext_cmd()` at `292` with `ext_cmd_getlin_hook()`.
`js/tty_menu.js` already has a search-prompt-only version of the hook to
generalize. The prompt itself carries no `ECMD_TIME` on either termination, the
ESC or empty cancel and the `"…: unknown extended command."` answer, which is
why the no-time-command goal considered it and left it out: `extcmdlist[]` runs
to about 165 rows and needs a generator, and the prompt is the entry point to
the extended-command set that "Explicit future exploration work" below defers.
It is its own goal for that reason, not a slice of another.

Seven of the 33 development sessions stop on `#`, with 1,892 recorded steps
behind them, the largest ceiling the census names. Most of those steps stand
behind the command each session then types, not behind the prompt:
`#levelchange` and `wizlevelport` belong to the relocation family below, and
`#name` and `#chat` to families of their own. Expect the prompt alone to unblock
a few screens per session and stop again immediately.

Two traced findings to start from. `seed0102` step 5 shows `# name` with the
cursor still at column 3, so NEWAUTOCOMP expansion paints ahead of an unmoved
cursor. And `extcmds_match()` is gated on `wizard`, which `#levelchange`
depends on.

### 3. Search

`detect.c:dosearch0(1)` is already ported. The explicit `s` command needs
`mfind0()`, `unmap_invisible()`, and the `aflag == 0` branches. Four sessions
stop here, but each reaches an extended command within one or two keystrokes,
so the immediate return is small.

## Explicit future exploration work, outside the goal in progress

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
- The hero-destination stop for a decorated square that holds an object.
  `invent.c:dfeature_at()` and `stairs.c:stairs_description()` are ported now,
  so what remains is admitting that square in `js/hack.js` and recording the
  fresh differential for a walk onto a staircase or doorway holding one
  object.
- `hack.c:overexert_hp()`, the hit point `moveloop_core()` costs a hero who
  moved above `MOD_ENCUMBER` every thirtieth turn, and the `fall_asleep()`
  pass-out at one hit point. The elapsed turn stops there instead.
- `hack.c:test_move()`'s two zero-time diagonal doorway refusals, which set
  `svc.context.move` to FALSE, call `nomul(0)`, and print through
  `flags.mention_walls`. Both are refusals rather than moves, so the admission
  seam stops on them; porting them means owning a no-time refusal that still
  paints a frame.
- Special monster movement or actions, including hiding, shapechanging,
  covetous tactics, fleeing teleportation, conflict, watch or quest behavior,
  speech, item use, and themed-room monster behavior beyond an inert wait.
- `js/dogmove.js` `heroDeaf()` does not match youprop.h:125, which defines
  `Deaf` as `(HDeaf || EDeaf || u.uroleplay.deaf)`. It reads `u.uprops[DEAF]`
  alone and adds a `blocked` term the macro has no counterpart for, so
  `OPTIONS=deaf` will diverge in dogmove.c's leashed-pet trap arm. The delta
  review recorded at `2adc5af` confirmed the mismatch and rejected it as a
  finding, because `js/unported_monster_actions.js` refuses a leashed pet
  before `dog_move()` runs, which makes the arm unreachable today. Fix it with
  the leashed-pet work; every other `Deaf` reader in the port already ORs the
  conduct in.
- Pet states beyond an ordinary active starting pet, including eating,
  carrying, leashes, steeds, arrival or wait strategies, conflict, confusion,
  stun, fear except for the source-bounded continuation after this milestone's
  safe-pet refusal, ranged attacks, and combat.
- Every remaining command, including count prefixes, travel, force-fight,
  pickup commands, and the extended-command set.

Several source-faithful helpers for these families are already committed. They
remain preserved prerequisites; their existence does not make their live
behavior part of a goal in progress.

## Unresolved: an indented inverse menu heading cannot match

The spell menu's column header records as `\x1b[20C\x1b[7m    Name`: C moves
the cursor to the window edge, turns inverse video on, prints four spaces, then
prints `Name`. `serialize()` in `frozen/terminal.js`, which the judge
substitutes for `js/terminal.js`, finds the first cell in the row whose
character is not a space and emits the cursor-forward jump ahead of any SGR
sequence, so those four cells decode as default-attribute spaces. The scorer
does not forgive that: `SPACE_VISIBLE_ATTRS` in `frozen/screen-decode.mjs`
counts inverse and underline as visible on a space, so `diffCell()` reports
`attr` and the screen misses on four cells.

Twelve recorded screens across nine development sessions carry that heading,
every one of them a spell list under the default
`menu_headings:[no-color&inverse]`. A heading whose text starts at a glyph, such
as the options menu's `General`, is unaffected, which is why the inventory menu
matches. The `+` segments added to `scripts/run-no-time-commands.mjs` at
`ff6efb9` set `menu_headings:none` to sidestep it.

No fix in game code exists, because `AGENTS.md` requires leaving
`js/terminal.js` unchanged and the judge replaces it regardless. Treat it as a
ceiling: a session that displays the spell menu under the default option loses
that screen however faithful the port is.

## Unresolved: a live monster refusal escapes as a hard failure

`UnsupportedMonsterCreationError` is listed in
`ELAPSED_TURN_PLANNING_REFUSALS`, which converts it to a turn boundary, but
that conversion covers only the cloned planning round. `advanceElapsedTurn()`
supplies that round only when `projected_capacity(state) > 0`, so an
unencumbered hero never dry-runs the turn, and the same refusal thrown by the
live `maybe_generate_rnd_mon()` leaves `runSegment()` as a hard failure. A
segment then loses its matching screens instead of keeping the prefix.

The correctness pass recorded at `eb7e17e` confirmed this and verified it is
older than the range it audited: the identical probe at the parent produces
identical output. Converting on the live path alone would not be enough,
because moves and the regeneration draws are already spent by then, so the fix
is a preflight for the unburdened path, as `preflightGetHungry()` and
`preflight_nh_timeout_elapsed_turn()` already do for theirs.

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
audit-fix commits, which `.agents/review.md` keeps as correctness debt
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
`.agents/review.md` keeps historical `BASELINE` debt exempt until each
area's first recorded pass.

## Later milestones

This list selects the next milestone; `scripts/scan-stops.mjs` selects goals
inside whichever milestone is current. After the current milestone, proceed in
this order:

1. **Combat and creatures:** complete melee, damage and death, the remaining
   monster and pet behavior, monster inventory, conditions, and common creature
   abilities.
2. **Item interaction:** inventory commands and menus, wield/wear, eat/quaff,
   read/zap, apply, throw, drop, identification, and equipment effects.
3. **Levels and persistence:** level transitions, deeper and special levels,
   save/restore, bones, and cross-segment state.
4. **Long tail:** shops, advanced spells and effects, rare monsters and items,
   endgame branches, and remaining valid commands and options.
