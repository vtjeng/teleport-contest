# Scoped negative: explicit walls take precedence over implicit joins

C `set_door_orientation` first checks walls, doors and secret doors. It consults `IS_DOORJOIN` (including stone and iron bars) only if all four initial checks are false. Thus a stone neighbor does not necessarily affect orientation when a real wall exists. JS follows the same rule.

The bundled unmodified C routine is executed against the production JS `lspo_door` API for all 8^4 combinations of eight representative neighbor types, at (1,10) and (10,10), with closed and secret descriptors: **16,384 matching comparisons**. The explicit control changes a left-stone-only neighborhood (horizontal) by adding an upper wall (vertical). This distinguishes the two stages instead of accepting every plausible orientation.

This is a finite domain: STONE, HWALL, DOOR, SDOOR, TREE, IRONBARS, ROOM and POOL; four cardinal neighbors; two center coordinates; two explicit states. The constructed neighborhoods are unit inputs, not individually claimed shipped-game witnesses. Other coordinates, types, random descriptors and room-wall placement remain outside the claim.

From the repository root on base `8eec78d622b3ef9cb22a54d1699aaf335e9342e9`, with Node and Clang:

```sh
node diagnostics/divergence-evidence/levels/levels-door-orientation-20261028/probe.mjs
node diagnostics/divergence-evidence/levels/levels-door-orientation-20261028/replay.mjs
```

Both should exit 0. The first compiles the bundled extraction in a private temporary directory; no full C build is needed. The second verifies and replays four bundled compressed C recordings, using seeds 28104100–28104103 for two Cav-strt and two Cav-loca loads. Their complete output streams match, but all four retain unresolved Lua-attribution status. These matching recordings do not establish source coverage or universal equivalence.

C provenance: gitlink `16ff59115315917b93185d026aeefea06db9b0f4`, sp_lev.c:1042. `case.json` pins extraction, source, tool and recorder hashes. The wrapper supplies a fixed map and the relevant rm.h constants/macros. `observations.json` is the focused result; `recordings.json` preserves raw statuses and hashes. Regenerate recordings with the existing private recorder via `config.json` and a fresh output directory.

This is manual/unbound, with no invented scanner ID. The companion descriptor case reuses `oracle.c`; keep both case directories when replaying that case.

All three documented commands across the two cases passed in a separate clean checkout of the stated base, with only evidence overlaid. The orientation directory includes the clean-base receipt.
