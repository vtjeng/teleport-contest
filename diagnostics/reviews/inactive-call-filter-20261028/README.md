# All-occurrences inactive C call filter

`all-literal-inactive-calls-v1` extends the existing literal-branch proof parser
to **C-only call-edge warnings**. It filters a warning only when every lexical
call to that target in every same-owner definition and every aggregated warning
site is proven inside a complete, build-independent inactive literal arm.
The source path must match, the callee must resolve unambiguously, and all
represented owners must resolve to the same callee identity. First-site guards,
name similarity and JS implementation presence are not proof.

Mixed active/dead occurrences, unknown conditions, malformed directive nesting,
ambiguous callees and other candidate kinds stay untouched. Literal false arms,
false elif arms and alternatives excluded by a literal true arm reuse the
existing parser and its conservative exclusions. Unknown nested conditions
inside a proven inactive outer arm cannot enable that arm. Platform-specific
conditions such as Unix guards are not evaluated by this rule.

Filtered warnings retain IDs, original sites/details/ranks, per-occurrence
branch reasons and directive lines, source path/hash and source/tool/config
provenance in `report.filteredCallEdges`. The scanner backlog omits those proved
inactive warnings; previous backlog entries remain as unobserved history via
existing merge behavior. Active views do not treat unobserved rows as current
warnings. No `explained_negative` status is fabricated. Changing the source
recomputes the proof and can restore the warning; current review fingerprints
invalidate through existing source/tool/config identities. The hub reports
`callFilters` separately from ranking hints and message filters.

## Frozen incremental measurement

No new scan. Reused the source-audit backlog underlying PR #14 (12,537 warnings)
and C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`. The frozen eligible
C-only input projection is `input.json.gz` (100,095 bytes); full input hash,
original counts and all proofs are preserved in `measurement.json`.

- New proved call-edge filters: **55**, leaving **12,482** warnings.
- New priority demotions in this change: **0**.
- Macro and delegation ranking hints remain separate (165 and 2 in their
  earlier frozen measurements). Prior exact reviewed decisions were not applied.
- This is an incremental frozen-input comparison, not today's full hub count;
  PR #5's additional message filters are not reapplied to this old denominator.
- Repeated applications and pinned-C reproduction agree. No compute savings claimed.

Matches include PR #24's three disabled AC-achievement calls (one warning) and
PR #28's disabled shield-weight call. PR #9's inactive prayer reset also fits.
None of these proofs applies to adjacent live behavior, other achievement or
weight calls, or the independent prayer/occupation interruption divergences.

```sh
node diagnostics/reviews/inactive-call-filter-20261028/reproduce.mjs
node --test scripts/inactive-call-filter.test.mjs scripts/delegation-ranking.test.mjs scripts/macro-ranking.test.mjs scripts/source-audit.test.mjs scripts/discovery-hub.test.mjs
```

The reproduction loads the original C revision from the submodule Git object
store, not mutable working files. Tests cover mixed calls in both orders,
active else branches, unknown conditions, malformed frames, adjacent arms,
same-name callees across files, ambiguous resolution and mismatched source
paths. A real audit fixture verifies raw proof retention, survival of a missing
live call, and restoration plus source identity change when the guard is enabled.

This patch is stacked on PR #26; it contains no gameplay changes or recordings.
Main owns integration. New incoming evidence is queued separately rather than
silently widening this proof rule.
