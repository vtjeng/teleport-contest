# Implementation checklist template

Use this template for a behavior slice, meaning a bounded implementation unit,
that is expected to span multiple work sessions, cross subsystems, or reach
about 500 changed production lines across its affected quality areas. Copy it to
`.agents/implementation-checklist.md` and replace every prompt in square
brackets. The main agent owns the completed checklist and verifies evidence
provided by any helper.

This checklist is a working record of implementation evidence. It supplements
the required source review, tests, fresh differentials, `AGENTS.md` quality
workflow, and any required audit. A fresh differential is a strict comparison
between a newly recorded C run and the corresponding JavaScript run.

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
- Exclusions: [list behavior after the ending event and any other excluded
  branches; for each reachable exclusion, cite evidence that it does not change
  state, consume randomness, or produce output before the ending event]

## How the candidate list was built

Explain how the relevant upstream C or Lua sources were used to build an
exhaustive candidate list and how the table establishes whether each candidate
can run before the ending event.

- Upstream entry points: [list the controlling C or Lua functions]
- Dispatch tables and catalogs: [list tables, generated data, option families,
  or descriptors that define possible cases]
- Reachable helpers: [state how every reachable call, helper, and short-circuit
  branch was traced through the ending event]
- JavaScript cross-check: [list searches for unsupported branches, explicit
  stops, fallbacks, no-ops, and replay code]
- Remaining limits: [state every known reason the candidate list may still be
  incomplete; use `None` only after completing the upstream candidate derivation
  and JavaScript cross-check described above]

Organize each row around the upstream function or subsystem that controls a
path, or around one coherent behavior shared by several branches. Give a path its
own row when it has different state changes, random-number use or order,
messages, rendering, persistence, or input handling. Small branches may share a
row when those behaviors and their implementation owner are the same.

An owner names the JavaScript file that already corresponds to the upstream
source file, and the function inside it. It does not authorize a new file. See
"Keep each source file's port in one place" in `AGENTS.md`.

## Status values

Assign exactly one status to every row:

When transferring a boundary coverage survey into this checklist, use the
corresponding checklist labels: `source-inert` maps to `no-effect-yet`,
`outside-boundary` to `later`, `unreachable` to `cannot-occur`, `confirmed-gap`
to `missing`, and `unverified` to `undecided`. Map `covered` to `done` only when
its evidence also shows that the real game executes the path; otherwise use
`undecided`. Every row must still satisfy the checklist definition below.

- `done`: the production JavaScript game path executes behavior that matches
  upstream, with evidence from executing its live consumer or from a fresh
  differential;
- `no-effect-yet`: source tracing proves that the valid path has no effect through
  the ending event but does not classify a known post-boundary effect;
- `later`: source tracing identifies the path's first effect after the ending
  event;
- `cannot-occur`: a specific upstream or valid-input condition prevents the
  path from running;
- `missing`: source tracing and a focused reproduction show that implementation
  work remains;
- `undecided`: available evidence is insufficient to choose another status.

A JavaScript guard, fallback, or passing development recording is evidence to
investigate. It does not by itself decide a row's status. State the exact
source condition for `no-effect-yet`, `later`, and `cannot-occur`.

## Implementation table

| Upstream function or branch family | Reachability and ordering | JavaScript owner | State, randomness, and output | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| [candidate] | [source condition that permits or prevents execution, and ordering] | [module and function, or `None`] | [effects before the ending event] | [source location and supporting proof; include a test or fresh differential when required] | [status] | [work or proof still needed] |

When a test or fresh differential exposes a candidate missing from the table,
add it and inspect related branches in the same upstream function or subsystem.
Implement the shared upstream behavior exercised by the observed case.

## Missing work by owner

Group every `missing` and `undecided` row into work that should be resolved
together. Put rows in the same group when they correspond to the same upstream
function, use the same state owner and update rules, share an initialization,
reset, or persistence stage, or must be implemented together because one
depends on another. Order the groups so each prerequisite comes before the
groups that use it.

1. [owner or subsystem]: [rows and the next implementation or proof task]

Write `None` only when the implementation table contains no `missing` or
`undecided` entries.

## Validation

Record evidence for the exact committed head that will be reviewed.

- Commit checked: [full commit SHA]
- Source review: [at the commit above, every branch and helper reachable within
  the boundary through the ending event traced against upstream C or Lua,
  including state and random-number call order; JavaScript stubs, explicit
  stops, partial implementations, and missing subsystems identified]
- Focused tests: [commands and results]
- Full suite: [command and result]
- Generated-file checks: [commands and results, or why none apply]
- Fresh differentials: [checked-in recipe or script using
  `scripts/diff-fresh.mjs`; confirmation that recipes contain replay inputs only
  and no recorded `steps`; executed commands and results; varied dimensions;
  and confirmation that random-number logs, complete 24×80 screens and
  attributes, cursors, and persisted state match]
- Development suite: [command and aggregate result]
- Quality check: [`npm run quality -- --check` result]
- Browser check: [result, or why repository policy does not require it]

## Readiness

Choose one:

- `Implementation`: at least one row is `missing` or `undecided`, or required
  validation for the exact committed head is incomplete.
- `Ready for audit`: every row is `done`, `no-effect-yet`, `later`, or
  `cannot-occur` and has supporting evidence; source review traces every branch
  and helper reachable through the ending event against upstream C or Lua; all
  required validation passes at the exact committed head; the production
  JavaScript game executes every `done` path; no unsupported branch or replay
  code can execute before the ending event; and every reachable branch excluded
  from the slice stops before changing state, consuming randomness, or producing
  output.

Current mode: [Implementation or Ready for audit]

Reason: [state the specific missing work or the evidence supporting readiness]
