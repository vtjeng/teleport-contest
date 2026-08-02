# Implementation checklist schema

A behavior slice is a bounded implementation unit. Create
`.agents/implementation-checklist.json` for a behavior slice that is expected
to span multiple work sessions, cross subsystems, or reach about 500 changed
production lines across the quality areas it affects, which `QUALITY.json`
lists. The orchestrator owns the checklist and verifies every piece of
evidence recorded in it against the repository; a subagent's report of that
evidence is a claim to check.

The checklist is JSON because `scripts/audit-worktree.mjs prepare` reads it
as data: it refuses to prepare a pass while `mode` is not `ready-for-audit`,
while any entry's `status` is `missing` or `undecided`, or while
`commitChecked` differs from the range head. Judgment lives in the free-text
fields; the gate reads only `mode`, `commitChecked`, and each entry's
`status`.

## Fields

```json
{
  "mode": "implementation",
  "reason": "the specific missing work, or the evidence supporting readiness",
  "commitChecked": "full commit SHA the evidence applies to",
  "boundary": {
    "roadmapItem": "the current ROADMAP.md item",
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
