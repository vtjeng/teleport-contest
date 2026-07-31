# Implementation checklist: the hero rides a saddled steed, slice 2

This checklist is a working record of implementation evidence for slice 2 of the
goal `ROADMAP.md` opened at `1f0e7d5`, the failed mount. It supplements the
required source review, tests, fresh differentials, and the workflows in
`.agents/workflow.md` and `.agents/review.md`.

It exists because slice 1 changed 531 production lines across six `js/` files
and slice 2 ports `mount_steed()`, 190 C lines holding fourteen guard branches,
plus two helpers the port lacks. Slices 1 and 3 are `later` here.

## Boundary

- Roadmap item: In progress: the hero rides a saddled steed, slice 2, the
  failed mount.
- Starting code commit: `e33c026904d1f01e18fbd7ff5a4e4bd4d40d1e93`, where slice
  1 closed.
- Starting event: `steed.c doride()` passes its `isok(u.ux + u.dx, u.uy + u.dy)`
  test and calls `mount_steed(m_at(u.ux + u.dx, u.uy + u.dy), FALSE)`.
- Ending event: the complete screen and cursor after the hit-point loss the slip
  path inflicts, with the next command prompt drawn.
- Valid inputs: any seed, datetime, role, race and option set that places the
  hero adjacent to a saddled, tame, untrapped steed and answers `getdir()` with
  the direction of that steed. `forcemount` is always FALSE outside debug mode,
  so every `!force` guard is live.
- Observables: the `rnd(20)` impairment roll and the `rn1(5, 10)` damage roll,
  in that order and no others; the `You slip while trying to get on %s.`
  message; the hit points `losehp()` removes and the status line it redraws;
  `u.usteed` staying null; the complete 24x80 screens, attributes and cursor.
- Exclusions, each justified from source in the table below:
  - The success path at `steed.c:358-382`, slice 3. It is reached only when the
    roll passes, so a case that slips never enters it.
  - `dismount_steed()`, slice 3. `u.usteed` is null throughout this slice, so
    `doride()`'s dismount arm cannot be taken.
  - The `wizard` "Force the mount to succeed?" arm at `steed.c:185`. Debug mode
    only; slice 1 already refuses it.

## How the candidate list was built

- Upstream entry points: `steed.c mount_steed()` (194-383). Its fourteen guards
  in source order sit at relative lines 13, 19, 36, 48, 55, 61, 67, 77, 89, 95,
  103, 107, 115, 124, 129, 135 and 140, the roll at 145, and the success arm at
  167. `hack.c losehp()` (4255-4290), which the slip path calls, adds
  `showdamage()` (4245) and `maybe_wail()` (4210).
- Dispatch tables and catalogs: `mons[]` for `PM_LONG_WORM` and the steed's
  `permonst`; `SADDLE` through `which_armor(mtmp, W_SADDLE)`; `MAXULEV`, which
  is 30 and makes the roll `rnd(20)`; `optlist.h:654` for `iflags.showdamage`,
  the one option that changes what the slip prints.
- Reachable helpers: `near_capacity()` is in `js/hack.js`, `touch_petrifies()`
  and `is_swimmer()` in `js/mondata.js`, `greatest_erosion()` and `isMetallic()`
  in `js/obj.js`, `which_armor()` in `js/weapon.js`, `can_saddle()` in
  `js/dog.js`, `newsym()` in `js/display.js`, `hliquid()` and
  `monsterCommonName()`/`capitalizedMonsterName()` (the port's partial
  `mon_nam()`/`Monnam()`) in `js/do_name.js`, `body_part()` in `js/polyself.js`,
  `youHear()` in `js/monmove.js`. Added by this slice: `can_ride()`,
  `x_monnam()`, `pmname()`, `mon_pmname()`, `type_is_pname()`, `is_mplayer()`,
  `losehp()`, `showdamage()`, `maybe_wail()` and `Maybe_Half_Phys()`. Still
  absent and refused at their sites: `trapname()`, `mhe()`, `m_unleash()`,
  `a_monnam()`, `legs_in_no_shape()`, `instapetrify()`.
