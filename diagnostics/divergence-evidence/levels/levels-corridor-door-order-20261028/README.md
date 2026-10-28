# Corridor door order: bounded negative

C `search_door` uses zero-based door indices and scans increasing x on north/south walls, increasing y on east/west walls. Ordinary and secret doors both count. JS matches all 32 queries in two constructed room layouts: all ordinary doors or a secret middle door, four walls, indices0..3. Indices0..2 select the corresponding door; index3 returns no door.

```sh
node diagnostics/divergence-evidence/levels/levels-corridor-door-order-20261028/probe.mjs
```

Expected exit0 on Main `52d1911e5e9e8ad6a185e2561caaf5fd92edc703`, using Node24/Clang19. The probe builds its bundled C oracle in a private temporary directory and cleans up. No sibling evidence or C checkout is needed.

JS setup uses public terrain, region and door APIs, asserts room bounds and door types, then queries the exported production helper used by create_corridor. The oracle executes the exact C search_door body over the same geometry and types in minimal storage. C setup Lua APIs are not executed. The comparison uses only successful coordinates or no-door results; C output arguments on failure are intentionally ignored, matching its caller's use.

This finite proof does not establish corridor carving, random-wall behavior, corner-door handling, irregular-room handling or whole-level equivalence. The all-ordinary layout, opposite-wall order and exhausted index are controls. Manual/scanner-unbound; no canonical suppression identity invented. Hashes, observations, clean-base and suite-discovery receipts are bundled. Save-export remains parked.
