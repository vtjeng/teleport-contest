# Declarative character progression: bounded negative

At JS `b313cde5b50f3c5b5e8f622ff32418cbc1ae12be` and C gitlink
`16ff59115315917b93185d026aeefea06db9b0f4`, all **1,206 comparisons match**:
1,175 scalar fields and 31 table-length checks. There are **zero mismatch
witnesses and zero distinct candidate causes**. This establishes only agreement
of the selected source declarations, not runtime correctness or reachability.

| Declared family | Coverage | Scalar comparisons | Length comparisons |
| --- | --- | ---: | ---: |
| Roles | 13 × 6 attrbase, attrdist, hpadv, enadv; 13 xlev | 325 | 0 |
| Races | 5 × 6 attrmin, attrmax, hpadv, enadv | 120 | 0 |
| Skill caps | 13 catalogs, 277 ordered entries: skill ID and cap | 554 | 13 |
| Innates | 18 tables, 44 entries: level, property ID, gain/loss text | 176 | 18 |

Role/race cardinality, identity/order and vector width are additional fail-closed
parser assertions, not inflated into the comparison count. Each target row
retains its semantic key and both values in `target-output.json`.

## Oracle and normalization

`compare.mjs` reads text only, hashes all inputs against `inputs.json`, and never
imports game modules, evaluates source, invokes a C compiler, records gameplay,
or calls handlers. It is a deliberately restricted parser for the pinned source
syntax, not a general JavaScript/C parser or preprocessor. Unsupported expressions,
missing constants, missing sentinels and malformed widths fail the command.

- `src/role.c:30–576,581–685` provides all playable role/race entries. The field
  positions come from `include/you.h` Role/Race structs (attributes at 217–221
  and 277–280); array identities are checked against JS filecodes. Rogue remains
  before Ranger. Role/race terminator records are excluded after exact checks.
- `include/you.h:23–28` defines advancement order as infix, inrnd, lofix, lornd,
  hifix, hirnd. These are parameters for initial/lower/higher progression, **not
  sampled hit-point or energy outcomes**. `xlev` is the role cutoff. JavaScript's
  `advance()` argument-to-field mapping is asserted from its source text.
- Attributes retain Str, Int, Wis, Dex, Con, Cha order. Role attrbase is the lowest
  initial attribute, attrdist is distribution weight; these are not finalized
  character attributes. Race attrmin/attrmax are declared limits, not starting
  values. `STR18(x)` is explicitly verified as `18 + x`: human/dwarf 18/100 →
  118, gnome/orc 18/50 → 68. These are explained representations, not defects.
- `src/u_init.c:257–572` skill entries are paired by named catalog and order.
  C skills and caps resolve independently through `include/skills.h`; JS values
  resolve through `js/const.js`. `P_MARTIAL_ARTS` aliases `P_BARE_HANDED_COMBAT`
  in both. C `{P_NONE,0}` sentinels are checked and omitted. The JS `catalog()`
  wrapper mapping is checked. No inference is made about actual acquired skills.
- `src/attrib.c:23–112` supplies all 13 role and five race innate arrays. C
  `&HFoo`/`&(HFoo)` is resolved through `youprop.h` to the intrinsic property
  index, then independently through C `prop.h`; JS uses `const.js`. Four-zero
  sentinels are checked and removed. JS `innate()` field mapping is checked.
  Human's sentinel-only array becomes an empty JS array. Order and strings are
  retained, including empty level-one messages.

The selected declaration blocks are unconditional in this C revision; no
TOURIST or other feature switch removes these catalog entries. The deferred
Race night-vision fields in `you.h` are excluded. The recorder patch touching
`u_init.c` changes birthday-time acquisition, outside these tables; it does not
change the selected declarations. No alternate build configuration is certified.

## Controls and reproducibility

Run from the repository root with the pinned JS files and C checkout present:

```
node diagnostics/divergence-evidence/character-tables/progression-20261028/compare.mjs target
node diagnostics/divergence-evidence/character-tables/progression-20261028/compare.mjs controls
```

Both commands exited 0 under Node v24.19.0. `record.mjs` ran these exact commands
and captured their observed output, exit status, timestamp, runner hash and all
input hashes. The committed receipts are historical; reproducing the commands
directly avoids overwriting them. No dependencies were installed.

Controls include seven positive assertions (five independently selected values
and the C/JS martial-arts aliases), **16 source-text mutations detected with exact
expected mismatch keys**, and three malformed-input rejections (vector width,
unknown skill constant, altered C sentinel). Every mutation changes an in-memory
copy before extraction; no source file or production value is modified. Mutation
witnesses are deliberately artificial and are not candidate gameplay defects.
The controls cover every selected vector family, cutoff, both skill fields,
all four innate fields, and empty-table membership. They are not exhaustive
parser fuzzing. An initial positive-control draft used Monk row 10 for grand
master; source inspection corrected it to row 11 before the saved successful
runs. That setup error was not a game discrepancy.

## Existing coverage and evidence limits

The audit is an independent, pinned source comparison, not a claim to discover
previously untested tables. `scripts/role-init.test.mjs:74–125` already checks
role/race shape and a whole-table digest. `scripts/role-skills.test.mjs:61–90`
already compares every C skill entry using JS constants as its value mapping.
The new pass resolves C and JS constants independently and preserves each
normalized field, provenance and source-mutation sensitivity. Existing
`attrib-innate.test.mjs` and `hero-attributes.test.mjs` cover selected runtime
behaviors; they were inspected for overlap, **not executed** in this source-only
assignment. No character-table evidence package was found in the pinned
`diagnostics/divergence-evidence` tree. A bounded GitHub PR title/body search for
role/race/character/innate found no matching character progression audit; this is
not an exhaustive review-history claim.

Unexamined: role/race selection and compatibility masks; role-to-catalog or
role/race-to-innate dispatch wiring; randomized distribution, actual initial and
level-up HP/energy calculations; attribute clamping, exercise and redistribution;
skill initialization/training and race-specific adjustments; intrinsic grants,
removal, messages and property ownership in execution; polymorph state;
spellcasting parameters, alignment records, ranks, gods, quest metadata, pets,
night vision, starting inventory and all other role/race fields. In particular,
declared dwarf/gnome INFRAVISION rows are **not evidence that adjabil grants them**:
C and JS comments distinguish grant dispatch from innate-origin lookup.

No runtime, command/object catalog, combat, Lua-level or excluded investigation
was executed. No game code changed. Main retains gameplay integration and all
acceptance gates. No scanner decision/filter, score, CI dispatch, merge or formal
approval is requested. `explained_negative` is scoped to the tables and bases
above; exposure remains unestablished. Source/tool changes invalidate carrying
this conclusion forward without rechecking.

The package follows `docs/evidence-package.md` v1 using tooling from the pinned
JS base. Final validation includes the committed-tree test-layout preflight;
packaging success is not semantic acceptance or a full Checkpoint receipt.
