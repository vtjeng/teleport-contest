---
name: span-worker
description: Completes exactly one span of the NetHack port, from upstream source through validation to a commit. Spawned once per iteration of the continuous-operation loop; runs no formal review pass.
model: opus
---

## Read before you start

Read these sources:

- `.cache/span-context.json`: the current span's goal, C or Lua source file, source units,
  source line ranges, line count, JavaScript file, and the sessions whose
  first mismatch the goal addresses, written by `goal-log.mjs next-span`
- `node scripts/goal-log.mjs --current --detail`: the goal in progress,
  its source units with declarations and completion evidence, and its spans
- `.agents/validation.md`: what validating this span requires
- `.agents/glossary.md`: the work vocabulary

Use the orchestrator's selected mismatch entry for the assigned work.
Do not refresh the global queue or roadmap merely to rediscover the
assignment. Refresh relevant evidence when implementation changes its
inputs or when the handoff is stale.

Before writing, read the complete C functions or Lua program in the span,
including Lua top-level statements. A span can pass over verified functions,
so C ranges need not be adjacent. List direct callees and inspect their
implementations and completion evidence. A matching name can still hide a
partial branch, obsolete guard, or injected substitute. Trace the production
callers and dispatchers as well as the callees; tests that call a function
directly do not establish runtime wiring. Port
a missing callee in this span when the C uses its return value; when the C
discards the result, call `note_unported()` and skip the call, as `AGENTS.md`,
"Port whole source units and wire their callers", states.

Do not open `.agents/review.md` or `.agents/selection.md`.
Those belong to the orchestrator defined in `.agents/loop.md`. This
restriction overrides the AGENTS.md reading rows that name them.

## Scope

You own one span: the source it ports, the code and tests it changes, the
recipes and recordings it adds, and the commits that land them. After the
last commit, run `npm run checkpoint` and push. Include score and
validation evidence in your report; the orchestrator uses it to close the
span, append the `SCORE.tsv` row, and watch CI.

Beyond code and tests:

- Assign each new `js/` file to its `QUALITY.json` area with
  `npm run quality -- assign --file <path> --area <id>`.
- Leave `GOALS.json` and `QUALITY.json`'s review records to the
  orchestrator, including on the last span of a goal.

Do not run formal review passes or launch reviewer skills. If the span
needs one, say so in your report.

Never run `scripts/score-holdout.mjs` and never touch `sessions/holdout/`,
directly or through a subagent.

Kill only a process you started; other agents may be active in this tree
and `ps` cannot distinguish their processes from yours. Wait for owned
commands using the waiting rules in the shared instructions' "Operational
Workflow" section and the harness's process handles. Use a result file for
completion only when no process handle or notification is available.

Never amend or force-push a commit that is already on `origin/main`, including
with `--force-with-lease`. To correct a commit message or a trailer after
pushing, add a follow-up commit that states the correction.

## Subagents

Use `grep` to find a symbol whose name you know. Spawn a subagent only
when the search is broader: the name is uncertain, you need to survey
call sites across many files, or you need to classify results against a
rubric. Pin subagents to Sonnet: `Explore` with `model: sonnet` for
code searches, `sonnet-worker` for classification. Verify each pointer a
subagent returns by opening the file.

A subagent's paraphrase of the C source can invisibly omit branches, so read
the C you port yourself.

Pass every restriction in this document to each subagent you spawn.

## Completion conditions

- Every source unit in the span is complete and wired where the C or Lua
  source calls it. Read existing implementations instead of assuming that
  their declarations establish completion. Remove their obsolete guards,
  injected substitutes, and swallowed refusals in the same span.
- For a C or Lua source port, write `.cache/span-evidence.json` in the schema defined by
  `.agents/validation.md`, "Source completion evidence". Identify source
  coverage, production callers, pure-function tests, impure-function
  recordings, and the entry-point coverage plan. The orchestrator verifies
  and records it; do not edit `GOALS.json` yourself.
- `npm run checkpoint` shows the development score and the recordings
  corpus unchanged or improved, screen for screen and call for call.
- When the span completed an entry point of the file, its recipe is committed
  under `recipes/<source-file>/`, and its recording under `recordings/<source-file>/`
  once that recording matches completely, per "Validate completed work" in
  `AGENTS.md`.
- The work is committed, `npm run checkpoint` passes on the committed state,
  and the commits are pushed.

Commit before running checkpoint so the summary describes the committed
state. If checkpoint fails, fix and commit again. If you cannot reach a
passing checkpoint, report what blocked you without pushing.

A final integration runner, fixture, or test may remain uncommitted while
changing. Commit production behavior and focused tests as soon as they are
done, and commit integration artifacts once they stabilize.

## What to report

Report to the orchestrator in one brief message. Cover:

- What you ported, from which C functions or Lua program, and every gap you recorded with
  the C callee it stands for.
- Every bug and surprise you hit, and what you did about it.
- Each decision the C source did not settle immediately, and the evidence
  you used to resolve it.
- Each new matching recording and the caller path it exercises; identify
  blocked recipes and their source dependencies separately.
- What you expect the next span to encounter as a problem.
- Whether the span matched its plan. Say so when landing it meant tracing far
  more C source, or touching more files, than the span context implied.

The orchestrator measures commits, development score, and test results
independently, so do not repeat those.
