# Explained-negative filter inventory and bounded extension

Base: accepted Main `128fba220b25c44e18c5907c15bab10b0e8ac918`.
This is tooling only; no new gameplay investigation, disposition rewrite,
publication, or runtime-equivalence claim.

## Existing executable rules versus notes

| Mechanism | Existing behavior | Boundary retained |
| --- | --- | --- |
| source-audit literal `#if 0` | Drops proved inactive message candidates; retains raw observations | Complete literal arm only; not a compiler-profile proof |
| discovery-hub active view | Removes current reviewed `explained_negative` leads from active view | Exact evidence/run, C gitlink, JS SHA, tool, config and source fingerprints required |
| structural helper/rename resolution | Resolves source/counterpart call edges | Does not establish arbitrary branch/message equivalence |
| Source-audit review JSON | Five exact evidence-keyed dispositions | Not blanket owner/function exclusions |
| Committed triage notes | Helper, inactive-profile, unsupported-object and matching-control explanations | Notes alone do not authorize reusable suppression |

Consulted `diagnostics/reviews/source-audit-20261026{.json,-notes.md}`.
Main's private log and selective Clang active-code pilot artifacts are unavailable
in this checkout. The swallowed-drop and artifact-saddle examples therefore do
not acquire new filters here. A string/call's mere existence elsewhere in JS,
a matching seed, invalid setup, or failure to reach a path is not a source proof.
Macro-profile inactivity and object/artifact-domain impossibility still need
complete, versioned profile/table/caller evidence before generalization.

## Incremental executable filter

`source-audit.mjs` now recognizes build-independent inactive literal branches:
commented literal false conditions, false `#elif 0` arms, and alternatives after
a literal true condition. Unknown macros remain unknown. Nested arms, comments,
and C escaped-newline splicing are handled; malformed nesting, incomplete
comments, trigraph/digraph uncertainty and unsupported expressions provide no
new suppression. The original literal-if-zero rule is unchanged and measured
separately.

Each filtered raw message retains rule/reason, directive line, raw source SHA256,
scanner SHA256 and policy/config SHA256. Source audit recomputes proofs on each
scan; existing source/tool/config identity checks invalidate cached reviews.
No regex or global JS literal presence becomes an equivalence rule. Runtime
replay, Lua matching cases, unresolved leads, invalid setup and missing coverage
retain their existing visible status. The hub carries `messageFilters` into
its source-audit coverage summary; it consumes the same filtered backlog.

Tests include adjacent active and unknown-macro messages, nested alternatives,
comments/splicing/malformed directives, irrelevant helper/string presence,
source-hash invalidation, and the pinned pickup.c commented-out message. Enabling
that arm restores its candidate, demonstrating that a nearby genuine omission
would remain visible.

## Frozen same-input measurement

`literal-filter-frozen-20261028.json.gz` retains all 1,788 raw candidate rows and
input hashes. `literal-filter-results-20261028.json` records archive hashes,
source identity, every added site and the separate counters. Both before/after
views use that exact single scan's source and JS-match results:

- 303 eligible C files; unchanged excluded files/symbols.
- Raw candidates: 1,788 message occurrences.
- Old literal-if-zero rule removes 35; baseline active occurrences: 1,753.
- Incremental rule removes 15; resulting active occurrences: 1,738.
- Of the 15: 12 non-gameplay diagnostics, 2 gameplay diagnostics, 1 gameplay
  message. These are not 15 discovered defects or 15 independent repair leads.
- Scan elapsed time: 36.844 seconds. No before/after runtime or compute-saving
  benchmark was performed.

Recommendation: integrate this narrow reduction through Main's full gates.
Do not claim the broader explanation-to-rule work complete: future helper or
table-domain rules require evidence unavailable here and adversarial controls
for changed callers, tables, configuration, and source. Keep those leads visible.
