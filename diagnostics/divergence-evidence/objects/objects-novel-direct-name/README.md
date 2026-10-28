# objects-novel-direct-name

**Explained negative; objects shard.** Scanner lead `source-audit:edge-c-only:src/mkobj.c:mksobj:oname` reports a missing call. In the SPE_NOVEL finalization arm, C `mkobj.c:1246-1248` selects a title and calls `oname` with ONAME_NO_FLAGS. JS `obj.js:2749-2755` selects the same title/index and writes `oextra.oname` directly. This shortcut has the same effects for a fresh novel, not for arbitrary object naming.

C `do_name.c:372-433` truncates names above PL_PSIZ, preserves existing artifacts, allocates/copies the name, checks artifact identity, applies artifact-specific effects, and refreshes inventory only for carried objects. All 41 titles in `sir_Terry_novels` exactly match the JS table and fit in PL_PSIZ. The new novel is OBJ_FREE, with no existing artifact or name. There is no SPE_NOVEL entry in artilist.h or the initialized artifact table; neither artifact existence lookup nor creation can succeed. No title truncation, artifact change or inventory refresh is reachable here. Name storage and the selected novel index are the remaining effects, both performed by JS.

The focused test extracts the actual C title table, checks every title's byte length, checks absence of a novel artifact entry, and constructs all 41 title choices through mksobj. Each yields the expected title/index and exactly `rnd(2)` for next_ident followed by `rn2(41)` for noveltitle. A blank spellbook control has no assigned name. This only tests the finalization shortcut; other mksobj initialization behavior is not certified.

An independent public debug wish creates a novel titled Thud!, verified in inventory. The C capture matches JS for all 28 screens/cursors and 2597 RNG calls; it records `rn2(41)=33 @ noveltitle`. A matching seed illustrates reachability; the finite title-table and fresh-object proof establishes this narrow negative.

```
node --test diagnostics/divergence-evidence/objects/objects-novel-direct-name/check.test.mjs
node frozen/ps_test_runner.mjs --worker-session=diagnostics/divergence-evidence/objects/objects-novel-direct-name/capture-c.json
NETHACK_INSTALL=/tmp/objects-recorder NETHACK_BINARY=/tmp/objects-recorder/nethack node scripts/record-session.mjs diagnostics/divergence-evidence/objects/objects-novel-direct-name/recipe.json /tmp/objects-novel-new.json
```

Use a private recorder install for fresh capture. All checks pass. New titles exceeding the byte limit, novel artifacts, or changes to fresh-object placement/oname side effects invalidate the proof. Do not generalize this to naming carried objects or artifact-capable types.

Exact scanner binding and both review decisions are in `../objects-novel-direct-name/{binding,bound-run,decision-template,decisions}.json`. The compact projection preserves hub review fingerprints; the full run remains available in the shard workspace.
