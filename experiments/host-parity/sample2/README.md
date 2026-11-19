# Host-parity sample 2

The first sample (`../README.md`) took 500 games from a random-play run.
Those games rarely open a menu, read a help file, parse a config line
or press a key above 0x7f, so code that draws without drawing random
numbers, or that leans on the host's C library, was barely exercised.
This sample aims at that code. Every recipe is written by
`make-sample2.mjs`; nothing is chosen at random.

The files are:

- `make-sample2.mjs`: writes `recipes/` and `sample2.jsonl`.
- `recipes/<id>.session.json`: one recipe per file.
- `sample2.jsonl`: one line per recipe with its group, what it probes,
  and a marker string.
- `check-markers.mjs`: checks that each recipe's Linux recording shows its
  marker, that is, that the recipe reached the screen it was written for.
- `trims.json` (absent while no recipe needs it): for a recipe whose game
  ends before its last key, the number of final keys `make-sample2.mjs`
  drops, measured on Linux.

## Groups

Every recipe starts with ESC, which dismisses a `--More--` after the
welcome message and does nothing at the command prompt. A recipe whose
nethackrc either host might reject sends Return next: NetHack lists the
config errors and waits for Return before the game starts, and at the
command prompt Return only moves the hero one square south. Unless a group
says otherwise, the hero is a neutral human female Valkyrie on seed
`7310442` at `20261115143000`.

| Group | Recipes | What it probes |
| --- | --- | --- |
| `options-boolean` | 72 | Each boolean row of `#optionsfull`, toggled, then the inventory, a look, a search and the menu again. |
| `options-compound` | 164 | Each compound row of `#optionsfull` four ways: ESC at once, the first choice, the second choice, and the typed value `99999999999`. |
| `options-short` | 5 | The `O` menu's pages and help text, `#optionsfull` help, a whole-page selection and `#saveoptions`. |
| `status-highlights` | 37 | `hilite_status` lines in the nethackrc (percentages, absolute values, up/down/changed, text matches, conditions, an RGB colour, bad colours and fields, and 21 or 22 fields, which reach past `hsbuf[]` in `botl.c parse_status_hl1()`); and the interactive status-highlight menu. |
| `regex` | 93 | `regcomp()` patterns that GNU and BSD regex may read differently, as `MENUCOLOR` lines; bad patterns as `MENUCOLOR`, `MSGTYPE` and `AUTOPICKUP_EXCEPTION` lines and typed into the three options-menu editors, whose error text comes from `regerror()`; and `MSGTYPE=hide` patterns aimed at the welcome and look messages. |
| `enhanced-colors` | 26 | Colour strings for `hilite_status` and `MENUCOLOR` that `coloratt.c` parses with `sscanf("#%02x%02x%02x%c")` or `atoi()`: a width-exhausted `0x`, signs, spaces, too few and too many digits. |
| `help` | 85 | Every `?` menu item; `#version`, `v`, `^O`, `#overview`, `^X`, `#chronicle`, `#conduct`, `#known`, `#vanquished`, `#genocided`, `V`, `#?`, `&`, `/`, `!`, `#shell`, `^Z`, `#suspend`, `^R`, `#annotate`; every `#terrain` choice; `\` and every `` ` `` class; `^P` in each `msg_window` mode. |
| `date` | 51 | A Tourist on 34 dates (Friday the 13th, full and new moon, midnight, the 21:59/22:00 and 05:59/06:00 night boundaries, Halloween, both 2026 DST changes, winter and summer, 29 February, both sides of 2038-01-19 03:14:07 UTC, years 1800 to 9999), reading the Hawaiian shirt (whose motif comes from `o_id ^ ubirthday`), then `^X` and `#chronicle`; a debug-mode death on 12 of the dates for the tombstone's year; and five saves restored on another date. |
| `high-byte` | 47 | Every byte from 0x80 to 0xff at the command prompt, some with `altmeta`; high bytes typed into the engrave, extended-command, fruit, call and annotate prompts, used as menu selectors and after a count, with `number_pad`, and in the player name. |

## Running it

```sh
node experiments/host-parity/sample2/make-sample2.mjs
experiments/host-parity/record-sample.sh <out-dir> 4 experiments/host-parity/sample2/recipes/*.session.json
node experiments/host-parity/sample2/check-markers.mjs <out-dir>
```

The macOS workflow (`.github/workflows/macos-recorder.yml`) records the
sample into `macos-recordings/sample2/` in its artifact.
