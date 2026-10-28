# Remaining non-ring catalog declarations

Disposition: **no static mismatch in the remaining permitted fields**.
Reviewed: **2026-10-28T20:11:26Z**. Case identity: `remaining-20261028`.
This completes the bounded non-ring catalog audit at the pins below. Stop here;
do not rescan unchanged inputs or infer runtime correctness or score impact.

## Pins and method

- JS/main: `1c4be74beb32edbfc897de805f218e180f8c6002`.
- C gitlink/source: `16ff59115315917b93185d026aeefea06db9b0f4`.
- JS catalog blob: `20b37cda407137c5a2bedb88a26a229f2ac62d36`.
- Same source snapshot as the first weapon batch; its evidence remains intact.
- Python 3.12.14; GNU cpp 14.2.0 (Debian 14.2.0-19).

`compare.py` reads pinned Git objects and submits only the macro catalog body to
`cpp -P -undef -nostdinc -x c -`. A small projection replaces OBJECT, OBJ, and BITS
to emit only identity, name, weight, category, material and source line. The
original macro families and their local overrides still expand normally. The
projection follows `include/objects.h:32`–53 and the corresponding fields in
`include/objclass.h:48`–95. It includes no headers, compiles no executable, and
links or executes no C/JS game code. Ring definitions are removed before cpp;
only their excluded-slot count is retained for subsequent enum positions.

The parser's integer evaluator accepts only literals, identifiers, addition,
subtraction and multiplication. It is not `eval`. Unknown syntax, unresolved
symbols, unsupported output, pin changes, and coverage gaps fail closed.
All compared source lines, input hashes, C-expected/JS-observed normalized
values, and comparison controls are retained in `comparison.json`. C paths are
relative to the C submodule; JS paths are relative to repository root. Source
lines identify the macro expansion site (which may be a continuation line).

## Exact coverage

Five fields per row: canonical name, declared weight, category (`oc_class`),
material (`oc_material`), and catalog ID. This batch adds **382 rows** and
**32 constants**. The previous batch covered 71 weapon rows and 23 constants.

| Category | Additional rows |
| --- | ---: |
| Illegal/dummy objects | 3 |
| Weapon generic placeholder | 1 |
| Armor | 85 |
| Amulets | 14 |
| Tools | 51 |
| Food | 34 |
| Potions | 27 |
| Scrolls | 44 |
| Spellbooks | 45 |
| Wands | 29 |
| Coins | 2 |
| Gems/stones | 37 |
| Large rocks | 3 |
| Iron balls | 2 |
| Chains | 2 |
| Venom | 3 |
| **Additional total** | **382** |

These counts include each non-ring generic placeholder. Illegal/dummy objects
include STRANGE_OBJECT, GENERIC_ILLOBJ, and the array terminator. No placeholder
is represented as an ordinary playable item.

Combined total: **453 non-ring rows** (452 catalog slots plus the terminator),
covering every non-ring slot in the 482-row description/template arrays, and
**55 distinct non-ring catalog constants**. All **2,320 comparisons** match:
453 × 5 row fields + 55 constants. The remaining batch contributes 1,942 of them.
The 71 previous weapon rows are checked once against the independent earlier
source-parser result as a detector control; they are not counted twice.

Constants cover all 22 material enum values; 16 non-ring class values plus
RANDOM_CLASS and MAXOCLASSES; 11 object-range markers; NUM_OBJECTS; and
NUM_REAL_GEMS, NUM_GLASS_GEMS, MAXSPELL. The 23 prior constants are retained in
the combined JSON for transparent normalization, not counted as new discoveries.

Excluded: the generic ring slot 4 and 28 RING_CLASS slots 173–200, plus the
RING_CLASS constant. Non-ring classes are selected by declared C category.
The field audit concerns declarations only, including for entries whose names
also occur in excluded runtime topics; no effects, uses or instance state were
investigated.

## Explained data representations

- **NoDes → null:** C's null-pointer name becomes JS JSON null. There are 20
  extra scroll-label slots SC01–SC20 (`include/objects.h:1236`–1257), three
  unnamed wand slots WAN1–WAN3 (:1502–1504), and the terminator (:1647).
  These null names match the source and are not missing-name mismatches.
- **Adjacent strings:** `GENERIC` concatenates `"generic "` with a class label
  at `include/objects.h:72`–75. The parser joins C string literals before
  comparing with the JS string; it does not remove spaces inside names.
- **Local material override:** `#define PAPER LEATHER` at
  `include/objects.h:1292`, undone at :1299, yields material 7 (LEATHER) for
  SPE_DIG and SPE_MAGIC_MISSILE. Ordinary PAPER values remain 5. Preprocessing
  preserves the override, so neither row is a mismatch. No effects are inferred.
- **Conditional declarations:** MAIL_STRUCTURES is unconditionally defined at
  `include/global.h:430`, so SCR_MAIL is included (:1262–1264 in objects.h).
  The three `#if 0` blocks at objects.h:509, :536 and :1413 remain inactive.
  This is source preprocessing, not a build or runtime experiment.
- **IDs and ranges:** ordinal positions and MARKER expressions are evaluated
  from C, including the skipped ring slots, before comparison with JS exports.
  Count constants are derived from `include/objclass.h:179`–185. The terminator
  is at index 481 and is separately classified from ordinary catalog entries.
- **Weight:** declared integers are compared unchanged in C's cn unit; no
  quantity, container contents, material effects or instance adjustments are
  evaluated. Category and material symbols use independently parsed C enums.

## Reproduction and controls

```sh
python3 diagnostics/divergence-evidence/object-catalog/remaining-20261028/compare.py > /tmp/object-catalog-remaining.json
cmp /tmp/object-catalog-remaining.json diagnostics/divergence-evidence/object-catalog/remaining-20261028/comparison.json
```

The checkout must contain the pinned Git commits. `--c-repo PATH` may select
another local C repository with that commit. The earlier weapon comparison JSON
must also be present; it belongs to this same fresh static audit.

Controls passed: pin checks; 482-slot array bounds; exact excluded ranges;
expected new-row and constant counts; macro-output shape guards; independent
71-row weapon-parser agreement; an equal-row control; five one-field synthetic
copied-table mutations; and null/adjacent-string/integer-arithmetic normalization
checks. Adding the last normalization/coverage guards left all comparison values
unchanged. The saved output was reproduced byte for byte.

## Limits and publication review

There are no unresolved comparisons in these five fields and selected catalog
constants. Descriptions/appearances, armor/skill subtype, damage, flags,
probabilities, prices, nutrition, colors, properties, mutable fields and actual
instance behavior are outside this audit. Inactive source rows are not compiled
catalog entries and are not compared. No full generated-file certification,
runtime consequence or gameplay/score claim follows from matching declarations.

No game, recorder, runtime-effect investigation, state injection, prior denied
work artifacts, gameplay changes, CI dispatch, or Main writes were used. The
only publication additions are this report, the table-only parser, and normalized
data. They were reviewed for scope, credentials, private metadata and unrelated
data. No such data was found. Main retains gameplay integration ownership.
