# Implementation checklist: `insight.c:doattributes()`

## Boundary

- Roadmap item: "Goal in progress: commands that consume no game time",
  `insight.c:doattributes()`
- Starting code commit: `baa192f2afba3f1c18453b096258c789aa5214ea`
- Starting event: `^X` pressed at a ready D:1 command prompt, in a game that is
  neither wizard mode nor explore mode
- Ending event: the command prompt after the attributes window is dismissed,
  with the map repainted
- Valid inputs: `^X` under its default binding; the keystroke that dismisses the
  window; every role, race, gender and alignment a fresh character can start
  with; any seed, date and time
- Observables: the attributes window's complete 24×80 screens and attributes,
  the cursor at every boundary, the absence of any gameplay random-number call,
  and `svc.context.move` staying FALSE so no monster moves
- Exclusions: `attributes_enlightenment()`, the `Miscellaneous:` bones block,
  end-of-game disclosure, and every status condition this milestone's supported
  behavior cannot produce. `js/insight.js` carries 16 explicit stops for these,
  each thrown before the first `enlght_out()` call for its section, so the
  segment ends with no state change, no random-number call, and no output.

## How the candidate list was built

`doattributes()` is 11 lines and settles the two parameters that decide
everything below it. In a game that is neither wizard nor explore mode, `mode`
is `BASICENLIGHTENMENT` alone and `final` is `ENL_GAMEINPROGRESS`, which is 0.
`enlightenment()` then reads as a fixed sequence of section calls, so the
candidate list is that sequence plus the line-formatting layer the sections
share. Implementation split each section row into the fresh-character path it
runs and the conditions it cannot reach; those splits are recorded below.

- Upstream entry points: `insight.c:doattributes()` and
  `insight.c:enlightenment()`, both at `nethack-c/upstream` submodule commit
  `16ff591`.
- Dispatch tables and catalogs: `command_bindings.js` maps `^X` to
  `attributes`; `js/cmd.js` `ADMITTED_COMMANDS` is the single list that decides
  which commands the milestone dispatches. Role, race, gender and alignment come
  from the `gu.urole`, `gu.urace` and alignment records that `u_init.c` fills at
  startup. `hu_stat[]` and `enc_stat[]` supply the hunger and encumbrance
  wording for every value of `u.uhs` and `near_capacity()`.
- Reachable helpers: counted by call inside `insight.c` lines 468 to 1270, the
  four sections an ordinary `^X` runs: `you_are()` 33 times, `enlght_out()` 17,
  `enl_msg()` 16, `you_have()` 8, `one_characteristic()` 7, `attrval()` 4,
  `cause_known()` 3, `weapon_insight()` 2, and `youhiding()`,
  `walking_on_water()`, `trap_predicament()`, `enlght_line()` and
  `enlght_combatinc()` once each. Three candidates this list missed were found
  during implementation and are rows below: `align_str()`, `find_ac()`, and the
  `wizard` gate inside `from_what()`.
- JavaScript cross-check: `grep -c "UnsupportedEnlightenmentError("
  js/insight.js` returns 16, and each stop names the upstream function or status
  it refuses. `npm run quality -- --check` reports no unassigned `js/` file, so
  `js/insight.js`, `js/pray.js`, `js/vault.js` and `js/wield.js` all carry a
  `QUALITY.json` area.
- Remaining limits: two ported branches have no fresh-start reachability and so
  carry no end-to-end evidence, only a reading of the C. They are named in the
  table and are the sharpest thing for a correctness pass to check.

## Status values

See `.agents/implementation-checklist-template.md`, "Status values", for the
definition of each status.

## Implementation table

