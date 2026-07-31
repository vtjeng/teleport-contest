# Implementation checklist: the hero rides a saddled steed, slice 3

This checklist is a working record of implementation evidence for slice 3 of the
goal `ROADMAP.md` opened at `1f0e7d5`, the successful mount and the dismount. It
supplements the required source review, tests, fresh differentials, and the
workflows in `.agents/workflow.md` and `.agents/review.md`.

It exists because slices 1 and 2 each changed more than 500 production lines,
and `dismount_steed()` alone is 247 C lines. Slices 1 and 2 are closed.

## Boundary

- Roadmap item: In progress: the hero rides a saddled steed, slice 3, the
  successful mount and dismount.
- Starting code commit: `05c56ed`, where slice 2's implementation landed.
- Starting event: `mount_steed()`'s impairment roll at `steed.c:341` passes, so
  control reaches the success arm at 358. The port refuses there today.
- Ending event: the complete screen and cursor after a second `#ride` dismounts
  the steed, with the next command prompt drawn.
- Valid inputs: any seed, datetime and option set that puts a Knight adjacent to
  the saddled starting pony and answers `getdir()` toward it, twice. Only the
  Knight can reach this: `dog.c:263-268` saddles a starting pet solely when
  `pettype == PM_PONY`, and `role.c:209` gives that `petnum` to the Knight
  alone. `u.uroleplay.pauper` suppresses the saddle even for a Knight.
- Observables: `u.usteed` becoming the steed and returning to null; the hero and
  steed positions `remove_monster()`, `teleds()` and `place_monster()` write;
  `disp.botl` and the status line; the mount and dismount messages; the complete
  24x80 screens, attributes and cursor. The success arm makes no random-number
  call, and the dismount path must be checked for one rather than assumed.
- Exclusions, each justified from source in the table below:
  - Seven of the eight `DISMOUNT_` reasons in `hack.h:347-356`. `doride()`
    passes `DISMOUNT_BYCHOICE` and nothing else in this slice reaches
    `dismount_steed()`.
  - Riding movement and riding combat. `seed0104-knight-ride-combat` needs them
    after mounting, and `domove()` now refuses a mounted hero outright.

## How the candidate list was built

- Upstream entry points: `steed.c mount_steed()`'s success arm (358-382) and
  `steed.c dismount_steed()` (576-822).
- Dispatch tables and catalogs: the `DISMOUNT_` enumeration at `hack.h:347-356`;
  `TELEDS_ALLOW_DRAG`, the flag `mount_steed()` passes `teleds()`.
- Reachable helpers: absent and needed by this slice were `teleds()`,
  `steed_vs_stealth()`, `maybewakesteed()`, `dismount_steed()`, `landing_spot()`
  and `is_pole()`. Tracing `teleds()` and `dismount_steed()` added ten more
  absent helpers, each listed in its own row below.
- JavaScript cross-check: `grep -rln "function <name>" js/` was run for each
  helper, and `grep -rn "usteed" js/` for every reader of the field this slice
  makes live. The reader audit's result is the last section of this file.
- Remaining limits: the candidate list is complete for the success arm and for
  `dismount_steed()`'s `DISMOUNT_BYCHOICE` path, which was walked branch by
  branch. It does not cover the seven refused reasons beyond establishing what
  each would need.

## Status values

Assign exactly one status to every row: `done`, `no-effect-yet`, `later`,
`cannot-occur`, `missing`, or `undecided`, as
`.agents/implementation-checklist-template.md` defines them.

## Implementation table

### The success arm, `steed.c:358-382`

