# Wall-property eligibility: finite negative

C `sel_set_wall_property` includes stone/walls, trees and iron bars. Generic obstruction does not make secret doors or secret corridors eligible. Arboreal stone is already included by IS_STWALL, so the arboreal tree predicate adds no new eligible terrain in this domain.

The probe compares nine terrain types across normal/arboreal levels and three public API forms: relative selection, singleton rectangle and whole map. Each fixture applies nondiggable then nonpasswall, checking preservation of the first bit. All 54 fixtures match both C stages (108 comparisons). A neighboring wall is untouched by local forms and flagged by whole-map forms.

```sh
node diagnostics/divergence-evidence/levels/levels-wall-properties-20261028/probe.mjs
```

Expected exit **0** on Main `1c4be74beb32edbfc897de805f218e180f8c6002`, with Node24 and Clang19. The command builds its bundled oracle in a private temporary directory and removes it afterward. No other evidence directory is required.

The C oracle executes the exact callback with source-matched predicate macros and minimal property-bit storage. It is an eligibility/OR proof, not a full C Lua-wrapper or rm-union simulation. Production JS setup creates terrain through `lspo_terrain` and optional `lspo_level_flags`; no internal fields are injected. Unchanged JS type/doormask checks are additional JS invariants, not full C metadata comparisons. Tested terrain is stone, horizontal wall, tree, iron bars, secret door, secret corridor, ordinary door, floor and pool. No universal topology/finalization or untested terrain claim.

Manual/scanner-unbound. Source/tool hashes, timestamps and observations are bundled. Save-export remains parked; this independent callback proof does not resolve orig_rtype. No gameplay/default-CI edits.
