# Solidfill retains wall properties that C clears

Reported-ready API evidence for an additional path of the wall-info alias-reset cause from PR #79. The accepted map-path repair at `79baae3a9` clears wall_info in set_themeroom_map_terrain; current lvlfill_solid still lacks that corresponding write. This is related evidence, not an independent cause or a duplicate gameplay fix.

Two targets reproduce on Main `cc5a50e4e23b33f36a39ff8826a866bb7832caca`: nondiggable (8) and nonpasswall (16), each on nine HWALL cells. Reinitializing with `des.level_init({style:"solidfill",fg:"-",bg:"-",lit:0})` clears the C flags/wall_info field to0 but leaves every JS wall_info value unchanged. HWALL remains HWALL. Four controls (terrain redraw and mazegrid, each property) preserve the bits in both C and JS.

Supported setup: production startup/special loader; solidfill floor; public terrain calls place walls at absolute x10..12,y6..8; public wall_property sets each bit, with all nine prevalues asserted. Then repeat level_init for the target, or run a control. C lspo_level_init accepts the table and sets splev_init_present unconditionally before dispatch; there is no first-call-only guard. The C oracle actually executes that wrapper and dispatcher twice, plus exact fill/terrain/property bodies. All coordinates are interior. No entities, room allocation or internal JS metadata injection are needed. Equivalent Lua recipes specify the contract but are not executed-Lua receipts.

Clean-base reproduction:

1. Check out `cc5a50e4e23b33f36a39ff8826a866bb7832caca` with C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Copy this evidence directory into that checkout without gameplay changes.
3. Use existing Node24.19.0 and Clang19.1.7 (`source /workspace/.setup/activate.sh` in this environment); no installation/network dependency.
4. Run `node diagnostics/divergence-evidence/levels/levels-solidfill-wall-reset-20261028/probe.mjs target` (expected exit1; two differing targets /18 wall cells).
5. Run `node diagnostics/divergence-evidence/levels/levels-solidfill-wall-reset-20261028/probe.mjs control` (expected exit0; four controls /36 cells). After repair the unchanged target command should exit0.
6. Run `node --test scripts/test-suites.test.mjs`.

Limits: One additional API path for the flags/wall_info alias-reset cause demonstrated in levels-map-wall-reset-20261028 (PR79, map-path repair79baae3a9). Do not count as an independent semantic cause without Main deduplication. Two wall-property targets, each with nine HWALL cells. Controls use explicit terrain redraw and mazegrid at identical setup. No other metadata, arbitrary terrain, runtime digging/passwall, finalization, shipped-exposure or score claim. Production JS startup/loader, level_init, terrain and wall_property only; no internal JS mutation. C executes exact lspo_level_init dispatch, fill and terrain/property bodies with fixed typed table readers and rm flags aliases. Room/frame parser details and full Lua interpreter are not exercised; unexpected unrelated side effects abort.

Manual/unbound: initialization-source inspection found this additional fill path. No scanner key is assigned merely because a nearby create_des_coder edge exists. Frozen inventory counts remain31 negative keys/17 causes,1 accepted historical candidate,1 mazewalk candidate awaiting Main,8 stale,482 undisposed; this adds one manual related-path handoff outside those key counts. Three parked gaps remain unchanged.
