# Non-ring declared numeric catalog fields

Disposition: **explained negative: no static field mismatch**. This finite pass
is complete. It adds no gameplay implementation, runtime claim or score claim.
Reviewed at 2026-10-28T22:22:28.993211+00:00; exact execution
timestamps are in the target/control receipts. The accepted v1 `case.json` carries the handoff and hashed artifacts.

## Pins and coverage

- JS/main and packaging-tool base: `b313cde5b50f3c5b5e8f622ff32418cbc1ae12be`.
- C submodule: `16ff59115315917b93185d026aeefea06db9b0f4`.
- JS catalog blob: `20b37cda407137c5a2bedb88a26a229f2ac62d36`.
- Guidance read: current AGENTS.md, .agents/loop.md evidence-publication section,
  docs/evidence-package.md, evidence-package.mjs and checkpoint-preflight.mjs.
  No .agents/skills or applicable repository SKILL.md exists at this base.

All 453 non-ring rows (452 catalog slots and the terminator) are compared for:
`oc_cost`, `oc_prob`, `oc_wsdam`, `oc_wldam`, `oc_oc1`, `oc_oc2`.
The 84 real armor entries also compare `oc_subtyp`, with seven ARM_* enum
constants checked independently. **453 × 6 + 84 + 7 = 2,809 matching values**.
There are zero unresolved selected fields and zero differences.

| Declared class | Rows in six-field comparison |
| --- | ---: |
| Illegal/dummy | 3 |
| Weapon | 72 |
| Armor | 85 |
| Amulet | 14 |
| Tool | 51 |
| Food | 34 |
| Potion | 27 |
| Scroll | 44 |
| Spellbook | 45 |
| Wand | 29 |
| Coin | 2 |
| Gem/stone | 37 |
| Large rock | 3 |
| Ball | 2 |
| Chain | 2 |
| Venom | 3 |

Counts include generic placeholders; illegal/dummy includes STRANGE_OBJECT,
GENERIC_ILLOBJ and the terminator. No placeholder is claimed to be a playable
item. Ring slot 4 and slots 173–200 are removed before preprocessing. Only the
excluded slot counts are retained to preserve subsequent ordinal alignment.
Names, weights, categories, materials and IDs from PR #68 are not re-compared;
identity, class and slot metadata are used only to align the new field checks.
No artifact or code from excluded runtime investigations is used.

## Source mapping and normalization

Every row and armor constant in target-output.json carries exact C/JS source
locations and expected/observed numeric values. C paths are relative to the
submodule. Source line numbers identify macro invocation/expansion sites.

- `include/objects.h:48`–51 maps OBJECT cost, probability, damage, oc1 and oc2
  arguments into the corresponding C fields. `include/objclass.h:94`–106
  declares their types and aliases. Compare underlying JS template keys,
  without loading JS modules or invoking alias accessors.
- WEAPON/PROJECTILE/BOW (`objects.h:114`–130) declare damage components and
  the hit-bonus value. These are not a full damage formula; the nearby source
  comment at :132–133 explicitly says some extra damage is defined elsewhere.
  No such handlers are read or investigated in this pass.
- ARMOR (`objects.h:422`–428) stores `10 - ac` in oc_oc1 and `can` in oc_oc2.
  Its category comes from ARM_* enum values (`objclass.h:37`–45). A raw AC
  argument of 9 therefore compares with JS value 1, not 9.
- FOOD (`objects.h:1033`–1037) derives cost as `nutrition / 20 + 5`.
  The restricted evaluator implements C integer division toward zero, not
  Python floor division or floating-point division. Food ration's declared
  800 nutrition (:1110–1111) independently anchors cost 45.
- SPELL (`objects.h:1277`–1281) derives cost as `level * 100` and stores
  level in oc_oc2. It is not interpreted as an armor value for spellbooks.
- WEPTOOL (`objects.h:891`–896) forwards its hitbon argument to oc_oc1.
  When it is a symbolic literal, PIERCE/SLASH/WHACK are decoded from
  `objclass.h:79`–81. This is a declaration comparison, not an inference
  about how a tool uses that value.
- Cost and probability remain declared integers. They are not realized shop
  prices, normalized percentages, or observed generation frequencies.
- Signed fields stay signed. Expected values must fit conservative portable
  signed-short/signed-char ranges. There is no byte-layout comparison,
  bitfield-layout dependency, pointer interpretation, or unsigned-long sentinel
  comparison. The latter could depend on platform ABI and remains excluded.

## Reproduce

Use this repository checkout with the pinned JS commit available and its C
submodule initialized at the exact gitlink. The five source dependencies listed
in case.json must match their pins; the runner checks this before comparison.
No network download is performed by the runner.

```sh
node diagnostics/divergence-evidence/object-catalog/declared-fields-20261028/check.mjs target > /tmp/catalog-target.json
node diagnostics/divergence-evidence/object-catalog/declared-fields-20261028/check.mjs control > /tmp/catalog-control.json
cmp /tmp/catalog-target.json diagnostics/divergence-evidence/object-catalog/declared-fields-20261028/target-output.json
cmp /tmp/catalog-control.json diagnostics/divergence-evidence/object-catalog/declared-fields-20261028/control-output.json
node scripts/evidence-package.mjs validate diagnostics/divergence-evidence/object-catalog/declared-fields-20261028/case.json --commit HEAD
```

The manual `.mjs` runner delegates to the packaged Python parser. It reads
pinned Git blobs, strips excluded ring declarations, and projects only selected
fields with `cpp -P -undef -nostdinc -x c -`. There are no C includes, compilation,
linking, game imports, recordings, handlers or state injection. Python evaluates
only a restricted integer-expression AST. Inactive `#if 0` rows stay inactive;
MAIL_STRUCTURES is set from its explicit definition in global.h:430.

Controls include seven one-field copied-data mutations, one armor-enum mutation,
an equal-row control, arithmetic/signedness checks, hand-read dagger/helm/ration
anchors, and exact row/exclusion counts. Target exits 1 if any real comparison
differs. Source/config/runner hashes and tool versions bind final command
receipts to saved outputs. No copied-data mutation touches game state or source.

The initial parser development run stopped on an unresolved WHACK token.
Its static header definition was added to normalization before accepting any
result; this was a detector setup correction, not a catalog finding.

Before publication, run the required `node --test scripts/test-suites.test.mjs`
and the package validator's committed-tree layout guard on the exact candidate.
Packaging success verifies structure and receipts, not semantic correctness or
gameplay exposure. No CI or full Checkpoint is requested by this package.

## Remaining unexamined fields

Appearance descriptions; flags and bitfields; oc_dir; non-armor oc_subtyp;
oc_delay; oc_color; oc_oprop; oc_nutrition as an independent field; name/description
indexes, called names and mutable discovery/pricing state; pointer and ABI-sized
fields. All ring data and every runtime interpretation remain excluded.
Nutrition participates only as an input to the declared FOOD cost expression.
No unresolved selected comparison is hidden in these explicit scope exclusions.

Publication review covers only this case's parser, wrapper, outputs, receipts,
report and case.json. Inputs are existing repository source dependencies, not
copied session artifacts. No secrets, personal metadata or unrelated data are
included. Main remains sole gameplay writer/integrator. Stop after this pass.
