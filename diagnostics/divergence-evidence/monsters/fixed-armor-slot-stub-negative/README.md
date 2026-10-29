# Fixed armor-slot diagnostic: two exact negatives

`mattacku → which_armor(WORN_HELMET/W_ARMH)` and `mdisplacem → which_armor(W_ARMG)` cannot reach the helper’s sole unsupported marker. The marker is inside the hero branch, only when no armor slot matches. Both literal masks have matching entries in the frozen slot table and belong to W_ARMOR. The ordinary monster branch does not contain a marker at all. This holds independently of whether a particular combat setup reaches the call.

Run from repository root on JS base `cc5a50e4e23b33f36a39ff8826a866bb7832caca`, with C submodule `16ff59115315917b93185d026aeefea06db9b0f4`, Node and a C11 `cc`:

```sh
node diagnostics/divergence-evidence/monsters/fixed-armor-slot-stub-negative/proof.mjs target
node diagnostics/divergence-evidence/monsters/fixed-armor-slot-stub-negative/proof.mjs control
```

Both exit 0. Target checks helmet/glove present for monster linked-list lookup and hero direct-slot lookup: C and JS return IDs `[11,22,11,22]`. Missing-armor control returns `[0,0,0,0]`. The runner imports the actual JS helper and compiles the complete extracted upstream C helper with minimal structure/global declarations. `impossible` aborts if reached. No C success-return stub is used. The exact full JS helper, fixed caller arguments, frozen slot membership and C/JS constants are checked before execution.

These are supported **pure lookup input records**, not an equip, displacement, falling attack or petrification recording. No claim is made about acquisition, wearability, armor effects, or whole combat behavior. The source dominance/constant proof discharges the two exact scanner warnings; the small helper oracle corroborates only lookup behavior. No gameplay defect or repair is proposed.

Bindings retain original run `2bfc89cdcbaa6139046f`, SHA-256 `4e7ab2870a6c57b5c1d586b651917cfabf28056c485f9f92ebc0e202cfcc1b93`, scan base `b313cde5b50f3c5b5e8f622ff32418cbc1ae12be`. The helper is unchanged at the witness base; current callers are rechecked. The original immutable run is available once in [PR #96’s durable artifact](https://github.com/vtjeng/teleport-contest/blob/9c2df4fe2eda635c3a92afc6b3673626d595ebe1/diagnostics/divergence-evidence/monsters/medusa-ugly-reaction-negative/discovery-run.json.gz). No new scan was run. Export/validation with accepted tooling from the witness base verified 3 selected active keys → 2 exact filtered, 1 active. The gazemu→polymon positive control remains unresolved/active. Decisions do not transfer automatically to changed sources or new runs.

Discovered/reviewed timestamps are in observations and actual clean-base execution timestamps in receipts. This is part of PR #102’s bounded negative batch. All prior excluded investigations and parked hypotheses remain untouched.
