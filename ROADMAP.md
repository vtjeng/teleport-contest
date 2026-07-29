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

### Goal in progress: running and rushing

`hack.c:domove_core()` under `svc.context.run`, with `hack.c:lookaround()`
deciding where a run stops. Six sessions stop here with 1,275 steps behind
them. `lookaround()` is a substantial function and a run spans several turns,
so this is larger than either goal that closed before it.

Unlike the goal that closed before it, this one consumes game time: a run moves
the hero and the turn advances, so every existing turn behavior is in scope for
regression. Take the intermediate correctness passes as `.agents/review.md`
schedules them.

A fresh scan supersedes the census figure above: seven sessions stop on
`runeast`, `runnorth` or `runwest`, with 1,668 steps behind them, not six with
1,275.

**Behavior slices, each closed on its own.**

1. **A shift-direction run that starts and ends inside one room.** `L`, `H`, `J`
   or `K` from a hero standing in a room. `hack.c:lookaround()` (3898-4050)
   whole, `domove_core()`'s two run arms at 2764 and 2936, `nomul()` (4160),
   `runmode_delay_output()` (2996), `pickup.c:check_here()`'s run stop (449),
   and the `moveloop_core()` calls at `allmain.c:515`. A run reads no input, so
   one keystroke is one recorded step whose screen is where the run stopped;
   the per-turn refreshes land in `animation_frames`, which the scorer counts
   supplementally. Corridor running is excluded: its turning and `corrct`
   logic never fires from a room, and all five first-run sessions decoded start
   in a room and stop within four squares. Rush, `#run` and travel, which are
   `context.run` 2, 3 and 8, are excluded with it.
   Closed at `bc6b5aa`. Every one of the checklist's nine `context.run` rows
   was settled: `allmain.c:262` and `:978` are ported, and the rest are
   unreachable at run 1 by their own `!run` or `run >= 2` terms, by
   `ParanoidTrap` defaulting off, or behind seams that refuse the destination
   first. Corridor running is refused inside `lookaround()` itself, where
   `levl[u.ux][u.uy].typ != ROOM` is the single source test every corridor arm
   hangs off.

   One recorded case stays unexplained and outside the slice: `seed0013` steps
   4-5 record an input boundary three turns into a run, then a zero-time `\f`
   redraw step carrying 363 PRNG calls, six animation frames and a cursor
   moving from x=12 to x=32. Nineteen fresh recordings failed to reproduce a
   mid-run input boundary, so nothing was fitted to it. Resolve it with a fresh
   recording before targeting that session.

2. **Corridor running at `context.run == 1`.** Small in production terms and
   large in evidence. `lookaround()` is already ported whole at
   `js/hack.js:777-975`, `bcorr`, `corrct` and `noturn` included; the guard at
   `js/hack.js:804`, `here.typ !== ROOM`, is all that suppresses them. The
   delta is that guard plus `domove_core()`'s doorway stop at `hack.c:2936`,
   and the real work is a `run-corridor-runs.mjs` sibling to the 211-line
   `scripts/run-room-runs.mjs`. `seed0017` step 11 and `seed0004` step 16 both
   start a run from a doorway with corridor beyond, so one `L` is one recorded
   step. Needs no checklist.

   The census credits two sessions and 449 steps, but that ceiling deflates on
   inspection: `seed0004`'s next key is `u` into a locked door, worth about one
   step, and only `seed0017` has further run keys behind it. Expect corner
   turns to set a diagonal `u.dx`/`u.dy` that collides with
   `requireNonDiagonalDoorway()`.

   Rush (`context.run` 2), `#run` (3) and travel (8) stay out, all three with no
   census ceiling, along with `mention_walls` text and `test_move()`'s
   closed-door bump at `hack.c:1097`.

   Closed at `e9cd289`, for 31 screens, the largest single-slice gain recorded
   so far. The ceiling deflation above held for `seed0004`, which gained its one
   step; `seed0017` supplied the other 30 and now stops on `#`. The corner-turn
   collision was settled from the C: `test_move()`'s `testdiag` and `ust` arms
   both hang on `doorless_door()`, which `requireNonDiagonalDoorway()` already
   applies, and a turn cannot start from a doorway because `nomul(0)` zeroes
   `multi` first.

