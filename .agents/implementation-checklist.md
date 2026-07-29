# Implementation checklist: the `#` prompt through one dispatch

## Boundary

- Roadmap item: "Goal in progress: the extended-command prompt", slice 1
- Starting code commit: `d6ae214`
- Starting event: `#` pressed at a ready D:1 command prompt
- Ending event: whichever of the three terminations the typed text reaches — the
  ESC or empty cancel, the `"…: unknown extended command."` answer, or a
  dispatched command — and the command prompt after it
- Valid inputs: `#` under its default binding; every byte the prompt accepts,
  including erase and kill; `playmode:debug` and ordinary play, which change
  what `extcmds_match()` admits; any seed, date, time, role, race, gender and
  alignment
- Observables: every prompt keystroke paints a recorded screen, so the complete
  24×80 screens and attributes and the cursor at each one, plus the PRNG log and
  the elapsed turn across the dispatched command
- Exclusions: `doextlist` (`#?`), `extcmd_via_menu` (no session sets `extmenu`),
  the repeat queue, `can_do_extcmd`'s WIZMODECMD arm, and every extended command
  outside `#attributes`, `#look` and `#wait`. Each must fail closed before any
  state change, PRNG call, or output.

## How the candidate list was built

The prompt is dense in observables and thin in reachable dispatch: every
keystroke is a recorded screen, but only three commands behind it are ported.
So the candidate list splits into the prompt's own machinery, the table that
decides what the typed text matches, and the three closers that prove a
dispatch happened.

- Upstream entry points: `cmd.c` `extcmd_initiator` (457-461),
  `can_do_extcmd` (463-489), `doextcmd` (493-519), `extcmds_match` (2523-2557);
  `win/tty/getline.c` `hooked_tty_getlin` (43-215), `ext_cmd_getlin_hook`
  (272-286), `tty_get_ext_cmd` (292-325).
- Dispatch tables and catalogs: `extcmdlist[]` at `cmd.c:1667-2067`, 171 rows.
  `AGENTS.md`, "Generate large fixed tables from source", requires a generator,
  a committed generated file, and a check comparing the two;
  `scripts/generate-*.mjs` has six siblings to follow. Seven `#if` regions
  inside the table (CRASHREPORT, DEBUG_MIGRATING_MONS, SHELL, SUSPEND, DEBUG,
  NH_DEVEL_STATUS) have to be resolved against the pinned build rather than
  guessed.
- Reachable helpers: `ttyGetlinSearch` at `js/tty_menu.js:469` is the existing
  getlin, reached from two call sites at `:779` and `:1008`. It implements the
  non-NEWAUTOCOMP shape, so generalizing it into a `js/getline.js` is a rewrite
  of its editing and painting rules, not a parameterization.
- JavaScript cross-check: `ls js/getline.js` reports no such file, so nothing
  from `win/tty/getline.c` is ported under its own name.
  `grep -n "ttyGetlinSearch" js/*.js` returns the definition and its two menu
  call sites and nothing else, so the rewrite has exactly two existing
  consumers to keep working.
  `grep -lc "playmode:debug" sessions/*.json` returns 9 of the 33 development
  sessions, so the wizard-gated matching arm is live in more than a quarter of
  them and cannot be deferred.
- Remaining limits: the branches inside `hooked_tty_getlin` are not split into
  rows yet; the worker splits them as it traces. The NEWAUTOCOMP painting rule
  is recorded from one observation and needs a fresh recording before it is
  trusted.

## Status values

See `.agents/implementation-checklist-template.md`, "Status values".

## Implementation table

