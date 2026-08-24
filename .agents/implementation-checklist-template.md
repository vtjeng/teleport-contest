# Implementation checklist

A behavior slice is an implementation unit with a defined starting event,
ending event, and set of valid inputs (the `boundary` object below captures
these). Create or replace
`.agents/implementation-checklist.json`, following the schema below, when a
behavior slice is expected to:

- span agent sessions;
- cross subsystems (change code under more than one upstream function or
  owner group); or
- reach about 500 changed production lines across the quality areas listed
  in `QUALITY.json`.

Create the checklist as soon as a smaller slice grows to meet any of these
three conditions.

The orchestrator owns the checklist and verifies every piece of evidence
recorded in it against the repository, including evidence that a subagent
reported. Build the checklist's candidate entries from upstream
entry points, dispatch tables, catalogs, reachable helpers, and valid input
or configuration families, then cross-check those entries against JavaScript
code that blocks unported paths (stops), substitutes placeholder behavior
(fallbacks and no-ops), or handles replay. Maintain the list throughout
implementation: passing samples do not prove completeness, so when a fresh
case exposes an omitted path, add it and inspect related branches owned by
the same upstream function or subsystem.

Keep `mode` at `implementation` while any checklist entry is `missing` or
`undecided`; the Readiness section below defines when `mode` changes to
`ready-for-audit`. Commit each checklist update in the same commit as the
work it describes, except when creating a new checklist or removing a
completed one. Before a formal review pass (described in `.agents/review.md`),
the checklist evidence must apply to the commit being reviewed, or to an
earlier commit if no subsequent commit changed code that the review covers.
After the slice closes and its evidence is recorded in existing trackers,
remove the checklist or replace it for the next qualifying slice. Smaller
slices may keep equivalent information in their commit messages and in the
readiness attestations in `.agents/review.md`.

The checklist is JSON so `scripts/audit-worktree.mjs prepare` can check it
automatically. `prepare` reads `mode`, each entry's `status`, and
`commitChecked`. It runs only when `mode` is `ready-for-audit`, every
entry's `status` is `done`, `no-effect-yet`, `later`, or `cannot-occur`, and
`commitChecked` names the commit being reviewed, or an earlier commit if the
code under review has not changed since. Everything else in the checklist is
prose for whoever opens it next; automated checks do not read it, so a wrong
or stale sentence does not block a pass.

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
- `no-effect-yet`: source tracing proves the candidate path does not produce
  an observable effect before the ending event.
- `later`: source tracing identifies the path's first effect after the ending
  event.
- `cannot-occur`: a specific condition in the upstream source or in the set
  of valid inputs makes the path unreachable within the boundary.
- `missing`: source tracing and a reproduction (a recorded case or test that
  exercises the path) show that implementation work remains.
- `undecided`: available evidence is insufficient to choose another status.

Prefer the most specific status the evidence supports; otherwise use
`undecided`.

## Grouping missing work

Group `missing` and `undecided` entries into `missingWorkByOwner` when they
correspond to the same upstream function, name the same JavaScript owner,
share initialization code or persist state through the same mechanism, or
depend on one another. Order groups so each prerequisite precedes the groups
that depend on it. Leave the array empty only when every entry has reached
`done`, `no-effect-yet`, `later`, or `cannot-occur`.

## Readiness

Set `mode` to `ready-for-audit` only when every entry is `done`,
`no-effect-yet`, `later`, or `cannot-occur` with supporting evidence; the
source review in `sourceReview` covers everything reachable through the
ending event; the production game executes every `done` path; and every
reachable excluded branch stops before changing state, consuming randomness,
or producing output. Otherwise keep `mode` at `implementation` and state the
gap in `reason`. Validation commands are not recorded in the checklist; the
readiness note in `.agents/review.md` covers them. A case expected to fail
because it belongs to future work is recorded as a deferred entry with
`npm run quality -- defer`.
