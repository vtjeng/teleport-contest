# Implementation checklist

A behavior slice is a bounded implementation unit. Create or replace
`.agents/implementation-checklist.json`, following the schema below, when a
behavior slice is expected to:

- span sessions;
- cross subsystems; or
- reach about 500 changed production lines across the quality areas it
  affects, which `QUALITY.json` lists.

Create the checklist as soon as a smaller slice grows to meet any of these
three conditions.

The orchestrator owns the checklist and verifies every piece of evidence
recorded in it against the repository; a subagent's report of that evidence
is a claim to check. Build the checklist's candidate entries from upstream
entry points, dispatch tables, catalogs, reachable helpers, and valid input
or configuration families. Cross-check those entries against JavaScript
stops, fallbacks, no-ops, and replay code. Maintain the list throughout
implementation. Passing samples do not prove completeness. When a fresh case
exposes an omitted path, add it and inspect related branches owned by the
same upstream function or subsystem.

Keep `mode` at `implementation` while any checklist entry is `missing` or
`undecided`. "Readiness" below defines that mode and the alternative,
`ready-for-audit`; `scripts/audit-worktree.mjs prepare` enforces both and the
`commitChecked` match as data. Commit a checklist update in the same commit
as the work it describes; a checklist-only commit is for opening or retiring
the file. Before a formal review pass, the checklist evidence must apply to
the commit being reviewed, or to an earlier one if no commit since then changed
code a pass would read. After the slice closes and its evidence is recorded
in existing trackers, remove the checklist or replace it for the next
qualifying slice. Smaller slices may keep equivalent information in their
commit messages and in the readiness attestations in `.agents/review.md`.

The checklist is JSON so `scripts/audit-worktree.mjs prepare` can check it
automatically. `prepare` will not run when `mode` is not `ready-for-audit`,
when any entry's `status` is `missing` or `undecided`, or when `commitChecked`
names neither the commit being reviewed nor an earlier one whose intervening
commits changed no code a pass would read.

`prepare` reads only those three fields. Everything else in the checklist is
prose for whoever opens it next, and no check reads that prose, so a wrong or
stale sentence there will not stop a pass.

## Fields

```json
{
  "mode": "implementation",
  "reason": "the specific missing work, or the evidence supporting readiness",
  "commitChecked": "full commit SHA the evidence applies to",
  "boundary": {
    "goalId": "the GOALS.json id this behavior slice belongs to",
    "startingCommit": "full commit SHA before this behavior slice",
    "startingEvent": "the input or game event that begins the behavior",
    "endingEvent": "the next observable prompt, screen, or termination",
    "validInputs": "commands, options, and configurations inside the boundary",
    "observables": "state, random-number calls, screens, cursors to match",
    "exclusions": "behavior after the ending event and other excluded paths"
  },
  "candidateListMethod": {
    "upstreamEntryPoints": "the controlling C or Lua functions",
    "dispatchTablesAndCatalogs": "tables, generated data, option families",
    "reachableHelpers": "how every reachable call and short-circuit was found",
    "javascriptCrossCheck": "each search command run for unsupported paths",
    "remainingLimits": "every known reason the list may still be incomplete"
  },
  "entries": [
    {
      "candidate": "upstream function or branch family",
      "reachability": "source condition permitting execution, and its position in the call and random-number order",
      "owner": "JavaScript file and function, or None",
      "effects": "effects before the ending event",
      "evidence": "source location and supporting proof",
      "status": "one of the six values below",
      "remaining": "work or proof still needed"
    }
  ],
  "missingWorkByOwner": [
    {
      "group": "owner or subsystem",
      "candidates": ["entries resolved together"],
      "next": "the next implementation or proof task"
    }
  ],
  "sourceReview": "attestation that every branch and helper reachable within the boundary was traced against upstream C or Lua, covering state and random-number order, with stubs, stops, and partial implementations identified"
}
```

## Status values

Assign exactly one status to every entry:

- `done`: the production JavaScript game path executes behavior that matches
  the upstream source, with supporting evidence.
- `no-effect-yet`: source tracing proves the valid path has no effect through
  the ending event.
- `later`: source tracing identifies the path's first effect after the ending
  event.
- `cannot-occur`: a specific upstream or valid-input condition prevents the
  path inside the boundary.
- `missing`: source tracing and a focused reproduction show implementation
  work remains.
- `undecided`: available evidence is insufficient to choose another status.

Prefer the most specific status the evidence supports; otherwise use
`undecided`. Passing samples do not prove completeness.

## Grouping missing work

Group `missing` and `undecided` entries into `missingWorkByOwner` when they
correspond to the same upstream function, name the same JavaScript owner,
share an initialization or persistence stage, or depend on one another. Order
groups so each prerequisite precedes the groups that use it. Use an empty
array only when no entry is `missing` or `undecided`.

## Readiness

Set `mode` to `ready-for-audit` only when every entry is `done`,
`no-effect-yet`, `later`, or `cannot-occur` with supporting evidence; the
source review in `sourceReview` covers everything reachable through the
ending event; the production game executes every `done` path; and every
reachable excluded branch stops before changing state, consuming randomness,
or producing output. Otherwise keep `mode` at `implementation` and state the
gap in `reason`. Validation commands are not recorded here: the readiness
note in `.agents/review.md` covers them, and a case expected to fail because
it belongs to future work is recorded as a deferred entry with
`npm run quality -- defer`.