| Upstream function or branch family | Reachability and ordering | JavaScript owner | State, randomness, and output | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| `extcmdlist[]` | The table every other row reads. 171 rows with seven `#if` regions | generated file plus `scripts/generate-extcmds.mjs` and its check | None; data only | `cmd.c:1667` | missing | Write the generator first; resolve each `#if` against the pinned build and record which way and why |
| `doextcmd()` | Runs when `#` reaches `rhack()`. Calls `tty_get_ext_cmd()`, then dispatches | `js/cmd.js` `doextcmd()` | Dispatches; time depends on the command reached | `cmd.c:493` | missing | Port after the getlin, since it consumes the answer |
| `extcmd_initiator()`, `can_do_extcmd()` | Guard the dispatch. `can_do_extcmd`'s WIZMODECMD arm cannot be reached from the prompt | `js/cmd.js` | Refusal messages only | `cmd.c:457`, `cmd.c:463` | missing | Port both; confirm the WIZMODECMD arm is unreachable rather than omitting it silently |
| `extcmds_match()`, and its `wizard` gate | Decides what the typed prefix matches, and the gate changes the answer: `l` expands to `loot` in the four non-debug sessions and stays ambiguous in the five `playmode:debug` ones | `js/cmd.js` | None; pure over the table and `wizard` | `cmd.c:2523` | missing | Port with both arms; the two behaviors are a differential pair, not an option to defer |
| `hooked_tty_getlin()` under NEWAUTOCOMP | Every keystroke paints. NEWAUTOCOMP writes the expansion ahead of an unmoved cursor and changes erase and kill handling | new `js/getline.js` | Screen and cursor per keystroke | `win/tty/getline.c:43`; `seed0102` step 5 shows `# name` with the cursor at column 3 | missing | Rewrite rather than parameterize; keep `ttyGetlinSearch`'s two menu call sites working |
| `ext_cmd_getlin_hook()`, `tty_get_ext_cmd()` | The hook that turns typed text into a match, and the wrapper `doextcmd()` calls | `js/getline.js` | Screen output | `win/tty/getline.c:272`, `:292` | missing | Port with the getlin |
| The three closers: `#attributes`, `#look`, `#wait` | Their consumers are already ported, so each proves a real dispatch. `#wait` carries `ECMD_TIME` and the other two do not | existing owners | As their commands already do | `js/insight.js`, `js/invent.js`, `js/allmain.js` | missing | Use these as the slice's end-to-end evidence, with and without elapsed time |
| ESC and empty-input cancel | Both terminate with no dispatch | `js/getline.js` | Screen only | `win/tty/getline.c:292` | missing | Port with the getlin |
| `"…: unknown extended command."` | The answer when nothing matches | `js/cmd.js` | Message only | `cmd.c:493` | missing | Port with `doextcmd()` |
| `doextlist` (`#?`), `extcmd_via_menu`, the repeat queue | Outside the slice | None | None | `cmd.c` as listed | later | Confirm each fails closed before output |
| `can_do_extcmd()`'s WIZMODECMD arm | Cannot be reached through the prompt | None | None | `cmd.c:463` | cannot-occur | State the source condition once traced |

## Missing work by owner

1. The generator: `scripts/generate-extcmds.mjs`, its committed output, and its
   regeneration check. Everything else reads the table.
2. `js/getline.js`: `hooked_tty_getlin()` under NEWAUTOCOMP,
   `ext_cmd_getlin_hook()`, `tty_get_ext_cmd()`, and the two existing
   `ttyGetlinSearch` call sites kept working.
3. `js/cmd.js`: `extcmd_initiator()`, `can_do_extcmd()`, `extcmds_match()` with
   both `wizard` arms, and `doextcmd()` with its unknown-command answer.
4. The three closers as end-to-end evidence.

## Validation

- Commit checked: [pending]
- Source review: [pending]
- Focused tests: [pending]
- Full suite: [pending]
- Generated-file checks: [pending; the new `extcmdlist[]` check joins the four
  existing ones]
- Fresh differentials: [pending; vary `playmode:debug` against ordinary play so
  the `extcmds_match()` gate is exercised both ways, cover all three
  terminations, and include erase and kill keystrokes]
- Development suite: [pending; the slice's own ceiling is about 77 screens, and
  none of the nine sessions passes the command it types next, so judge it on
  the differential rather than the total]
- Quality check: [pending]
- Browser check: [pending]

## Readiness

Current mode: Implementation

Reason: nothing is ported, and the table this slice reads has no generator yet.
