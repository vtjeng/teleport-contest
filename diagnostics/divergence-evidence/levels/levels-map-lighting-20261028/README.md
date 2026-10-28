# Confirmed: table-map lighting is ignored

`des.map({lit:true,...})` leaves non-lava cells dark in JS. C reads `lit` at sp_lev.c:6121 and forwards it through `terr.tlit`/`sel_set_ter` for every painted cell (6295). JS's table-map path calls `set_themeroom_map_terrain`, which assigns only `IS_LAVA(typ)` to lighting and never reads `spec.lit`.

This is reachable in the shipped fifth Gehennom prefab (`hellfill.lua:197`, faithfully specified with `lit:true` at `js/hell_levels.js:235`). The unmodified public-input wizard load at seed **28103903** produces the first screen mismatch on filename submission: segment 0, step 26, row 15, column 24, C `.` versus JS space. All **4,887 RNG calls** and cursors match. The source-attributed trace selects prefab 5 twice before subsequent prefabs. The control seed **28103902** matches **6,190 RNG calls**, all 27 screens and cursors. Each was recorded twice; both C and JS hashes repeat exactly.

## Reproduce on the stated base

Tested JS base: `8eec78d622b3ef9cb22a54d1699aaf335e9342e9`. C gitlink: `16ff59115315917b93185d026aeefea06db9b0f4`. Overlay this evidence directory on a clean checkout of that JS base; no C checkout/build or recorder is needed for these commands. The `clean-verification.json` receipt records all four results from a separate clean-base checkout with gameplay source unchanged.

```sh
node diagnostics/divergence-evidence/levels/levels-map-lighting-20261028/replay.mjs witness
node diagnostics/divergence-evidence/levels/levels-map-lighting-20261028/replay.mjs control
node diagnostics/divergence-evidence/levels/levels-map-lighting-20261028/focused.mjs target
node diagnostics/divergence-evidence/levels/levels-map-lighting-20261028/focused.mjs control
```

Expected exits on the base: **1, 0, 1, 0** respectively. The intentional red commands assert C parity and stay outside default CI. Replay verifies the decompressed recording hash before running the scorer-backed JS session. Both compressed C oracles are bundled.

The focused test uses the production special-level API with the exact seven-row prefab shape: all 45 painted floor cells should be lit for `lit:true`; JS lights zero. The otherwise identical `lit:false` control lights zero as expected. Its injected loader is an isolation test, not the reachability proof; the public-input C/JS recordings supply that independently. No gameplay implementation is included.

The complete input is `.\x23wizloaddes\nhellfill.lua\n` (dot, `#wizloaddes`, Enter, filename, Enter). Both recipes pin options, date and seed. To regenerate both twice with the existing private recorder adapter:

```sh
node scripts/lua-discovery.mjs diagnostics/divergence-evidence/levels/levels-map-lighting-20261028/qualification-config.json /absolute/new-output-directory
```

`observations.json` preserves repeated mismatch/control results, source-attribution trace and raw hashes. `case.json` pins recorder binary, relevant installed Lua, patches and tool hashes. The packaged config differs from the original immutable run only in renamed evidence paths; both hashes are recorded. `exploration.json` preserves the initial 12-seed results: 11 matching streams and this mismatch. Those matches do not establish general correctness.

This case is manual/unbound; no scanner identity is invented. Main owns implementation after pickup. The established line-tie and pattern-boundary unresolved cases are unrelated.
