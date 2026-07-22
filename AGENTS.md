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
  performs the state changes associated with that call, remove the
  corresponding obsolete replay call. Keep the gameplay implementation.
  Across changes, trace-derived content may stay unchanged or shrink; it must
  never grow.
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

Use checks in proportion to risk. Formal correctness review may be batched, but
every implementation commit remains subject to it.

For each coherent implementation chunk:

1. Inspect the diff and run focused tests plus the relevant broader checks.
2. Commit the implementation and run `npm run quality` as a scheduling
   dashboard. Assign every new file under `js/` to exactly one quality area.
3. Directly review source behavior, PRNG and evaluation order, parsing, state
   ownership, persistence, input boundaries, and rendering against upstream.
   Small mechanical or test-only changes may rely on diff inspection and tests
   for immediate validation, but include them in the next scheduled correctness
   pass.
4. Add the exact code commit and score estimate to `SCORE.md`.

Run the heavier checks at these boundaries:

`QUALITY.json` is the executable source for the numeric thresholds below. When
those values change, update this policy text and the quality-status tests in the
same chunk.

- Three unreviewed implementation commits or 500 changed production lines in an
  affected quality area are an advisory batching checkpoint. Run a full
  correctness pass no later than ten unreviewed implementation commits or 1,000
  changed production lines under `js/` in an affected area. A pass is also due
  when a change alters a shared behavioral contract between quality areas,
  direct review or differential validation produces an unexplained mismatch, or
  before a release, pull request, authorized holdout evaluation, or closure of
  the current first-command milestone. Small cohesive fixes may stay batched
  until one of these conditions applies. Do not repeat the same formal pass
  until another threshold is met or the design materially changes.
- For the shared-contract trigger, a change crosses quality areas only when it
  changes state ownership or persistence, PRNG or evaluation order, lifecycle
  ownership, an input boundary, or another shared behavioral interface. Imports,
  exports, call sites, tests, and other wiring that consume an existing contract
  do not trigger a pass by themselves.
- At a formal milestone, run a `full` `$audit-diff-correctness` pass. Its
  correctness, readability, tests, and variable-trace finders are mandatory.
  Enable the performance finder only for a plausible hot-path or resource-cost
  change, and concurrency only for shared-state, asynchronous, reentrant,
  cancellation, retry, or cleanup risk.
- Run `$simplify-codebase` before every second scheduled correctness pass over
  production changes since the previous simplification frontier. Run it sooner
  when direct inspection finds duplication, accidental complexity, or stale
  scaffolding. Also run it before a pull request or release when production code
  has changed since its previous pass. A pass may conclude that no changes are
  warranted.
- Run `$audit-diff-clarity` after every second scheduled correctness pass, once
  correctness fixes have stabilized, over changes since the previous clarity
  pass. Also run it before requesting external review or making a release.
- Run `$copyedit-technical-prose` after every third scheduled correctness pass
  if published prose has changed since the previous copyedit. Also run it before
  externally publishing changed documentation, reports, or a pull request
  description. Tracker-only SHA and score entries do not trigger it. Do not run
  it on unchanged prose.
- After applying audit fixes, inspect the fix diff directly and run
  proportionate focused and broad validation. Do not launch an immediate delta
  review solely because audit fixes were applied. Keep the review frontier at
  the audited commit and record the exact fix commits as the start of the next
  correctness range. Repeat a formal pass immediately only when a fix
  independently meets one of the triggers above. No audit-fix tail may remain
  before a pull request, release, authorized holdout evaluation, or closure of
  the first-command milestone.

Pass rules:

- Native Codex subagents are available to both the primary session and fresh
  top-level `codex exec` processes. For formal passes, use them within the
  pass's independent top-level process: start each pass in a fresh process,
  then let it orchestrate the bounded subagents the skill requires. This keeps
  its judgment independent from implementation and other passes. Do not use
  `--ephemeral`: retain the rollout so agent activity and token usage can be
  inspected. Run with `--json` and preserve the session identifier and
  `turn.completed.usage` summary with the pass evidence. Give the process only
  the pass's scoped inputs.
- Give reviewers only the exact committed range or document snapshots, affected
  areas, relevant sources or artifacts, prior validation, decided non-issues,
  and applicable constraints. Require them to read `AGENTS.md`. Explicitly
  prohibit access to `sessions/holdout/` and never provide holdout material.
- For `$audit-diff-correctness`, use the skill's default context routing. Add
  explicit finder `audiences` only for exceptions or unusually large context;
  use `all` only for universal constraints. Pass compact validation summaries
  rather than logs or prior transcripts.
- Run formal skill passes in an isolated worktree pinned to the checked commit.
  Capture the complete output, including counts, findings, rejections,
  unverified items, warnings, and validation. The primary session reviews and
  validates proposed changes before integrating them; reviewers must not push.
- Freeze an audit's assigned scope while it runs. A later commit is outside that
  audit, but ordinarily requires review of only the later delta.
- Preserve source-shaped code, planned dependency seams, generated data, and
  temporary scaffolding until a source-faithful replacement implements the
  behavior and maintains the state. Simplification must preserve PRNG and
  evaluation order.
- Record correctness coverage with
  `npm run quality -- record-review ...`. Record simplification coverage with
  `npm run quality -- record-simplification ...`. Advance a frontier only
  through the exact integrated commit covered by the pass. Audit-fix commits
  remain review debt until the next correctness pass covers them. Prose passes
  are not ledger records.
- For a full review record, give correctness's exact range and include raw,
  deduplicated, confirmed, and applied counts; enabled optional finders; fixes
  and deferrals; unverified judgments; notable rejections and their
  counter-evidence; warnings; and validation. Include clarity separately only
  when it ran.
- Finish each formal milestone with `npm run quality -- --check`. Resolve review
  debt that has reached a batching threshold and resolve unassigned `js/` files
  then. A smaller audit-fix tail may remain except at the external and
  first-command boundaries listed above. Inspect simplification advisories, but
  do not manufacture cleanup merely to clear them.
  Historical `BASELINE` debt remains exempt until that area's first recorded
  pass.

## Generalization failure protocol

Run this protocol whenever both conditions hold:

- An authorized aggregate holdout evaluation indicates a transfer failure.
- A review of the source, code diff, and development evidence verifies that
  fixture-specific or hardcoded behavior passed development checks but failed
  to transfer.

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
