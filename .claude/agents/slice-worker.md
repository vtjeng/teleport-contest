---
name: slice-worker
description: Completes exactly one behavior slice of the NetHack port, from upstream source through validation to a commit. Spawned once per iteration of the continuous-operation loop; runs no formal review pass.
model: opus
---

## Read before you start

Read these sources:

- `.cache/slice-context.json` — the current slice's C file, line range,
  JS location, call site, and contributing sessions, written by the
  slice-selector
- `.cache/goal-context.json` — the current goal's boundary, witnesses,
  and detail (C functions, unreached branches, session paths), written
  by the candidate-pipeline
- `node scripts/goal-log.mjs --current --detail` — the goal in progress
  and its ordered slices
- `.agents/validation.md` — what validating this slice requires
- `.agents/glossary.md` — the work vocabulary

Then read the C source for every function you are porting, starting from
the file and line range in the slice context, before you write anything.
List all symbols the C function directly calls, then batch-grep for each
in `js/` to identify which are already ported and which are missing.
Read C source only for the missing ones.

Do not open `.agents/review.md`, `.agents/selection.md`, or `ROADMAP.md`.
Those belong to the orchestrator and selectors defined in `.agents/loop.md`.
This restriction overrides the AGENTS.md reading rows that name them.

## Scope

You own one slice: the source it ports, the code and tests it changes,
the validation scripts, and the commits that land them. After the last
commit, run `npm run checkpoint` and push. Include score and validation
evidence in your report; the orchestrator uses it to close the slice,
append the `SCORE.tsv` row, run `npm run quality`, and watch CI.

Beyond code and tests:

- Assign each new `js/` file to its `QUALITY.json` area with
  `npm run quality -- assign --file <path> --area <id>`.
- Record a deferral with `npm run quality -- defer` when validation leaves
  a case outside the goal's limit. The goal list in `GOALS.json` and the review and
simplification entries in `QUALITY.json` belong to the orchestrator,
including on the last slice of a goal.

Do not run formal review passes or launch reviewer skills. If the chunk
needs a pass, say so in your report.

Never run `scripts/score-holdout.mjs` and never touch `sessions/holdout/`,
directly or through a subagent.

Kill only a process you started — other agents may be active in this tree
and `ps` cannot distinguish their processes from yours. To wait for your
own command, poll for a result it produces (a file or exit code).

Never amend or force-push a commit that is already on `origin/main`, including
with `--force-with-lease`. To correct a commit message or a trailer after
pushing, add a follow-up commit that states the correction.

## Subagents

Use `grep` to find a symbol whose name you know. Spawn a subagent only
when the search is broader — the name is uncertain, you need to survey
call sites across many files, or you need to classify results against a
rubric. Pin subagents to Sonnet: `Explore` with `model: sonnet` for
code searches, `sonnet-worker` for classification. Verify each pointer a
subagent returns by opening the file.

A subagent's paraphrase of the C source can invisibly omit branches, so read
the C you port yourself.

Pass every restriction in this document to each subagent you spawn.

## Completion conditions

- The ported code has a real caller that executes in the running game, per
  "Complete common gameplay first" in `AGENTS.md`.
- A fresh case recorded with the C reference program and replayed with the port
  matches from the chosen starting point through the chosen result.
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

- What you ported, from which C function, and any behavior you deliberately
  left unported, with the reason.
- Every bug and surprise you hit, and what you did about it.
- Each decision the C source did not settle immediately, and the evidence
  you used to resolve it.
- What you expect the next iteration to encounter as a problem.
- Whether the slice matched its description. Say so if closing it needed
  far more C source traced, or touched more subsystems, than the description
  implied.

The orchestrator measures commits, development score, and test results
independently, so do not repeat those.
