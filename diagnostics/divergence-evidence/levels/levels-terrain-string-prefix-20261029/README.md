# Terrain map-character C-string prefix

`des.terrain({x:13,y:10,typ:"T\0suffix",lit:0})` and `des.terrain(13,10,"T\0suffix")` paint TREE in C but throw in JS, leaving ROOM. A string ending directly after the NUL reproduces both forms too. These are four targets under one existing C-string-prefix cause. Six controls match: plain T paints TREE; TT and leading-NUL strings reject.

Clean-base handoff:

1. Check out `2f80ba5210a57819a2aaa8dbf5b8c88618b85242`, initialize C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Copy this complete directory into the same relative path.
3. Use existing Node24.19.0 and Clang19.1.7 (`source /workspace/.setup/activate.sh` here); no installation/network/Lua-library dependency.
4. Run `node diagnostics/divergence-evidence/levels/levels-terrain-string-prefix-20261029/probe.mjs target`: expected exit1, four C[accepted,TREE13]/JS[error,ROOM25] differences.
5. Run `node diagnostics/divergence-evidence/levels/levels-terrain-string-prefix-20261029/probe.mjs control`: expected exit0, six matches. Post-fix target should exit0; runner permits JS changes while checking pinned C source/body integrity.
6. Run `node --test scripts/test-suites.test.mjs`. The ordinary `.mjs` parity runner is manual/outside default CI.

Oracle path: exact lspo_terrain calls get_table_mapchr → get_table_str → dupstr for table input, then exact check_mapchr → splev_chr2typ. Positional input passes the original byte string directly to check_mapchr. C strlen observes one character before NUL, while JS check_mapchr currently requires full string.length===1. The fixed input adapter preserves all bytes, supplied as hex5400737566666978 or5400; no pre-truncation invents the expected result. The exact terrain writer then produces the observed TREE. Initial level setup and target coordinate translation are pinned and shared; no hidden internal-state dependency.

Implementation handoff: inspect check_mapchr and its required terrain reader/callers alongside existing message/engraving/map C-prefix repairs. This evidence does not prescribe a global string conversion or claim optional-reader behavior.

Origin: Manual source-led required map-character composition; no exact immutable scanner binding is asserted. Nearby lspo_terrain error edges remain unreviewed, not mapped to this shared reader merely for counting.

Limits: Two supported des.terrain forms: explicit table and positional x,y,typ. Fixed default frame1,0, relative13,10, initial ROOM from solidfill. Only TREE painting and input acceptance are compared; no tree/monster/object/player runtime effects or finalization. C executes exact lspo_level_init/lspo_terrain, terrain writers, get_table_mapchr/get_table_str, dupstr, check_mapchr and splev_chr2typ plus the exact char2typ table. Fixed typed Lua-reader adapters preserve raw string bytes and only emulate these explicit argument forms, integer coordinates and table fields. No Lua library dependency or general coercion/VM claim. Hex transport preserves embedded NUL and suffix in the input allocation. Actual C dupstr/strlen determines prefix behavior; the adapter does not pre-truncate. The table path copies the C prefix; the positional path passes the original bytes to exact check_mapchr. Coordinate adapter asserts in-bounds explicit values and default frame1,0 with no room/random selection. Unused parser/selection and runtime-effect adapters abort. nhl_error adapter longjmps to capture failure; error text/stack/process behavior is not asserted. Four targets cover T-NUL-suffix and T-NUL in both forms. Six controls cover plain T acceptance, TT rejection and leading-NUL rejection. Rejected controls validate parsing boundaries only; they are not invalid-setup negatives. This extends the existing C-string-prefix cause (message, engraving, map) to a required map-character reader. No new independent repair identity, broad string equivalence, shipped exposure or score-impact claim.

Scanner counts unchanged:56 negative keys/24 causes,4 historical/candidate keys,8 stale,455 undisposed. This is manual/unbound related-path evidence; three parked gaps remain unchanged.
