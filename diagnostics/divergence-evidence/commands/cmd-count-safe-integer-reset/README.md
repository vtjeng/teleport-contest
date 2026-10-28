# Command count resets at JavaScript's safe-integer limit

Base: `5826a75fcc149b8895af22af4d38ea750bad13c8`. C source: `16ff59115315917b93185d026aeefea06db9b0f4`.

An ordinary Ranger can select starting arrows with `ic`, choose the split-count item action with `I`, and type `9007199254740992` followed by space. C displays that count, then rejects it as too large for the 58-arrow stack. JS displays `Count: 0` and rejects it as below one. No split occurs.

The first mismatch is zero-based boundary 19, after the final digit. Both sides have 21 screens/cursors and 2,260 matching RNG calls. Changing only the final digit to `1` gives complete parity. Two fresh C recordings reproduce the witness, including one on the stated base.

From the repository root with the standard recorder setup:

```
node scripts/diff-fresh.mjs diagnostics/divergence-evidence/commands/cmd-count-safe-integer-reset/witness.recipe.json
node scripts/diff-fresh.mjs diagnostics/divergence-evidence/commands/cmd-count-safe-integer-reset/control.recipe.json
node --test diagnostics/divergence-evidence/commands/cmd-count-safe-integer-reset/candidate.test.mjs
```

Expected exits: witness 1, control 0, candidate tests 1 (control passes; witness reports count/cursor mismatch). All fixtures are included. Fresh tools isolate recorder state and overlay protected scorer files. The candidate test is outside default CI.

`get_count` uses `Number.MAX_SAFE_INTEGER` as its overflow boundary; C's `AppendLongDigit` uses `LONG_MAX`. The reachable caller passes `maxcount=0`. Ordinary command prefixes capped at 32767 do not expose this. Implementing exact C-long parsing may require more than changing the threshold; nearby decimal values beyond JS integer precision remain separate follow-up checks.

This case concerns command input parsing only, with no object implementation changes. See `case.json` for oracle hashes, source locations, raw setup observations and scope.