| Upstream function or branch family | Reachability and ordering | JavaScript owner | State, randomness, and output | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| `doattributes()` | Runs whenever `^X` is pressed. `wizard` and `discover` are both FALSE in an ordinary game, so `mode` stays `BASICENLIGHTENMENT` and `final` is `ENL_GAMEINPROGRESS`. Returns `ECMD_OK`, which carries no `ECMD_TIME` | `js/insight.js` `doattributes()`; dispatch in `js/cmd.js` | No state change, no random-number call; output is the whole window | `insight.c:2009`; `seed8000-tourist-starter` advances from 17 to 20 matching screens at `60bf2c3` | done | None |
| `enlightenment()` frame | The fixed sequence: title, the three basic sections, `status_enlightenment()`, the `Miscellaneous:` separator, the elapsed-time line, then the menu | `js/insight.js` `enlightenment()` | Creates and destroys the window; `ge.en_via_menu` is TRUE because `final` is 0 | `insight.c:383`; the fresh differentials below | done | None |
| `enlght_out()`, `enlght_line()`, `enl_msg()`, `you_are()`, `you_have()` family | Every section builds its lines through this layer; it fixes the wording and the tense that `final` selects | `js/insight.js` | Appends menu lines only | `insight.c:118` to `insight.c:160` | done | None |
| `background_enlightenment()` fresh-character path, with `align_str()` | Runs under `BASICENLIGHTENMENT`. Covers role, race, alignment, deities, dungeon level, time and experience. `align_str()` at `insight.c:3187` is reached every time, from `insight.c:534` | `js/insight.js` | Reads role, race, alignment and dungeon state | `insight.c:468`; fresh differentials across roles | done | None |
| `basics_enlightenment()` fresh-character path, with `find_ac()` | Runs under `BASICENLIGHTENMENT`. Covers hit points, energy points, armor class and gold. `find_ac()` is the one state change the window makes | `js/insight.js` | Writes the recomputed armor class; no random-number call | `insight.c:728`; fresh differentials | done | None |
| `characteristics_enlightenment()`, `one_characteristic()`, `attrval()` | Runs under `BASICENLIGHTENMENT`. `one_characteristic()` is called seven times, once per characteristic | `js/insight.js` | Reads `ATTRCURRENT` and `ATTRMAX` | `insight.c:827` to `insight.c:940`; fresh differentials | done | None |
| `status_enlightenment()` fresh-character path, including every `u.uhs` hunger value | Runs for both modes, so an ordinary `^X` reaches it. The hunger arm reads `hu_stat[u.uhs]` for every value, so a hero who grows hungry while waiting is covered | `js/insight.js` | Reads status conditions and encumbrance | `insight.c:940`; `js/insight.js:622`; fresh differentials | done | None |
| `weapon_insight()` fresh-character path, and `weapon_descr()` | Called twice from `status_enlightenment()`. `js/display.js` previously held a private partial `weapon_descr()` missing `makesingular()` and the sword, saber and whip skill names; `27d8ef7` moved the real one to `js/weapon.js` and is score-identical to its parent, session by session | `js/weapon.js`, `js/insight.js` | Reads wielded weapon and skill state | `insight.c:1270`; `27d8ef7` scored at 283 screens, identical to `1705d0d` | done | None |
| `fmt_elapsed_time()`, and `urealtime.start_timing` | Always runs, after the `Miscellaneous:` separator. `allmain.c:836` sets `start_timing` in `newgame()`; without that line the port would have reported a 55-year elapsed time | `js/insight.js`, `js/allmain.js` | Reads the timer; output only | `insight.c:314`, `allmain.c:836` | done | None |
| Menu window path | `create_nhwindow(NHW_MENU)`, `start_menu(MENU_BEHAVE_STANDARD)`, `end_menu()`, `select_menu(PICK_NONE)`, `destroy_nhwindow()`. The window is two pages and uses no headings, so the indented-inverse-heading ceiling in `ROADMAP.md` does not apply | `js/tty_menu.js` | Screen output; the dismissal keystroke returns to the prompt | `insight.c:389`, `insight.c:451`; both Escape and Space dismissals verified in the fresh differentials | done | None |
| `attributes_enlightenment()` | Gated on `mode & MAGICENLIGHTENMENT`, which `doattributes()` sets only when `wizard` or `discover` is TRUE | `js/insight.js`, stop | None | `insight.c:420`; stop `attributes_enlightenment()` | cannot-occur | None |
| `Miscellaneous:` bones block | Gated on `(mode & BASICENLIGHTENMENT) != 0 && (wizard \|\| discover \|\| final)`; all three terms of the second clause are false at an ordinary `^X`. The separator and heading sit outside the gate and do print | `js/insight.js` | Separator and heading only | `insight.c:428`; confirmed against the recorded C screens | cannot-occur | None |
| `from_what()` and the wording it feeds `cause_known()` and `enlght_halfdmg()` | `attrib.c:905` restricts the whole body to `if (wizard)`, so it returns the empty string at an ordinary `^X` | `js/insight.js` | Output only | `attrib.c:905` | cannot-occur | None |
| Riding, in-water, punished, trapped, held, polymorphed, and the monk's suit penalty | None of these properties can be set by this milestone's supported behavior, which is a wait, a one-square walk, and the no-time commands. No trap, no combat, no item use, and no steed exists on the supported path | `js/insight.js`, stops | None; each stop precedes its section's first `enlght_out()` | `insight.c:940` onward; the six named stops in `js/insight.js` | cannot-occur | None |
| Autopickup wording, `Fixed_abil`/`stuck_ring()`, `shield_simple_name()`/`is_wet_towel()`, the two-weapon skill report, `endgamelevelname()` | Each needs an option, item or game state a fresh character on D:1 does not have. `flags.pickup` TRUE additionally needs `optfn_pickup_types()` and, inside a shop, `costly_spot()` | `js/insight.js`, stops | None | The five named stops in `js/insight.js` | cannot-occur | Revisit when a later goal turns autopickup on or admits two-weapon combat |
| Non-`UNENCUMBERED` encumbrance arm, and `makeplural()` for a wielded stack | Ported, but no fresh start reaches either: a starting pack leaves the hero unencumbered, and no role wields a stack. Pinned only by reading the C | `js/insight.js` | Output only | `js/insight.js:631`; no end-to-end evidence | cannot-occur | Named for the correctness pass, which should check both against the C |

