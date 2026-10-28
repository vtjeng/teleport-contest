# objects-scatter-unused-flags

**Explained negative, objects shard.** Five compiled-constant warnings (`MAY_HITMON`, `MAY_HITYOU`, `MAY_HIT`, `MAY_DESTROY`, `MAY_FRACTURE`) report real numeric disagreements in `js/const.js:2036-2040`. They share one cause: these are unused legacy exports. Gameplay scatter uses separate `SCATTER_*` exports from `js/explode.js:231-236`, whose values match C `include/hack.h:1339-1344` exactly (1, 2, 4, 6, 8, 16).

A complete identifier search over production `js/*.js` finds the five mismatched names only at their declarations. Scatter's consumers in `dokick.js`, `trap_effects.js`, `dbridge.js`, and `pickup.js` import `SCATTER_*` from `explode.js`; scatter itself tests those same flags. A zero-mask kick is also present and has no flagged effects. The sole static namespace import of const.js is `statusConstants` in display.js, whose accesses and finite destructuring are status fields, not computed field lookup; the sole dynamic const.js import destructures `DISMOUNT_GENERIC` in mon.js. Thus the legacy numbers cannot reach scatter through current production references.

Expected C and observed active JS: each active mask selects the same bit positions, including the MAY_HIT union. The focused test checks all 32 combinations of the five independent bits, explicitly retains the fact that the legacy values differ, and fails if any production file starts referring to those legacy names. These numerical checks supplement the complete value-use trace; they are not a claim that scatter's entire runtime behavior is equivalent.

```
node --test diagnostics/divergence-evidence/objects/objects-scatter-unused-flags/check.test.mjs
source /workspace/.setup/activate.sh
TELEPORT_RECORDER_INCLUDE=/workspace/teleport-contest/nethack-c/recorder/include node scripts/discover-constants.mjs --report /tmp/objects-constants-new.json
```

The compiled scan completed using the existing recorder-generated headers and Clang 19.1.7. No compiler installation or header modifications were needed. The focused test passes. The source mismatch is preserved as five raw observations, deduplicated to one disposition. Do not suppress other mismatched constants on name similarity alone; a new legacy reader, reflective lookup or changed import invalidates this proof. This is tooling evidence, not a gameplay fix candidate.

## Exact discovery binding

This PR includes one shared `bound-run.json` containing only these five leads plus the burning-oil lead, and the unchanged run-level fields used by the hub's review fingerprint. `binding.json` pins the original full run's SHA-256 and the projection's SHA-256. The complete immutable run is retained in the saved objects environment at the repository-relative path recorded there. The projection is explicitly labeled; it is not a new scan or a claim to include unrelated leads.

`decisions.json` starts from the hub's template for the full run, preserving its key, evidenceKey, runId and reviewFingerprint. The hub classifier verifies those decisions against the included projection:

```
node scripts/discovery-hub.mjs classify --run diagnostics/divergence-evidence/objects/objects-scatter-unused-flags/bound-run.json --decisions diagnostics/divergence-evidence/objects/objects-scatter-unused-flags/decisions.json --out /tmp/objects-reviewed-new.json
```

Use a fresh output filename. The six raw warnings represent two semantic dispositions. Their identities and observations remain intact.
