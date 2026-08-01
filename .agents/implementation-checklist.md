# Implementation checklist: the hero descends a staircase, the shop slice

Working record of implementation evidence for the next slice of the goal
`ROADMAP.md` opened at `4fe8028`: stocking the shop that `makelevel()` asks for
on D:2. It supplements the required source review, tests, fresh differentials,
and the workflows in `.agents/workflow.md` and `.agents/review.md`.

Slices 1, 2 and 3 are closed, at `6d7aedd`, `bb4ef50` and `1cd7c32`. The hero
now descends to a D:2 the port generates, but `makelevel()`'s shop arm fires on
`u_depth > 1` alone, so about half of reachable D:2 levels stop at
`js/mkroom.js mkshop()`. This slice takes the commonest shop types.

## Boundary

- Roadmap item: In progress: the hero descends a staircase, the shop slice.
- Starting code commit: `f042aee`.
- Starting event: `js/mklev.js do_mkroom(SHOPBASE)` reaches
  `js/mkroom.js:243`'s `UnsupportedSpecialRoomError`, on the `>` path.
- Ending event: the `--More--` the arrival stops on, then the D:2 map with a
  stocked shop and its shopkeeper drawn, and the next command prompt.
- Valid inputs: the hero on a down staircase on D:1 pressing `>`, arriving on a
  D:2 whose `makelevel()` asked for a shop and whose roll selects a general
  store, an armor shop or a weapon shop.
- Observables: the single `rnd(100)` that selects the shop type and every
  random-number call `stock_room()` and `shkinit()` make after it; the shop
  room's lit cells; the shopkeeper's glyph and position; the complete D:2
  screen with attributes and cursor.

**The boundary's shape is settled, and this slice inherits it rather than
re-deriving it.** Slice 3 established that a descending segment ends on a
`--More--` over the level being left, with D:2 appearing only after the prompt
is dismissed, so a segment ends with a space rather than with `>`.

- Exclusions, each to be justified from source in the table below:
  - The scroll, potion, ring and tool name lists with `nameshk()`'s `shktools`
    arm; bookstores' `SPE_NOVEL` tribute arm; and the deli, wand and
    health-food shops, which need `mkshobj_at()`'s negative-`otyp`
    `mksobj_at()` path and `shkveg()`/`veggy_item()`/`mkveggy_at()`. Together
    these are the remaining shop rolls and are later slices.
  - C's wizard-mode `SHOPTYPE` block above the room search. The port never sets
    wizard mode and game code may not read the environment; `js/mkroom.js`
    already records this at the site.

## How the candidate list was built

- Upstream entry points: `mkroom.c mkshop()` (95-215), specifically everything
  after the room search, and `mkroom.c do_mkroom()` (52).
- Dispatch tables and catalogs: `shknam.c shtypes[]`, whose `prob` and `symb`
  columns select the shop type. `AGENTS.md`, "Generate large fixed tables from
  source", applies: write a script that emits the JavaScript table, commit the
  script, the generated file and a check comparing the two.
- Reachable helpers: read `mkroom.c:95-215` in order. Already ported and needing
  connection rather than porting: `topologize()` (`js/mklev.js:2403`),
  `stock_room()` (`js/shknam.js:298`), `shkinit()` (`js/shknam.js:209`),
  `nameshk()` (`js/shknam.js:114`), `isbig()` (`js/mkroom.js:157`),
  `invalid_shop_shape()` (`js/mkroom.js:181`), `mkshobj_at()`
  (`js/shknam.js:274`). Confirmed by `grep -rn "function <name>\b" js/`.
- JavaScript cross-check: `js/shknam.js:73-90` already holds the `ARMORSHOP`
  and `WEAPONSHOP` records, added for the two themed "twin business" shops that
  `dat/themerms.lua` names. The general store's `{100, RANDOM_CLASS}` iprobs
  and its `shkgeneral` name list are reported to exist already; verify that
  before adding a duplicate, because a second owner for one table row is the
  failure mode here.
- Remaining limits: the shop-type roll is one `rnd(100)` and its loop is
  `for (j = rnd(100), i = 0; (j -= shtypes[i].prob) > 0; i++)`. An off-by-one
  there shifts every shop type by one and **does not show in the
  random-number log**, because the draw happens either way. Only a screen
  comparison catches it. `nameshk()` is the same hazard from the other side: it
  derives the keeper's name from `ubirthday` and `m_id` and draws no random
  number.

## Status values

Assign exactly one status to every row: `done`, `no-effect-yet`, `later`,
`cannot-occur`, `missing`, or `undecided`, as
`.agents/implementation-checklist-template.md` defines them.

## Implementation table

