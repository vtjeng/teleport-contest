# Static placeholder, stem and alias supplement

This supplement preserves the original v1 evidence unchanged and closes its
remaining **lexical** mapping checks at the same source revisions:
JS `de3380e285e5f4abf40375459f9490f92569e7dc`, upstream
`16ff59115315917b93185d026aeefea06db9b0f4`. It reuses only the new static audit's
committed inventory at `d2a9051ce46de072b1c49f2cf1c38cc0c1a37272`, verifies its
exact blob hash, and adds source-bound declarations. It does not use any earlier
dynamic investigation evidence.

| Declaration relationship | Result |
| --- | --- |
| `include/you.h:struct Role.filecode`, `src/role.c:roles`, `js/roles.js:roles` | All 13 filecodes match, including order, uniqueness and declared NUM_ROLES. The C parser selects the field by the verified struct prefix; it never evaluates initializers. Other role fields are outside this audit. |
| Three `x-*` names in dungeon metadata × 13 role filecodes | All 39 lexical names exist as authored files and registry keys, with no duplicate expansion. This join is a consistency check, not a claim about executed substitution. |
| Authored quest-family filenames | Five suffixes observed in the pinned manifest inventory yield exactly 65 files across the 13 declared filecodes. No extra/missing role-family file. `-fila`/`-filb` are observed filename suffixes, not invented dungeon fields. |
| `protofile = "tower"`, `base = 3`, three named levels | `tower1`, `tower2`, `tower3` agree with the declared list; exactly those numbered files and mappings exist. No assertion that this describes runtime stem selection or generated depth. |
| 26 LEVEL_MAP aliases | Each source name exists in the declared dungeon prototypes; each destination macro resolves to an existing `d_level` field in `struct dgn_topology`. No duplicate alias sources/destinations. V1 already independently compared the C and JS alias tables. |
| Registry shared identifiers | Only `Rog-fila` and `Rog-filb` share the same module/symbol binding (`rogFila`). These are two different authored-file keys, not a duplicate identifier. No body-equivalence claim. |

The static target exits 0. Seventeen positive and mutation/rejection controls
cover filecode divergence/duplication, missing quest files/mappings, duplicate
placeholder expansion, extra role files, missing fillers, changed stem/count,
duplicate stem levels, extra stem files, missing alias prototypes/fields/macros,
and duplicate alias destinations. Mutations operate on copied declarations only.

Run from the repository root with the existing Node/Acorn installation:

```sh
node diagnostics/divergence-evidence/dungeon-metadata/static-v1/expansions-v2/audit.mjs
node diagnostics/divergence-evidence/dungeon-metadata/static-v1/expansions-v2/audit.mjs --controls
node scripts/evidence-package.mjs validate diagnostics/divergence-evidence/dungeon-metadata/static-v1/expansions-v2/case.json --commit HEAD
node scripts/checkpoint-preflight.mjs --commit HEAD
```

`record.mjs` saves actual command outputs and v1-format receipts; a rerun at a
new source base belongs to a new evidence version. Packaging tooling remains
unchanged from the pinned JS source revision.

No unexamined rows remain in these finite static expansions. The remaining
questions require interpretation or execution outside this task: actual quest
substitution and filler selection; tower runtime selection; the `rogue`/`dummy`
markers; `Rog-filb` body equivalence; and `Val-strt` wrapper behavior. There is no
separate literal-file declaration for those marker semantics and no invented JS
counterpart. No Lua body, special-level API, gameplay handler or level generation
is executed. Matching these declarations does not establish runtime equivalence
or exhaust all Levels behavior.
