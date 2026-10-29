# Solid-fill ice provenance: related shared-flags reset candidate

**Confirmed API-scoped metadata difference, shipped exposure unknown.** The accepted solidfill repair clears JS wall_info, but the C flags reset also clears icedpool (rm.h aliases it to flags). JS keeps icedpool separately and does not clear it in lvlfill_solid.

For both default iced-moat16 and explicit iced-pool8, public terrain construction sets nine ICE cells. Repeating `des.level_init({style:"solidfill",fg:"I",bg:"I",lit:0})` leaves ICE terrain on both sides, but C icedpool becomes0 and JS retains16/8. The before-state matches and is asserted. Four controls (terrain redraw and mazegrid for both provenance modes) preserve provenance and match terrain on all nine cells.

Clean-base handoff:

1. Check out `e2cd8ea2fa298c9b3a7c062c70d21999b91f06fc`, with C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Copy this complete evidence directory into that checkout without gameplay edits.
3. Use existing Node24.19.0 and Clang19.1.7 (`source /workspace/.setup/activate.sh` here); no installation/network dependency.
4. Run `node diagnostics/divergence-evidence/levels/levels-solidfill-ice-reset-20261029/probe.mjs target`: expected exit1,18 cells retain icedpool8/16 in JS versus C0.
5. Run `node diagnostics/divergence-evidence/levels/levels-solidfill-ice-reset-20261029/probe.mjs control`: expected exit0,36 cells across four controls. After Main repair, target should exit0 too.
6. Run `node --test scripts/test-suites.test.mjs`. The manual parity runner is an ordinary `.mjs` outside default CI.

The oracle retains exact C API init/dispatcher/fill and terrain-writer bodies and represents icedpool as the actual C flags alias. The public setup mode corresponds to the C icedpools configuration, and exact sel_set_ter sets the initial metadata. No C ice-removal effect executes; such adapters abort. An early reused reader incorrectly defaulted mazegrid bg to STONE; that fixture mismatch was corrected to the supplied ICE background before final receipts, not reported as a divergence.

Group with `levels-solidfill-wall-reset-20261028` and `levels-map-wall-reset-20261028` as the same shared-flags reset family. Compare `levels-map-ice-20261028` for assignment semantics, but do not claim this is already fixed merely because map painting was repaired. This handoff changes no gameplay code or frozen evidence.

Origin: Manual source-led metadata follow-up to accepted solidfill wall-property repair. No exact frozen scanner lead represents the omitted separate JS icedpool reset; no nearby allocator/helper edge is assigned or suppressed.

Limits: Construction metadata only:two provenance choices8/16 on nine interior ICE cells, rewritten ICE-to-ICE by solidfill. No melting, timer execution, object/monster effects, movement or finalization claim. C runtime-effect adapters abort if reached. The setup uses public des.level_flags(icedpools) or default moat mode, level_init floor and des.terrain ICE. C prepares the same fixed coordinates using exact sel_set_ter and the corresponding icedpools configuration, then executes exact lspo_level_init/splev_initlev/lvlfill_solid with typed readers. The before-state is observed and asserted on both sides, not invented. C is_ice is restricted to the fixture terrain set and returns typ==ICE. It is used only to identify ICE-to-ICE changes; no ice removal branch is exercised. Maze-grid control writes terrain directly, as production source does. The target has the same shared-flags clearing mechanism as the accepted solidfill wall-property repair. This is an additional icedpool alias left out of that repair, not a new independent repair identity. The prior map-ice assignment case remains distinct for deduplication. Shipped exposure unknown. The fixture does not establish all metadata aliases, arbitrary fills, lighting semantics or gameplay impact.

Scanner counts unchanged:48 negative keys/22 causes,4 historical/candidate keys,8 stale,463 without disposition. This is additional manual/unbound related-path evidence. Three parked gaps unchanged.
