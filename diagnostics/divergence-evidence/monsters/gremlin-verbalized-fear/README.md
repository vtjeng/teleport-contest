# Spoken gremlin fear receives an extra accessibility prefix

Confirmed native gameplay divergence. At recorded step 73, C prints `"Bright light!"`; JS prints `(northwest): "Bright light!"`. The same seed and inputs with `accessiblemsg` disabled match completely. Both variants have 2,743 matching RNG events, 80 screens/cursors and no animation frames; the target's first screen mismatch is step 73.

The supported setup wishes and wields Sunsword, creates a native seeing gremlin, then rests. Ordinary monster movement calls `distfleeck` → `monflee`; its `rn2(10)=0` branch with hearing enabled invokes `verbalize` in C. In the recorder's tty build, `SetVoice` is empty. `verbalize` quotes the speech and calls `vpline` without setting message location. JS `monfleeMessage` constructs the same quote but then applies `messageAt` to every branch. This speech arm consequently acquires a prefix that C does not produce.

This is one cause related to the earlier accessibility formatting family, specifically an **extra** prefix on speech. It is not another copy of the omitted-prefix cases. No map-symbol lookup, description-coordinate option, excluded object effect or denied-turn artifact is involved. Wielding the standard artifact is only the supported fear setup.

Pinned JS/tool base `32578f23091dad34635a9b4fe0bfb45ed9840e39`; C `16ff59115315917b93185d026aeefea06db9b0f4`. Both complete raw C recordings are bundled as deterministic gzip files, approximately 10 KB each. They contain only the game recipe/trace needed for replay. Exact uncompressed/compressed hashes, raw C/JS toplines, source hashes and recorder identity are included.

From a clean checkout of the stated base with this directory copied in:

```sh
# Intentional target failure at step73; control passes. No recorder needed.
node --test diagnostics/divergence-evidence/monsters/gremlin-verbalized-fear/proof.mjs
# Both characterization checks pass before a repair.
CHARACTERIZE=1 node --test diagnostics/divergence-evidence/monsters/gremlin-verbalized-fear/proof.mjs
node --test scripts/test-suites.test.mjs
# Optional fresh C recording, using the existing configured recorder:
node diagnostics/divergence-evidence/monsters/gremlin-verbalized-fear/record.mjs /absolute/new-target-directory
CONTROL=1 node diagnostics/divergence-evidence/monsters/gremlin-verbalized-fear/record.mjs /absolute/new-control-directory
```

The clean-base target/control and six suite-guard checks were verified. Ordinary `.mjs` runners keep the deliberate failing comparison out of default CI. No gameplay files changed. The recipe adapts the supported Sunsword-flight setup with an independently chosen seed and the two relevant message options; it reached the target on the first attempted seed.

The matching original scanner `monflee:verbalize` lead and hub-generated fingerprint are retained. Reusable original run: [published gzip](https://github.com/vtjeng/teleport-contest/blob/5011e3c8e/diagnostics/divergence-evidence/monsters/vrock-gas-delegation-negative/discovery-run.json.gz), uncompressed SHA-256 `22dde96e93aafc25876762fe1e4c4be4144c28432f353c2a77a6248d11a8642e`. No suppression decision is proposed. Four previous unresolved hypotheses remain separate.
