# objects-partly-eaten-container-hook

**Confirmed divergence, objects shard.** On JS base `5826a75fcc149b8895af22af4d38ea750bad13c8`, applying a carried empty sack and stashing a partly eaten food ration stops JS with `eatenStat is not available for otyp 293`. C completes the insertion. The whole-ration control matches completely.

The independent public-input recipe starts a debug Valkyrie without a pet, wishes for an uncursed empty sack (letter e), wishes for an uncursed partly eaten food ration (f), then executes `aesf`. Wishing establishes the setup; the measured insertion/weight branch does not depend on wizard mode. `setup-observations.json` preserves the setup captures' final frames, exact inputs and full-capture hashes: inventory letters, partly eaten state, and the sack menu. This is a reachable case, not a fabricated invalid object.

C `pickup.c:2704` recomputes the container weight. `mkobj.c:1929-1930` recursively weighs contents, and `mkobj.c:1964-1965` calls `eaten_stat` for partly eaten food. JS `pickup.js:3265-3266` passes only `{state}` to `weight`; `obj.js:1774-1775` forwards that environment recursively, and `obj.js:1794` requires `hooks.eatenStat`. The wish parser supplies that hook locally (`objnam_readobjnam.js:1940-1945`), which explains why creating the ration succeeds but does not repair the later container operation. No gameplay change is included.

## Reproduce

From repository root, with a private copy of the existing patched recorder install:

```
NETHACK_INSTALL=/tmp/objects-recorder NETHACK_BINARY=/tmp/objects-recorder/nethack node scripts/record-session.mjs diagnostics/divergence-evidence/objects/objects-partly-eaten-container-hook/recipe.json /tmp/objects-new-c.json
node frozen/ps_test_runner.mjs --worker-session=/tmp/objects-new-c.json
node --test diagnostics/divergence-evidence/objects/objects-partly-eaten-container-hook/check.test.mjs
```

The focused test intentionally fails its candidate assertion until gameplay is repaired; it is outside default CI. Its whole-ration control passes. The frozen scorer in separate fresh processes reports candidate: 78/79 screens and cursors, 2748/2752 RNG calls; control: 66/66 screens and cursors, 2747/2747 RNG calls. `observation.json` retains the exact diagnostic boundary and final C/JS screens. A second direct replay independently reproduced the boundary.

Scope: this demonstrates one sack/ration operation. Other partly eaten objects and container paths are leads, not additional confirmed cases. Matching control input does not prove universal whole-food equivalence. The raw scanner warning about `requiredHook` is a lead rather than proof; the public recording supplies the proof. No active objects PR was present at initial triage. No matching repair was found in current source/history.
