# Default castmu API loses the monster-name article

Confirmed **API-scoped** divergence, not a demonstrated public-play mismatch. Current normal monster actions inject the correct name adapter. The exported `castmu` API accepts omission of that optional adapter but falls back to capitalizing the bare species name, losing C `Monnam` semantics.

The focused target initializes a human Valkyrie, places a native master lich with its shipped spell attack and wounded HP, and calls actual `castmu` with valid deterministic draws selecting self-cure. Without `monsterName`, JS prints `Master lich casts a spell!` and `Master lich looks better.` The control supplies real `Monnam` and prints `The master lich casts a spell!` and `The master lich looks better.` Both heal 30→33 and consume the same four calls: `rn2(17)=1`, `rn2(170)=169`, `d(9,6)=9`, `d(3,6)=3`. No spell or healing effect is stubbed.

C `castmu` and `m_cure_self` call `Monnam`; `Monnam` capitalizes `mon_nam`, which requests `ARTICLE_THE`. A fresh ordinary C recording independently captures `The master lich casts a spell!` at steps 34–36 and 43. Its entire C/JS comparison matches: 2,792 RNG events, 55 screens and cursors. This is a control for the correctly wired normal action path. It does **not** reproduce the focused API self-cure sequence in C; the cure message's naming expectation is source-backed. The two messages share one fallback cause, not two defects. Earlier Main repairs supplied proper naming to production paths; this residual default remains in the current source.

Pinned base: JS/tooling `32578f23091dad34635a9b4fe0bfb45ed9840e39`; C `16ff59115315917b93185d026aeefea06db9b0f4`. Exact source/tool/recorder hashes and raw C toplines are included. From repository root:

```sh
# Expected: target fails on article; adapter control passes.
node --test diagnostics/divergence-evidence/monsters/castmu-default-name/proof.mjs
# Expected: both characterization checks pass on the stated base.
CHARACTERIZE=1 node --test diagnostics/divergence-evidence/monsters/castmu-default-name/proof.mjs
node --test scripts/test-suites.test.mjs
# Optional public-input C/JS control: requires configured existing recorder.
node diagnostics/divergence-evidence/monsters/castmu-default-name/record.mjs /absolute/new-private-directory
```

Verified from a clean detached checkout of that base. Evidence runners have ordinary `.mjs` names and are not registered in default CI. The small recipe regenerates the full recording; only focused raw observations and its hash are published. The private path is provenance, not a cross-environment dependency.

The first recording route inherited `#wizintrinsic i` from the earlier recipe and made the hero blind; it reached only `Something casts...` and is retained as a coverage miss in observations. The corrected route omits that command. No findings are inferred from the failed reachability route.

The two matching original helper leads and hub-generated review fingerprints are retained in `scanner-binding.json`; no filtering decision is proposed. The complete immutable original run is reusable from [the earlier published artifact](https://github.com/vtjeng/teleport-contest/blob/5011e3c8e/diagnostics/divergence-evidence/monsters/vrock-gas-delegation-negative/discovery-run.json.gz), uncompressed SHA-256 `22dde96e93aafc25876762fe1e4c4be4144c28432f353c2a77a6248d11a8642e`. Relevant `mcastu.js` is unchanged since that run. Four earlier unresolved hypotheses remain separate. No gameplay edits, coordinate-description follow-on, excluded object effects or denied-turn artifacts are involved.
