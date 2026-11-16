# Source review of unexecuted C lines

**Status: working analysis, not final.** Every "unreachable" verdict here rests
on one reviewer's reading and has not had an independent second check. Do not
leave a line out of a coverage total on the strength of these files alone.

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
  that the port implements.
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

## What is not checked

- Unreachable verdicts have had one review each.
- `skip-targets`, `match-text` and `not-compared` rows were not compared line
  by line.
- Which code counts as gameplay comes from hand-written rules in the coverage
  tooling, by file and by function name. Those rules have not been checked
  against what recorded sessions run; debug-mode code in particular may be
  reachable in judged sessions.
