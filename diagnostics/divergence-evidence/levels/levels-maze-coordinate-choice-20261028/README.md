# Maze coordinate choice: bounded negative

JS randomOneBased defaults to rnd and is called twice per attempt; the C-only edge is an injected-parameter alias.

Eight C/JS comparisons through the production coordinate chooser on publicly initialized/painted maps. Both terrain modes cover first-hit, 100th-hit, deterministic x-major scan fallback after 100 rejected pairs, and real default RNG. C receives checked shared draw tapes; not independent RNG parity or all map geometries.

Control: Immediate chosen point and all-eligible default-RNG maps; fallback selects 2,7 before 7,2, while a 100th-attempt hit chooses 7,2.

## Clean-base reproduction

1. Check out Main `b313cde5b50f3c5b5e8f622ff32418cbc1ae12be`, with C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Copy this evidence directory into the checkout without modifying gameplay.
3. Use existing Node 24.19.0 and Clang 19.1.7 (managed environment: `source /workspace/.setup/activate.sh`). No downloads or Lua dependency.
4. Run `node diagnostics/divergence-evidence/levels/levels-maze-coordinate-choice-20261028/probe.mjs target` (expected 0).
5. Run `node diagnostics/divergence-evidence/levels/levels-maze-coordinate-choice-20261028/probe.mjs control` (expected 0).
6. Run `node --test scripts/test-suites.test.mjs`.

Target: four 100th-hit/fallback cases; control: four first-hit/default-RNG cases. Both room/corridor terrain modes use public solidfill/terrain setup before calling the production coordinate chooser. Sparse maps contain absolute candidates (2,7), (7,2); the 100th hit returns (7,2), whereas fallback selects (2,7). Default RNG controls use all-eligible maps. The C terrain grid is independently initialized to these stated postconditions. No invalid empty maze or panic path is used.

Limitations: Eight maps/draw sequences only; no universal geometry or independent RNG equivalence. C accepts the same checked draw tape as JS; no population, finalization or runtime claim. Shipped exposure remains unestablished.

Original scan run `ea2181cadbad5793b4be`, SHA `b087d8cb44d510370100ae2b193e7caebc770402333397612e5035ee0f5d2de8`. Official exporter verifies one active key becomes filtered; original identity/fingerprint and compact projection are retained. The specific JS function is byte-identical to the scan base. Eight unrelated stale reviews are not revived.

This two-case batch brings the frozen 523 permitted entries to 10 current negative keys, 1 candidate key, 8 stale bindings, and 504 without a current disposition. Raw count remains 571; 44 Main-owned overlaps remain routing notes. Numeric-string/gradient gaps stay unresolved; replace_terrain source inspection alone adds no disposition.
