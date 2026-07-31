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
- Exclusions, each to be justified from source in the table below:
  - Seven of the eight `DISMOUNT_` reasons in `hack.h:348-355`. `doride()`
    passes `DISMOUNT_BYCHOICE` and nothing else in this slice reaches
    `dismount_steed()`.
  - Riding movement and riding combat. `seed0104-knight-ride-combat` may need
    them after mounting; the slice-selector reads that session's next boundary
    once this slice closes.

## How the candidate list was built

- Upstream entry points: `steed.c mount_steed()`'s success arm (358-382) and
  `steed.c dismount_steed()` (576-822).
- Dispatch tables and catalogs: the `DISMOUNT_` enumeration at `hack.h:348-355`;
  `TELEDS_ALLOW_DRAG`, the flag `mount_steed()` passes `teleds()`.
- Reachable helpers: absent and needed by this slice are `teleds()`,
  `steed_vs_stealth()`, `maybewakesteed()`, `dismount_steed()` and `is_pole()`.
  Present: `setuwep()` in `js/worn.js`, `place_monster()` and
  `remove_monster()` in `js/monst.js`.
- JavaScript cross-check: `grep -rln "function <name>" js/` was run for each
  helper above and its result recorded in the preceding entry. The worker
  records the further searches it runs, and in particular must search for every
  reader of `u.usteed`, because this is the first slice that ever sets it: at
  `1f0e7d5` those readers were `js/hack.js:544`, `js/hack.js:963`,
  `js/hack.js:1453`, `js/light.js:138` and `js/engrave.js:169`, and a live
  `u.usteed` changes what each of them answers.
- Remaining limits: the candidate list is complete for the success arm and
  incomplete for `dismount_steed()`, whose 247 lines the worker must walk
  branch by branch before claiming any row `cannot-occur`.

## Status values

Assign exactly one status to every row: `done`, `no-effect-yet`, `later`,
`cannot-occur`, `missing`, or `undecided`, as
`.agents/implementation-checklist-template.md` defines them.

## Implementation table

| Upstream function or branch family | Reachability and ordering | JavaScript owner | State, randomness, and output | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| `maybewakesteed()` | First statement of the success arm | `js/steed.js` | May wake the steed | Absent | `missing` | Port |
| The `Levitation` arm, "%s magically floats up!" | Needs `Lev_at_will` | `js/steed.js` | Message | Unreachable in the recorded case | `undecided` | Port or refuse, with the source reason |
| `You("mount %s.")` and the `Flying` arm | After the Levitation arm | `js/steed.js` | Message | `seed0103` step 19 records "You mount the saddled pony." | `missing` | Port |
| `uwep && is_pole(uwep)` clearing `gu.unweapon` | Before `u.usteed` is set | `js/steed.js`, `js/worn.js` | Changes hero state | `is_pole()` absent | `missing` | Port |
| `u.usteed = mtmp` | The first write of this field in the port's history | `js/steed.js` | Changes hero state | Five existing readers listed above | `missing` | Port, and check every reader |
| `steed_vs_stealth()` and the `was_stealthy` comparison | After `u.usteed` is set | `js/steed.js` | May print "You aren't stealthy anymore." | Absent | `missing` | Port |
| `remove_monster()` then `teleds(..., TELEDS_ALLOW_DRAG)` | Last two state changes | `js/monst.js`, `js/teleport.js` or `js/steed.js` | Moves hero and steed | `remove_monster()` ported; `teleds()` absent | `missing` | Port `teleds()` in the file its C source maps to |
| `disp.botl = TRUE` | Last statement | `js/steed.js` | Redraws the status line | | `missing` | Port |
| `dismount_steed(DISMOUNT_BYCHOICE)` | `doride()`'s first arm once `u.usteed` is set | `js/steed.js` | Message, position changes | `seed0103` step 25 records the unnamed-steed line | `missing` | Port the BYCHOICE path |
| The other seven `DISMOUNT_` reasons | `hack.h:348-355` | `js/steed.js` | | `doride()` passes BYCHOICE only | `later` | Refuse each, and cite its only caller |
| Riding movement and riding combat | After this slice | | | `seed0104` may need them | `later` | The slice-selector reads that session next |

## Validation

- Commit checked: not yet. Slice 3 has not started.
- Source review: pending.
- Focused tests: pending.
- Full suite: `npm run checkpoint` passes at `d6fd1e2`, before the slice.
- Generated-file checks: all five pass at `d6fd1e2`.
- Fresh differentials: pending. The worker chooses seeds independently. At
  minimum: one mount followed by a dismount, which `seed0103` shows is a single
  recordable sequence, and one case that establishes whether the success arm or
  the dismount makes any random-number call.
- Development score: 476/7765 screens, 100,829/610,816 random-number values,
  1/33 sessions at `d6fd1e2`, measured by the orchestrator.
- Quality check: gate clear at `d6fd1e2`; the advisory has fired for the
  `commands` area at 649 of 1,000 lines. Implementation continues, and the
  orchestrator owns the pass this schedules.
- Browser check: `.agents/validation.md` exempts a shared-renderer change.

## Readiness

Current readiness: `Implementation`

Reason: no row is `done`; slice 3 has not started.