| Upstream function or branch family | Reachability and ordering | JavaScript owner | State, randomness, and output | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| `maybewakesteed()` | First statement of the success arm | `js/steed.js` | Clears `msleeping`; halves `mfrozen` behind one `rn2(frozen)`; ends the meal | `scripts/dismount-steed.test.mjs` pins the halving and the draw | `done` | -- |
| `maybewakesteed()`'s "%s wakes up." | Needs a steed that was helpless and woke | `js/steed.js` | Message | Refused; no admitted path leaves a starting pet asleep or frozen | `later` | Port with the sleeping-pet work |
| `dogmove.c finish_meating()` | Last statement of `maybewakesteed()` | `js/dogmove.js` | Clears `meating`; resets a mimic disguise | Ported whole; the disguise arm needs a pet that ate a mimic | `done` | -- |
| The `Levitation` arm, "%s magically floats up!" | Needs `Lev_at_will` | `js/steed.js` | Message | Ported; unreachable, because nothing in this port grants levitation at will | `done` | -- |
| `You("mount %s.")` | After the Levitation arm | `js/steed.js` | Message | `seed0103` step 19 and all nine matrix segments | `done` | -- |
| The `Flying` arm, "You and %s take flight together." | Needs `Flying` | `js/steed.js` | Message | Ported; no reachable steed flies and no hero flies | `done` | -- |
| `uwep && is_pole(uwep)` clearing `gu.unweapon` | Before `u.usteed` is set | `js/steed.js`, `js/worn.js` | Changes hero state | `is_pole()` exported from `js/worn.js` under its source name; pinned with the Knight's lance | `done` | -- |
| `u.usteed = mtmp` | The first write of this field in the port's history | `js/steed.js` | Changes hero state | See the reader audit below | `done` | -- |
| `steed_vs_stealth()` and the `was_stealthy` comparison | After `u.usteed` is set | `js/polyself.js` | Writes `uprops[STEALTH].blocked`; may print "You aren't stealthy anymore." | The first writer of any `blocked` mask in this port; both messages pinned | `done` | -- |
| `remove_monster()` then `teleds(..., TELEDS_ALLOW_DRAG)` | Last two state changes | `js/monst.js`, `js/teleport.js` | Moves hero and steed | Nine matrix segments | `done` | -- |
| `disp.botl = TRUE` | Last statement | `js/steed.js` | Redraws the status line | Pinned after the dismount | `done` | -- |

### `teleds()`, `teleport.c:448-573`

| Upstream function or branch family | Reachability and ordering | JavaScript owner | State, randomness, and output | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| The reachable body | Both halves of the ride | `js/teleport.js teleds()` | Moves the hero; no random number | Nine matrix segments; `getRngLog()` shows the whole success path spends one draw, the impairment roll | `done` | -- |
| `reset_utrap(FALSE)` -> `set_utrap()` -> `float_vs_flight()` | First state change | `js/trap.js`, `js/polyself.js` | Writes `utrap`, `utraptype`, the `FLYING` and `LEVITATION` blocked masks, `disp.botl` | Unit-pinned | `done` | -- |
| `set_ustuck(NULL)` | Clears the swallow state | `js/mon.js` | `ustuck`, `uswallow`, `uswldtim`, `disp.botl` | Unit-pinned | `done` | -- |
| `u_on_newpos()` | After the ball block | `js/dungeon.js` | Hero and steed positions | Moved here from `js/mklev.js`, its C home, which also broke an import cycle | `done` | -- |
| `fill_pit()` | After `u_on_newpos()` | `js/trap.js` | Settles a boulder into a pit | Refuses; `flooreffects()` has no owner | `later` | Port with `flooreffects()` |
| `update_player_regions()` | After `fill_pit()` | `js/region.js` | Region membership | Unit-pinned; no level this port generates holds a region | `done` | -- |
| `see_monsters()` | After `newsym(u.ux0, u.uy0)` | `js/display.js` | Redraws every monster; sets the steed's `meverseen` | Pinned by clearing `meverseen` across a mount | `done` | -- |
| `see_wsegs()` and `Sting_effects()` inside it | Need a long worm or `Warn_of_mon` | `js/display.js` | | Both throw; neither is reachable on a level this port generates | `later` | Port with worms and warning artifacts |
| `nomul(0)`, `notice_mon_off()`, `vision_recalc(0)`, `notice_mon_on()`, `notice_all_mons(TRUE)` | In C's order | `js/hack.js`, `js/vision.js` | Stops a run; suspends and resumes the accessibility notices | Unit-pinned | `done` | -- |
| `switch_terrain()` under `teleds()`'s own test | After `vision_recalc(0)` | `js/hack.js` | `flags.terrainstatus` classification | Extracted from `switch_terrain_for_legal_move()`, whose folded condition belonged to `spoteffects()` | `done` | -- |
| `spoteffects(TRUE)` | After the terrain test | `js/hack.js` | Room entry, pickup | Extracted from `domove()`, which now calls it; `gi.in_steed_dismounting` gates the pickup | `done` | -- |
| `invocation_message()` | After `spoteffects()` | `js/hack.js` | Message | Guarded; `Invocation_lev()` needs Gehennom | `cannot-occur` | -- |
| The punishing ball, an engulfed hero, a mimic hero, the vault guard, `TELEDS_TELEPORT` | Each guarded | `js/teleport.js` | | Five refusals, each unit-pinned | `later` | Port with the ball, engulfing, polymorph, vaults and teleportation |

### `dismount_steed()`, `steed.c:576-822`, and `landing_spot()`, `steed.c:459-566`

