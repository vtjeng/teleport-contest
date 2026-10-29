# CON/WIS and advancement-cutoff arithmetic

JS base `fdaa960271b2eab9d9e2314d413f80258122b577`; C gitlink
`16ff59115315917b93185d026aeefea06db9b0f4`.

24,254 target states and four explicit numeric controls match freshly compiled
C newhp/newpw/enermod against the actual JS component APIs. Zero divergent semantic
causes; one scoped negative package. State counts are not cause/scanner counts.

The target uses thirteen human roles plus elf Wizard, gnome Wizard, dwarf
Archeologist and orc Barbarian. Each pair has minimum/maximum-draw initialization
controls, then level 1, xlev−1, xlev, xlev+1 and 29, selected CON branch boundaries
3/4/6/7/14/15/16/17/18/19/20 within the race maximum, every WIS integer from 3
through the race maximum, and minimum/maximum random draws. No level-30 direct
growth is included: ordinary newexplevel suppresses it, while object-driven
post-cap gain is excluded from this audit.

The explicit controls independently require Wizard-human (level 1, CON/WIS 3,
minimum draws) HP increment 1 and energy 4; CON/WIS 18 with maximum draws yields
13/24; Wizard initialization yields HP 12, energy 6 and neutral alignment record 0.
Archeologist initialization independently pins HP 13, energy 2 and alignment record 10.

## Oracle and source bindings

`parse-c.mjs` independently reads literal role.c Role/Race initializers. It extracts
HP/energy vectors, xlev, initial alignment record and race CON/WIS maxima. The C
harness is generated from those C values, never from JS tables. Separate checks
compare them with JS data and fail closed on unexpected initializer counts/shapes.
This deliberately does not repeat PR #99's broader static-table claim.

The runner copies the three complete function bodies unchanged from pinned C,
saves their hashes and generated translation unit, and compiles with installed
GCC 14.2.0. Numeric role tags preserve the C switch's symbolic category identity;
this adapter does not test original enum values. ACURR supplies the explicit
ordinary attribute inputs; RNG supplies explicit lower/upper outcomes and records
bound/order/result. Those are the only behavioral dependencies. All arithmetic
stays within represented ranges. The actual C bodies perform flooring, clamping,
role multipliers, cutoff selection and increment-slot/alignment writes.

Comparison covers returned HP/energy, the remembered increment slot, alignment
type/record and complete RNG-call transcript. Other game state, natural input
reachability, timer integration and full play are not inferred. These constructed
states obey the selected race attribute limits, but no history reaching every
state is claimed. Initial alignment is selected from the intersection of the C role/race permission
expressions (preferring neutral when legal); this tests assignment and role record,
not the complete character-selection UI. All chosen starting alignments are legal. No source or gameplay module is edited.

This fresh executable has recorded generated-source/compile/binary provenance.
It does not strengthen the preinstalled recorder build-attestation limitation in
previous packages. The discarded first compilation emitted only an indentation
warning in the adapter driver; after formatting that driver, final target/control
were rerun and their compiler diagnostics are empty. No mismatch was hidden.

## Reproduce and inspect

```
node diagnostics/divergence-evidence/hero-advancement/attribute-boundaries-20261029/run.mjs control
node diagnostics/divergence-evidence/hero-advancement/attribute-boundaries-20261029/run.mjs target
```

Both expect exit 0 and generate fresh temporary artifacts. Every input and both
outputs are retained as gzip streams; compressed bytes are hashed. The two JSONL
outputs have one row per matrix index. `mismatches.json` is empty for both runs.
Generated C, independently parsed C data, source hashes and compiler diagnostics
are stored alongside them. A setup/assertion failure is not a negative.

Confirmed new causes: 0. Explained negative: the explicit component projection
and bounded domain above. Duplicates: prior static tables are used as reconciliation,
not resubmitted. Unresolved mismatches: 0. Gaps: every legal pairing, intermediate
RNG values, effective-attribute modifiers, natural histories and post-MAXULEV
nonincremental effects. No source-only suspicion backlog is inferred from gaps.

The previous 92 integration tests cover identical game/test bytes and were not
repeated. Fresh compiled comparison, positive numeric assertions, versioned
packaging and committed-tree layout provide the relevant new checks. No full CI,
score, merge or formal approval; Main remains the gameplay writer. Elapsed windows
are measured wall time from generated source to saved summary, not active compute
or all-in audit effort. See ../COVERAGE.md for ongoing next work.
