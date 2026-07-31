# Implementation checklist: the hero walks onto a floor square holding more than one object

This checklist is a working record of implementation evidence for the goal
`ROADMAP.md` opened at `24822e2`. It supplements the required source review,
tests, fresh differentials, and the workflows in `.agents/workflow.md` and
`.agents/review.md`.

The goal holds three slices. This checklist covers **slice 1**, the
`Things that are here:` window itself. Slices 2 and 3 — the `skip_objects`
count line and a pile on a decorated square — are `later` here and get their
own coverage when they open.

## Boundary

- Roadmap item: In progress: the hero walks onto a floor square holding more
  than one object — slice 1, the object-pile window.
- Starting code commit: to be filled with the full SHA of the commit this slice
  starts from, once the roadmap and checklist commit lands.
- Starting event: `domove_core()` completes a walking hero's one-square step
  onto a ROOM or CORR square holding two or more objects, and reaches
  `pickup.c pickup()` with `!flags.pickup`.
- Ending event: the `Things that are here:` window is dismissed, the corner is
  repaired, and the next command prompt is drawn — the complete screen and
  cursor at the end of the hero's command.
- Valid inputs: any seed, datetime, role, race and option set with
  `!autopickup` that puts the hero one ordinary step from a ROOM or CORR square
  holding two or more objects, with no boulder, trap, region, engraving or
  decorated terrain on it. No new command is involved; the hero's input is an
  ordinary move or run.
- Observables: the window's heading and item lines, `offx`/`offy` geometry, the
  `(end)` prompt and its dismissal, the `docorner()` repair, the complete 24x80
  screens and attributes, the cursor, `multi` and the run stop `nomul(0)`
  performs, and the random-number calls, of which this path should make none.
- Exclusions, each to be justified from source in the table below:
  - `skip_objects` (`invent.c:4251-4276`) — slice 2. The refusal at
    `js/invent.js:452` stands.
  - The `dfeature` header `putstr()` pair at `4291-4294` — slice 3. The refusal
    at `js/hack.js:445` stands and admits no decorated square.
  - `will_feel_cockatrice()`, `Blind`, `u.uswallow`, `is_pool`/`is_lava`,
    `visible_region_at()`, a seen trap, and an engraving. Each is refused
    before this path today; the row for each must cite the refusal and show it
    precedes any state change, draw or output.
  - `autopick()` and `pickup_object()` — the whole autopickup arm.
    `js/hack.js:431` refuses `flags.pickup` first.

## How the candidate list was built

- Upstream entry points: `invent.c look_here()` (4104-4315), and in particular
  its final `else` arm (4285-4312); `pickup.c pickup()`'s
  `(autopickup && !flags.pickup)` early return into `check_here()`;
  `win/tty/wintty.c tty_putstr()`'s NHW_MENU case, `tty_display_nhwindow()`'s
  NHW_MENU arm, `process_text_window()`, `dmore()`,
  `tty_dismiss_nhwindow()` and `erase_menu_or_text()`; `topl.c`'s
  `display_nhwindow(WIN_MESSAGE, FALSE)` arm.
- Dispatch tables and catalogs: `doname_with_price()` and the object naming it
  reaches; `flags.pile_limit`, which selects between the count line and this
  window; the `compress_str()` and `CO` line-break behavior that decides how
  many rows the window occupies.
- Reachable helpers: to be completed by the worker. Every call inside the
  final `else` arm and every tty function it reaches must be traced through the
  ending event, including the `n0 > CO` recursion in `tty_putstr()`.
- JavaScript cross-check: `js/hack.js:432` throws
  `unsupported hero move: floor object pile`; `js/invent.js:451-456` throws
  `the object-pile menu`; `js/tty_menu.js:340` `displayTtyTextWindow()`
  hardcodes `offx = 0`. Both throws and the hardcoded offset were read at
  `24822e2`. The worker records the searches it runs for further stops.
- Remaining limits: the candidate list is incomplete until the worker completes
  `Reachable helpers` and `JavaScript cross-check`. The tty geometry is the
  part most likely to hide a candidate, because a wrong `maxcol` misses every
  cell in the window rather than one.

## Status values

Assign exactly one status to every row: `done`, `no-effect-yet`, `later`,
`cannot-occur`, `missing`, or `undecided`, as
`.agents/implementation-checklist-template.md` defines them.

## Implementation table

