# Direct turn binding cannot reach its implemented command

On Main `acec7a75751e61f8e6b78c2f08c1579d19a10869`, an ordinary Ranger with `BINDINGS=V:turn` can type `V` in C and receive `You don't know how to turn undead!`. JS refuses the parsed command before reaching `doturn`. The same configuration with `#turn` works on both sides. A second supported witness uses Escape then `t` with `altmeta` enabled; it has the same failure and counts as the same cause.

From repository root with the standard recorder setup:

```
node scripts/diff-fresh.mjs diagnostics/divergence-evidence/commands/cmd-turn-direct-binding/witness.recipe.json
node scripts/diff-fresh.mjs diagnostics/divergence-evidence/commands/cmd-turn-direct-binding/control.recipe.json
node scripts/diff-fresh.mjs diagnostics/divergence-evidence/commands/cmd-turn-direct-binding/altmeta.recipe.json
node --test diagnostics/divergence-evidence/commands/cmd-turn-direct-binding/candidate.test.mjs
```

Expected exits: 1, 0, 1, 1. Only the two aliases fail in the candidate test, which stays outside default CI. The bound witness has C=2 versus JS=1 screen/cursor boundaries; the altmeta witness has C=3 versus JS=2. The control matches all seven boundaries. Each has 2,545 RNG calls on both sides.

`turn` has a generated table row and an implemented `doextcmd` handler, but is absent from `ADMITTED_COMMANDS`. `rhack` rejects it at parsed-input admission. C dispatches the bound row's function pointer. `boundary.json` retains the exact supported JS diagnostic. This is distinct from the accepted first-`#turn` conduct fix and queued prayer-repeat repair.

No wizard mode, state injection, object implementation or monster AI is involved. A preliminary Unicode-character probe was discarded because the recorder sends UTF-8 bytes; it did not exercise the intended C key. Both retained witnesses are ASCII input. Raw C/JS JSON is gzip-compressed with hashes in `case.json`; no custom decompressor is needed. Main owns the gameplay repair.
