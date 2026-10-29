# Dungeon metadata and authored-file inventory, static v1

At Main `de3380e285e5f4abf40375459f9490f92569e7dc`, with upstream gitlink
`16ff59115315917b93185d026aeefea06db9b0f4`, no unexplained static difference
was found. This is a scoped declaration negative, not runtime equivalence.

## Finite coverage

| Source / translated declaration | Coverage and result |
| --- | --- |
| `dat/dungeon.lua` / `js/dungeon_data.js:DUNGEON_DATA` | All 9 dungeon records, 37 level prototypes, 7 branch records; exact field presence, values, array order, and nested structure agree. |
| Dungeon fields | `alignment`, `base`, `bonetag`, `branches`, `entry`, `flags`, `levels`, `lvlfill`, `name`, `protofile`, `range`. |
| Level fields | `alignment`, `base`, `bonetag`, `chainlevel`, `chance`, `flags`, `name`, `nlevels`, `range`. |
| Branch fields | `base`, `branchtype`, `chainlevel`, `direction`, `name`, `range`. |
| Identifier references | Unique dungeon names, per-dungeon level names and branch destinations; every branch destination exists; every declared chainlevel names a level in the same dungeon. No dangling references. |
| `include/{dungeon,dgn_file,global,align}.h` / `js/dungeon.js` | All 21 corresponding explicit BR/TBR, flag, alignment, and limit constants agree. Alignment expressions are restricted to their declared named constant shifted by 4. |
| `src/dungeon.c` / `js/dungeon.js` | All entries in `flagstrs/flagstrs2i`, `dgnaligns/dgnaligns2i`, and `brtypes/brtypes2i` agree with FLAG_VALUES, ALIGN_VALUES, BRANCH_TYPE_VALUES. Terminator/default slots have no JS table entry and are excluded. All 26 `level_map` aliases agree with LEVEL_MAP, resolving only the three literal X_* definitions. |
| `sys/unix/Makefile.top:SPEC_LEVS, QUEST_LEVS` | Expand every declared `*` and `?` against the pinned Git tree: 129 files, no unmatched patterns or duplicate files. Three library files leave 126 authored level files. |
| `js/mklev.js:SPECIAL_LEVEL_LOADERS` | All 24 declared spread/import modules resolve; 125 unique keys refer to existing authored filenames, and every mapped identifier has a module-level binding. Module bodies are parsed as syntax only, never imported. |
| Direct startup exception | `tut-1.lua` is the sole raw registry omission. `js/tutorial_level.js:537-539` explicitly documents direct startup; `js/tutorial_startup.js:26` imports its exported `loadTutorialLevel`. This accounts for the 126th file, without a runtime execution claim. |
| Declared assets | Literal `themerooms` and `lvlfill` assets exist; ordinary level names and declared variant families resolve to files. Full rows are in target-output.json. |
| Entire Lua filename inventory | All 131 direct `dat/*.lua` names are inventoried: 126 authored levels, `nhcore.lua`/`nhlib.lua`/`themerms.lua` libraries, `dungeon.lua` metadata, and `quest.lua` dialogue data. No upstream Lua level bodies are read. |

The output retains every module, key, mapped symbol, source line, filename,
metadata asset row, unresolved filename form, source hash, and comparison.
Names and values are compared as declarations, with no invented effective depth,
RNG-derived range, branch probability, or runtime flag field.

## Exceptions and limits

- `rogue` and `dummy` are metadata markers without authored Lua files or registry
  keys. Their runtime handling is not established here and is not called a bug.
- `x-strt`, `x-loca`, `x-goal` are quest placeholders. The Makefile's 65 authored
  role-family files are covered, but role substitution is not inferred or run.
- `protofile = "tower"` is a stem, not `tower.lua`; the three explicitly declared
  tower level filenames are covered. Stem selection semantics remain untested.
- `Rog-filb` and `Rog-fila` intentionally share a declared symbol according to the
  registry comment; matching bodies are not asserted. The `Val-strt` wrapper
  after the aggregate declaration is not a new file key; its behavior is outside
  this audit. Shared symbols are not duplicate file identifiers.
- Table string vocabularies and constant values match; interpretation, default
  behavior, constraints on generated depths, and direction-dependent behavior
  remain outside static comparison. The C direction lookup has no corresponding
  JS lookup table and is not assigned an invented counterpart.
- Makefile packaging coverage is the pinned Unix manifest, not proof for every
  platform or runtime loading path. References inside executable level bodies,
  generated level contents, and arbitrary assets outside these declarations are
  outside the finite scope.

There are no remaining unexamined entries in the listed static tables or file
manifests. The nonliteral forms and runtime semantics above are explicit scope
boundaries, not pending dynamic experiments. No Lua, level API, game handler,
level generation, recorder, C compilation, or gameplay test runs in this package.
The stopped dynamic investigation and its evidence were not used.

## Reproduce and validate

Run from repository root with Node 22+ and the repository's already-installed
Acorn dependency (the exact version and file hash are recorded). No install or
network operation is performed by these scripts. Source bytes must match the
pinned Git blobs; the Git history and C submodule at the recorded SHA must exist.
The runner fails closed on unsupported metadata syntax.

```sh
node diagnostics/divergence-evidence/dungeon-metadata/static-v1/audit.mjs
node diagnostics/divergence-evidence/dungeon-metadata/static-v1/audit.mjs --controls
```

Both exit 0. There are 28 positive, rejection, and mutation controls. Controls
change copies only: depth, range, count, flags, direction, missing/extra fields,
missing/reordered records, duplicate keys and identifiers, dangling references,
loader omissions/extras, asset paths, constants, vocabulary, and alias mapping.
They are detector-sensitivity checks, not alternate gameplay inputs.

`record.mjs` reruns both commands and refreshes local outputs, actual exit-code
receipts and the v1 package. Do not replace this committed evidence
with results from a later gameplay base; use a new version. The installed parser,
lockfile, source files, runner and receipts are hashed. The metadata equality
check overlaps an existing generator test; `overlap.json` details that boundary.

After committing the package, use the versioned tooling from the pinned Main:

```sh
node scripts/evidence-package.mjs validate diagnostics/divergence-evidence/dungeon-metadata/static-v1/case.json --commit HEAD
node scripts/checkpoint-preflight.mjs --commit HEAD
```

Packaging and layout validation are not a Checkpoint receipt, acceptance, or a
runtime-equivalence certification. Only analysis evidence files change.
