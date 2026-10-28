# Static weapon catalog comparison

Disposition: **explained data representations; no table mismatch found in this batch**.
This is evidence about declarations, not confirmation of gameplay correctness,
runtime reachability, a gameplay bug, or score impact.

Reviewed: **2026-10-28T20:04:27Z**. Case identity: `weapons-20261028`.
Fresh source-only audit; no prior session evidence was consulted.

## Pins and provenance

- JS/repository main fetched for this audit: `1c4be74beb32edbfc897de805f218e180f8c6002`.
- C submodule gitlink and inspected source: `16ff59115315917b93185d026aeefea06db9b0f4`.
- JS catalog blob: `20b37cda407137c5a2bedb88a26a229f2ac62d36`.
- Last supplied accepted tooling SHA `034443e9246cb9fc19dfba9ba2d9c2893132e84c`
  is an ancestor of the pinned main. This audit does not run that tooling.
- `AGENTS.md` at pinned main was read. No applicable nested AGENTS.md or
  repository skill was found for this evidence directory. No listed cloud
  skill applies to this source-table audit.
- Input SHA-256 hashes, exact per-row source lines, normalized expected/observed
  values, and detector controls are in `comparison.json`. C paths in that file
  are relative to `nethack-c/upstream`; JS paths are relative to repository root.

## Bounded inventory and coverage

The first batch consists only of the complete contiguous weapon section of
`include/objects.h`: 71 real entries, ARROW (18) through CROSSBOW (88), declared
at lines 141–406. There are 59 WEAPON, 6 PROJECTILE and 6 BOW invocations.
No ring entry is extracted, compared, or included in the evidence.

| Field | C declaration | JS declaration | Coverage/result |
| --- | --- | --- | --- |
| Canonical name | First macro argument, through OBJ | OBJECT_DESCRIPTIONS[].oc_name | 71 equal |
| Declared weight | `wt` argument, through OBJECT | OBJECT_TEMPLATES[].oc_weight | 71 equal |
| Category | WEAPON_CLASS in all three macros | OBJECT_TEMPLATES[].oc_class | 71 equal |
| Material | `metal` argument, through BITS | OBJECT_TEMPLATES[].oc_material | 71 equal |
| Object ID | Declaration order after marker chain | Exported object constant | 71 equal |
| Catalog constants | 22 obj_material_types values and WEAPON_CLASS | Corresponding numeric exports | 23 equal |

Total: 355 row-field comparisons plus 23 constant comparisons; zero differences.
Each compared constant and entry remains individually visible in the JSON;
there is no negative-result filter or inferred exclusion rule.

## Explained representations

- C material symbols map directly to numeric JS enum values. The normalization
  is derived independently from `include/objclass.h:12`–35, then compared with
  JS exports. For example IRON is 11, WOOD is 8, BONE is 9, METAL is 12,
  SILVER is 14, PLASTIC is 18, and LEATHER is 7. The source comment at
  `include/objclass.h:9`–11 explains that material is a best-fit declaration
  for composite objects. No runtime meaning is inferred.
- WEAPON_CLASS becomes 2 via `include/defsym.h:404`–407 and :468. The three
  catalog macros at `include/objects.h:114`–130 all declare this category.
- The same macro definitions pass weight directly; `include/objclass.h:95`
  describes its unit as cn (0.1 lb). Values are compared as integers in that
  unit, without conversion or conclusions about an instantiated object's weight.
- Names are stored in JS OBJECT_DESCRIPTIONS, while weight/class/material are
  in OBJECT_TEMPLATES (`js/objects.js:558` and :1043). The extractor reads only
  JSON literal rows for ordinals 18–88, never imports this module or its game
  dependency. It does not resolve mutable name/description indexes.
- The initial ordinal is derived from GENERIC_VENOM and the marker chain at
  `include/objects.h:102`–111; the VENOM class ordinal is 17. Subsequent weapon
  IDs follow declaration order. The next armor constant is only a boundary
  control; armor data is not compared.

## Reproduction and controls

Use a checkout containing the pinned main commit and C submodule revision:

```sh
python3 diagnostics/divergence-evidence/object-catalog/weapons-20261028/compare.py > /tmp/object-catalog-comparison.json
cmp /tmp/object-catalog-comparison.json diagnostics/divergence-evidence/object-catalog/weapons-20261028/comparison.json
```

Python 3.12.14 was used. `--c-repo PATH` can select an existing local C repository
containing the pinned C commit. The script uses only `git show`, `git ls-tree`,
`git rev-parse`, Python standard-library parsing, and JSON output. All reads are
from pinned Git objects; working-tree edits cannot silently affect the result.
There is no game execution, compilation, recorder, JS import, state injection,
runtime-effects test, network call, or CI dispatch in the reproducer.

Controls passed:

- Exact submodule and JS blob pin checks; macro arity checks; first/last weapon
  and next-category boundary checks; invocation-count completeness check.
- Independent C material and category enum decoding before numeric comparison.
- An equal-row negative control.
- Five positive controls, changing one copied table value at a time: ID, name,
  weight, category, material. Each produces exactly its intended difference.
  These are artificial detector checks, not repository findings or game states.
- Reproduction after adding the marker-chain guard produced byte-identical JSON.

An initial extractor development run stopped at its arity assertion because the
WEAPON mapping had 17 rather than 16 arguments. The mapping was corrected against
the macro signature before any result was accepted. No source discrepancy was
inferred from that parser failure.

## Limits and publication review

Not covered: other object classes, descriptions/appearances, damage, skill,
probability, price, nutrition, flags, color, properties, mutable fields, or
instance weight. These are unexamined rather than matching. Rings and all
runtime scenarios remain excluded. No field required gameplay investigation;
there are no unresolved fields within the selected comparison set.

The extractor is deliberately restricted to the syntax and pins above. A future
revision or macro change requires review; do not treat this result as a recurring
scan or general parser certification. Results do not certify the full catalog or
the generated-file pipeline. Main alone owns gameplay fixes and integration.

Publication review is limited to three new evidence files in this case directory:
this report, the source-only reproducer, and its normalized comparison. They
contain repository source locations, public revision identifiers, table data,
and synthetic detector controls. No credentials, personal account metadata,
prior-session artifacts, recordings, or unrelated data are included.
