# Room and trap type C-string boundaries

Room targets: C creates one morgue (rtype 6) or temple (rtype 10), bounds (11,6)-(15,8), needfill=0 and needjoining=1; JS creates no room. Trap targets: C creates rust (9) or anti-magic (21) at (11,6), unseen; JS throws Unknown trap type and creates none. Each path has three matching controls.

One existing C-string cause with two public API paths, not two independent repair identities.

JS base `2579242c67804962299920a58e3052ab3718c187`; C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`. Discovered 2026-10-29; reviewed 2026-10-29T04:42:27.230563+00:00.

Clean-base reproduction:

1. Check out the exact JS base with its pinned C submodule.
2. Overlay this complete evidence directory at its relative path. No sibling evidence is required.
3. Use existing Node 24.19.0 and Clang 19.1.7 (3+b1), C11, -O2; this workspace uses `source /workspace/.setup/activate.sh`. Nothing is downloaded or installed.
4. Run `node diagnostics/divergence-evidence/levels/levels-type-string-family-20261029/room-probe.mjs target` and `node diagnostics/divergence-evidence/levels/levels-type-string-family-20261029/trap-probe.mjs target`. Each exits 1 with two deterministic mismatches.
5. Run each command with `control` instead: both exit 0, three matches each.
6. After repair, rerun all four expecting 0. C source hashes and exact function text are enforced; JS hashes record provenance and permit the intended repair.

Actual clean-base receipts and outputs are included. Names are hex encoded in output to preserve embedded NUL. JS uses the public des APIs inside the normal mklev loader and stops before finalization. C uses extracted unchanged production handlers with explicitly bounded typed interfaces below.

Two API paths, four suffixed targets and six controls, one existing C-string prefix cause. Manual/unbound; scanner counts unchanged. Shipped exposure unknown. No room stocking, finalization, trap activation or runtime behavior claim.

Room path: public des.region with explicit rectangle (10,6)-(14,8), lit=0, filled=0 and type morgue/temple plus NUL suffix, on fresh solidfill floor. C executes registered lspo_region, exact string reader/dupstr, room creation, topology and stack teardown. Fixed typed scalar readers supply valid coordinates and flags; raw string facade exposes the whole byte allocation. Full Lua table parsing and numeric coercion are not tested. Ordinary, plain morgue and plain temple controls pass.

Room oracle includes actual mkroom structure and exact topologize body with its non-SPECIALIZATION signature. Scoped rm fields use ints with valid 0/1 values; no bitfield claim. Explicit ANY_LOC coordinate adapter applies level frame (1,0) and asserts no active room. No irregular selection, door, wallification or callback branch executes; those adapters abort.

Trap path: public positional des.trap(name,10,6) on fresh ROOM floor, no traps, actors or objects. Exact registered lspo_trap calls get_traptype_byname, create_trap, mktrap and maketrap. Actual trap structure, union and bitfields retained. Targets rust and anti magic plus NUL suffix; plain rust, anti magic and mixed-case RuSt controls pass.

Trap oracle uses typed Lua positional adapters, ASCII-only strcasecmp adapter for strcmpi, D1 difficulty 1 and in_mklev=true. The single rnd(4) construction draw returns legal value 1; RNG sequence equivalence is not claimed. Rust/anti-magic avoid specialized trap constructors and victim creation. Unrelated side effects abort; no runtime or excluded investigation executes.

Optional table-form trap type and des.room type have not been executed here. Do not generalize to those bindings, random placement, arbitrary names, diagnostics or finalization. All prior parked and denied investigations remain excluded.

Evidence runners are manual, outside default CI. The suite-layout guard and committed v1 packaging validator are publication checks, not acceptance or full Checkpoint.
