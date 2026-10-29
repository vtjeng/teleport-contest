# Role/race ability traversal and martial-skill rollback

JS base `3f0abcf1846d55999c260505a257647b12e570b8` (game code unchanged from
`9cd25dd87fe2df24bbf04ea3897aaa725b9758ea`); C gitlink
`16ff59115315917b93185d026aeefea06db9b0f4`.

**22 public-input recordings match C/JS completely.** Zero candidate semantic
causes, zero scanner keys. These comprise 19 target fixtures and three controls;
fixture counts are not distinct cause counts.

- Thirteen human-role traversals, each level 1→30→1, cover every role's ascending
  and descending innate table crossings with fresh seeds.
- Four legal race variants (elf Wizard, gnome Wizard, dwarf Archeologist, orc
  Barbarian) exercise their race dispatch alongside role progression. This is not
  every legal role/race pairing or attribute assignment.
- A no-op Monk level-1 command is the traversal control.
- Monk martial-skill target/control cover the different unarmed slot-cost class.
- Ranger attributes target/control expose a silent intrinsic crossing, not just
  the absence of a message.

`verify.mjs` recomputes strict RNG/screens/cursors/animation parity from saved
outputs. Each traversal must reach `Xp:30/100000000` and finish `Xp:1/19`.
The verifier independently reads C attrib.c innate tables and checks each nonempty
above-level-1 gain/loss message. It also checks elf awake/tired feedback. Each of
these 17 traversals contains 212 screens; the no-op control has 21. Full per-row
counts remain in immutable result.json files. There are no animation frames.

## Additional integration results

Monk starts with five slots after reaching level 6. Public wizard #enhance raises
martial arts Basic→Skilled→Expert→Master, spending 1+2+2 slots. The control menu
shows Master and zero free slots. Successive drops to levels 5, 3 and 1 show:

| Menu state | Slots | Martial arts |
| --- | ---: | --- |
| Initial spent control | 0 | Master |
| After 6→5 | 1 | Expert |
| After 5→3 | 1 | Skilled |
| After 3→1 | 0 | Basic |

The target has 169 screens and 2555 RNG calls; control 55 screens and 2555 calls.
All actual C and JS skill/ability/resource paths execute; no stubs or injected
internal state. Debug practice setup is distinguished from earning practice in
ordinary play. Slots never become negative in these recipes.

Ranger's see-invisible entry at level 15 has empty gain/loss strings. Attributes
pages at levels 14→15→14 show `You see invisible because of your experience.`
only in the middle view. The target has 187 screens / 2963 calls; the below-level
control has 63 screens / 2962 calls. This closes one silent-property observation
gap without assuming that matching messages prove every hidden property mask.

## Limits, provenance and reconciliation

All setup uses supported public debug commands: #levelchange, #enhance, and ^X.
The hero remains ordinary/non-polymorphed; loss is nonfatal. No combat, monster
drain, object effect, ring, death/resurrection, status expiry or denied-case route
is used to create the state. Normal startup generation still occurs. Surplus
spaces dismiss More and then produce matching zero-turn unknown-command messages.

The existing isolated recorder and frozen JS overlay are unchanged. Preinstalled
C binary provenance remains limited: no retained build attestation. Its digest and
adjacent source comparisons are in the earlier integration environment artifact,
whose bytes are a hashed dependency. Game/harness source bytes are unchanged from
that artifact's base; no C rebuild or silent strengthening is claimed.

This adds dynamic table crossings beyond PR #99's static declarations and selected
roundtrips in #106. It exercises actual dependencies omitted by #109's compiled
projection. The earlier level-one XP repair remains preserved, not a new finding.
The parked shared timer-engine trial is not settled by these zero-turn commands.

Confirmed new causes: 0. Explained negative: the 22 named paths and observed
projections. Duplicate/already-fixed findings: none resubmitted. Unresolved in
this batch: none. Remaining gaps: all legal role/race/attribute combinations,
non-debug practice/walking histories, direct post-MAXULEV growth, overlap masks
from other sources, and hidden state outside the observed projections. Follow
../COVERAGE.md for the next concrete frontier; no exhaustiveness claim is made.

## Reproduction and validation

From the repository root, with the existing supported recorder:

```
node diagnostics/divergence-evidence/hero-advancement/ability-traversals-20261029/run.mjs monk
node diagnostics/divergence-evidence/hero-advancement/ability-traversals-20261029/run.mjs martial-refund
node diagnostics/divergence-evidence/hero-advancement/ability-traversals-20261029/run.mjs silent-roundtrip
node diagnostics/divergence-evidence/hero-advancement/ability-traversals-20261029/verify.mjs
```

Use any recipes/ basename to run its row. Every final row expects exit 0. A fresh
output directory is required; archive paths are exclusive and not reusable.
Receipts retain actual commands, hashes and observed exits. Gzip hashes cover
stored compressed bytes; decompression yields original output bytes.

The preceding integration's 92 focused tests apply to identical game/test bytes;
they were not redundantly rerun. All 22 fresh differentials and the reached-state
verifier passed. Packaging/layout checks must pass at publication head. No full
Checkpoint, CI dispatch, score, merge or formal approval. Main owns gameplay edits.
Elapsed capture windows are recorded separately; they are not active compute.