| Upstream function or branch family | Reachability and ordering | JavaScript owner | State, randomness, and output | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| `landing_spot()`'s direction scan and three passes | Runs before the `!u.usteed` sanity check | `js/steed.js` | `rn2(viable)` breaks a tie between equally distant squares | Nine matrix segments plus unit tests for the trap pass, the boulder pass, an occupied square and the impaired start | `done` | -- |
| `landing_spot()`'s `(j % 1) != 0` grid-bug test | `DISMOUNT_POLY` only | `js/steed.js` | | Preserved as written; the expression is zero for every `j`, so the arm never skips a direction | `done` | -- |
| `landing_spot()`'s `DISMOUNT_KNOCKED` preferred direction and its `rn2(2)` | `uhitm.c` knockback only | `js/steed.js` | | Refuses | `later` | Port with knockback combat |
| `landing_spot()`'s `enexto()` fallback behind `forceit` | Every reason but `BYCHOICE` and the first `KNOCKED` call | `js/steed.js` | | Refuses | `later` | Port with the fall arms |
| `landing_spot()`'s `!throws_rocks(gy.youmonst.data)` conjunct | Boulder pass | `js/steed.js` | | `cannot-occur`: every `throws_rocks()` species is `bigmonst()`, and `can_ride()` refuses a big hero the saddle | `cannot-occur` | -- |
| `u.usteed = 0` around `ufly`, `ulev` and `u_locomotion("fall")` | Before the switch | `js/steed.js` | | Omitted deliberately and documented at the site: all three values feed only the refused `_FELL`, `_THROWN` and `_KNOCKED` arms | `cannot-occur` | -- |
| `u_locomotion()` itself | Read by the fall arms | `js/hack.js` | | Ported and unit-pinned | `done` | -- |
| `DISMOUNT_BYCHOICE`'s cursed-saddle arm | First test in the arm | `js/steed.js` | Message; sets `bknown`; returns still mounted | Unit-pinned both ways. A starting saddle is never cursed: `mkobj.c`'s `TOOL_CLASS` switch has no `blessorcurse()` case for `SADDLE`, so this needs a saddle from elsewhere | `done` | -- |
| `DISMOUNT_BYCHOICE`'s `!have_spot` arm | Second test | `js/steed.js` | Message; returns still mounted | Unit-pinned by walling the hero in | `done` | -- |
| The unnamed-steed line and its Hallucination follow-up | Third test | `js/steed.js` | Message | `seed0103` step 25 and all nine matrix segments; the Hallucination line is ported and unreachable | `done` | -- |
| `You("dismount %s.")` for a named steed | Needs `has_mgivenname()` | `js/steed.js` | Message | Ported; `#name` is not, so no starting steed carries a given name | `done` | -- |
| `heal_legs(1)` behind `repair_leg_damage` | After the switch | `js/steed.js` | | Refuses; nothing sets `uprops[WOUNDED_LEGS]` and `mount_steed()` refuses a hero who has it | `later` | Port with `set_wounded_legs()` |
| `u.usteed = NULL`, `u.ugallop = 0`, `steed_vs_stealth()` | Release | `js/steed.js` | May print "You seem less noisy now." | Both pinned | `done` | -- |
| The `u.utraptype` trio setting `mtmp->mtrapped` | After the release | `js/steed.js` | | Pinned over all five relevant `TT_` values. `TT_BEARTRAP` is 1, not 0, so an untrapped hero matches none of the three | `done` | -- |
| `enexto()` for an occupied hero square | Needs an engulfer that plucked the hero | `js/steed.js` | | Refuses | `later` | Port with engulfing |
| `place_monster()` inside `gi.in_steed_dismounting` | Puts the steed on the hero's square | `js/monst.js` | | Nine matrix segments | `done` | -- |
| The `DISMOUNT_BONES` `rloc_to()`/`rloc()` arm | `bones.c` only | `js/steed.js` | | Refused at the switch | `later` | Port with bones files |
| The pool and lava drop | Needs a liquid hero square | `js/steed.js` | | Refuses, and deliberately wider than C: `grounded()` is not ported, so a flying steed is refused too | `later` | Port with `killed()` and `adjalign()` |
| `teleds(cc, TELEDS_ALLOW_DRAG)` inside `gi.in_steed_dismounting` | Moves the hero to the landing spot | `js/teleport.js` | | Nine matrix segments | `done` | -- |
| `sokoban_guilt()` and the `save_utrap` `mintrap()` | Need a Sokoban level or a trapped hero | `js/steed.js` | | Both refuse | `later` | Port with Sokoban and hero traps |
| The `enexto()`/`killed()`/`monkilled()` arms for a hero who cannot move | Need a held, engulfed or boxed-in hero | `js/steed.js` | | Refuses; the `BYCHOICE` arm has already returned for the boxed-in case | `later` | Port with engulfing and combat |
| `float_down(0L, W_SADDLE)` | After the placement | `js/trap.js` | `disp.botl`, `nomul(0)`, `encumber_msg()`, `pickup(1)` | Nine matrix segments plus unit tests for each refusal | `done` | -- |
| `encumber_msg()`, `vision_full_recalc = 1` | After `float_down()` | `js/pickup.js`, `js/steed.js` | | Nine matrix segments | `done` | -- |
| `uwep && is_pole(uwep)` setting `gu.unweapon` | Last statement | `js/steed.js` | | Pinned with the Knight's lance | `done` | -- |
| The other seven `DISMOUNT_` reasons | `hack.h:347-356` | `js/steed.js` | | Each refuses at the switch and names its C callers; unit-pinned | `later` | Port with the subsystem each belongs to |

