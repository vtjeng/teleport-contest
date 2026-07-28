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
| `ddoinv()` and `dispinv_with_action()` with `lets == NULL` | Reached by `i` with no prefix; `menumode` is TRUE because `len != 1` | None | Returns `ECMD_OK`, so no game time | `invent.c` `dispinv_with_action()` | missing | Port both, with the Escape return that skips `itemactions()` |
| `display_inventory()` | Called with `want_reply` TRUE; its `cmdq_pop()` branch cannot fire while no command queue is ported | None | No state change | `invent.c:3428` | missing | Port the non-queue path |
| `display_pickinv()` menu construction | The main path: builds the menu window, one entry per object, with class headers when `flags.sortpack` is set | None, needs `js/tty_menu.js` | Screen output only | `invent.c:3057` | missing | Port the entry and header construction |
| `sortloot()` ordering | `flags.sortloot` defaults to `'l'`; `flags.sortpack` defaults on, so entries group by class in `flags.inv_order` order | Unported | Order decides the screen | `invent.c`, `sortloot()` | undecided | Trace which sort the default options select before porting either |
| Empty inventory, `Not carrying anything` | Cannot occur for a starting character, which always carries items | None | One message rather than a menu | `invent.c:3066` | cannot-occur | None |
| Single-item inventory shortcut | `n == 1 && !force_invmenu && !menu_requested`; unreachable from `i` because `menumode` forces the menu | None | Would print one line instead | `invent.c:3149` | cannot-occur | None |
| `!flags.invlet_constant` reassignment | `invlet_constant` defaults on, so `reassign()` does not run | None | Would renumber every invlet | `invent.c:3146` | cannot-occur | None |
| Escape dismissal | The three sessions send Escape; `select_menu()` returns 0 and `display_inventory()` returns `'\033'` | `js/tty_menu.js` `dismissTtyMenu()` | Restores the map screen | `invent.c` `dispinv_with_action()` | undecided | Confirm the existing dismissal restores the same cells C redraws |
| `itemactions()` after a letter | Excluded; no development session selects an item | None | Would consume time | Session census at `4b07735` | later | None |

## Missing work by owner

- `js/invent.js`: `ddoinv()`, `dispinv_with_action()`, `display_inventory()`,
  and `display_pickinv()`.
- `js/cmd.js`: admit the `inventory` command at the seam and dispatch it, as
  `look` is dispatched.
- `js/tty_menu.js`: only if the inventory menu needs a spec shape the role
  filter menu does not already produce.

## Validation

- Commit checked: pending
- Full suite and generated checks: pending
- Fresh differentials: pending. Plan at least four: a starting character of
  two roles, since role decides the starting inventory; a game where `i` is
  pressed twice; and one where Escape is replaced by a second `i`, to check
  that the second menu redraws identically.
- Development score: 273 screens at the starting commit.

## Readiness

Not ready. No production code is written yet.
