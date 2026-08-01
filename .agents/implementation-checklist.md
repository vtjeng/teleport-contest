# Implementation checklist: the hero descends a staircase, the shop slice

Working record of implementation evidence for the next slice of the goal
`ROADMAP.md` opened at `4fe8028`: stocking the shop that `makelevel()` asks for
on D:2. It supplements the required source review, tests, fresh differentials,
and the workflows in `.agents/workflow.md` and `.agents/review.md`.

Slices 1, 2 and 3 are closed, at `6d7aedd`, `bb4ef50` and `1cd7c32`, and this
slice is closed too. The hero now descends to a D:2 the port generates and, when
`makelevel()`'s shop arm selects a general store, a used armor dealership or an
antique weapons outlet, walks into a stocked shop with its shopkeeper standing
by the door. The other nine `shtypes[]` rows fail closed by name.

**One measurement here was wrong before the slice started.** `makelevel()`'s
shop test ends in `rn2(u_depth) < 3`, and at depth two `rn2(2)` is 0 or 1, so
the arm fires on *every* D:2 with enough rooms rather than on about half. What
varies is whether any room passes `mkshop()`'s search. Over 4,000 fresh seeds
scanned for this slice, 189 descents reached a shop at all.

## Boundary

- Roadmap item: In progress: the hero descends a staircase, the shop slice.
- Starting code commit: `603e61a`. Closed at `6c48b49`, `e2d07c0` and the
  commit this file lands with.
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
| The `!sroom->rlit` lighting loop, `mkroom.c:179-187` | Runs when the chosen room is unlit | `js/mkroom.js mkshop()` | Lights the room and its one-cell border, sets `rlit` | Ported. Two matrix segments arrive on an unlit shop, and `mkroom-shop.test.mjs` pins the `lx-1..hx+1` bounds cell by cell | `done` | None |
| The shop-type roll, `mkroom.c:191-194` | Runs when `i < 0`, always so without wizard mode | `js/mkroom.js mkshop()` | **The slice's only new random-number call, one `rnd(100)`** | Ported. `mkroom-shop.test.mjs` drives all 22 share boundaries of the generated `prob` column through an injected roll | `done` | None |
| `isbig()`'s wand and spellbook override, `mkroom.c:199-201` | A big room forces a general store | `js/mkroom.js isbig()` | Rewrites the rolled type to 0 | Connected. Two matrix segments are big rooms whose roll selected a wand or spellbook shop; a third is a big armor shop, where the second half of the test is what has to fail | `done` | None |
| `sroom->rtype = SHOPBASE + i` and `topologize()`, `mkroom.c:203-210` | After the roll | `js/mkroom.js`, `js/mklev.js topologize()` | Marks the room's type and squares | Connected. `topologize()` gained a `state` parameter so the shop path and the tests share one spelling | `done` | None |
| `needfill = FILL_NORMAL`, `mkroom.c:215` | Last statement | `js/mkroom.js mkshop()` | Defers stocking to `makelevel()`'s tail | Ported; `js/mklev.js fill_special_room()` already dispatched `rtype >= SHOPBASE` to `stock_room()` | `done` | None |
| `shtypes[]`'s `prob` and `symb` columns | Selects the type | `js/shtypes_data.js` plus `scripts/generate-shtypes.mjs` | Fixed table | Generated whole, with `name`, `annotation`, `symb`, `prob`, `shdist`, `iprobs[]` and all eleven name lists. `npm run check:shtypes` is the sixth generated-data check | `done` | None |
| The general-store record | The commonest roll | `js/shtypes_data.js` | `{100, RANDOM_CLASS}` iprobs, `shkgeneral` names | It was **not** present. `js/shknam.js` held a `GENERAL_NAMES` copy of `shkgeneral` used only as `nameshk()`'s fallback list, and no general-store record at all. The generated table is now the single owner and the copy is deleted | `done` | None |
| `stock_room()`, `shkinit()`, `nameshk()` | `makelevel()`'s tail, after `mkshop()` returns | `js/shknam.js` | Stocks the shop and creates its keeper; consumes randomness | Connected. `shkinit()` was missing C's `mongets()` arms, one of which spends `rn2(5)` for every general store | `done` | None |
| The scroll, potion, ring and tool name lists, and `nameshk()`'s `shktools` arm | Other shop types | `js/shknam.js` | | A later slice | `later` | Refused by name in `SUPPORTED_SHOPS` |
| Bookstores' `SPE_NOVEL` tribute arm | Book shops | `js/shknam.js` | | A later slice | `later` | Refused by name in `SUPPORTED_SHOPS` |
| The deli, wand and health-food shops | Need `mkshobj_at()`'s negative-`otyp` path and `shkveg()`/`veggy_item()`/`mkveggy_at()` | `js/shknam.js` | | A later slice | `later` | Refused by name in `SUPPORTED_SHOPS` |
| `UnsupportedSpecialRoomError` as a segment boundary | `js/jsmain.js:519-527` catches three boundary classes and not this one | `js/jsmain.js` | **Turns a fail-closed stop into a discarded segment** | Added at `6c48b49`. `node scripts/scan-debt.mjs` runs again and reports 33 sessions and 488 of 7,765 screens | `done` | None |
| `stock_room()`'s locked-door engraving square, `shknam.c:748-764` | Needs a shop whose first door is locked or trapped | `js/shknam.js stock_room()` | C writes `Is_special(&u.uz) \|\| *in_rooms(m, n, 0) ? ROOM : CORR`; the port writes `ROOM` unconditionally | Pre-existing and unchanged by this slice. `Is_special()` is absent from `js/`, and no fresh case scanned reached a locked shop door | `later` | Port `Is_special()` with a case that reaches the branch |
| Generic-object colour on the map, `display.c map_object():340-352` | Any unseen potion, gem or spellbook within `neardist` of the hero | `js/display.js` | C observes the object and redraws it with its own colour; the port leaves the class colour | **A pre-existing defect this slice found and did not fix.** Seed 7333427 walked `kkuukkkkk` on D:1 draws a worthless piece of yellow glass with `color 8` where C draws `color 11`, with the random-number stream matching exactly and no descent involved. It belongs to the display area, not to shop generation | `later` | Own it as a display goal; a shop stocking a potion or a gem will meet it |

