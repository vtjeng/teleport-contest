# Level-region destination-name C-string copy

Both registered portal destination names differ: C oracle/medusa prefixes versus JS retained NUL suffix. All six descriptor numeric fields match. Three unsuffixed destination controls match. This is an extension of the existing C-string cause, not an independent repair identity.

Base `2cb9a55c12a2bbee4403ca48ed22f46522076eeb`; C `16ff59115315917b93185d026aeefea06db9b0f4`. Discovered/reviewed 2026-10-29T04:30:49.943661+00:00.

Clean-base reproduction:

1. Use an isolated checkout of that exact JS base with the pinned C submodule.
2. Overlay only this complete evidence directory at its relative path; no sibling package is needed.
3. Activate existing compiler if needed (`source /workspace/.setup/activate.sh` here). Tested Node24.19.0 andClang19.1.7 (3+b1),C11,-O2. No dependencies to install.
4. Run `node diagnostics/divergence-evidence/levels/levels-levregion-name-prefix-20261029/probe.mjs target`: expected pre-fix exit1, two actual name mismatches.
5. Run `node diagnostics/divergence-evidence/levels/levels-levregion-name-prefix-20261029/probe.mjs control`: expected exit0, three matches.
6. After repair, rerun both expecting exit0. C source hashes/exact function bodies remain enforced; JS hashes are provenance and permit the repair.

Receipts contain actual clean-base execution results. Input/output strings are hex encoded to preserve bytes without control characters. The runner invokes public JS des.levregion during normal startup/mklev loader entry and stops before finalization. Exact C API executes its string-copy and registration path; unrelated scalar table adapters are explicitly bounded below.

Two ASCII destination strings containing embedded NUL, oracle\0suffix andmedusa\0suffix. Controls oracle,medusa andnumeric destination string3. Supported public des.levregion registration only, observed before full finalization; no portal creation/travel/score or shipped-exposure claim.

C executes exact registered lspo_levregion,l_get_lregion,levregion_add,get_table_str_opt anddupstr. The typed Lua string facade exposes the whole byte allocation to the reader; exact dupstr truncates via strlen/strcpy. No synthetic pretruncation supplies the expected result. All tested strings are raw values, not callbacks/numeric coercion. No Lua interpreter, install or download needed.

Unrelated fixed typed readers supply valid region[1,1,4,4],region_islev=true,absentexclude,typeportal,padding2. Their outputs are asserted by adapters; full Lua table parsing is not tested. The actual get_location source is included, but fixed level coordinates bypass it; random coordinates abort if reached. Allocation succeeds; failure paths abort.

The initialized JS floor map is valid and the registered rectangle is in bounds. The C name bytes after NUL are not part of the destination string; retaining them in JS is the same C-string copy cause as previously accepted message/map/engraving paths, not a new independent repair identity.

No scanner key exactly names this copy defect; manual/unbound. Related room-type/trap-type source concerns remain unqualified without their own executed equivalent public API paths. The existing numeric-string region and other parked gaps are not reopened.

Six layout guards and committed v1 validator pass before publication. These are evidence packaging checks, not gameplay acceptance.
