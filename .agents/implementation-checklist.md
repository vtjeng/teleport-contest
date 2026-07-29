# Implementation checklist: `insight.c:doattributes()`

## Boundary

- Roadmap item: "Goal in progress: commands that consume no game time", slice 1,
  `insight.c:doattributes()`
- Starting code commit: `baa192f2afba3f1c18453b096258c789aa5214ea`
- Starting event: `^X` pressed at a ready D:1 command prompt, in a game that is
  neither wizard mode nor explore mode
- Ending event: the command prompt after the attributes window is dismissed,
  with the map repainted
- Valid inputs: `^X` under its default binding; the keystroke that dismisses the
  window; every role, race, gender and alignment a fresh character can start
  with; any seed, date and time
- Observables: the attributes window's complete 24×80 screen and attributes, the
  cursor at every boundary, the absence of any gameplay random-number call, and
  `svc.context.move` staying FALSE so no monster moves
- Exclusions: `attributes_enlightenment()` and the `Miscellaneous:` bones block,
  which the reachability column below shows an ordinary `^X` cannot reach; every
  status condition a fresh character does not carry; the two wizard-mode
  development sessions, whose games do not start correctly yet. Each excluded
  branch has to fail closed before any state change, random-number call, or
  output.

## How the candidate list was built

`doattributes()` is 11 lines and settles the two parameters that decide
everything below it. In a game that is neither wizard nor explore mode, `mode`
is `BASICENLIGHTENMENT` alone and `final` is `ENL_GAMEINPROGRESS`, which is 0.
`enlightenment()` then reads as a fixed sequence of section calls, so the
candidate list is that sequence plus the line-formatting layer the sections
share. The rows below record where each section's own branches still need
tracing; that work belongs to implementation and the table is maintained as it
proceeds.

- Upstream entry points: `insight.c:doattributes()` and
  `insight.c:enlightenment()`, both at `nethack-c/upstream` submodule commit
  `16ff591`.
- Dispatch tables and catalogs: `command_bindings.js` maps `^X` to
  `attributes`; `js/cmd.js` `ADMITTED_COMMANDS` is the single list that
  decides which commands the milestone dispatches. Role, race, gender and
  alignment come from the `gu.urole`, `gu.urace` and alignment records that
  `u_init.c` fills at startup.
- Reachable helpers: counted by call inside `insight.c` lines 468 to 1270, the
  four sections an ordinary `^X` runs: `you_are()` 33 times, `enlght_out()` 17,
  `enl_msg()` 16, `you_have()` 8, `one_characteristic()` 7, `attrval()` 4,
  `cause_known()` 3, `weapon_insight()` 2, and `youhiding()`,
  `walking_on_water()`, `trap_predicament()`, `enlght_line()` and
  `enlght_combatinc()` once each.
- JavaScript cross-check: `ls js/insight.js` reports no such file, so nothing
  from `insight.c` is ported. `grep -n "doattributes" js/cmd.js` returns
  nothing. `sed -n '310,325p' js/cmd.js` shows `ADMITTED_COMMANDS` holding
  `wait`, `look`, `inventory`, `showspells` and `known`, so `^X` reaches the
  boundary refusal rather than any partial implementation.
- Remaining limits: the per-branch reachability inside
  `background_enlightenment()`, `basics_enlightenment()`,
  `characteristics_enlightenment()` and `status_enlightenment()` has not been
  traced yet. Those four rows are `undecided` and each has to be split into its
  own branch rows as the trace proceeds.

## Status values

See `.agents/implementation-checklist-template.md`, "Status values", for the
definition of each status.

## Implementation table

