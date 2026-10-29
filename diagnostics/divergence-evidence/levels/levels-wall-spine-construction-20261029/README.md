# Wall-spine construction: bounded unbound negative

189398 target fixtures and241052 controls match exact compiled C on resulting center terrain;132010 targets and45097 controls actually change the center type. One functional cause, no scanner disposition.

Base `9cd25dd87fe2df24bbf04ea3897aaa725b9758ea`; C `16ff59115315917b93185d026aeefea06db9b0f4`. Discovered/reviewed 2026-10-29T04:16:20.868662+00:00.

Reproduce: use a clean checkout of that base with its C submodule, overlay this directory, activate the existing Clang (`source /workspace/.setup/activate.sh` here), then run from repository root:

```sh
node diagnostics/divergence-evidence/levels/levels-wall-spine-construction-20261029/probe.mjs target
node diagnostics/divergence-evidence/levels/levels-wall-spine-construction-20261029/probe.mjs control
```

Both exit0. Tested Node24.19.0,Clang19.1.7 (3+b1),C11,-O2. No downloads or new dependencies. Runner source-checks each exact C body, pins source/config hashes and generates fixtures deterministically. Compact input/output hashes retain observations without publishing bulky arrays. Six test-layout checks and committed v1 packaging pass before publication. These are not a gameplay receipt.

Finite single-cell output domain, not full-level wallification/order/finalization equivalence. Exact C fix_wall_spines and wallification (cleanup followed by spines) versus exported production JS functions on valid typed maps and bounds. No C or JS Lua binding tested.

At interior (12,9), all 6561 ternary eight-neighbor configurations over STONE/HWALL/ROOM. At eight edge/corner centers (1,0),(1,20),(79,0),(79,20),(1,10),(79,10),(30,0),(30,20), all 256 HWALL/ROOM binary configurations; outside cells are ignored exactly as predicates specify. These domains do not cover every terrain neighbor class.

Targets cover all 11 ordinary wall center types; controls apply cleanup+spines to 14 center types:STONE,VWALL,HWALL,CROSSWALL,TRWALL,DBWALL,SDOOR,LAVAPOOL,LAVAWALL,IRONBARS,DOOR,CORR,ROOM,ICE. Each tests default inactive protected rectangle(0,0)-(0,0) and one protected center. Bughack protected behavior is a typed engine-state fixture, not a shipped Baalzebub attribution.

C maps are zeroed each fixture. JS reuses a GameMap and overwrites the complete in-bounds 3x3 neighborhood each fixture; these functions read only that neighborhood for the one-cell bounds. Only resulting center terrain is compared; other metadata, invalid-bound diagnostic output and allocation failures are not proved.

One manual/unbound functional cause. Frozen scanner keys for wall_cleanup and fix_wall_spines concern panic diagnostics on invalid bounds, which are outside this valid-bounds proof. They remain active/unresolved; no source-only no-yield inspection is recorded as a negative. No canonical scanner ID is invented.

coverage.json preserves unchanged scanner accounting and the concrete next frontier. The permitted scope is not exhausted; active lead count is not a count of executable hypotheses.