| Upstream function or branch family | Reachability and ordering | JavaScript owner | State, randomness, and output | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| The wizard `SHOPTYPE` block, `mkroom.c:101-153` | Needs `wizard` and an environment variable | `js/mkroom.js mkshop()` | Would divert to `mkzoo()`, `mktemple()` or `mkswamp()` | The port never sets wizard mode, and `AGENTS.md` forbids reading the environment; recorded at the site | `cannot-occur` | None |
| The room search, `mkroom.c:157-177` | First statement after `gottype` | `js/mkroom.js mkshop()` | Selects the room; no randomness | Ported; it is what reaches today's refusal | `done` | None |
| The `!sroom->rlit` lighting loop, `mkroom.c:179-187` | Runs when the chosen room is unlit | `js/mkroom.js mkshop()` | Lights the room and its one-cell border, sets `rlit` | Absent | `missing` | Port; note the loop spans `lx-1` to `hx+1` |
| The shop-type roll, `mkroom.c:191-194` | Runs when `i < 0`, always so without wizard mode | `js/mkroom.js mkshop()` | **The slice's only new random-number call, one `rnd(100)`** | Absent | `missing` | Port with the generated `shtypes[]` prob column; an off-by-one is invisible in the log |
| `isbig()`'s wand and spellbook override, `mkroom.c:199-201` | A big room forces a general store | `js/mkroom.js isbig()` | Rewrites the rolled type to 0 | `isbig()` ported, not connected | `missing` | Connect it |
| `sroom->rtype = SHOPBASE + i` and `topologize()`, `mkroom.c:203-210` | After the roll | `js/mkroom.js`, `js/mklev.js topologize()` | Marks the room's type and squares | `topologize()` ported, not connected here | `missing` | Connect it |
| `needfill = FILL_NORMAL`, `mkroom.c:215` | Last statement | `js/mkroom.js mkshop()` | Defers stocking to `makelevel()`'s tail | Absent | `missing` | Port |
| `shtypes[]`'s `prob` and `symb` columns | Selects the type | Generated file plus its script | Fixed table | `js/shknam.js` holds `ARMORSHOP` and `WEAPONSHOP` only | `missing` | Generate from source with a committed script and a check |
| The general-store record | The commonest roll | `js/shknam.js` | `{100, RANDOM_CLASS}` iprobs, `shkgeneral` names | Reported present already | `undecided` | Verify before adding; do not create a second owner |
| `stock_room()`, `shkinit()`, `nameshk()` | `makelevel()`'s tail, after `mkshop()` returns | `js/shknam.js` | Stocks the shop and creates its keeper; consumes randomness | Ported | `missing` | Connect and compare the stream |
| The scroll, potion, ring and tool name lists, and `nameshk()`'s `shktools` arm | Other shop types | `js/shknam.js` | | A later slice | `later` | Refuse |
| Bookstores' `SPE_NOVEL` tribute arm | Book shops | `js/shknam.js` | | A later slice | `later` | Refuse |
| The deli, wand and health-food shops | Need `mkshobj_at()`'s negative-`otyp` path and `shkveg()`/`veggy_item()`/`mkveggy_at()` | `js/shknam.js` | | A later slice | `later` | Refuse |
| `UnsupportedSpecialRoomError` as a segment boundary | `js/jsmain.js:519-527` catches three boundary classes and not this one | `js/jsmain.js` | **Turns a fail-closed stop into a discarded segment** | `node scripts/scan-debt.mjs` fails outright at `f042aee`; the orchestrator reproduced it | `missing` | Add the class, so the refused shop types end a segment cleanly |

## Missing work by owner

1. `js/jsmain.js`, the boundary class. It is a prerequisite rather than a
   convenience: the shop types this slice does not take must end a segment
   cleanly, or they keep crashing.
2. The generated `shtypes[]` table and its check, which the roll reads.
3. `js/mkroom.js mkshop()`'s tail: lighting, roll, `isbig()` override,
   `rtype`, `topologize()`, `needfill`.
4. `js/shknam.js`, connecting `stock_room()` and `shkinit()` through
   `makelevel()`'s tail, and the general-store record if it is genuinely
   absent.

## Validation

- Commit checked: not yet. The slice has not started.
- Source review: pending.
- Focused tests: pending.
- Full suite: passes at `f042aee` on Node 22.
- Generated-file checks: all five pass at `f042aee`; this slice adds a sixth.
- Fresh differentials: pending, and they are the **whole** evidence here.
  Compare strictly with `runFreshMatrix()`. Vary the seed so the roll selects
  each of the three shop types in scope, and include at least one big room to
  exercise the `isbig()` override and one unlit room to exercise the lighting
  loop.
- Development score: 488/7,765 screens and 106,354/610,816 random-number values
  at `f042aee`, measured with `npm run checkpoint`. **This slice is expected to
  move neither.** The slice-selector reports that no development session stops
  here and that only `seed0030-ten-diverse-deaths` reaches `mkshop()` at all, in
  a segment after its first stop. Treat any development gain as a surprise
  worth explaining, and any loss as a regression.
- Quality check: gate clear at `f042aee`; three areas at the advisory
  checkpoint, `generation` at 470 of its 1,000-line gate. This slice is
  generation work and may fire that gate.
- Browser check: pending.

## Readiness

Current readiness: `Implementation`

Reason: no row is `done` beyond the room search the previous slice left; the
slice has not started.
