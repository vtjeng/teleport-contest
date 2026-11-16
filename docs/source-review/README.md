# Source review of unexecuted C lines

**Status: working analysis, not final.** The verdicts that rested on one
reading (unreachable, skipped and not-compared rows) have now had one blind
second review (`blind/`), which found a share of them wrong; see "Second
review" below. Do not leave a line out of a coverage total on the strength of
these files alone.

These files record a review of the C lines that no recorded game executes.
"Unexecuted" means the line has a count of zero in the C coverage map built
from every gated game, regression recording and synthetic case. A replay
compares the port with C only on lines a game runs, so the review compared the
unexecuted lines with the port by reading both, and fixed each difference it
could prove with a C recording or a constructed-state test.

## Files

- `ledger-1.tsv` to `ledger-5b.tsv`: one file per reviewer, named by round
  (1 to 5) and reviewer (a, b, c). Rounds 1 to 4 cover the 8,774 unexecuted
  gameplay lines in 97 C files on `main` at `5ccfa22e` (2026-11-15). Round 5
  covers unexecuted lines in options, interface, startup and Lua-binding code
  that the port implements. Round 6 (`ledger-6a.tsv`, `ledger-6b.tsv`) covers
  the code a category audit on 2026-11-15 moved into gameplay: debug-mode
  commands, sanity checks, and functions the port implements under other names.
- `blind/`: the second review. `first-verdicts.tsv` lists the 517 rows it
  rechecked with their first verdicts; `verdicts-a.tsv` to `verdicts-c.tsv` hold
  the three blind reviewers' verdicts by row id; `brief.md` is their brief.
- `unreachable-targets.md`: the verdicts of the recipe passes that ran before
  the review (targets 2 to 5). Ledger rows with class `skip-targets` defer to
  it.

## Ledger columns

Each row covers one block of unexecuted lines.

| Column | Contents |
| --- | --- |
| `file` | C source file |
| `lines` | Line or line range, numbered as in the coverage map. Most files match `nethack-c/upstream/src/`; the patched files `end.c`, `calendar.c`, `files.c`, `nhlua.c` and `win/tty/wintty.c` follow the recorder's patched source. |
| `function` | Enclosing C function |
| `js` | Where the port implements it |
| `class` | The verdict (below) |
| `note` | The reviewer's reason, and any evidence |

## Classes

| Class | Meaning |
| --- | --- |
| `match` | The port's branch matches C, read on both sides. |
| `match-text` | Matched by message text only. |
| `DIFFERS` | A difference, proven and fixed; the note names the commit and evidence. |
| `DIFFERS-covered` | A proven difference found in executed lines next to the block. |
| `DIFFERS-unproven`, `differs-unobservable` | A difference that was not proven, or that no output shows. The port was not changed. |
| `unreachable-C`, `unreachable-config`, `missing-unreachable` | Judged unreachable by valid input, by the build configuration, or absent from the port and unreachable. Provisional. |
| `nobehaviour` | `impossible()`, `panic()` or debug-only code with no game behaviour to compare. |
| `skip-targets` | Skipped because `unreachable-targets.md` judges it unreachable. |
| `not-compared` | The C was read but the port side was not compared. |

## Second review

Three reviewers re-decided the 517 rows whose verdict rested on one reading,
without seeing those verdicts, and proved any "reachable" claim with a C
recording.

| First verdict | Rows | Proven reachable | Probably reachable | Unreachable | Unsure |
| --- | ---: | ---: | ---: | ---: | ---: |
| `unreachable-C` | 222 | 20 | 6 | 191 | 5 |
| `skip-targets` | 205 | 35 | 19 | 139 | 12 |
| `not-compared` | 86 | 26 | 24 | 35 | 1 |
| `missing-unreachable` | 4 | 0 | 0 | 4 | 0 |

Some "proven reachable" rows are reachable only by loading the session's own
`.nethackrc` as Lua with `#wizloadlua`, which the port does not support by
decision, and a few are coverage-tool misattributions. The review found six
port defects, each fixed and proven by a recording.

## What is not checked

- Unreachable verdicts the second review confirmed have had two readings;
  rows outside its 517 (configuration and Lua-shape verdicts) have had one.
- `skip-targets`, `match-text` and `not-compared` rows were not compared line
  by line.
- Which code counts as gameplay comes from rules in the coverage tooling, by
  file and by function name. They were audited against what recorded sessions
  run on 2026-11-15 and corrected; round 6 reviewed what the correction added.
