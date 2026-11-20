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
- `results/`: the comparison report for run 44619874537
  (`compare-44619874537.txt`), the inventory rows each `re-match` and
  `re-typed` pattern highlighted on each host
  (`regex-highlights-44619874537.txt`; `ERR(...)` is the error text), and
  the port's replay of the 89 macOS recordings that differ from Linux
  (`port-vs-macos-differing-44619874537.txt`).
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
| `regex` | 119 | `regcomp()` patterns that GNU and BSD regex may read differently, as `MENUCOLOR` lines; patterns a player might type into the menu-colour editor, including the `{,n}` family; bad patterns as `MENUCOLOR`, `MSGTYPE` and `AUTOPICKUP_EXCEPTION` lines and typed into the three options-menu editors, whose error text comes from `regerror()`; and `MSGTYPE=hide` patterns aimed at the welcome and look messages. |
| `enhanced-colors` | 39 | Colour strings with a width-exhausted `0x`, signs, spaces, too few and too many digits. Only the `glyph:` lines (after `symset:plain`) reach `coloratt.c rgbstr_to_int32()`, which parses them with `atoi()` and `sscanf("#%02x%02x%02x%c")`; the `hilite_status` and `MENUCOLOR` lines go through `match_str2clr()`, a colour-name lookup. The capture (patch 006) hooks `term_start_color()` but not `term_start_extracolor()`, so an RGB colour never shows on a recorded screen. This build has no `palette` option. |
| `help` | 85 | Every `?` menu item; `#version`, `v`, `^O`, `#overview`, `^X`, `#chronicle`, `#conduct`, `#known`, `#vanquished`, `#genocided`, `V`, `#?`, `&`, `/`, `!`, `#shell`, `^Z`, `#suspend`, `^R`, `#annotate`; every `#terrain` choice; `\` and every `` ` `` class; `^P` in each `msg_window` mode. |
| `date` | 65 | A Tourist on 42 dates (Friday the 13th, full and new moon, midnight, the 21:59/22:00 and 05:59/06:00 night boundaries, Halloween, both 2026 DST changes, winter and summer, 29 February, both sides of 2038-01-19 03:14:07 UTC, years 1800 to 9999, with eight dates between 1801 and 1901 added after the first macOS run), reading the Hawaiian shirt (whose motif comes from `o_id ^ ubirthday`), then `^X` and `#chronicle`; a debug-mode death on 18 of the dates for the tombstone's year; and five saves restored on another date. |
| `high-byte` | 47 | Every byte from 0x80 to 0xff at the command prompt, some with `altmeta`; high bytes typed into the engrave, extended-command, fruit, call and annotate prompts, used as menu selectors and after a count, with `number_pad`, and in the player name. |
| `out-of-bounds` | 10 | Copies of committed debug-mode recipes in which C reads `svd.dungeons[-1]` or `gl.luathemes[-1]` for a wished magic portal "to nowhere". The port models those bytes from the Linux recorder's memory layout (`js/dungeon_table.js`, `js/mklev.js`). |

## Running it

```sh
node experiments/host-parity/sample2/make-sample2.mjs
experiments/host-parity/record-sample.sh <out-dir> 4 experiments/host-parity/sample2/recipes/*.session.json
node experiments/host-parity/sample2/check-markers.mjs <out-dir>
```

The macOS workflow (`.github/workflows/macos-recorder.yml`) records the
sample into `macos-recordings/sample2/` in its artifact.

## Results

Two macOS workflow runs recorded the sample, both on macOS 26.7.2
(arm64, Apple clang 21.0.0), in standard time with `tm_isdst` forced to 1
(patch 009), as was the Linux recording:

- Run [44616562608](https://github.com/vtjeng/teleport-contest/actions/runs/44616562608)
  at `07520f6e`: the first 580 recipes. In this version the regex
  recipes doubled every backslash, and the colour recipes did not reach
  `rgbstr_to_int32()`.
- Run [44619874537](https://github.com/vtjeng/teleport-contest/actions/runs/44619874537)
  at `e59cc23f`: the 643 recipes here. Every recipe recorded on both
  hosts.

`node scripts/compare-host-recordings.mjs <macOS> <Linux>` on run
44619874537 reported 626 of 643 RNG logs identical and 72 recipes with
differing screens; 89 recipes differ in all, in three groups.

| Group | Recipes that differ | Cause |
| --- | --- | --- |
| `regex` | 75 of 119 | The host's `regcomp()` and `regerror()` |
| `date` | 12 of 65: every date from 1800 to 1899 | `mktime()` before 1900 |
| `status-highlights` | 2 of 37: `hl-hsbuf-21`, `hl-hsbuf-22` | A read past `hsbuf[]` |

The 17 RNG differences are not game differences. In 13 regex recipes one
host stops at the config-error screen before the game starts. In four
pre-1900 date recipes Linux prints a date-dependent start message with a
`--More--` that macOS, on its own clock's date, does not, which moves an
input boundary.

The other 554 recipes are identical on both hosts: every options menu,
help screen, `^P` mode and high-byte key, every date from 1900 to 9999
(the DST gap and repeated hour, Friday the 13th, both moons, midnight,
2038), the save and restore pairs, the colour strings and the ten
out-of-bounds portal recipes. Every text pager in the `?` menu was paged to its end. The
port replays the Linux recordings of all 643 recipes except the two
`hl-hsbuf` ones; the 554 macOS recordings that equal Linux were not
replayed separately.

The dates show that macOS `mktime()` gives the same `time_t` as glibc
from 1900 on, when the recorder copies the fields of a standard-time
`localtime()` and forces `tm_isdst` to 1, which leaves the copied
`tm_gmtoff` contradicting `tm_isdst`. The shirt motif resolves the
`time_t` to well under an hour: on Linux it differs between 01:59:59,
02:00, 02:30 and 03:00 on 8 March 2026. A macOS recording made in
daylight time, as the judge's were, was not tested.

The ten out-of-bounds recipes matching means that this runner's build
had the same bytes before `svd.dungeons` and `gl.luathemes` as the Linux
recorder in these games. It does not show that the layouts are the
same.

### Regex

`sys/share/posixregex.c regex_compile()` calls the C library's
`regcomp(REG_EXTENDED | REG_NOSUB)` (line 70) and `regex_error_desc()`
calls `regerror()` (line 84). macOS ships BSD regex; when this sample
ran, `js/posixregex.js`, `js/regcomp.js` and `js/regexec.js` ported
glibc's. The port now follows macOS (docs/testing.md, "The regex
difference"). The differences:

- Every rejected pattern has different error text, for example
  `parentheses not balanced.` against `Unmatched ( or \(.`, and
  `repetition-operator operand invalid.` against
  `Invalid preceding regular expression.`
- macOS rejects empty alternatives (`spear|`, `|spear`, `(spear|)`) as
  `empty (sub)expression.` and stacked repetition (`x**`, `a+?`, `b*+`,
  `a{1,2}{3}`) as `repetition-operator operand invalid.`; glibc accepts
  them.
- glibc rejects `[[:<:]]`, `[[.space.]]` and `{,1}`; macOS accepts them.
- `\w`, `\W`, `\s`, `\S`, `\b`, `\<` and `\>` are GNU operators; macOS
  reads them as the plain letter. In an extended regex, glibc reads `\1`
  as a back-reference and macOS as the digit 1. glibc reads `{,n}` as
  `{0,n}` and macOS as literal text.
- The two hosts agree on `\d` (the letter d), `\+`, `\(`, `.`, anchors,
  `{m,n}`, ordinary words, and the bracket expressions `[a-]`, `[]a]x`,
  `[^]]`, `[\d]`, `[[=a=]]` and `[[:alpha:]]`.
- "The plain letter", "the digit 1" and "literal text" above were read
  from which inventory rows each pattern highlighted
  (`results/regex-highlights-44619874537.txt`). Apple Libc's
  `tre-parse.c` (its "unenhanced_backslash" branch and
  `ERE_LITERAL_LBRACE_ON_NON_NUMERIC_BOUND`) and the regex oracle of run
  44628090866 (`../regex-oracle/`) confirm them.

A judged session reaches this with single-byte keys and no debug mode:
`#optionsfull` (or `O`), then `menu colors`, `message types` or
`autopickup exceptions`, `a` to add, and a pattern. Patterns a player
might well type, such as `+1`, `+0 dagger`, `*dagger` and `?spear`, are
rejected on both hosts with different text, which changes one or two
screens and no RNG call (`re-typed-03` to `re-typed-06`). `MENUCOLOR`,
`MSGTYPE` and `AUTOPICKUP_EXCEPTION` lines in a session's nethackrc
reach it too; none of the 44 public sessions has one. When this sample
ran, the port replayed all 75 Linux recordings and none of the 75 macOS
ones. It now follows macOS's regex and replays all 119 macOS regex
recordings of run 44628090866, which recorded this sample again.

### Dates before 1900

For each of the six dates from 1800 to 1899 macOS shows a different Hawaiian-shirt
motif and a tombstone dated 2026, the year of the run, where Linux shows
the requested date (the tombstone prints 1900 for 1800, through the
`tm_year < 70` rule in `calendar.c yyyymmdd()`). `19000101000000` and
the 1901 dates match. The likely cause, not traced in the macOS source:
macOS `mktime()` returns -1 for a year before 1900, so patch 001's
`time_from_yyyymmddhhmmss()` returns 0 and `getnow()` falls back to
`time()`. `date-y1800` differs between the two macOS runs, which fits a
real-clock fallback. A judged session reaches this only through a
`datetime` before 1900; the public sessions use 2000 to 2026. No port can
match a real-clock recording. The port replays the Linux recordings.

### `hsbuf[21]`

A `hilite_status` value with 21 or more `/`-separated fields makes
`botl.c parse_status_hl1()` fill `hsbuf[0]` to `hsbuf[20]`, and a parser
then reads `hsbuf[21]`, past the array. The error text shows whatever
the stack held. Two Linux recordings of `hl-hsbuf-21` differ from each
other, so no port can match either host. The port reports a fixed
configuration error (`js/options.js`). A judged session reaches it
through such a `hilite_status` line in its nethackrc, or by typing the
value at the `hilite_status` prompt of `#optionsfull`; two Linux
recordings of that path showed different garbage as well.

### Uninitialized memory

A Linux recorder built with `-ftrivial-auto-var-init=pattern` (stack
variables start as a nonzero pattern instead of whatever the stack held)
was checked against the normal Linux build:

- It prints `Key binding failed?!` for the `bind-key-first` probe, as
  macOS does; the normal Linux build binds the key.
- Of the 4,136 committed recipes that have a committed recording, 3
  differ: `cmd.c/unbind-unbound-key-reports-nothing` (the `cmdstr`
  buffer in `cmd.c handler_rebind_keys_add()`) and the two
  `dungeon.c/levtele-menu-*` recipes (`print_dungeon()` reads
  `lchoices.playerlev[-1]`). macOS read 0 in the levtele probes of run
  44607258217, as Linux does; that depends on what the stack held, not
  on a rule.
- Its recordings of the first 500-recipe sample match macOS run
  44619874537 in all 500, `g04439` included.
- Of the first 580 recipes of this sample, only the two `hl-hsbuf`
  recipes differ.

The normal build with `MALLOC_PERTURB_=165` (heap blocks start as a
nonzero pattern) recorded 579 of the first 580 recipes; 577 match the
normal recordings and the two `hl-hsbuf` recipes do not. The one that did
not record, `optc-runmode-esc`, was missing (`ENOENT`) because
`make-sample2.mjs` rewrote the recipes while the run was going.

A text scan of `cmd.c`, `options.c`, `invent.c`, `pager.c`, `insight.c`,
`botl.c` and `wintty.c` for local `char` arrays whose first use reads
them found `cmdstr` only. A wider scan for arrays whose first use is not a
plain write listed 80 sites; those read did not show a read before a
write, and the rest were not checked one by one.

### Not covered

- How the judge's recorder delivers keys. Both hosts here write keys to a
  pipe, so terminal line-discipline handling, such as `^T` (`VSTATUS` on
  macOS), `^C`, `^Z` and `^O`, is not tested.
- The judge's terminfo entry. Both runs used the runner's
  `xterm-256color`.
- A recording made in daylight time on macOS.
- RGB colours, which the capture does not record.
- Heap perturbation of the committed recipes, and stack or heap
  perturbation on macOS itself.
- The short `O` menu row by row; its rows are a subset of `#optionsfull`.
- The order in which `qsort()` calls a comparator. Patch 002 makes the
  sorted result independent of the C library, but a comparator with side
  effects, such as `sortloot_cmp()`, still runs in the library's order.
- `snprintf()` truncation, and `scanf()` overflow other than the typed
  value `99999999999` at the compound-option prompts.
- `WARNINGS=` with fewer than six values, which leaves part of an array
  uninitialized (`js/cfgfiles.js cnf_line_WARNINGS()`).
- The other sites where a `js/` comment says the port follows glibc
  (`atoi()`/`atol()` and `scanf()` conversions in `js/hacklib.js`,
  `js/minion.js`, `js/sounds.js`, `js/files.js` and `js/topten.js`).
  `%s` with a null pointer prints `(null)` on both hosts: the macOS
  recording of `recipes/cmd.c/bind-toggle-empty-param-reports-and-lists-null`
  from run 44607258217 equals the committed Linux one.