### Consequences of the field going live

| Upstream function or branch family | Reachability and ordering | JavaScript owner | State, randomness, and output | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| `hack.c weight_cap():4325-4327`, the `u.usteed && strongmonst()` arm | Every capacity read while mounted | `js/hack.js` | Raises the cap to `MAX_CARR_CAP` | Was dropped; a pony is `M2_STRONG`, so this was live and wrong the moment the field was set. Fixed and unit-pinned | `done` | -- |
| `botl.c:1194` `bl_fly`, the steed term of `Flying` | Status line | `js/display.js` | | Was dropped; four other copies of the macro carried it. Fixed and unit-pinned; no reachable steed flies | `done` | -- |
| `hack.c domove_core()`'s `stucksteed()`, steed coordinate updates, `exercise_steed()` and `u_on_newpos()` | Every step a mounted hero takes | `js/hack.js` | | `domove()` now refuses a mounted hero, so the steed's coordinates cannot go stale in silence | `later` | The riding-movement slice |
| `allmain.c moveloop_core():541`, the second `vision_recalc()` | Between the command and the next monster scan | `js/allmain.js` | | Was absent, so the flag `dismount_steed()` sets reached the monster scan and stopped the cloned planning round. Added | `done` | -- |
| `hack.h:347-356` `enum dismount_types` | Every `dismount_steed()` caller | `js/const.js` | | The port's eight values were in the wrong order. Corrected; `landing_spot()` compares against three of them | `done` | -- |
| The steed's own monster turn | The turn each `#ride` charges | `js/unported_monster_actions.js` | `mcalcmove()` draws a ration for the steed and `u_calc_moveamt()` draws a second | The preflight's `special starting-pet state` refusal no longer names a steed; `dog_goal()` returns -2 for one, which `js/dogmove.js` already ported | `done` | -- |
| The remaining 34 readers of `u.usteed` | | | | Audited one by one against their C owners: all match or refuse deliberately. `js/hack.js:676` (closed door) and `js/insight.js:653` (enlightenment) refuse wider than C on purpose | `done` | -- |

## Validation

- Commit checked: pending; the slice's implementation is one commit.
- Source review: `steed.c` 176-382 and 459-848; `teleport.c teleds()` 448-573;
  `trap.c` `set_utrap()`, `reset_utrap()`, `fill_pit()`, `float_down()`;
  `hack.c` `spoteffects()`, `switch_terrain()`, `u_locomotion()`,
  `invocation_message()`, `notice_all_mons()`, `weight_cap()`,
  `domove_core()`; `polyself.c` `float_vs_flight()` and `steed_vs_stealth()`;
  `mon.c set_ustuck()`; `display.c see_monsters()`; `region.c
  update_player_regions()`; `cmd.c xytodir()`/`dirtocoord()`; `vault.c
  vault_occupied()`; `dogmove.c finish_meating()`; `allmain.c moveloop_core()`.
- Focused tests: `scripts/dismount-steed.test.mjs`, 41 tests. Every one was
  observed failing before it was kept, by breaking the line it covers.
- Full suite: `npm run checkpoint` passes.
- Generated-file checks: all five pass.
- Fresh differentials: `scripts/run-ride-dismount.mjs`, nine segments, all
  passing on the random-number log, the complete screens and attributes, and the
  cursors. `scripts/run-mount-steed.mjs` and `scripts/run-ride-direction.mjs`
  still pass unchanged.
- Development score: 476/7765 screens and 100,829/610,816 random-number values
  before the slice; 493/7765 and 100,917/610,816 after, 1/33 sessions either way.
- Quality check: the orchestrator owns it.
- Browser check: `.agents/validation.md` exempts a shared-renderer change.

## Readiness

Current readiness: `Ready for audit`

Reason: every row is `done`, `later` or `cannot-occur`; none is `missing` or
`undecided`.
