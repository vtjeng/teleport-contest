# Inventory display checklist

## Boundary

- Roadmap item: "Commands that consume no game time", slice 1, `invent.c`
  `ddoinv()` and the inventory display.
- Starting code commit: `a62b13fbb7b476e2be447d46f50a0b8b54530c62`
- Starting event: the `i` keystroke at a ready D:1 command prompt.
- Ending event: the next ready command prompt, reached after the menu is
  dismissed with Escape.
- Valid inputs: `i`, then Escape. The three development sessions that stop
  here all dismiss the menu; none selects an item.
- Observables: the complete 24x80 screen and its attributes for the menu and
  for the restored map, the cursor position at each boundary, the absence of
  any gameplay random-number call, `svc.context.move` remaining FALSE, and the
  turn counter not advancing.
- Exclusions: selecting an inventory letter, which reaches `itemactions()`;
  the `menu_requested` prefix; `force_invmenu`; a count before `i`; perm_invent
  and the persistent window; `in_dumplog`; wizard-mode identify; the in-use
  ordering that `dispinv_with_action()`'s other callers request; and every
  sortloot order other than the default. Each stops before the menu is drawn,
  so no screen, state change, or random-number call precedes the stop.

## How the candidate list was built

From the C call chain `cmd.c rhack()` -> `ddoinv()` ->
`dispinv_with_action()` -> `display_inventory()` -> `display_pickinv()`, plus
the window-port calls `display_pickinv()` makes into `win/tty/wintty.c`. The
list below is the branch families reachable with `lets == NULL`,
`want_reply` true, and a starting inventory. `js/tty_menu.js` already owns the
tty menu layout, paging, selection, and dismissal, so each row states whether
the branch needs new code or an existing owner.

## Status values

As defined in `.agents/implementation-checklist-template.md`.

## Implementation table

| Upstream function or branch family | Reachability and ordering | JavaScript owner | State, randomness, and output | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| `ddoinv()` and `dispinv_with_action()` with `lets == NULL` | Reached by `i` with no prefix; `menumode` is TRUE because `len != 1` | `js/invent.js` | Returns `ECMD_OK`, so no game time | Ported at this head; a selected letter stops rather than reaching `itemactions()` | done | None |
| `display_inventory()` | Called with `want_reply` TRUE; its `cmdq_pop()` branch cannot fire while no command queue is ported | `js/invent.js` | No state change | Ported at this head | done | None |
| `display_pickinv()` menu construction | The main path: builds the menu window, one entry per object, with class headers when `flags.sortpack` is set | `js/invent.js`, drawing through `js/tty_menu.js` | Screen output only | Five fresh recordings match C cell for cell across three roles, a repeated menu, and a game with a pet | done | None |
| `doname()` worn and wielded suffixes | Every starting character wears armor and wields a weapon | `js/objnam.js` `wornSuffix()` | Text only | Ported: worn amulets, armor, and tools; the wielded and alternate phrasings; the alternate weapon; and all three quiver phrases. Five fresh recordings match C cell for cell | done | None |
| `doname()` container and tin naming | A Rogue starts with a sack and a Tourist with tins | `js/objnam.js`, with `tin_details()` in `js/eat.js` | Text only | Ported: the "empty" prefix, a box's known trap and lock state, and a tin's contents. A container that holds something still stops, because counting its stacks is `pickup.c count_contents()` | done | None |
| tty menu dismissal with Space | `process_menu_window()` finishes a menu when Space arrives on its last page | `js/tty_menu.js` | Screen only | The port only finished when the spec declared an empty completion, so a Space left the inventory menu on screen. Fixed and covered by a fresh recording | done | None |
| `sortloot()` ordering | Traced. `options.c:7208` sets `flags.sortloot = 'l'`, and `display_pickinv()` compares against `'f'`, so the flags are `SORTLOOT_INVLET`; `optlist.h:687` defaults `sortpack` On, adding `SORTLOOT_PACK`. The menu loop then walks `flags.inv_order`, whose default is `def_inv_order[]` at `options.c:118`, and lists each class in invlet order | None | Order decides the screen | `options.c:118`, `options.c:7208`, `optlist.h:687`, `invent.c:3175` | missing | Port the class walk with that order; a full `sortloot()` is not needed for `SORTLOOT_INVLET` |
| Empty inventory, `Not carrying anything` | Cannot occur for a starting character, which always carries items | None | One message rather than a menu | `invent.c:3066` | cannot-occur | None |
| Single-item inventory shortcut | `n == 1 && !force_invmenu && !menu_requested`; unreachable from `i` because `menumode` forces the menu | None | Would print one line instead | `invent.c:3149` | cannot-occur | None |
| `!flags.invlet_constant` reassignment | `invlet_constant` defaults on, so `reassign()` does not run | None | Would renumber every invlet | `invent.c:3146` | cannot-occur | None |
| Escape dismissal | The three sessions send Escape; `select_menu()` returns 0 and `display_inventory()` returns `'\033'` | `js/tty_menu.js` `selectTtyMenu()` and `dismissTtyMenu()` | Restores the map screen | Settled by fresh differential: the existing owner restores exactly the cells C redraws, given a title-less spec and headings styled with `iflags.menu_headings` | done | None |
| `itemactions()` after a letter | Excluded; no development session selects an item | None | Would consume time | Session census at `4b07735` | later | None |

## Missing work by owner

- `js/invent.js`: `ddoinv()`, `dispinv_with_action()`, `display_inventory()`,
  and `display_pickinv()`.
- `js/cmd.js`: admit the `inventory` command at the seam and dispatch it, as
  `look` is dispatched.
- `js/options.js`: none of `sortloot`, `sortpack`, `invlet_constant`, or
  `inv_order` is in the port's `flags` yet; only their names are accepted.
  Each needs its `options.c` default, the way `pile_limit` gained one at
  `7f4c101`, and adding a flag moves the second-turn fixture's state digests.
- `js/tty_menu.js`: only if the inventory menu needs a spec shape the role
  filter menu does not already produce.

## Validation

- Commit checked: pending for the `doname()` work; the display chain is
  committed and its stop is covered by `scripts/cmd.test.mjs`.
- Full suite and generated checks: 1,719 tests, four generated-data checks,
  and `check:namespace-members` pass. All four fresh matrices pass, including
  the 107-segment first-command closure matrix, which is the gate on the menu
  change reaching startup selection.
- Fresh differentials: seven recorded and matching, five checked into
  `scripts/run-no-time-commands.mjs`, which now matches 29,459 PRNG calls and
  71 screens and cursors across twelve segments. They cover a Valkyrie, a
  Tourist, a Ranger with a quiver and an alternate weapon, a Rogue with an
  empty sack dismissed by Space, a Tourist carrying a tin, two menus in a row,
  and a game with a pet on the level.
- Development score: 273 screens at the starting commit.

## Readiness

Ready for its audit once the remaining rows close. All three sessions that
press `i` now display and dismiss the menu; the development score rose from
273 to 279 screens and no session regressed, confirmed session by session
against the parent. Seven fresh recordings match C cell for cell, five of them
checked into `scripts/run-no-time-commands.mjs`.
