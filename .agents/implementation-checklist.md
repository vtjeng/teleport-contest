# Implementation checklist: the hero eats, slice 3

Working record of implementation evidence for slice 3 of the goal `ROADMAP.md`
opened at `7f448a5`, the multi-turn occupation. It supplements the required
source review, tests, fresh differentials, and the workflows in
`.agents/workflow.md` and `.agents/review.md`.

It exists because slice 1 changed roughly 840 production lines and slice 2
changed 534, both past the trigger, and because this slice is the first
occupation the port would own. `allmain.c moveloop_core()` runs every turn, so a
mistake here reaches every scored screen, and not only the eating path.

## Boundary

- Roadmap item: In progress: the hero eats, slice 3, the multi-turn occupation.
- Starting code commit: `02c6e59`.
- Starting event: `doeat()` selects a food whose `oc_delay` gives
  `svc.context.victual.reqtime` greater than 1, so `start_eating()` sets the
  occupation and the meal spans turns. The port refuses there today.
- Ending event: the complete screen and cursor after the last bite completes,
  `done_eating()` runs and the next command prompt is drawn.
- Valid inputs: any seed, datetime, role and option set that puts a food of
  `oc_delay` greater than 1 in the hero's inventory. A food ration is the
  ordinary case.
- Observables: `svc.context.victual.usedtime` advancing once per turn; the
  occupation being set and cleared; `multi` and `nomovemsg`; each turn's
  random-number calls, which must match C call for call across the whole meal;
  the complete 24x80 screens and cursor for every turn of it.
- Exclusions, each to be justified from source in the table below:
  - Interruption. `stop_occupation()` at `allmain.c:684` and the paths that
    reach it, including a monster appearing mid-meal. Refuse it, and say at the
    site which C callers reach it.
  - Corpses and tins, which slices 1 and 2 already refuse.
  - `eatmdone()`, the delayed-instrument callback.

## How the candidate list was built

- Upstream entry points: `allmain.c moveloop_core()` at 485-506, which calls
  `(*go.occupation)()` and clears it when the callback answers 0;
  `allmain.c stop_occupation()` (684); `eat.c eatfood()` (518-541), the
  callback, which increments `usedtime`, answers 1 while busy and calls
  `done_eating(TRUE)` when the meal ends; `set_occupation()`, which installs it.
- Dispatch tables and catalogs: `objects.h` `oc_delay` decides `reqtime` and so
  which foods reach this slice at all. Establish which comestibles have
  `oc_delay` greater than 1 before choosing a case.
- Reachable helpers: `bite()` is ported in `js/eat.js` from slice 2, as are
  `done_eating()` and `state.context.victual`. Absent: `eatfood()`,
  `set_occupation()`, `stop_occupation()`, `reset_occupations()`, and any owner
  for `go.occupation` in `js/allmain.js`. `interrupt_multi()` exists at
  `js/allmain.js:413` and is a no-op today because a run is the only way this
  port reaches a positive `multi`; that changes here.
- JavaScript cross-check: `grep -rln "function <name>" js/` was run for each
  helper above. `grep -rn "occupation" js/allmain.js` returns only
  `interrupt_multi()`'s comment, so no part of the machinery exists yet. The
  worker records the further searches it runs.
- Remaining limits: the candidate list is complete for `eatfood()` and for
  `moveloop_core()`'s occupation block. It does not cover every writer of
  `multi`, and the worker must establish which of them can fire during a meal.

## Status values

Assign exactly one status to every row: `done`, `no-effect-yet`, `later`,
`cannot-occur`, `missing`, or `undecided`, as
`.agents/implementation-checklist-template.md` defines them.

## Implementation table

| Upstream function or branch family | Reachability and ordering | JavaScript owner | State, randomness, and output | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| `set_occupation()` installing `eatfood` | End of `start_eating()` when `reqtime > 1` | `js/allmain.js` | Writes `go.occupation`, `multi`, `nomovemsg` | Absent | `missing` | Port; decide where `go.occupation` lives and say so |
| `moveloop_core()`'s occupation block, `allmain.c:485-506` | Every turn while an occupation is set | `js/allmain.js` | Calls the callback; clears it on 0 | No owner; `grep -rn occupation js/allmain.js` finds only a comment | `missing` | Port. This runs every turn, so a fault here reaches every scored screen |
| `eat.c eatfood()` (518-541) | The callback | `js/eat.js` | Increments `usedtime`; answers 1 while busy; calls `done_eating(TRUE)` | Absent | `missing` | Port |
| `eatfood()`'s `!food` and `!eating` early returns | Before the counter | `js/eat.js` | Answers 0 without changing state | | `missing` | Port; each is a distinct exit |
| `done_eating()` at the last bite | `usedtime > reqtime` | `js/eat.js` | Ported in slice 2 | Slice 2's differential | `done` | Confirm it is reached from this path, by execution |
| `stop_occupation()` (`allmain.c:684`) and every path to it | Interruption | `js/allmain.js` | Clears the occupation, prints | Out of scope | `later` | Refuse, naming the C callers |
| `interrupt_multi()` | Fires on a positive `multi` | `js/allmain.js:413` | Today a no-op, because only a run reaches positive `multi` | Its own comment says so | `undecided` | This slice makes it reachable. Establish what it must do during a meal |
| Every other writer of `multi` | During the meal | various | | Not enumerated | `undecided` | Enumerate, and say which can fire mid-meal |
| Corpses, tins, `eatmdone()` | | `js/eat.js` | | Refused by slices 1 and 2 | `later` | Keep refused |

## Validation

- Commit checked: not yet. Slice 3 has not started.
- Source review: pending.
- Focused tests: pending.
- Full suite: passes at `02c6e59` on Node 22 and Node 24, 2,203 tests.
- Generated-file checks: all five pass at `02c6e59`.
- Fresh differentials: pending. Choose seeds independently. At minimum: one
  multi-turn meal eaten to completion, and one case establishing that the
  random-number calls across the whole meal match C turn for turn. The port has
  never run a turn with an occupation set, so the differential must cover every
  turn of the meal and not only its first and last.
- Development score: 487/7,765 screens and 100,910/610,816 random-number values
  at `02c6e59`, measured by the orchestrator from `scripts/score-development.mjs`.
  `npm run checkpoint` cannot fail on the score, so its exit code is no
  evidence here.
- Quality check: gate clear and advisory clear at `02c6e59`.
- Browser check: `.agents/validation.md` exempts a shared-renderer change.

## Readiness

Current readiness: `Implementation`

Reason: no row is `done` except the one slice 2 already closed; slice 3 has not
started.
