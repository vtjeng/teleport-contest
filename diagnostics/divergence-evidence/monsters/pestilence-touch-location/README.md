# Pestilence hero-touch message drops its location

Confirmed native gameplay divergence at step 80: C prints `(northeast): Pestilence reaches out, and you feel fever and chills.--More--`; JS drops `(northeast): `. The first screen and cursor mismatches occur there. All 2,525 target RNG events match. The same seed/input with accessibility messages disabled matches all 2,772 RNG events and 85 screens/cursors. Both recordings have 85 screens and no animation frames.

The supported public setup uses wizard `#levelchange` to 30 so the hero can survive, creates native hostile Pestilence with the unique-monster confirmation, then rests. Ordinary monster combat dispatches its shipped `AD_PEST` attack into `mhitm_ad_pest`. C's hero-defender branch explicitly calls `pline_mon`; JS directly calls the ordinary message adapter. `diseasemu` and ordinary damage continue through their real owners in both implementations.

This is an additional site in the existing omitted-prefix family, not a new class of combat defect. It is the opposite of [PR #88's spoken gremlin line](https://github.com/vtjeng/teleport-contest/pull/88), where C deliberately has no prefix. A blanket add/remove policy would be incorrect. This proof covers the reached hero-touch output only, not broader disease logic or the monster-target delegation.

The option variants are independently compared against their own C recordings. Their later RNG counts differ because the prefix changes message pagination and hence how subsequent inputs are consumed; no claim of identical gameplay across variants is made. The target comparison itself has identical RNG throughout.

Pinned base: JS/tooling `32578f23091dad34635a9b4fe0bfb45ed9840e39`; C `16ff59115315917b93185d026aeefea06db9b0f4`. Both complete raw C recordings are bundled as small deterministic gzip files. Source/tool/recorder hashes and raw C/JS toplines accompany them. From a clean checkout of that base with this directory copied in:

```sh
# Intentional target screen/cursor failure at step80; control passes.
node --test diagnostics/divergence-evidence/monsters/pestilence-touch-location/proof.mjs
# Both characterization checks pass before repair.
CHARACTERIZE=1 node --test diagnostics/divergence-evidence/monsters/pestilence-touch-location/proof.mjs
node --test scripts/test-suites.test.mjs
# Optional fresh C runs with the existing configured recorder:
node diagnostics/divergence-evidence/monsters/pestilence-touch-location/record.mjs /absolute/new-target-directory
CONTROL=1 node diagnostics/divergence-evidence/monsters/pestilence-touch-location/record.mjs /absolute/new-control-directory
```

Clean-base replay needs no recorder; target/control, characterization and six suite-guard checks were verified. Ordinary `.mjs` names keep the deliberately failing parity runner outside default CI. Recipe adapts the existing supported level-30/forced-Pestilence setup with a new seed, removing Conflict and the other monster so the hero receives the attack. The first attempted seed reached the branch.

Exact original scanner lead `mhitm_ad_pest:pline_mon` and hub-generated fingerprint are retained without a suppression decision. The original run remains available as [the reusable published gzip](https://github.com/vtjeng/teleport-contest/blob/5011e3c8e/diagnostics/divergence-evidence/monsters/vrock-gas-delegation-negative/discovery-run.json.gz), uncompressed SHA-256 `22dde96e93aafc25876762fe1e4c4be4144c28432f353c2a77a6248d11a8642e`.

No gameplay changes, map-symbol/description-coordinate operations, excluded scenarios or denied-turn artifacts are involved. Four earlier unresolved hypotheses remain separate.