## Missing work by owner

None. Every row above is `done` or `later`, and each `later` row names the slice
or goal that owns it.

## Validation

- Commit checked: the three commits above.
- Source review: `mkroom.c:95-215` and `shknam.c:206-350, 420-800` read in
  full before any line was written.
- Focused tests: `scripts/mkroom-shop.test.mjs`, 15 tests. Each was observed
  failing before it was committed, by breaking the line it covers: the roll's
  `> 0`, the `isbig()` override's `symb` test, the lighting loop's `lx - 1`
  bound, the `!sroom->rlit` guard, `needfill`, the `topologize()` call, the
  search's `break`, `SUPPORTED_SHOPS`, and `js/jsmain.js`'s added clause.
- Full suite: passes on Node 22 at each of the three commits.
- Generated-file checks: six now pass, `check:shtypes` among them, and
  `npm run checkpoint` runs it.
- Fresh differentials: `node scripts/run-shop-descent.mjs` passes at 12
  segments, 66,538 random-number values, 212 screens and 212 cursors, compared
  strictly. It covers four general stores, two used armor dealerships and three
  antique weapons outlets across three roles and two dates; both `isbig()`
  override cases; two unlit rooms; both arms of the general store's `rn2(5)`;
  and one control segment that walks without descending.
- Mutation: 18 mutants over the slice's `js/` diff, 16 killed. The two survivors
  are `js/shknam.js:259` and `:260`, the first two clauses of `shkinit()`'s
  `mongets(SCR_CHARGING)` chain. No test can kill either: both compare the
  shop's name list against `shktools`, `shkwands` and `shkrings`, all three of
  which `SUPPORTED_SHOPS` refuses, so both clauses are false for every shop this
  port stocks and `||` and `&&` agree. Slice 6 or 8 will kill them.
- Development score: 488/7,765 screens, unchanged, and 106,408/610,816
  random-number values against 106,354 before the slice. The gain of 54 is in
  `seed0030-ten-diverse-deaths`, whose later segment now generates a D:2 with a
  shop instead of stopping; its screens are unchanged, as predicted.
- Browser check: not run. No browser-specific code, DOM, CSS, input or storage
  path changed, and the renderer is untouched.

## Readiness

Current readiness: `Ready for audit`

Reason: every row of the implementation table is `done` or `later`, the fresh
matrix passes strictly at 12 segments, and the development score held its
screens while gaining 54 random-number values in the one session that reaches
`mkshop()`.
