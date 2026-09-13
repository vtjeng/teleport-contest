# Choosing what to implement next

Read this file when selecting or resuming a goal. `.agents/glossary.md`
defines the goal kinds; `.agents/loop.md` describes their execution.

## Choosing a goal

Run `node scripts/mismatch-queue.mjs`. Its single priority list includes C
and Lua sources, partially implemented functions, defects in existing code,
screen and cursor mismatches, and refusals whose source owner is unresolved.
A JavaScript declaration is inventory information, never completion evidence.

Take the highest-ranked candidate. Candidates are grouped by source owner
when known, then ranked by the upper bound on remaining screens and the
first mismatch step. A later blocker can consume the entire apparent gain;
these counts are not predicted gains or measured unmatched-screen counts.

Trace that candidate to the source before choosing the goal kind:

- Missing or partial C behavior: open a `file-port` for the responsible whole
  function or self-contained function family. Use `--from-function` and
  `--to-function` for a group, in C definition order. Include required callees
  and the production caller changes in the same span. Existing declarations
  do not justify skipping incomplete branches.
- Missing or partial Lua behavior: open a `lua-port` for the responsible
  `dat/*.lua` program. Include its top-level statements, helper functions,
  random-call order, and dispatch wiring. An existing `load_special()` or
  registered loader does not establish that the program is complete.
- A defect in implemented behavior: open a `divergence-fix` and follow
  `.agents/divergence.md`. Trace deterministic state changes as well as RNG
  and drawing; a screen mismatch need not be a rendering defect.
- An unresolved source owner: investigate the named session, identify its
  C or Lua owner, then queue one of the above. Do not skip the candidate
  because it lacks a C function annotation.

A lower-ranked candidate or a different owner requires `--selection-reason`
explaining the source-traced dependency or the condition blocking the higher
candidate. For a different or unresolved owner, also name the affected
session with `--sessions` (or `--session` for a divergence fix). This is an
implementation decision, not a request for user approval.

`queue-goal`, `open-goal`, `next-span`, and a divergence fix's `queue-span`
enforce selection against the current development and local-holdout queue. Reconsider priority
between spans. When an open
goal no longer addresses the highest candidate, preserve its work with
`park-goal --goal <id> --reason "<source-based reason>"` and select again.
Resume it with `open-goal --id <id>` when its priority permits.

Use `node scripts/goal-log.mjs roadmap` for fallback work only when the
mismatch queue is empty. Complete unverified C function groups and Lua
programs with reachable callers and useful validation before reference-build
inactive helpers. The port is complete only when all development and local-holdout sessions
match and all C functions and Lua programs have completion evidence.

## Opening the goal

Queue a C source port with:

```
node scripts/goal-log.mjs queue-goal --kind file-port --id <id> \
  --c-file <file.c> --from-function <first> --to-function <last> \
  --summary "<whole source behavior>" --sessions <development-session>
```

Omit the function bounds to cover the whole C file. A function family may be
selected in any file; it need not wait for a file-size threshold.

Queue a Lua program with:

```
node scripts/goal-log.mjs queue-goal --kind lua-port --id <id> \
  --lua-file <program.lua> --summary "<whole source behavior>" \
  --sessions <development-session>
```

Queue a divergence fix with `--kind divergence-fix`, `--c-file`, `--function`,
`--session`, and optionally `--step`; put the source trace in `--detail`.
A Lua program correction uses `lua-port` so its top-level behavior remains in
scope. The same source-tracing and replay requirements apply.

Open with `open-goal --id <id>`, then plan with `next-span --goal <id>`.
A source port plans every unit without recorded completion evidence,
including previously declared functions. Record the evidence as
`.agents/validation.md`, "Source completion evidence", specifies. Do not
rewrite historical goal or score rows to make their old name counts verified.

## Reading a mismatch

An RNG annotation identifies a call site, not necessarily the cause. Compare
its preconditions and the state established by earlier calls against the
upstream source. The last matching RNG call proves only that draw matched;
it does not prove that its caller or earlier deterministic behavior was right.
Lua annotations can identify both a helper and the program that called it.

For a screen or cursor mismatch, use `frozen/screen-decode.mjs` and the scan's
cell and cursor fields to locate the difference. Investigate messages, input
boundaries, game state, and drawing. Matching RNG does not imply matching game
state. A mismatch without a known step stays in the queue until investigated.

For a refusal, inspect the actual throw and the C or Lua branch it replaces.
Name the source function in the refusal message when it is missing, so later
scans can attribute it. Remove obsolete guards and injected placeholders when
their behavior lands; do not rename a refusal into a completed implementation.

A session can have multiple segments. The scorer concatenates their screens
and RNG logs positionally, so an early segment's output count can shift later
segments. Compare first mismatches and complete recordings as well as totals.
`score-development.mjs` is the authority on measured matching screens.

The queue ranks first failures from both fixed sets. Local-holdout session
identifiers start with `holdout/`; keep that prefix in `--sessions` or
`--session`. The default scan still reads development only; use
`scan-sessions.mjs --include-holdout --json` to reproduce the combined queue.
Scores remain separate, and the upper bounds are not predicted gains.
