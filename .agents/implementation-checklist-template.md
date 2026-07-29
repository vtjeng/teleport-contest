# Implementation checklist template

A behavior slice is a bounded implementation unit. Use this template for a
behavior slice that is expected to span multiple work sessions, cross
subsystems, or reach about 500 changed production lines across the quality
areas it affects, which `QUALITY.json` lists. Copy it to
`.agents/implementation-checklist.md` and replace every prompt in square
brackets. The main agent owns the completed checklist and verifies evidence
provided by any helper.

This checklist is a working record of implementation evidence. It supplements
the required source review, tests, fresh differentials, the workflows in
`.agents/workflow.md` and `.agents/review.md`, and any required formal review
pass. A fresh
differential is a strict comparison between a newly recorded C run and the
corresponding JavaScript run.

## Boundary

- Roadmap item: [name the current `ROADMAP.md` item]
- Starting code commit: [full commit SHA before this behavior slice]
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

Explain how the relevant upstream C or Lua sources were traced to build an
exhaustive candidate list and how the table under "Implementation table"
establishes whether each candidate can run before the ending event.

- Upstream entry points: [list the controlling C or Lua functions]
- Dispatch tables and catalogs: [list tables, generated data, option families,
  or descriptors that define possible cases]
- Reachable helpers: [state how every reachable call, helper, and short-circuit
  branch was traced through the ending event]
- JavaScript cross-check: [record each search command run for unsupported
  branches, explicit stops, fallbacks, no-ops, and replay code, and what each
  command returned]
- Remaining limits: [state every known reason the candidate list may still be
  incomplete; use `None` only after completing the `Upstream entry points`,
  `Dispatch tables and catalogs`, `Reachable helpers`, and
  `JavaScript cross-check` entries in this section]

## Status values

Assign exactly one status to every row:

- `done`: the production JavaScript game path executes behavior that matches
  upstream, with evidence from executing its live consumer, meaning the
  production JavaScript game code that calls that path, or from a fresh
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

When transferring a boundary coverage survey (the output defined in
`.agents/skills/survey-boundary-coverage/SKILL.md`) into this checklist, use
the corresponding checklist labels: `source-inert` maps to `no-effect-yet`,
`outside-boundary` to `later`, `unreachable` to `cannot-occur`, `confirmed-gap`
to `missing`, and `unverified` to `undecided`. Map `covered` to `done` only when
its evidence also shows that the production JavaScript game executes the path;
otherwise use `undecided`. Every row must still satisfy the status definitions
in this section.

A JavaScript guard, fallback, or passing development recording is a reason to
investigate a row. It does not by itself decide a row's status. State the
exact source condition for `no-effect-yet`, `later`, and `cannot-occur`.

## Implementation table

Organize each row around the upstream function or subsystem that controls a
path, or around one coherent behavior shared by several branches. Give a path its
own row when it has different state changes, random-number use or order,
messages, rendering, persistence, or input handling. Small branches may share a
row when those behaviors and their `JavaScript owner` are the same.

A `JavaScript owner` entry names the JavaScript file that already corresponds
to the upstream source file, and the function inside that file. Naming an
owner does not authorize creating a new file. See "Keep each source file's
port in one place" in `AGENTS.md`.

| Upstream function or branch family | Reachability and ordering | JavaScript owner | State, randomness, and output | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| [candidate] | [source condition that permits or prevents execution, and the path's position in the upstream call sequence and in the random-number call order] | [JavaScript file and function, or `None`] | [effects before the ending event] | [source location and supporting proof; include a test or fresh differential when the row's status requires one under "Status values"] | [status] | [work or proof still needed] |

When a test or fresh differential exposes a candidate missing from the table,
add it and inspect related branches in the same upstream function or subsystem.
Implement the shared upstream behavior exercised by the observed case.

## Missing work by owner

Group every `missing` and `undecided` row into work that should be resolved
together. Put rows in the same group when they meet any of these conditions:

- they correspond to the same upstream function;
- they name the same JavaScript owner and follow the same update rules for
  its state;
- they share an initialization, reset, or persistence stage; or
- one depends on another, so they must be implemented together.

Order the groups so each prerequisite comes before the groups that use it.

1. [owner or subsystem]: [the candidate names from the implementation
   table's `Upstream function or branch family` column, and the next
   implementation or proof task]

Write `None` only when the implementation table contains no `missing` or
`undecided` entries.

## Validation

Record evidence for the exact committed head that will be reviewed.

- Commit checked: [full commit SHA]
- Source review: [at the commit recorded in `Commit checked`, every branch and
  helper reachable within the boundary through the ending event traced against
  upstream C or Lua, including state and random-number call order; JavaScript
  stubs, explicit stops, partial implementations, and missing subsystems
  identified]
- Focused tests: [commands and results]
- Full suite: [command and result]
- Generated-file checks: [commands and results, or why none apply]
- Fresh differentials: [checked-in recipe or script using
  `scripts/diff-fresh.mjs`; confirmation that recipes contain replay inputs only
  and no recorded `steps`; executed commands and results; the input dimensions
  varied across the recorded C runs, and the value used for each; and
  confirmation that random-number logs, complete 24×80 screens and attributes,
  cursors, and persisted state match]
- Development suite: [command and aggregate result]
- Quality check: [`npm run quality -- --check` result]
- Browser check: [result, or why `.agents/validation.md` does not require one]

## Readiness

Choose one:

- `Implementation`: at least one row is `missing` or `undecided`, or required
  validation for the exact committed head is incomplete.
- `Ready for audit`: all of the following hold:
  - every row is `done`, `no-effect-yet`, `later`, or `cannot-occur` and has
    supporting evidence;
  - source review traces every branch and helper reachable through the ending
    event against upstream C or Lua;
  - all required validation passes at the exact committed head;
  - the production JavaScript game executes every `done` path;
  - no unsupported branch or replay code can execute before the ending event;
  - every reachable branch excluded from the slice stops before changing
    state, consuming randomness, or producing output.

Current readiness: [`Implementation` or `Ready for audit`]

Reason: [state the specific missing work or the evidence supporting readiness]