## Missing work by owner

None. Every row is `done` or `cannot-occur`.

## Validation

- Commit checked: `60bf2c3cf1fc8d7313970a91417547af466206c3`
- Source review: every branch and helper reachable through the ending event was
  traced against `insight.c` at submodule commit `16ff591`. The two parameters
  `doattributes()` settles make `attributes_enlightenment()` and the bones block
  unreachable; the remaining exclusions are the 16 stops listed above, each
  thrown before its section's first output. Three claims were checked against
  the C directly rather than taken from the implementation report:
  `from_what()`'s `wizard` gate at `attrib.c:905`, `urealtime.start_timing` at
  `allmain.c:836`, and `align_str()`'s call site at `insight.c:534`.
- Focused tests: `scripts/insight.test.mjs`, run inside the full suite below
- Full suite: `npm test` reports 1,748 tests, 1,748 passing, 0 failing
- Generated-file checks: `check:monsters`, `check:objects`, `check:symbols` and
  `check:themerooms` all pass inside `npm run checkpoint`
- Fresh differentials: `node scripts/run-no-time-commands.mjs` matches 71,967
  random-number calls with 158 screens and 158 cursors across 29 segments,
  varying role, race, gender, alignment, seed, and the keystroke that dismisses
  the window
- Development suite: `npm run checkpoint` reports 98,759 random-number values,
  286 screens and 286 cursors. `seed8000-tourist-starter` rose from 17 to 20 of
  its 23 screens; per-session comparison against `ff6efb9` shows no other
  session changed and none regressed
- Quality check: `npm run quality -- --check` exits 1 solely because the `hero`
  area reached its batch threshold at 1,120 of 1,000 lines. No `js/` file is
  unassigned. That gate is what the correctness pass over
  `eb7e17e..60bf2c3` clears
- Browser check: not required; `.agents/validation.md` reserves it for rendering
  changes, and this slice adds no new rendering primitive

## Readiness

Current mode: Ready for audit

Reason: every row is `done` or `cannot-occur` with evidence; the source review
above traces every branch reachable through the ending event; the full suite,
generated checks, fresh differentials and development suite all pass at
`60bf2c3`; the production game executes every `done` path, evidenced by
`seed8000-tourist-starter` and the 29-segment matrix; and each excluded branch
stops before changing state, consuming randomness, or producing output. The one
open `npm run quality -- --check` failure is the review gate this pass exists to
clear.
