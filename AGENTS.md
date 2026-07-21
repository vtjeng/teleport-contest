# Teleport agent instructions

## Objective and source of truth

Implement a maintainable JavaScript port of NetHack 5.0 that behaves
correctly for arbitrary valid seeds, datetimes, options, and input
sequences. Use `nethack-c/upstream/` as the game-behavior specification
and `nethack-c/patches/` for the recorder's deterministic changes.
Derive implementations from those sources. Use development recordings
only as regression tests.

## Sealed local holdout

The session files under `sessions/holdout/` form a fixed, sealed local
holdout. Agents may access them only through the aggregate wrapper under
the restrictions below.

- Do not otherwise open, read, enumerate, search, parse, diff, summarize,
  copy, or visualize their contents or filenames.
- Do not send holdout files to another agent or pass them directly to a
  tool. In particular, do not pass `sessions/holdout/` or a file below it
  to `frozen/ps_test_runner.mjs`, the Session Viewer, or recording
  utilities.
- Run `node scripts/score-development.mjs` for routine scoring. It selects
  the fixed development set directly under `sessions/` and scores it in a
  temporary workspace without overwriting judge-owned files under `js/`.
- `node scripts/score-holdout.mjs --check` may be used to verify the seal;
  it reports only the file count and does not evaluate any session.
- Only the primary agent may run `node scripts/score-holdout.mjs`, and only
  after the user explicitly authorizes that milestone's holdout evaluation.
  Use its aggregate output only to evaluate transfer. Do not use it to
  select or tune implementation changes.
- Do not inspect temporary files, caches, CI logs, or artifacts to recover
  per-session holdout results.
- Do not change or rotate the split without explicit user approval.

These restrictions depend on agent compliance. Technical access and public
Git history do not grant permission to inspect the sealed local holdout.

## Implementation rules

- Port complete upstream functions or coherent subsystems. Preserve C
  control flow, state changes, integer behavior, evaluation order, input
  boundaries, rendering order, and pseudorandom number generator (PRNG)
  call order, including upstream quirks.
- Keep modules and function names traceable to the corresponding C or Lua
  source. When a translation is not structurally obvious, add a code
  comment naming the upstream file and function.
- Never make implementation behavior depend on a known session, seed,
  datetime, move string, trace position, expected output, or corpus-wide
  total.
- Never derive contestant implementation calls, tables, constants, or
  screen text from recorded PRNG traces or screens.
- `js/fastforward.js` is temporary, seed-specific replay scaffolding. Do
  not add, rearrange, or retune its trace-derived calls. After
  source-faithful gameplay code naturally makes a replayed PRNG call and
  performs its associated state changes, remove the corresponding obsolete
  replay call. Keep the gameplay implementation. Across changes,
  trace-derived content may stay unchanged or shrink; it must never grow.
- Do not modify `js/isaac64.js`, `js/terminal.js`, or `js/storage.js`. The
  judge replaces them with canonical copies.
- Contestant code must remain plain JavaScript ES modules that run directly
  in Node 22+ and modern Chrome, without WebAssembly, a build step,
  filesystem or network access at runtime, subprocesses, native addons, or
  threads. Persist cross-segment state only through `input.storage`.

## Validation

- Diagnose with upstream source, focused development sessions, and the full
  development suite. Do not diagnose from the sealed local holdout.
- For nontrivial behavior, differentially test against the C recorder using
  newly chosen seeds, datetimes, options, and input sequences.
- Keep fresh recordings in the canonical `America/New_York` timezone. Recorder
  patch 001 carries the recording-time `tm_isdst` bit into fixed-datetime
  parsing; preserve the resulting `mktime()` normalization and the
  `recorderIsDst` metadata emitted for fresh differential recordings.
- Use `node scripts/diff-fresh.mjs --seed ...` for strict fresh-recording
  differentials. Its recipe inputs must contain replay inputs only, never
  recorded `steps`; do not weaken that boundary or its sealed-path checks.
- Verify PRNG logs, 24×80 screens, and cursor positions. Verify browser
  behavior for browser-facing changes.
- End each completed work chunk with an estimated leaderboard screen score
  formatted `<shown> shown + <hidden> hidden = <total> total`. Use current
  published aggregates when available; otherwise estimate from development
  and fresh differential evidence and state the uncertainty. Do not run the
  sealed local holdout merely to produce this estimate.
- After committing a completed implementation chunk, add its exact code commit
  SHA and estimate to `SCORE.md`, together with the evidence and uncertainty.
  Tracker-only commits do not need their own score entry.
- Prefer source-faithful subsystem improvements to isolated score gains. If
  a development gain does not transfer at an authorized holdout milestone,
  review the implementation against upstream and test the general behavior
  with fresh C recordings.

## Quality workflow

Before marking an implementation chunk complete:

1. Commit one coherent implementation and run `npm run quality` to see review
   and simplification debt. Assign every new file under `js/` to exactly one
   quality area. `QUALITY.json` stores the tracking and enforcement bases, area
   assignments, thresholds, and pass records. From those records and Git, the
   dashboard derives per-area commit counts, changed-file and changed-line
   totals, worktree state, and separate review and simplification frontiers; a
   frontier is the last exact commit recorded as covered for that area and pass
   kind.