- JavaScript cross-check: `grep -rlE "<name>" js/` was run for each helper
  above. Two answers changed the plan. `trapname` matched only comments in
  `js/hack.js` and `js/invent.js`, confirming it unported; `test_move` matched
  one production caller, `js/hack.js:1099`, which is what made adding C's
  `mode` argument cheap.
- Remaining limits: none for `mount_steed()`'s own branches or for what
  `losehp()` reaches. `losehp()`'s two consequences beyond the hit-point write
  are now classified rather than assumed: `maybe_wail()` is ported whole and
  `done(DIED)` refuses.

## Status values

Assign exactly one status to every row: `done`, `no-effect-yet`, `later`,
`cannot-occur`, `missing`, or `undecided`, as
`.agents/implementation-checklist-template.md` defines them.

## Implementation table

| Upstream function or branch family | Reachability and ordering | JavaScript owner | State, randomness, and output | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| `mount_steed()` guards 1, 2 and 4: `u.usteed`, `Hallucination`, `Upolyd` | Before any roll | `js/steed.js mount_steed()` | Message only, then FALSE | Ported and pinned by `scripts/mount-steed.test.mjs`, "every guard prints its own line and answers FALSE", which drives each from the Knight fixture | `done` | None |
| Guard 3, `Wounded_legs` | Before any roll | `js/steed.js mount_steed()` | `legs_in_no_shape()` message | Refused at the site. Nothing in the port writes `uprops[WOUNDED_LEGS]`: `grep -rn "WOUNDED_LEGS" js/` returns `js/const.js`, `js/attrib.js` and `js/insight.js`, all readers | `cannot-occur` | None |
| Guards 5-8: `near_capacity() > SLT_ENCUMBER`, `!mtmp`/`Blind`/`mundetected`/mimicry, `PM_LONG_WORM` tail, `u.uswallow`/`ustuck`/`utrap`/`Punished`/`!test_move` | Before any roll | `js/steed.js mount_steed()`, `js/hack.js test_move()` | Message only | All ported. The `!mtmp` arm is recorded fresh (`run-mount-steed.mjs` segment 6) and draws no random number; the rest are pinned by the guard-walk test, the burdened-hero case and "a steed the hero cannot step toward fails before the saddle test" | `done` | None |
| The `PM_LONG_WORM` tail message | Guard 7's body | `js/steed.js mount_steed()` | `a_monnam()` message | Refused at the site. `a_monnam()` passes a `suppress` set `x_monnam()` does not cover, and a long worm cannot be generated on dungeon level one: `rndmonst_adj()` caps at `monmax_difficulty(1) == 1` against the long worm's difficulty of 9 | `cannot-occur` | None |
| Guard 9: `!otmp`, the `which_armor(mtmp, W_SADDLE)` test | Decides "%s is not saddled." | `js/steed.js mount_steed()` | Message only | Three fresh recordings: a named pet ("Hachi is not saddled."), an unnamed one, and a hostile newt, which also shows this guard precedes guard 11 | `done` | None |
| Guard 10: `touch_petrifies()` | Before the tame decrement | `js/steed.js mount_steed()` | `instapetrify()` ends the game | Refused at the site. Guard 9 has already established a worn saddle, and every writer of `W_SADDLE` runs behind `can_saddle()`, which admits neither the cockatrice nor the chickatrice. Pinned by "an unsaddled fixture monster refuses a saddle" | `cannot-occur` | None |
| Guard 11: `!mtmp->mtame`/`isminion` | After the saddle test | `js/steed.js mount_steed()` | Message only | Ported; the guard-walk test reaches it with a saddled untame pony | `done` | None |
| Guard 12: `mtmp->mtrapped` | After guard 11 | `js/steed.js mount_steed()` | `mhe()` and `trapname()` message | Refused at the site and outside this slice's valid inputs, which name an untrapped steed. Pinned by "mount_steed stops at the arms this port has not reached" | `cannot-occur` | Port with `trapname()`, which the trap work owns |
| Guard 13: `!force && !Role_if(PM_KNIGHT) && !(--mtmp->mtame)` | Writes `mtmp->mtame` even when it does not fire | `js/steed.js mount_steed()` | Changes monster state; `newsym()`, `m_unleash()` | Ported, and pinned by "a non-Knight spends a point of tameness on every attempt" for both the decrement and the Knight short-circuit. **No recording can reach it**: `dog.c:263-268` saddles only a `PM_PONY` starting pet and `role.c:209` makes the Knight the only role with that `petnum`, so a non-Knight needs `apply.c use_saddle()` or a taming effect, and neither command is ported | `done` | Record a differential when `#apply` or a taming effect lands |
| The `mtmp->mleashed` half of guard 13 | Inside guard 13's body, after its `pline()` | `js/steed.js mount_steed()` | `m_unleash()` | Refused after the message, which carries the leash clause. `apply.c use_leash()` is the only writer of `mleashed` and `#apply` is unported | `cannot-occur` | None |
| Guards 14-17: `Underwater`, `can_saddle`/`can_ride`, `Levitation`, metallic eroded `uarm` | Immediately before the roll | `js/steed.js mount_steed()`, `js/steed.js can_ride()` | Message only | All ported; the guard-walk test covers each, including both erosion spellings | `done` | None |
| The impairment roll, `u.ulevel + mtmp->mtame < rnd(MAXULEV / 2 + 5)` | The first random-number call this slice makes | `js/steed.js mount_steed()` | One `rnd(20)` | Three fresh Knight recordings slip; "the impairment roll and the damage roll are the only draws" pins the count and the order, and "the roll fails only when the hero and the steed fall short of it" pins the strict comparison at the fixture's measured draw of 16 | `done` | None |
| The six impairment terms ahead of the roll: `Confusion`, `Fumbling`, `Glib`, `Wounded_legs`, `otmp->cursed`, `otmp->greased` | Short-circuit before the `rnd()` call | `js/steed.js mount_steed()` | Slip with no draw | Five are pinned by "the arms of the impairment disjunction" and "a greased or cursed saddle fails the mount without a roll", each with the roll neutralized so the term owns the outcome. `Wounded_legs` is dead: guard 3 returns for it first whenever `force` is FALSE, which it always is | `done` | None |
| The `Levitation` arm inside the failure, "%s slips away from you." | Only with `Lev_at_will`, since guard 16 returns for ordinary levitation | `js/steed.js mount_steed()` | Message, returns FALSE before `losehp()` | Ported; pinned by "a levitating hero watches the steed slip away" | `done` | None |
| `You("slip while trying to get on %s.")` and `x_monnam()` for `buf` | After the roll fails | `js/do_name.js x_monnam()`, `js/steed.js mount_steed()` | Message; `x_monnam()` with `SUPPRESS_IT`, `SUPPRESS_INVISIBLE`, `SUPPRESS_HALLUCINATION` | `x_monnam()` ported for that flag set and refusing every other, with source-pinned tests for both articles, the `called` arm and the five monster classes it does not format. The recorded `Monnam()` `do_it` gap under `## Unresolved` cannot bite here: `SUPPRESS_IT` makes `do_it` FALSE unconditionally | `done` | None |
| `losehp(Maybe_Half_Phys(rn1(5, 10)), buf, NO_KILLER_PREFIX)` | Second and last random-number call | `js/hack.js losehp()` | Removes hit points, redraws the status line, can kill | Ported with `showdamage()` and `maybe_wail()`. The damage is recorded against C three times, and once more with `OPTIONS=showdamage`, which prints it exactly | `done` | None |
| `losehp()`'s `Upolyd` branch | Only for a polymorphed hero | `js/hack.js losehp()` | `u.mh`, `rehumanize()` | Refused at the site. Nothing in the port assigns `u.umonnum` | `cannot-occur` | None |
| `losehp()`'s `done(DIED)` branch | `u.uhp < 1` | `js/hack.js losehp()` | Ends the game | Refused at the site, and the refusal converts to a command boundary rather than losing the segment. Pinned by "a slip that kills the hero stops the command rather than the segment", which also shows the killer string `x_monnam()` built | `later` | Port with the end-of-game work |
| `hack.c test_move()`'s `mode` argument | `mount_steed()` asks TEST_MOVE; `domove_core()` asks DO_MOVE | `js/hack.js test_move()` | Suppresses every message, the autoopen pull and `feel_location()` | Ported; pinned by two tests that run the wall, closed-door and both diagonal doorway arms under each mode. `TEST_TRAV` and `TEST_TRAP` have no ported caller, so the two places C treats them differently are marked and unreachable | `done` | None |
| `iflags.showdamage` | Read by `showdamage()` on every `losehp()` | `js/options.js`, `js/hack.js showdamage()` | One extra message | Parsed into `iflags` as `optlist.h:654-655` stores it, and recorded fresh with the option set | `done` | None |
| Success path, 358-382 | Roll passes | `js/steed.js mount_steed()` | Sets `u.usteed`, `teleds()`, `disp.botl` | Refused; `seed0103` and `seed0104` now stop there | `later` | Slice 3 |
| `dismount_steed()` (`steed.c:576`) | `u.usteed` set | `js/steed.js` | | `u.usteed` never set in this slice | `later` | Slice 3 |

