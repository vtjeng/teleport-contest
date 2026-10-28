# bigrm-13: real division changed to truncation

**Ready, one confirmed cause.** `bigrm-13.lua` filter 7 uses `(x/3)%2`; `js/bigrm.js` uses `Math.trunc(x/3)%2`. The shipped wizard level-load route reaches this filter and diverges. C places five pillars; JS places eleven. Filter 8 intentionally uses Lua `//` and is the focused passing control.

From the repository root, with this evidence directory present:

```sh
node --test diagnostics/divergence-evidence/levels/levels-bigrm13-division-20261028/focused.test.mjs
node diagnostics/divergence-evidence/levels/levels-bigrm13-division-20261028/replay.mjs witness
node diagnostics/divergence-evidence/levels/levels-bigrm13-division-20261028/replay.mjs control
```

At clean current base `cfb72d4699bfe6080b46f21894f929f35b68414f`, expected exits are **1, 1, 0**. The focused test reports one failing target and one passing control. These commands need Node and the checked-out repository, not a C build, additional packages, or reconstructed fixtures. After Main's fix, all three should exit 0. They remain outside default CI.

The replay script decompresses the bundled C recording, uses the existing scorer's frozen-file overlay, and calls the existing comparison tool. The reduced target is seed 28102909, ordinary debug startup followed by `.#wizloaddes\nbigrm-13.lua\n`. Its first mismatch is segment 0, step 26, screen row 2/column 23; all 3,598 RNG calls and 27 cursors agree. Seed 28102908 is the passing recorded control. Both reduced cases were recorded twice with identical raw hashes.

`record.json` pins C/Lua source, recorder binary/patch/config/tool fingerprints and explains reachability. `raw-observations.json` preserves all 16 initial scan outcomes and both confirmation attempts. The retained full scan captures include the two failing seeds and neighboring control; reduced captures support the pickup commands. `clean-base-verification.json` records execution of the three commands from a clean detached current-base checkout with only this evidence directory overlaid. C was recorded at `5826a75f`; gameplay and comparison inputs are unchanged at the clean-verified base.

This began as manual source inspection and is explicitly unbound to discovery-hub canonical IDs. No source suppression decision is proposed. The earlier diagonal-line helper case remains deferred and is unrelated.
