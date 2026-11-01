# Host-parity sample

This directory holds 500 recipes for measuring how C recordings made on
macOS, the judge's host, differ from recordings made on Linux.
`docs/testing.md`, "Local recordings and the judge's host", explains why the
hosts differ and gives the procedure. The files are:

- `recipes/<id>.session.json`: the recipes, copied byte for byte from the
  local 5,000-game run. One file per recipe, because
  `scripts/record-session.mjs` reads one recipe file and writes one
  recording, and the comparison pairs recordings by file name. The 500
  files take 411 KB.
- `sample.jsonl`: one line per recipe with its group, its result in that
  run (`status`, `hostKinds`), its game family and whether it has two
  segments.
- `select-sample.mjs`: the script that chose the sample.
- `record-sample.sh`: records the recipes with the C recorder. The macOS
  workflow and a local Linux run both use it.
- `probes/<name>.session.json`: five key-binding probe recipes, recorded
  apart from the sample (see "Key-binding probes for the next macOS run").

## Source and selection rule

The recipes come from the local run in `.cache/c-diff/` (not tracked) at
commit `efbea20a1`: the recipes in `recipes/`, the C recordings in
`recordings/`, and one result row per game in `results-efbea20a.jsonl`. A
result's `hostKinds` lists the host substitutions that turned a differing
screen into a match with the JavaScript port: `stringPairs` for the apple,
port-name and `/dev/random` strings, `recorderHome` for the HOME path. Its
`status` is `hostOnly` when the game matched only after those substitutions.

`select-sample.mjs` applies this rule:

1. Take every game whose status is `hostOnly` or whose `hostKinds` is not
   empty, in id order, up to 500.
2. Split the remaining places evenly between passing games (`pass`) and
   failing games (`fail`, `crash`, `refusal`), giving the odd place to
   passing games. A group with fewer games than its share gives the rest to
   the other group.
3. Within each group, in id order, take the games at indexes
   `floor(i * n / k)` for `i` from 0 to `k - 1`, where `n` is the group's size
   and `k` its share.

Games without a local C recording (`cfail`, 8 games) are never chosen,
because there is nothing to compare their macOS recording with.

The run had 232 host-affected games, so 268 places remained. Only 109
failing games were not host-affected, so the sample is:

| Group | Games | Statuses |
| --- | --- | --- |
| `host` | 232 | 219 `hostOnly`, 10 `fail`, 2 `pass`, 1 `refusal` |
| `pass` | 159 | `pass` |
| `fail` | 109 | 106 `fail`, 2 `crash`, 1 `refusal` |

70 of the 500 games have two segments.

To regenerate the sample from the same run:

```sh
node experiments/host-parity/select-sample.mjs .cache/c-diff .cache/c-diff/results-efbea20a.jsonl
```

## Results