## Missing work by owner

None.

## Validation

- Commit checked: `05c56ed47821d5403325dec771a198cbeb1b156c`.
- Source review: every branch of `steed.c mount_steed()` (194-383),
  `steed.c can_ride()` (168-174), `hack.c losehp()` (4255-4290),
  `hack.c showdamage()` (4245-4253), `hack.c maybe_wail()` (4210-4243),
  `hack.c test_move()` (988-1215) and `do_name.c x_monnam()` (826-1032) traced
  against the C source, with the random-number order recorded in the table
  above. Every unported path stops at a named refusal.
- Focused tests: `node --test scripts/mount-steed.test.mjs` (27 pass) and
  `node --test scripts/ride-direction.test.mjs` (22 pass).
- Full suite: `npm run checkpoint` passes; 1,971 tests in 133 files.
- Generated-file checks: all five pass.
- Fresh differentials: `node scripts/run-mount-steed.mjs` passes 9 segments,
  24,978 PRNG calls, 89 screens and 89 cursors against freshly recorded C.
  `node scripts/run-ride-direction.mjs` still passes 11 segments. The recipes
  contain replay inputs only and no recorded `steps`. Varied across the nine
  segments: five seeds, three roles, both genders, two alignments, three option
  sets (plain, `showdamage`, `time`), one orthogonal and one diagonal mount,
  and four different guard outcomes.
- Development suite: `node scripts/score-development.mjs` reports 476 of 7,765
  screens, 100,829 of 610,816 random-number values and 1 of 33 sessions, from
  469, 100,825 and 1 at `e33c026`.
- Mutation: `npm run mutate -- --worktree --kind relational,logical,boolean
  --whole-suite` kills 114 of 117. The three survivors are equivalent mutants:
  `pmname()`'s two range tests change no answer in JavaScript, where an
  out-of-range index reads `undefined` and the third disjunct already rejects
  it, and widening `losehp()`'s `u.uhp > u.uhpmax` to `>=` assigns the field to
  itself. Each is noted at its site.
- Quality check: run by the orchestrator.
- Browser check: not required. `.agents/validation.md` exempts a shared engine
  change when the renderer is unchanged, and no line of this diff touches
  `js/terminal.js`, `js/tty_menu.js` or the glyph renderer.

## Readiness

Current readiness: `Ready for audit`

Reason: every row is `done`, `later` or `cannot-occur`; the fresh differential
matches C on all nine segments; and the full suite, the five generated-data
checks and the development score pass at the commit recorded above.
