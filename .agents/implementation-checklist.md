# Implementation checklist: the hero descends a staircase, slice 2

Working record of implementation evidence for slice 2 of the goal `ROADMAP.md`
opened at `4fe8028`: leaving the level. It supplements the required source
review, tests, fresh differentials, and the workflows in `.agents/workflow.md`
and `.agents/review.md`.

`goto_level()` is 520 C lines, so the goal splits it. This slice takes its
opening and stops before the destination is chosen. Slice 3 generates and draws
D:2; slice 4 is the restore path, which no recorded session reaches.

## Boundary

- Roadmap item: In progress: the hero descends a staircase, slice 2.
- Starting code commit: `53ed46c`.
- Starting event: `dodown()` reaches its call to `goto_level()`, where slice 1
  left a fail-closed refusal.
- Ending event: `goto_level()` has discarded the leaving level's context and is
  about to choose the destination. **No screen changes and nothing is
  generated.** The observable boundary is the refusal that replaces the
  destination choice, and the state the port holds when it reaches it.
- Valid inputs: the hero on a down staircase on D:1 pressing `>`. Exactly one
  development session does this.
- Observables: the `svc.context` fields the discard clears; `u.utrap`; the pet
  state `keepdogs(FALSE)` collects; what `vision_recalc(2)` writes; and that
  this path makes no random-number call before the destination is chosen.
  Verify that by measurement.
- Exclusions, each to be justified from source in the table below:
  - `mklev()`, the hero placement and `docrt()`, which are slice 3. The refusal
    sits before the destination is chosen.
  - `savelev()` and `getlev()`, slice 4. A first descent generates.
  - The amulet and quest guards, which need dungeon state D:1 cannot reach.

## How the candidate list was built

- Upstream entry points: `do.c goto_level()` (1478-1998). This slice covers its
  guards, the context discard, `keepdogs(FALSE)` and `vision_recalc(2)`.
- Dispatch tables and catalogs: none here. The destination tables are slice 3's.
- Reachable helpers: `docrt()` is ported in `js/display.js`, `mklev()` and
  `u_on_upstairs()` in `js/mklev.js`, none of which this slice calls.
  `reset_utrap()` is in `js/trap.js` from the steed goal and `vision_recalc()`
  in `js/vision.js`. Absent: `keepdogs()`, `maybe_reset_pick()`,
  `reset_trapset()`, `check_special_room()`.
- JavaScript cross-check: `grep -rln "function <name>" js/` for each helper
  above. The worker records its further searches, and must search for every
  reader of the `svc.context` fields the discard clears: clearing a field the
  port reads elsewhere is the failure mode here.
- Remaining limits: `keepdogs()` is unsized. It collects the pets that follow
  the hero and the port's pet handling is extensive. Size it before writing it,
  and tell the orchestrator if it alone justifies a slice.

## Status values

Assign exactly one status to every row: `done`, `no-effect-yet`, `later`,
`cannot-occur`, `missing`, or `undecided`, as
`.agents/implementation-checklist-template.md` defines them.

## Implementation table

| Upstream function or branch family | Reachability and ordering | JavaScript owner | State, randomness, and output | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| The amulet and Gehennom guard | Needs the amulet | `js/do.js` | Message | Unreachable from D:1 | `cannot-occur` | Cite the dungeon state |
| The quest guard | Needs a quest portal | `js/do.js` | Message | Unreachable from D:1 | `cannot-occur` | Cite it |
| The tethered-movement arm | Needs a tether | `js/do.js` | | | `undecided` | Establish reachability |
| `maybe_reset_pick()` | First of the discard | `js/dig.js` or `js/do.js` | Clears the carried pick context | Absent | `missing` | Port or refuse |
| `reset_trapset()` | Second | `js/trap.js` | Clears the to-be-armed trap | Absent | `missing` | Port or refuse |
| The digging-context discard | Third | `js/dig.js` | Level-aware and resumable | Absent | `missing` | Port or refuse |
| `check_special_room(TRUE)` | Fourth | `js/mkroom.js` | May print | Absent | `missing` | Port or refuse |
| `reset_utrap(FALSE)` | Fifth | `js/trap.js` | Clears `u.utrap` | Ported by the steed goal | `missing` | Connect it here |
| `keepdogs(FALSE)` | After the discard | `js/dog.js` | Collects the following pets | Absent and unsized | `undecided` | Size it first; it may need its own slice |
| `vision_recalc(2)` | Last before the destination | `js/vision.js` | Rebuilds the vision buffers | Ported | `missing` | Connect it, and check the argument |
| The destination choice, `mklev()`, placement, `docrt()` | After this slice | `js/do.js`, `js/mklev.js` | Generates and draws | Slice 3 | `later` | Refuse before the choice |
| `savelev()`, `getlev()` | Returning to a visited level | | | Slice 4 | `later` | Refuse |

## Validation

- Commit checked: not yet. Slice 2 has not started.
- Source review: pending.
- Focused tests: pending.
- Full suite: passes at `53ed46c` on Node 22 and Node 24.
- Generated-file checks: all five pass at `53ed46c`.
- Fresh differentials: pending. This slice changes no screen, so the
  differential proves the port reaches the new refusal with the same
  random-number prefix and the same screens as before. A case that changes a
  screen means the slice overran its boundary.
- Development score: 487/7,765 screens and 100,910/610,816 random-number values
  at `53ed46c`. `scripts/score-baseline.mjs` holds a per-session baseline, so
  `npm run checkpoint` fails if any session drops.
- Quality check: gate clear and advisory clear at `53ed46c`.
- Browser check: `.agents/validation.md` exempts a shared-renderer change.

## Readiness

Current readiness: `Implementation`

Reason: no row is `done`; slice 2 has not started.