The first measurement ran on 1 November 2026: macOS workflow run
[41280653286](https://github.com/vtjeng/teleport-contest/actions/runs/41280653286)
at commit `7ca77caf` (macOS 26.6.2, Apple clang 21.0.0, Node 22.23.4),
and a Linux recording of the same recipes at the same commit, both in
standard time. All 500 recipes recorded on both hosts.

`node scripts/compare-host-recordings.mjs` reported:

| Measure | Count |
| --- | --- |
| RNG logs identical | 498 of 500 |
| Recipes with differing screens | 223 |
| Kind: `/dev/random` versus `/dev/urandom` | 192 recipes, 203 screens |
| Kind: `MacOS` versus `Unix` | 192 recipes, 203 screens |
| Kind: apple message | 33 recipes, 36 screens |
| Kind: key binding (`g04439`) | 1 recipe |

The two recipes whose RNG logs differ are `g00203`, from the apple step
on, and `g04439`, after the key-binding difference.

Replaying the 500 macOS recordings with the JavaScript port
(`node .cache/tools/replay-check.mjs <repo> <recording>`, no host
substitution):

| Sample group | Match macOS | Differ |
| --- | --- | --- |
| `pass` | 159 | 0 |
| `host` | 175 | 57 |
| `fail` | 56 | 53 |

51 of the 110 differing recordings print the recorder's temporary `HOME`
(`/tmp/nh-rec-XXXXXX/home`) in the options help, where the port prints
the judge's. `docs/testing.md`, "Local recordings and the judge's host",
interprets these results.

### Linux with the macOS-output profile

On 1 November 2026, at the commit that added the Linux macOS-output
profile (`nethack-c/host-profiles/linux-macos-output.patch`) and patch 008
(the judge's `HOME`), the 500 recipes were recorded again on Linux, in
standard time, and compared with the macOS recordings of run 41280653286:

| Measure | Plain Linux | Linux with profile |
| --- | --- | --- |
| RNG logs identical | 498 of 500 | 499 of 500 |
| Recipes with differing screens | 223 | 52 |
| Kind: `/dev/random` versus `/dev/urandom` | 192 recipes | none |
| Kind: `MacOS` versus `Unix` | 192 recipes | none |
| Kind: apple message | 33 recipes | none |
| Kind: key binding (`g04439`) | 1 recipe | 1 recipe |
| Options help: temporary versus judge's `HOME` | not measured | 51 recipes |

The 51 options-help recipes differ because the macOS recordings predate
patch 008 and show the temporary `HOME`, while the new Linux ones show the
judge's. The new path also moves the help text's line breaks and pages,
which `compare-host-recordings.mjs` reports as 71 further small kinds
in the same 51 recipes. Re-run the macOS workflow once patch 008 is on
`main`; these recipes should then match.

Replaying the new Linux recordings with the JavaScript port, again with no
substitution:

| Sample group | Match macOS | Match Linux with profile |
| --- | --- | --- |
| `pass` (159) | 159 | 159 |
| `host` (232) | 175 | 224 |
| `fail` (109) | 56 | 57 |
| All (500) | 390 | 440 |

Every recording that matched on macOS also matches on Linux. The 50 that
match only on Linux are 49 of the 51 options-help recipes and `g04439`,
where the port binds the key as the Linux recorder does. The other two
options-help recipes, `g01125` and `g04257`, differ from the port at
another step.

### Key-binding probes for the next macOS run

`g04439` is the only recorded case of the key-binding difference, and its
cause is undefined behavior (`docs/testing.md`, "The key-binding
difference"). Before the port or the profile changes, record these probes
on macOS as well as on Linux. Each is one segment with seed `7310442`,
`datetime` `20261115143000` and this `nethackrc`:

```
OPTIONS=name:Probe,role:Valkyrie,race:human,gender:female,align:neutral
OPTIONS=!autopickup,!legacy,!tutorial,!splash_screen,pettype:none
```

The moves all start with `#optionsfull\n      h\n`, which pages to the
`h - bind keys` row and opens the `Do what?` menu (written in JSON string
escapes):

| Probe | Moves after the prefix | Path in `handler_rebind_keys_add()` | Linux result |
| --- | --- | --- | --- |
| `bind-key-first` | `a~:apply\n\u001b~\u001b` | Key first, `Strcat(cmdstr, "apply")` | `Bound key '~' to "apply".` |
| `bind-command-first` | `b:apply\n~\u001b~\u001b` | Command first, then the key | `Bound key '~' to "apply".` |
| `unbind-key` | `aKa\u001bK` | `Strcat(cmdstr, "nothing")` | `Changed key 'K' from "runnorth" to "nothing".` |
| `bind-param` | `a~:toggle:\nautopickup\n\u001b\u001b~` | `Snprintf()` of `toggle(autopickup)` | `Bound key '~' to "toggle(autopickup)".` |
| `bind-twice` | ``a~:apply\n\u001ba`:pray\n\u001b\u001b~\u001b`\u001b`` | A second bind in the same menu | Both keys bound |

The five recipes are in `probes/`. `bind-param` is a copy of the
committed recipe `recipes/cmd.c/toggle-bound-param-menu.session.json`.
The macOS workflow records them into `probes/` inside its artifact, apart
from the 500-recipe sample. Their Linux recordings, made with the Linux
output profile, all match the port (`replay-check.mjs`, 5 of 5, at
`b97f251d`). To record them locally:

```sh
experiments/host-parity/record-sample.sh .cache/host-parity/linux-probes 5 experiments/host-parity/probes/*.session.json
```

If macOS prints `Key binding failed?!` for the four probes that use
`Strcat()` and binds the `bind-param` key, the judge's behavior is
consistent enough to port.

### Level-teleport menu probes

`levtele-menu-unreachable-knox-letter` and `levtele-menu-endgame-dummy-letter`
are copies of the recipes of the same names under `recipes/dungeon.c/`. In
both, the player presses the letter that `dungeon.c tport_menu()` gives an
unreachable level. `tty_select_menu()` then returns identifier 0, and
`print_dungeon()` reads `lchoices.playerlev[-1]`, one place before the start
of the array: undefined behaviour, like the key-binding case. On Linux the
byte read is 0, so `level_tele()` returns silently, and the port now does the
same. The macOS workflow records these two probes so that the next run shows
whether the judge's build also reads 0.