| Upstream function or branch family | Reachability and ordering | JavaScript owner | State, randomness, and output | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| `doattributes()` | Runs whenever `^X` is pressed. `wizard` and `discover` are both FALSE in an ordinary game, so `mode` stays `BASICENLIGHTENMENT` and `final` is `ENL_GAMEINPROGRESS`. Returns `ECMD_OK`, which carries no `ECMD_TIME`. | `js/insight.js` `doattributes()`; dispatch in `js/cmd.js` | No state change, no random-number call; output is the whole window | `insight.c:2009` | missing | Port it and add `attributes` to `ADMITTED_COMMANDS` |
| `enlightenment()` frame | The fixed sequence: title, the three basic sections, `status_enlightenment()`, the `Miscellaneous:` separator, the elapsed-time line, then the menu | `js/insight.js` `enlightenment()` | Creates and destroys the window; `ge.en_via_menu` is TRUE because `final` is 0 | `insight.c:383` | missing | Port the frame before the sections, so each section lands against a running consumer |
| `enlght_out()`, `enlght_line()`, `enl_msg()`, `you_are()`, `you_have()`, `you_can()` | Every section builds its lines through this layer; it fixes the wording and the tense that `final` selects | `js/insight.js` | Appends menu lines only | `insight.c:118` to `insight.c:160` | missing | Port first; every other row depends on it |
| `background_enlightenment()` | Runs under `BASICENLIGHTENMENT`. Covers role, race, alignment, deities, dungeon level, time and experience | `js/insight.js` | Reads role, race, alignment and dungeon state | `insight.c:468` | undecided | Trace its branches and split this row into one row per branch family |
| `basics_enlightenment()` | Runs under `BASICENLIGHTENMENT`. Covers hit points, energy points, armor class and gold | `js/insight.js` | Reads hero attributes only | `insight.c:728` | undecided | Trace its branches and split this row |
| `characteristics_enlightenment()`, `one_characteristic()`, `attrval()` | Runs under `BASICENLIGHTENMENT`. `one_characteristic()` is called seven times, once per characteristic | `js/insight.js` | Reads `ATTRCURRENT` and `ATTRMAX` | `insight.c:827` to `insight.c:940` | undecided | Trace the seven calls and `attrval()`'s formatting |
| `status_enlightenment()` | Runs for both modes, so an ordinary `^X` reaches it. The largest section, and the one whose branches depend most on what the hero currently carries | `js/insight.js` | Reads status conditions, traps, hiding and encumbrance | `insight.c:940` | undecided | Trace which branches a fresh character reaches and split this row |
| `weapon_insight()` | Called twice from `status_enlightenment()` | `js/insight.js` | Reads wielded weapon and skill state | `insight.c:1270` | undecided | Trace both call sites and their conditions |
| `youhiding()`, `trap_predicament()`, `walking_on_water()`, `cause_known()`, `enlght_combatinc()`, `enlght_halfdmg()` | Each called once or twice from `status_enlightenment()`, under a condition a fresh character on D:1 may not meet | `js/insight.js` | Output only | `insight.c:201` to `insight.c:287`, `insight.c:2022` | undecided | Settle each condition against a fresh character's state |
| `fmt_elapsed_time()` | Always runs, after the `Miscellaneous:` separator | `js/insight.js` | Reads `svm.moves` and the timer; output only | `insight.c:314` | missing | Port with the frame |
| `attributes_enlightenment()` | Gated on `mode & MAGICENLIGHTENMENT`, which `doattributes()` sets only when `wizard` or `discover` is TRUE | None | None | `insight.c:420` | cannot-occur | Confirm the port stops here rather than falling through, once wizard mode starts correctly |
| `Miscellaneous:` bones block | Gated on `(mode & BASICENLIGHTENMENT) != 0 && (wizard || discover || final)`; all three of the second clause's terms are false at an ordinary `^X` | None | None | `insight.c:428` | cannot-occur | Confirm the separator and heading still print, since they sit outside the gate |
| Menu window path | `create_nhwindow(NHW_MENU)`, `start_menu(MENU_BEHAVE_STANDARD)`, `end_menu()`, `select_menu(PICK_NONE)`, `destroy_nhwindow()` | `js/tty_menu.js` | Screen output; the dismissal keystroke returns to the prompt | `insight.c:389`, `insight.c:451` | undecided | `PICK_NONE` landed at `ff6efb9`; confirm a heading-free text menu of this length paginates as C does |

## Missing work by owner

1. `js/insight.js` line layer: `enlght_out()`, `enlght_line()`, `enl_msg()` and
   the `you_are()` family. Every section's wording depends on it, so it comes
   first.
2. `js/insight.js` frame: `doattributes()`, `enlightenment()` and
   `fmt_elapsed_time()`, with the `js/cmd.js` dispatch that makes `^X` reach
   them. This gives the sections a live consumer.
3. `js/insight.js` sections: `background_enlightenment()`,
   `basics_enlightenment()`, `characteristics_enlightenment()` with
   `one_characteristic()` and `attrval()`, then `status_enlightenment()` with
   `weapon_insight()` and the six single-call helpers. Trace each before
   implementing it and split its row.
4. `js/tty_menu.js`: confirm the text menu this window builds paginates and
   dismisses as C does.

## Validation

Record evidence for the exact committed head that will be reviewed.

- Commit checked: [pending]
- Source review: [pending]
- Focused tests: [pending]
- Full suite: [pending]
- Generated-file checks: [pending]
- Fresh differentials: [pending; vary role, race, gender and alignment, since
  `background_enlightenment()` and `characteristics_enlightenment()` read all
  four]
- Development suite: [pending]
- Quality check: [pending; `js/insight.js` needs a `QUALITY.json` area as soon
  as it is created, or `npm run quality -- --check` exits nonzero]
- Browser check: [pending]

## Readiness

Current readiness: `Implementation`

Reason: no row is `done`. Nothing from `insight.c` is ported, and the
per-branch reachability inside the four sections an ordinary `^X` runs has not
been traced.
