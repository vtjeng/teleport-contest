# AIR paint on a retained secret door — API-scoped candidate

**Confirmed supported-API divergence.** The target and two controls are runnable from the pinned base without a Lua runtime or injected gameplay loader. Shipped-path exposure and hidden-score impact are unknown.

From the repository root with Node 24 and Clang available:

```sh
node diagnostics/divergence-evidence/levels/levels-arboreal-paint-20261028/probe.mjs --assert-target
node diagnostics/divergence-evidence/levels/levels-arboreal-paint-20261028/probe.mjs --control
```

On base `034443e9246cb9fc19dfba9ba2d9c2893132e84c`, target exits **1**, controls exit **0**. After a correct implementation the target parity assertion can pass. Neither command is included in default CI. Without arguments the probe verifies the recorded pre-fix mismatch and controls.

## Contract and setup

`setup.lua` describes the equivalent public descriptor calls. The runnable JS probe calls the exported production `lspo_terrain` and `lspo_door` APIs. It creates a 3x3 floor patch, creates a secret door, locks that existing door, then paints the neighboring wall. No door fields are assigned directly. The ordinary whole-level frame has xstart=1; literal relative (10,10) resolves to absolute (11,10).

C `lspo_door` at sp_lev.c:4671 resolves the same literal coordinates and delegates to `sel_set_door`; that callback explicitly preserves an existing SDOOR while applying the locked mask. A temporary door with no adjacent walls is expressly described as feasible in `set_door_orientation`'s source comment. No invariant requires finalization between these descriptor calls. `lspo_terrain` accepts AIR and delegates to `sel_set_ter` after coordinate translation. Both programs assert the pre-target tuple `[14,8,0,0]` (type, mask, horizontal, arboreal), constructed by this sequence.

The C oracle executes exact extracted `set_levltyp`, `set_levltyp_lit`, `sel_set_ter`, `set_door_orientation`, and `sel_set_door` bodies. A small wrapper applies the documented literal-coordinate translation and supplies initialized map globals. It does not emulate arbitrary Lua. The unused side-effect hooks abort. The replacement control invokes the exact setter used by `lspo_replace_terrain`; its fixed matching cell and chance=100 make the terrain result deterministic. The full Lua parser and RNG trace are not part of this oracle.

## Result and implementation location

C `set_levltyp` keeps SDOOR when AIR is requested and sets the arboreal bit. C `sel_set_ter` then dispatches on the actual retained type, assigning D_CLOSED and horizontal orientation from the wall on the left. JS `sel_set_ter` in `js/mklev.js:1432` dispatches on requested AIR and skips those updates.

Target: C `[14,4,1,1]`, JS `[14,8,0,1]`. Controls: replacement AIR yields `[14,8,0,1]` in both; ordinary secret-door painting yields `[14,4,1,0]` in both. The shipped garden callback uses the replacement path and does not demonstrate target exposure. A literal shipped-caller search found no direct `des.terrain` AIR call, but does not prove dynamic calls absent.

`case.json` pins exact revisions, source/body/tool hashes and qualification rationale. `observations.json` and `clean-base-verification.json` record the supported-API test. Original direct-state observations/receipt are retained separately for provenance; they are not the qualification basis. No gameplay changes are proposed here.
