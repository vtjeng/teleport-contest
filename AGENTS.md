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

Use checks in proportion to risk. Routine chunks do not require the full
multi-agent workflow.

For each coherent implementation chunk:

1. Inspect the diff and run focused tests plus the relevant broader checks.
2. Commit the implementation and run `npm run quality` as a scheduling
   dashboard. Assign every new file under `js/` to exactly one quality area.
3. Run a fresh `light` `/audit-diff-correctness` pass when the change affects
   source behavior, PRNG or evaluation order, parsing, state ownership,
   persistence, input boundaries, or rendering. Small mechanical or test-only
   changes may rely on direct review and tests.
4. Add the exact code commit and score estimate to `SCORE.md`.

Run the heavier checks at these boundaries:

- At a major milestone, or before completing a large or cross-subsystem change,
  run `/simplify-codebase`, `/audit-diff-clarity`, and a `full`
  `/audit-diff-correctness` pass. Run simplification before the audits.
- Run simplification earlier when duplication, accidental complexity, or stale
  scaffolding is visible. The configured commit budget is a scheduling signal
  between milestones, not a reason to interrupt a coherent chunk.
- After a substantial batch of published technical prose stabilizes, run
  `/copyedit-technical-prose` once. Do not run it on unchanged prose.
- After applying an audit fix, review the new delta. Repeat the full-range audit
  only when the fix changes the design or invalidates earlier conclusions.

Pass rules:

- Use a fresh, independent session for each skill pass. Use the review backend
  selected for the active session; otherwise use the default skill workflow.
  Do not reuse a reviewer or provide the parent conversation.
- Give reviewers only the exact committed range or document snapshots, affected
  areas, relevant sources or artifacts, prior validation, decided non-issues,
  and applicable constraints. Require them to read `AGENTS.md`. Explicitly
  prohibit access to `sessions/holdout/` and never provide holdout material.
- Run formal skill passes in an isolated worktree pinned to the checked commit.
  Capture the complete output, including counts, findings, rejections,
  unverified items, warnings, and validation. The primary session reviews and
  validates proposed changes before integrating them; reviewers must not push.
- Freeze an audit's assigned scope while it runs. A later commit is outside that
  audit, but ordinarily requires review of only the later delta.
- Preserve source-shaped code, planned dependency seams, generated data, and
  temporary scaffolding until a source-faithful replacement owns its behavior
  and state. Simplification must preserve PRNG and evaluation order.
- Record formal review and simplification passes with
  `npm run quality -- record-review ...` and
  `npm run quality -- record-simplification ...`. Advance a frontier only
  through the exact integrated commit covered by the pass. Prose passes are not
  ledger records.
- For a full review record, identify clarity and correctness separately. Include
  each exact range; raw, deduplicated, confirmed, and applied counts; fixes and
  deferrals; unverified judgments; notable rejections and their counter-evidence;
  warnings; and validation.
- Finish each major milestone with `npm run quality -- --check`. Resolve review
  debt, exhausted simplification budgets, and unassigned `js/` files then.
  Historical `BASELINE` debt remains exempt until that area's first recorded
  pass.

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
