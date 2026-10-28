# Map-authored ice omits pool/moat origin metadata

One confirmed supported-API cause. After `des.level_init`, C `lspo_map` calls `sel_set_ter`, which sets ICE's `icedpool` to ICED_POOL (8) when the `icedpools` flag is set and ICED_MOAT (16) otherwise. JS's map-specific writer omits this arm. Its `terrain()` writer already includes it.

The targets initialize a floor level, optionally set `icedpools`, then map a 3x3 ICE fragment at (10,6). All nine cells per target are ICE in both implementations, but C records 16/8 and JS leaves zero. Two no-initialization map controls retain zero in both; two initialized `terrain()` controls record 16/8 in both. This compares creation metadata only, not later melting or gameplay outcomes.

## Clean-base pickup

1. Check out Main `1c4be74beb32edbfc897de805f218e180f8c6002`.
2. Overlay this complete evidence directory at its repository-relative path, or apply its evidence-only commit.
3. Use Node24 and Clang19 (`source /workspace/.setup/activate.sh` in the supplied environment).
4. Run `node diagnostics/divergence-evidence/levels/levels-map-ice-20261028/probe.mjs target`: expected **exit 1**, assertion `init=true pools=false map`, C metadata16 versus JS0.
5. Run the same command with `control`: expected **exit 0**, four matching cases.
6. Run it with `observe` to print all six raw results (exit0). After implementation, both target and control should exit0.

No extra fixtures, recorder, C checkout or Lua interpreter are required. The runner uses a private temporary build directory and cleans up. Its ordinary `.mjs` name keeps the deliberate failure outside default CI. The repository test-discovery guard receipt is bundled.

## Production API and oracle boundaries

JS uses `newgame_pre_mklev` and the production `mklev({specialLevelLoader})` interface, following `scripts/special-level.test.mjs`. Setup uses public `des.level_init`, `des.level_flags`, `des.map` and `des.terrain`. The established sentinel exits after placement, before unrelated finalization. No private helper extraction or metadata injection.

The bundled oracle executes unchanged C bodies for `lspo_map`, `sel_set_ter`, `lvlfill_solid`, `set_levltyp` and `set_levltyp_lit`, pinned to C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`. Fixed table and fragment adapters accept only the stated 3x3 ICE map. Minimal `rm` storage aliases `icedpool` and `doormask` to flags, as C does. Setup's two flags follow explicit public setter assignments (`lspo_level_init` sets `splev_init_present=TRUE`; `level_flags("icedpools")` sets `icedpools=1`); their Lua parsers are not executed. The exact solid fill runs before map/terrain writes. The terrain control calls the exact callback at the translated valid coordinates. Unexpected RNG, timer/object effects and unsupported callbacks abort.

This is a demonstrated API metadata defect, with all relevant setup invariants established. Shipped exposure and score impact remain unknown. It does not resolve or revisit parked save-export/orig_rtype work. Manual/scanner-unbound; Main owns implementation. Source/body/tool hashes, observations and clean-base receipts are bundled.
