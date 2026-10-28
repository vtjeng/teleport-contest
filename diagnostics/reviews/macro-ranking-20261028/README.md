# General macro-correspondence ranking hint

`called-macro-helper-v1` lowers source-audit rank by 10 when all these lexical
conditions hold: the candidate is a resolved extra JS helper edge; its name,
ignoring underscores and case, matches a function-like macro definition in C
include headers; and the paired C owner actually calls that macro. This builds
on the reviewed `tip_ok -> isContainer` example from PR #8. It is stronger than
global helper-name presence, but **does not prove equivalence**. The JS helper
could still be wrong, or the macro inactive, or the argument mapping different.

Every raw candidate, status, classification, review history and active-view
membership is retained. Only the existing numeric rank changes. The hint stores
its version, delta, explanation, limitations and macro definition locations/
source hashes. The hub carries the hint into canonical JSON and reports counts.
The auditor already gives extra helpers a -30 adjustment; this adds -10 only to
this more specific subset, not another -30 to all helpers. No new 0–3 priority
schema, suppression list or inferred equivalence status is introduced.

Existing audit identity includes C headers, C/JS sources, recorder/configuration,
mappings and tool bytes; those invalidate evidence when changed. Header edits
recompute/remove the hint, rather than preserving a prior numeric adjustment.
The hint's version and fixed delta are part of the hashed tool implementation.

## Frozen measurement

Applied the pure hint to the existing 12,537-lead input from PR #14, run
`0d5255ecbeb6fd9acac2`, base `128fba220b25c44e18c5907c15bab10b0e8ac918`.
Input hash and exact before/after entries are in `measurement.json`. The same
C gitlink provides the macro catalog and paired owner calls. This is an
incremental ranking comparison on frozen candidates, not a fresh corpus scan
or a claim about today's candidate denominator.

- Raw/active records: 12,537 before and after.
- Newly filtered: **0**. Newly deprioritized: **165**.
- `tip_ok -> isContainer`: -26 to -36.
- Two deterministic applications produced identical results.
- PR #7's known unicorn possessive-format message lead retains its original
  rank/status and stays active. No compute-saving claim is made.

The previous exact-negative decisions were not applied in this measurement.
Thus 165 rank adjustments must not be added to the seven proved suppressions
as though they were equivalent outcomes. Lua/manual claims and numeric
constant mismatches are outside this rule's candidate kind.

## Validation and limits

Tests run the real auditor on a tiny C/JS fixture with an intentionally wrong
macro-shaped helper. It is demoted but remains unreviewed and active. Removing
the macro restores its original rank and changes its evidence key; mapping and
header changes invalidate identity. Name-only, no-call, object-like macro,
comment-only definition, stub, message, C-only edge and constant controls do
not receive a hint. The hub preserves the explanation. Focused audit/hub/hint
tests and lint pass.

PR #16 supplies usable exact decisions: its compact run projection and six
rows successfully classify 6 to 0 active in that projection (two causes:
unused scatter flags and remapped burning-oil tag). This verifies import
usability, not the unavailable full-run denominator. Their value-use proofs do
not justify automatically downranking arbitrary numeric mismatches, so no
numeric heuristic was added. PR #17's manual random-line integer-division
negative remains unbound; PR #13's reported real-division defect is a reason
not to generalize truncation as harmless. Neither is covered by this hint.

The first scoped-decision batch is published separately as PR #14 at
`d1e6140cb3ebb8223471757d8b07cdf6a40360ce`. The PR #12 pending-run batch remains
separate. This patch contains no gameplay edits, source evidence archives or
new recordings. Main owns integration gates.
