# Blinded Archon gaze: bounded explained negative

The native Archon retains its blinding gaze while temporarily blind. A blinded
Pyrolisk cannot use its fire gaze. JavaScript matches the explicit C exception.
This manual case is unbound and must not generate an automatic scanner suppression.

From repository root, on JS base `8eec78d622b3ef9cb22a54d1699aaf335e9342e9`:

```sh
git submodule update --init --checkout --no-fetch -- nethack-c/upstream
node --test diagnostics/divergence-evidence/monsters/blinded-archon-gaze-negative/*.test.mjs
```

Requires Node and a C99 compiler (`cc`). All three tests also passed in a separate
clean checkout of that base with only this evidence directory copied in.

`oracle.test.mjs` extracts and compiles the exact upstream `gazemm` rejection
predicate, fixing other guard operands to this fixture (sighted, awake,
nonresistant minotaur; uncancelled, visible attacker). It returns allowed for the
blinded Archon and rejected for the blinded ordinary gaze. Source assertions pin
the native Archon/AD_BLND selector, special wording, blindness dispatch, and the
potion setup's eye/permanent-blindness checks. This is a predicate oracle, not a
full C combat execution or a public-input recording.

`probe.test.mjs` initializes a real game, places native monsters on visible free
adjacent squares, and uses production `potionhit` with an identified hero-thrown
potion of blindness. Both attackers acquire 65 turns of temporary blindness.
The Archon has no weapon (a supported disarmed state); HP values fit native dice.
Monster combat can enter this path through conflict. No native attack is replaced
or injected; the whole `mattackm` runs with valid low deterministic draws.

The Archon blinds the minotaur for two turns and stuns it; its physical attacks
leave 115 HP. The Pyrolisk prints “but nothing happens” for its gaze, then its
native bite leaves 119 HP. That later bite must not be mistaken for successful
gaze damage. `observations.txt` preserves draws, messages and state.

During probe construction, a wrong module import and an oracle process-call
signature were corrected. A missing identification prompt was removed by using
an identified potion type. The first Pyrolisk assertion incorrectly expected no
physical bite damage; the final control retains and checks that native bite.
These construction failures were not gameplay findings.

The prior broad Archon targeting scout and later wraith-growth hypothesis remain
unresolved. This case proves only the named blindness guard and control, not
complete Archon AI, arbitrary resistance combinations, or whole-combat C/JS RNG
identity. Exact source/tool hashes and timestamps are in `case.json`.
