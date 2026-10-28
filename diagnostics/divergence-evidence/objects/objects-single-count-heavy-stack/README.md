# objects-single-count-heavy-stack

**Confirmed divergence; implementation-ready objects handoff.** Requesting one rock from a 1000-rock floor stack reaches an unsupported pickup boundary in JS, while C picks it up. Requesting two from the identical stack succeeds in both. This is an extra JS admission guard, distinct from the accepted partly-eaten food-stashing repair.

## Reproduce

On clean base **58ad57cea2dcd8b94b8d1f7644e9e21fc02c7cd1**, copy this evidence directory from the PR at its repository-relative path. No package install, C compilation or fixture reconstruction is needed.

```
node --test diagnostics/divergence-evidence/objects/objects-single-count-heavy-stack/candidate.test.mjs
```

Expected now: target FAIL, control PASS, exit 1. Target reports `supported counted pickup must not hit a command boundary`; the actual boundary reason is `an unported branch of this command: unsupported pickup: pickup() requiring a partial or failed lift`. This deliberate candidate test is outside default CI. After repair both cases should finish, carrying one/two rocks and leaving 999/998 on the floor under the hero.

Passing verification of the current defect:
```
node --test diagnostics/divergence-evidence/objects/objects-single-count-heavy-stack/verify-current.test.mjs
```

Full C oracle comparison:
```
node frozen/ps_test_runner.mjs --worker-session=diagnostics/divergence-evidence/objects/objects-single-count-heavy-stack/target-capture-c.json
node frozen/ps_test_runner.mjs --worker-session=diagnostics/divergence-evidence/objects/objects-single-count-heavy-stack/control-capture-c.json
```

Target matches 35/39 screens/cursors and 2347/2353 RNG calls before stopping. First visible mismatch is zero-based step 35: C prints `e - a rock.` The frozen worker reports `error:null` because the command wrapper converts the error into an onBoundary notification; verify-current captures that notification and checks no rock was transferred. Control completely matches 39 screens/cursors and 2353 RNG calls.

## Supported setup and cause

Both recipes use public debug Valkyrie, seed 19870704 and fixed datetime. Wish `1000 uncursed rocks`: both C captures prove the complete stack falls to the floor at step 31. Then target uses `1,` and control `2,`, followed by inventory. No map or inventory injection is used. Both C inventories show the requested one/two rocks. Post-repair floor remainder expectations follow C's counted split semantics as well as the observed inventory count.

C pickup.c:1570-1608 carry_count saves the stack quantity/weight, temporarily substitutes requested count and recomputes weight when count differs, then restores the source stack before deciding whether count can be lifted. JS pickup.js:942-1043 preflight instead adds full object weight. Its sourceZeroLift exception requires object.quan===1, its sourcePartialStackLift exception requires selectedObject.count>1, and its multi-selection exception requires multiple rows. A one-item request from this huge stack fails all three and throws before the existing live carry_count path runs. The two-item control reaches that path and succeeds. Existing pickup.test.mjs covers whole heavy stacks and multi-selection, but this count-one boundary remains.

The source hypothesis was recorded before either experiment. The exact scanner warning is the JS-only preflightPickupObjects helper edge; it is not a borrowed neighboring identity. Binding files preserve the immutable run, key/evidenceKey/runId and hub review fingerprint. Discovery predates the food-stashing repair: the complete current pickup.js hash differs, but the implicated preflight function is byte-identical, with its fragment hash recorded separately.

## Validation and provenance

Candidate, verify-current and both full replay commands were verified in the detached clean gameplay checkout of the stated base, with evidence directories added and no tracked gameplay edits. Target deterministically fails and control passes. `observations.json` records these outcomes.

C upstream is **16ff59115315917b93185d026aeefea06db9b0f4**; recorder pickup.c compares byte-for-byte with it. `record.json` pins source, binary, patches, tools and fixtures. Optional fresh recording uses the standard patched recorder in a private install:
```
NETHACK_INSTALL=/tmp/objects-recorder NETHACK_BINARY=/tmp/objects-recorder/nethack node scripts/record-session.mjs diagnostics/divergence-evidence/objects/objects-single-count-heavy-stack/target-recipe.json /tmp/single-stack-new.json
```

Only this count-one ordinary floor-stack boundary is claimed. Gold, loadstones, special corpses, shop stock and other capacity cases are outside the handoff. No gameplay changes are included.
