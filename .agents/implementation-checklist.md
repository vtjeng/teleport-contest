# Implementation checklist: the hero rides a saddled steed, slice 2

This checklist is a working record of implementation evidence for slice 2 of the
goal `ROADMAP.md` opened at `1f0e7d5`, the failed mount. It supplements the
required source review, tests, fresh differentials, and the workflows in
`.agents/workflow.md` and `.agents/review.md`.

It exists because slice 1 changed 531 production lines across six `js/` files
and two quality areas, and slice 2 ports `mount_steed()`, 190 C lines holding
fourteen guard branches, plus two helpers the port lacks. Slices 1 and 3 are
`later` here.

## Boundary

- Roadmap item: In progress: the hero rides a saddled steed, slice 2, the
  failed mount.
- Starting code commit: `e33c026904d1f01e18fbd7ff5a4e4bd4d40d1e93`, where slice
  1 closed.
- Starting event: `steed.c doride()` passes its `isok(u.ux + u.dx, u.uy + u.dy)`
  test and calls `mount_steed(m_at(u.ux + u.dx, u.uy + u.dy), FALSE)`. The port
  reaches this point and refuses there today.
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
- Exclusions, each to be justified from source in the table below:
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
  167.
- Dispatch tables and catalogs: `mons[]` for `PM_LONG_WORM` and the steed's
  `permonst`; `SADDLE` through `which_armor(mtmp, W_SADDLE)`; `MAXULEV`, which
  is 30 and makes the roll `rnd(20)`.
- Reachable helpers: `near_capacity()` is in `js/hack.js`, `touch_petrifies()`
  and `is_swimmer()` in `js/mondata.js`, `greatest_erosion()` in `js/obj.js`,
  `which_armor()` in `js/weapon.js`, `can_saddle()` in `js/dog.js`, `newsym()`
  in `js/display.js`, `hliquid()` in `js/do_name.js`. Absent: `can_ride()`,
  `trapname()`, `mhe()`, `m_unleash()`, `is_metallic()`, `a_monnam()`,
  `x_monnam()`, `losehp()` and `Maybe_Half_Phys()`. `mon_nam()` and `Monnam()`
  are ported under different names, `monsterCommonName()` and
  `capitalizedMonsterName()` in `js/do_name.js`.
- JavaScript cross-check: `grep -rln "function <name>" js/` was run for each
  helper above and its result recorded in the preceding entry. The worker
  records the further searches it runs.
- Remaining limits: the candidate list is complete for `mount_steed()`'s own
  branches and incomplete for what `losehp()` reaches. `hack.c losehp()` (4256)
  can kill the hero and enter `done()`, which no part of this slice covers, so
  the worker must establish that the recorded cases lose fewer hit points than
  the hero has and refuse the death path.

## Status values

Assign exactly one status to every row: `done`, `no-effect-yet`, `later`,
`cannot-occur`, `missing`, or `undecided`, as
`.agents/implementation-checklist-template.md` defines them.

## Implementation table

| Upstream function or branch family | Reachability and ordering | JavaScript owner | State, randomness, and output | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| `mount_steed()` guards 1-4: `u.usteed`, `Hallucination`, `Wounded_legs`, `Upolyd` | Before any roll | `js/steed.js` | Message only, then FALSE | None yet | `missing` | Port or refuse each, and say which |
| Guards 5-8: `near_capacity() > SLT_ENCUMBER`, `!mtmp`/`Blind`/`mundetected`, `PM_LONG_WORM` tail, `u.uswallow`/`ustuck`/`utrap`/`Punished` | Before any roll | `js/steed.js` | Message only | `near_capacity()` ported in `js/hack.js` | `missing` | Port; each needs a source-pinned test |
| Guard 9: `!otmp`, the `which_armor(mtmp, W_SADDLE)` test | Decides "%s is not saddled." | `js/steed.js` | Message only | `which_armor()` in `js/weapon.js` | `missing` | Port |
| Guards 10-12: `touch_petrifies()`, `!mtmp->mtame`/`isminion`, `mtmp->mtrapped` | Before the tame decrement | `js/steed.js` | `mtrapped` arm calls `trapname()` | `touch_petrifies()` in `js/mondata.js`; `trapname()` absent | `missing` | Port; `trapname()` comes with it |
| Guard 13: `!force && !Role_if(PM_KNIGHT) && !(--mtmp->mtame)` | Writes `mtmp->mtame` even when it does not fire | `js/steed.js` | Changes monster state; `newsym()`, `m_unleash()` | Both recorded sessions are Knights, so the decrement is skipped | `missing` | Port; a non-Knight case pins the decrement |
| Guards 14-17: `Underwater`, `can_saddle`/`can_ride`, `Levitation`, metallic eroded `uarm` | Immediately before the roll | `js/steed.js` | Message only | `can_saddle()` in `js/dog.js`; `can_ride()` absent | `missing` | Port; `can_ride()` comes with it |
| The impairment roll, `u.ulevel + mtmp->mtame < rnd(MAXULEV / 2 + 5)` | The first random-number call this slice makes | `js/steed.js` | One `rnd(20)` | `seed0103` step 12 records the slip | `missing` | Port; the roll must be the only call before the message |
| The `Levitation` arm inside the failure, "%s slips away from you." | Only with Levitation | `js/steed.js` | Message, returns FALSE before `losehp()` | Unreachable in the recorded cases | `undecided` | Decide whether to port or refuse |
| `You("slip while trying to get on %s.")` and `x_monnam()` for `buf` | After the roll fails | `js/do_name.js`, `js/steed.js` | Message; `x_monnam()` with `SUPPRESS_IT`, `SUPPRESS_INVISIBLE`, `SUPPRESS_HALLUCINATION` | `x_monnam()` absent; `Monnam()`'s missing `do_it` branch is a recorded divergence under `## Unresolved` | `missing` | Port `x_monnam()`; check whether the `do_it` gap is reachable here |
| `losehp(Maybe_Half_Phys(rn1(5, 10)), buf, NO_KILLER_PREFIX)` | Second and last random-number call | `js/hack.js` | Removes hit points, redraws the status line, can kill | `losehp()` absent at `hack.c:4256` | `missing` | Port; refuse the death path and say so |
| Success path, 358-382 | Roll passes | `js/steed.js` | Sets `u.usteed`, `teleds()`, `disp.botl` | Refused today | `later` | Slice 3 |
| `dismount_steed()` (`steed.c:576`) | `u.usteed` set | `js/steed.js` | | `u.usteed` never set in this slice | `later` | Slice 3 |

## Validation

- Commit checked: not yet. Slice 2 has not started.
- Source review: pending.
- Focused tests: pending.
- Full suite: `npm run checkpoint` passes at `e33c026`, before the slice.
- Generated-file checks: all five pass at `e33c026`.
- Fresh differentials: pending. The worker chooses seeds independently and does
  not copy `seed0103`'s inputs. At minimum: one slip on a Knight, one slip on a
  non-Knight so the `--mtmp->mtame` decrement is exercised, and one guard that
  returns before the roll so the case makes no random-number call at all.
- Development score: 469/7765 screens, 100,825/610,816 random-number values,
  1/33 sessions at `e33c026`, measured by the orchestrator.
- Quality check: gate clear, advisory clear at `e33c026`. The `commands` area
  stands at 492 of 1,000 lines.
- Browser check: `.agents/validation.md` exempts a shared-renderer change.
  Decide when the diff exists.

## Readiness

Current readiness: `Implementation`

Reason: no row is `done`; slice 2 has not started.
