# AIR paint on a retained secret door — unresolved reachability

The focused API fixture demonstrates a difference, but this is **not ready for Main**. No supported shipped target setup has been established.

C `set_levltyp` keeps SDOOR when AIR is requested and marks the arboreal bit. C `sel_set_ter` then checks the actual retained type, assigning D_CLOSED and horizontal orientation from the wall to the left. JS checks the requested AIR type and skips those updates. For a locked secret door next to HWALL, C produces `[14,4,1,1]`, JS `[14,8,0,1]` (type, door mask, horizontal, arboreal).

Two controls match: `replace_terrain` from SDOOR to AIR preserves the old mask/orientation in both implementations; ordinary `terrain` painting SDOOR sets closed/horizontal in both. The shipped garden postprocessor at `dat/themerms.lua:1072` uses the replacement path. It therefore cannot qualify the target. A literal caller search found no shipped `des.terrain` AIR call; this does not rule out dynamic arguments or future supported routes.

Run from the repository root with Node and Clang available:

```sh
node diagnostics/divergence-evidence/levels/levels-arboreal-paint-20261028/probe.mjs
node diagnostics/divergence-evidence/levels/levels-arboreal-paint-20261028/probe.mjs --assert-target
```

The first command verifies the observed mismatch and matching controls, exiting zero. The second deliberately asserts target parity and exits one. Neither is in default CI. The C oracle includes exact source function bodies with minimal map globals; unrelated side effects abort instead of being silently emulated. Its replacement control calls the exact terrain setter, not a reconstructed Lua runtime. `case.json` pins provenance and limits; `observations.json` retains numeric results.

The previously deferred subroom orig_rtype question was also reviewed: existing recorder patches and wizard diagnostics inspected here did not supply an internal-state capture. Its earlier unresolved status remains unchanged; no new C evidence is claimed.
