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