3. **Ctrl-direction rush, `context.run == 3`.** The admission list
   `ADMITTED_RUN_MODES` at `js/cmd.js:326` is the whole production delta, the
   same guard shape as the slice above: `js/command_bindings.js` and
   `MOVEMENT_INTENTS` already produce `rusheast -> [1, 0, 3]`.

   Settle the run values first, because "rush" names two commands at two
   values. `cmd.c:1461-1512` `do_rush_<dir>`, which the ctrl-direction keys
   bind to, calls `set_move_cmd(dir, 3)`. The `g` prefix, `cmd.c:1599`
   `do_rush()`, sets 2. The `G` prefix, `cmd.c:1606` `do_run()`, sets 3. The
   comment at `js/cmd.js:324` reads "Rush and #run are 2 and 3", which is right
   for the two prefixes and wrong for the ctrl-direction keys; correct it with
   this slice.

   Its ceiling is zero: no development session stops on a run boundary, and
   the `^L` rush that both `seed0013` sessions record at step 5 sits behind
   their step-4 stop on traps. It is worth doing anyway because it is named in
   this goal and because run 3 is the first thing to execute three arms of
   already-ported code: `lookaround()`'s pet stop at `js/hack.js:852`, its
   closed-door stop at `:888`, and `avoid_moving_on_trap(..., infront && run >
   1)` at `:874`. Evidence has to come from fresh recordings, a
   `run-rush-runs.mjs` sibling.

   The `g` and `G` prefixes stay out: they need `rhack()`'s PREFIXCMD dispatch,
   the same unit `m`/`reqmenu` needs, which belongs with the extended-command
   goal. `lookaround()`'s widening stop at `corrct > 1 && run === 2` is
   therefore still unreachable after this slice, since only the `g` prefix
   sets 2.

   Closed at `60bf3d0`, with the score identical across all 33 sessions, as
   expected. All three never-executed arms read correctly against the C. Two
   findings for later. The trap arm's TRUE result is still unreached, because
   `avoid_moving_on_trap()` answers TRUE only for a `tseen` trap and the only
   D:1 route to one is `themerms.lua`'s teleportation hub, which the port's
   seams refuse first. And `requireSimpleHeroDestination()` throws for any
   trap, where C at run >= 2 stops cleanly in
   `avoid_running_into_trap_or_liquid()` with no time spent; that seam is the
   next thing a run will hit, and it belongs with the trap work.

   One case is undecided and belongs with `mention_walls`: seed 6100003 ends
   against the top map edge, which C answers in `move_out_of_bounds()` with
   `nomul(0)` and `context.move = 0`, and the port folds into
   `blocksMove`/`test_move`. The two agree with `mention_walls` off, which the
   recording confirms; with it on, C prints "You have already gone as far north
   as possible" and the port prints nothing.

## Next goals, in order

### 1. The extended-command prompt

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

Nine of the 33 development sessions stop on `#`, with 2,204 recorded steps
behind them, the largest ceiling the census names. That figure comes from a
scan at `60bf3d0`, after the running goal closed, and supersedes the seven
sessions and 1,892 steps a scan at `03c2add` reported. Most of those steps stand
behind the command each session then types, not behind the prompt:
`#levelchange` and `wizlevelport` belong to the relocation family below, and
`#name` and `#chat` to families of their own. Expect the prompt alone to unblock
a few screens per session and stop again immediately.

Two traced findings to start from. `seed0102` step 5 shows `# name` with the
cursor still at column 3, so NEWAUTOCOMP expansion paints ahead of an unmoved
cursor. And `extcmds_match()` is gated on `wizard`, which `#levelchange`
depends on.

### 2. Search

`detect.c:dosearch0(1)` is already ported. The explicit `s` command needs
`mfind0()`, `unmap_invisible()`, and the `aflag == 0` branches. Five sessions
stop here with 490 steps behind them, measured at `60bf3d0`, but each reaches
an extended command within one or two keystrokes, so the immediate return is
small.

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

## Unresolved: six deferred test-coverage findings from the running pass

The correctness pass over `2adc5af..60bf3d0` confirmed 13 findings. Seven are
applied at `374fb85`, including both production defects. Six are deferred, all
of them missing test pins rather than suspected wrong behavior, and each names a
mutation that survives the suite today:

- `domove()`'s three run-stop sites can be reverted from `nomul(0)` to the
  explicit field zeroing they replaced, with byte-identical matrix output.
- `domove_core()`'s run stop on `IS_FURNITURE` is never executed by a test;
  only its `IS_DOOR` arm runs, so the furniture term can be deleted.
- `check_here()`'s run stop runs three times during `npm test` with no
  assertion depending on it; deleting it leaves all tests passing while
  changing the cursor stream.
- The animation-frame stream, which this range newly made a compared output, is
  pinned by nothing stronger than a divisibility check, so a mutation halving
  the `nh_delay_output()` calls passes.
- `lookaround()`'s two `flags.mention_walls` arms never execute, because every
  segment of all three run matrices leaves the option off.
- The closed-door `mention_walls` line is the only ported *output* the new
  `lookaround()` adds and no differential or test can reach it: the arm needs
  `context.run !== 1`, so both run-1 matrices are structurally excluded, and no
  rush segment sets the option. The pass verified it is reachable by replaying
  six existing `arm: 'door'` rush seeds with `mention_walls` prepended.

The last two need a fresh C recording with the option set, which is why they
were not closed with the rest. Clear all six before the next holdout
evaluation, and prefer adding a `mention_walls` variant of an existing rush
seed over widening the production code to suit a test.

## Unresolved: `newsym()` omits the infrared arm

`display.c newsym()` has an out-of-sight arm that shows a monster when
`see_with_infrared(mon) && mon_visible(mon)`; `js/display.js newsym()` does not.
Reproduce with seed 7000063, a female chaotic orcish Rogue, moves `" L"`: C's
mid-run animation frames show `r` at `<11,13>`, a square the hero could see but
cannot, and the port leaves it blank.

The room-run slice found this and left it, because `newsym()` is load-bearing
for every screen the port draws and the slice's own boundary did not need it.
That case is deliberately absent from `scripts/run-room-runs.mjs`. Fix it with
the infravision work rather than inside a movement slice.

## Unresolved: `blocksMove()` reads the wrong door field

`js/hack.js blocksMove()` tests `loc.doormask`, but `js/mklev.js` writes an
ordinary door's mask to `loc.flags` (lines 2554-2565), and the same file's
`doorMask()` helper already reads `flags || doormask`. A generated closed or
locked door therefore answers FALSE to `blocksMove()`.

No wrong output follows today: `js/hack.js:488` reaches
`requireSimpleHeroDestination()` through its `typ === DOOR` arm and refuses the
square there instead, so the door is still refused, by a different route than
the code intends. Fix it with the closed-door work, which is where the two
routes stop agreeing, and take a fresh differential when doing so, because it
changes which refusal a closed door takes.

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