| Upstream function or branch family | Reachability and ordering | JavaScript owner | State, randomness, and output | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| `look_here()` final `else` arm, 4285-4312 | Runs when `otmp && otmp->nexthere && !skip_objects` and no earlier guard holds; after `pickup()`'s early return and `check_here()`'s `flush_screen(1)` | `js/invent.js look_here()` | Writes the window; no draw | `js/invent.js:452` refuses it today | `missing` | Port the arm |
| `display_nhwindow(WIN_MESSAGE, FALSE)` and its `TOPLINE_NEED_MORE -> more()` arm | First statement of the arm | None found | May emit a `--More--` | No owner located at `24822e2` | `missing` | Locate or port the owner; decide whether the arm can fire here |
| `tty_putstr()` NHW_MENU case, incl. `compress_str()` and the `n0 > CO` split | Once per `putstr()`, before any layout | `js/tty_menu.js` | Sets `maxcol`, `maxrow` | — | `missing` | Port; the split changes both |
| `tty_display_nhwindow()` NHW_MENU arm, `offx = max(10, cols - maxcol - 1)`, `offy = 0`, dispatch to `process_text_window()` because `cw->data` is set | After every `putstr()` | `js/tty_menu.js`; neither existing path fits alone | Draws the window | `displayTtyTextWindow()` hardcodes `offx = 0` | `missing` | Port a path with menu geometry and the text line loop |
| `dmore()` and the `(end)` prompt at `offx + 1` | After the last line | `js/tty_menu.js` | Draws the prompt; consumes the dismissing key | — | `missing` | Port |
| `tty_dismiss_nhwindow()` -> `erase_menu_or_text()` -> `docorner(offx, maxrow + 1, 0)` | On dismissal | `js/tty_menu.js dismissTtyMenu()` already models `maxrow + 1` | Repaints the corner | — | `undecided` | Confirm the existing repair applies unchanged |
| `read_engr_at()` after `destroy_nhwindow()` | Last statement of the arm | `js/invent.js readEngraving()` | Would print | `js/hack.js:453` refuses an engraving on an admitted square | `cannot-occur` | Cite the refusal in the row's evidence |
| `feel_cockatrice()` / `will_feel_cockatrice()` inside the loop | Corpse only | `js/invent.js` | Breaks the loop early | `js/invent.js:457` refuses it | `later` | Slice outside scope |
| `skip_objects` count line, 4251-4276 | `flags.pile_limit` selects it | `js/invent.js` | Message only | `js/invent.js:452` refuses it | `later` | Slice 2 |
| `dfeature` header `putstr()` pair, 4291-4294 | Decorated square only | `js/invent.js` | Two extra lines | `js/hack.js:445` refuses it | `later` | Slice 3 |
| `pickup()`'s `nomul(0)` run stop | On the same path | `js/pickup.js check_here()` | Sets `multi` | Reported already ported | `undecided` | Confirm by execution, not by reading |

## Missing work by owner

1. `js/tty_menu.js`: the NHW_MENU-geometry text window, `tty_putstr()`'s
   NHW_MENU case with the `CO` split, `dmore()` and the `(end)` prompt, and the
   `docorner()` repair. Prerequisite for the rest, because the window cannot be
   validated without it.
2. `js/invent.js look_here()`: the final `else` arm, replacing the
   `the object-pile menu` half of the throw at 451-456 and leaving the
   `skip_objects` half standing.
3. `js/hack.js requireSimpleHeroDestination()`: drop the `nexthere` throw at
   432 and keep every other refusal.
4. `display_nhwindow(WIN_MESSAGE, FALSE)`: find or port an owner, and settle
   whether its `more()` arm can fire on this path.

## Validation

- Commit checked: not yet — slice 1 has not started.
- Source review: pending.
- Focused tests: pending.
- Full suite: `npm run checkpoint` passes at `24822e2`, before the slice.
- Generated-file checks: all five pass at `24822e2`.
- Fresh differentials: pending. A candidate case reported as reaching the
  boundary is seed `7300031`, datetime `20310203040506`, a female neutral human
  Valkyrie with `pettype:none,!autopickup`, moves `"j"`, stepping from `<47,2>`
  onto a two-object ROOM square at `<47,3>`. **This is a reported candidate,
  not verified evidence**: the worker confirms it independently, then varies
  pile size, `quan > 1` stacks, a corridor square, a name long enough to drive
  `offx` toward 10, and a run that the pile stops.
- Development suite: 467/7765 screens, 100,825/610,816 random-number values,
  1/33 sessions at `24822e2`, measured before the slice.
- Quality check: gate clear, advisory clear at `24822e2`.
- Browser check: required if the tty rendering changes reach browser-only
  presentation; `.agents/validation.md` otherwise exempts a shared-renderer
  change. Decide when the diff exists.

## Readiness

Current readiness: `Implementation`

Reason: no row is `done`; slice 1 has not started.