2. Have a fresh Claude Code instance run and validate any due
   `/simplify-codebase` pass, then commit accepted changes. A simplification pass
   is due when an area reaches its configured commit budget. Run one earlier when
   accidental complexity, duplication, or temporary scaffolding has visibly
   accumulated.
3. For a `full` review, have a fresh Claude Code instance run
   `/audit-diff-clarity` after simplification stabilizes. Use a clean checkout of
   the intended range and supply its background, decided non-issues, prior review
   context, and repository conventions. Read the full output and warnings; apply
   confirmed fixes in the primary session, validate, and commit them.
4. Have a different fresh Claude Code instance run the final
   `/audit-diff-correctness` review against the relevant upstream source. Resolve
   confirmed findings, add regression tests for reusable failure classes, commit
   the fixes, and repeat the affected audit.
5. Run the relevant broader checks. Record each `review` or `simplification`
   ledger pass only through the exact commit it covered. Later commits touching
   its areas remain new debt: repeat affected review audits before completion,
   and repeat simplification when its budget is exhausted or the complexity
   conditions in step 2 make it due. Commit the `QUALITY.json` update and finish
   with `npm run quality -- --check`.

Pass rules:

- For these four checks, use Claude Code instead of the default Codex-subagent
  workflow: `/audit-diff-correctness`, `/audit-diff-clarity`,
  `/simplify-codebase`, and `/copyedit-technical-prose`. Run every pass in a
  separate, fresh Claude Code instance. Do not reuse an instance or give it the
  parent conversation.
- Give Claude only the exact committed range or document snapshots, affected
  areas, relevant sources or artifacts, prior validation, decided non-issues,
  and applicable constraints. Require it to read `AGENTS.md`. Never provide
  sealed holdout material, and explicitly prohibit access to
  `sessions/holdout/`.
- Capture the complete skill output, including counts, findings, rejections,
  unverified items, and warnings. Correctness and clarity checks are read-only.
  Run simplification in an isolated worktree, limited to its named scope and
  tests, and prose editing on scratch copies. The primary Codex session verifies
  and applies accepted changes. Prose passes are not quality-ledger records.
- While a Claude Code check runs, freeze its assigned scope. The primary session
  may continue on a descendant commit outside that scope. Changes made after the
  checked commit are not covered by the result and must not be included in its
  recorded frontier. If later work touches a reviewed area, review that new delta
  before completion.
- Use a `light` `/audit-diff-correctness` audit only for a small, coherent diff,
  and add `/audit-diff-clarity` when readability is in doubt. A `full` review is
  required at milestones and before marking a large or cross-subsystem change
  complete; it includes both `/audit-diff-clarity` and a `full`
  `/audit-diff-correctness` audit.
- In a `full` review record, identify the clarity and correctness audits
  separately. For each audit, include its exact range; raw, deduplicated,
  confirmed, and applied counts; applied fixes and confirmed deferrals;
  unverified judgments; notable rejections; warnings; and validation. Preserve
  the counter-evidence for notable correctness rejections.
- The configured simplification commit budget applies separately to each area;
  commits touching the area's paths count toward it, and a dirty affected
  worktree counts as one additional unit. Shorten the budget when passes find
  meaningful cleanup or debt grows; lengthen it after repeated, well-scoped
  no-change passes. Record the reason and update
  `thresholds.simplificationCommits` in `QUALITY.json`.
- Remove accidental complexity, stale compatibility layers, or obsolete replay
  scaffolding only after a source-faithful replacement makes them unnecessary.
  Preserve code, data, comments, APIs, and dependency seams needed by planned
  ports. Relevant unit, differential, and development checks must preserve
  behavior and PRNG order.
- Record each quality-ledger pass with `npm run quality -- record-review ...` or
  `npm run quality -- record-simplification ...`. The command derives the prior
  frontier and rejects a selected area when its configured `js/` paths have
  uncommitted changes. Record `changed` when a pass changes code; use `no-change`
  only after a deliberate pass. Include the method and validation in its
  evidence. A simplification pass may span several coherent commits. Use
  `--dry-run` to preview a record and `npm run quality -- --help` for full syntax.
- `npm run quality -- --check` blocks completion for post-enforcement review
  debt, an exhausted simplification budget, or an unassigned tracked or
  unignored file under `js/`. Historical `BASELINE` debt is exempt independently
  for review and simplification until that area's frontier for the pass kind
  advances.
- After a substantial batch of changes to `AGENTS.md`, `README.md`, or other
  published technical prose, have a fresh Claude Code instance run
  `/copyedit-technical-prose` once the content stabilizes. Do not schedule it by
  implementation commit or run it on unchanged prose.

## Generalization failure protocol

Run this protocol whenever an authorized aggregate holdout evaluation
indicates a transfer failure and a review of the source, code diff, and
development evidence verifies that fixture-specific or hardcoded behavior
passed development checks but failed to transfer:

1. Stop tuning against the aggregate holdout result.
2. Spawn a fresh subagent to analyze the responsible change, why the
   development checks accepted it, and which source-faithful approach
   should replace it. Give that subagent the code diff, relevant upstream
   source, development evidence, and aggregate holdout signal only. It must
   not inspect the sealed local holdout or per-session holdout results.
3. Replace the shortcut and add a development or newly recorded test that
   covers the general failure class.
4. Update `AGENTS.md` with a concise, reusable rule that would have
   prevented the failure. This update is required for every verified
   incident. Exclude incident-specific scores, session filenames, and
   progress notes.
