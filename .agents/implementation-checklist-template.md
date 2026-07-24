# Implementation checklist template

Use this template for a behavior slice that spans sessions, crosses
subsystems, or approaches the 500-line review-window limit. Copy it to
`.agents/implementation-checklist.md` and replace every prompt in square
brackets. The main agent owns the completed checklist and verifies evidence
provided by any helper.

This checklist is working implementation evidence. It does not replace source
review, tests, fresh differentials, the quality workflow, or a required audit.

## Boundary

- Roadmap item: [name the current `ROADMAP.md` item]
- Starting code commit: [full commit SHA before this implementation slice]
- Starting event: [name the input or game event that begins the behavior]
- Ending event: [name the next observable prompt, screen, termination, or other
  boundary]
- Valid inputs: [list the commands, options, configurations, and other input
  families in scope]
- Observables: [list state, random-number calls, screens, attributes, cursors,
  messages, persistence, and other results that must match]
- Exclusions: [list behavior outside the ending event or otherwise outside this
  slice]

## How the candidate list was built

Explain why the table below covers every meaningful source path that can run
before the ending event.

- Upstream entry points: [list the controlling C or Lua functions]
- Dispatch tables and catalogs: [list tables, generated data, option families,
  or descriptors that define possible cases]
- Reachable helpers: [state how calls and short circuits were followed through
  the ending event]
- JavaScript cross-check: [list searches for unsupported branches, explicit
  stops, fallbacks, no-ops, and replay code]
- Remaining limits: [state any reason the candidate list may still be
  incomplete; use `None` only after checking]

Choose rows according to stable upstream ownership or behavior. Give a path its
own row when it has different state changes, random-number use or order,
messages, rendering, persistence, or input handling. Small branches may share a
row when those behaviors and their implementation owner are the same.

## Status values

Assign exactly one status to every row:

- `done`: the real game executes behavior that matches upstream, with direct or
  fresh differential evidence;
- `no-effect-yet`: the path is valid, but it has no effect before the ending
  event;
- `later`: the path's first effect occurs after the ending event;
- `cannot-occur`: a specific upstream or valid-input condition prevents the
  path from running;
- `missing`: source tracing and a focused reproduction show that implementation
  work remains;
- `undecided`: available evidence is insufficient to choose another status.

A JavaScript guard, fallback, or passing development recording is evidence to
investigate. It does not by itself decide a row's status. State the exact
source condition for `no-effect-yet`, `later`, and `cannot-occur`.

## Implementation table

| Upstream function or branch family | Why it can run | JavaScript owner | State, randomness, and output | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| [candidate] | [source eligibility and ordering] | [module and function, or `None`] | [effects before the ending event] | [source location and test or differential] | [status] | [work or proof still needed] |

When a test or fresh differential exposes a candidate missing from the table,
add it and inspect related branches in the same upstream function or subsystem.
Fix the shared behavior rather than only the observed case.

## Missing work by owner

Group every `missing` and `undecided` row by the upstream function, state
contract, lifecycle, or dependency that should be implemented together. Order
the groups by their source dependencies.

1. [owner or subsystem]: [rows and the next complete behavior to implement]

Write `None` only when the implementation table contains no `missing` or
`undecided` entries.

## Validation

Record evidence for the exact committed head that will be reviewed.

- Commit checked: [full commit SHA]
- Focused tests: [commands and results]
- Full suite: [command and result]
- Generated-file checks: [commands and results, or why none apply]
- Fresh differentials: [checked-in recipe or script, varied dimensions, and
  matched random-number, screen, attribute, cursor, and persistence results]
- Development suite: [command and aggregate result]
- Quality check: [`npm run quality -- --check` result]
- Browser check: [result, or why repository policy does not require it]

## Readiness

Choose one:

- `Implementation`: at least one row is `missing` or `undecided`, or required
  validation for the exact committed head is incomplete.
- `Ready for audit`: every row has another supported status, all required
  validation passes at the exact committed head, the real game executes each
  `done` path, and no unsupported branch or replay code remains live before the
  ending event.

Current mode: [Implementation or Ready for audit]

Reason: [state the specific missing work or the evidence supporting readiness]
