# Resolving zeroing divergences

The standard loop is defined in `.agents/loop.md`. It selects fail-closed
gameplay boundaries as goals, implements them in behavior slices, and measures
their closure.

This document outlines the divergence-resolution loop, which fixes every
currently reported zeroing divergence.

A standard-loop candidate identifies C behavior to implement. A zeroing
divergence is different: it is an earlier screen or RNG mismatch that occurs
before a standard-loop candidate's boundary and causes `rankCandidates()` to
zero that session's `unlocks` contribution.

The divergence effort is complete when every recorded zeroing divergence is
resolved, classified as `machine-local`, or excluded with a recorded reason.
No record may remain in `observed`, `verified`, `in progress`, or `blocked`.

When the effort is complete, report:

```text
No active zeroing divergences remain.

Screens: <before matched>/<before total> -> <after matched>/<after total>
Change: <signed matched-screen delta>
Machine-local: <count>
Excluded: <count>
```

Resolving a divergence restores a candidate's eligibility for the standard
loop. It does not implement or close the candidate's gameplay boundary. The
human handles the standard-loop goal and slice lifecycle after this report.

## Scope

A qualifying divergence must have:

- a screen or RNG mismatch;
- a mismatch position before a standard-loop candidate's boundary;
- a corresponding zeroed `unlocks` contribution.

Unsupported boundaries, ordinary unported gameplay, cursor-only mismatches,
and known serializer differences are outside this workflow.

Cursor positions, messages, persisted state, and complete screen attributes
remain validation data, but they do not create a zeroing divergence.

## Reference documents

These reference documents provide additional information on repository rules,
candidate selection, validation, loop terminology, and score recording:

- `AGENTS.md` — binding repository rules, including source authority, holdout
  access, session-specific hardcoding, worktree edits, protected files, and
  escalation;
- `.agents/selection.md` — standard-loop candidates, the zeroing rule,
  candidate ranking, and the development-session census;
- `.agents/validation.md` — recording, replaying, and comparing development
  cases;
- `.agents/loop.md` — the standard-loop definition and lifecycle. The human
  handles goal and slice transitions after this process reports its result;
- `.agents/scoring.md` — score evidence and holdout-result recording. It does
  not determine divergence state.

## Workflow

### 1. Establish the inventory

Record the current standard-loop candidates and their forecasts separately from
the divergence inventory. Run `node scripts/score-development.mjs` and save
its development screen counts as the before measurement.

Run `node scripts/scan-sessions.mjs` to obtain the development-session
candidate inventory and its `Divergence candidates` section.

`scan-sessions.mjs` currently replays the complete scan in one Node process.
Treat its divergence rows as inventory and triage, not as final isolated
evidence.

### 2. Confirm and record divergences

Preserve each selected failing development session or recipe. Reduce it to the
shortest useful witness without removing the behavior under investigation.

Confirm each selected record in a fresh process with:

```sh
node frozen/ps_test_runner.mjs \
  --worker-session=sessions/<development-session>.session.json
```

`node scripts/score-development.mjs` is the authoritative aggregate scorer. It
invokes the per-session worker mode but reports aggregate metrics rather than
every first-mismatch detail. If the first screen or RNG position is not
available, use a temporary development-only diagnostic wrapper and remove it
before scoring.

Create a divergence record only when the earlier screen or RNG mismatch zeroes
a standard-loop candidate. If fresh evidence does not satisfy that condition,
set the record to `excluded`, record the reason, and remove it from the active
divergence set.

Each divergence record must identify:

- the affected standard-loop candidate and boundary;
- the development session and segment;
- the input step that reaches the mismatch;
- whether the first mismatch is a screen or RNG mismatch;
- the first mismatch position;
- the fact that the candidate contribution was zeroed;
- the exact upstream C file, function, branch, and preconditions;
- the JavaScript owner suspected of causing the mismatch.

Messages, screens, and RNG traces locate likely source areas. They do not prove
causality without matching C-path analysis.

### 3. Investigate and implement

Verify the divergence against the upstream C source before changing
JavaScript. Confirm the candidate boundary, the mismatch's position relative to
that boundary, the exact C call site, and its preconditions.

Cluster divergences by shared ownership. Run independent investigations in
parallel when their source areas and write sets do not overlap. Serialize work
that shares lifecycle state, cloning, storage, RNG, rendering, or input
handling.

For suspected shared state, trace initialization, cloning, saving, restoring,
and reset behavior before changing the caller.

Implement the smallest source-backed general fix. Do not special-case a
session, seed, date, input sequence, screen, RNG position, or expected total.

### 4. Validate and remeasure

Add focused source-pinned tests and a fresh end-to-end differential witness.
Compare messages, complete screen contents and attributes, cursor positions,
RNG calls, and persisted state through the affected candidate boundary.

Keep diagnostic hooks behind an explicit diagnostic option. Diagnostic fields
must not alter clone shape, persisted state, or production behavior. Remove
temporary instrumentation before scoring.

Validate divergence resolution in this order:

- syntax checks;
- focused unit and source-pinned tests;
- focused C/JavaScript differential replay;
- fresh-process confirmation;
- refreshed divergence census.

Recompute the census after every shared fix and after every fix that removes an
earlier mismatch. Update affected candidate forecasts only through the
standard loop.

When a coherent group of fixes is ready, run the full development scorer and
the repository's normal test and review gates as required by the reference
documents. Do not close standard-loop candidates or goals from this workflow.

### 5. Report completion

When no active divergence records remain, run
`node scripts/score-development.mjs` and report the before-and-after screen
counts using the completion format at the top of this file.

Use measurements produced by the commands, not worker-reported figures. The
human decides what standard-loop candidate or goal to handle next.

## Record lifecycle

Each divergence record has exactly one current state. States are mutually
exclusive:

- `observed`: the census reports a zeroed candidate contribution, but the cause
  has not been source-traced;
- `verified`: fresh replay reproduces the screen or RNG mismatch, confirms that
  it occurs before the candidate boundary, and identifies the matching C branch
  and preconditions;
- `in progress`: a verified divergence has been assigned to a worker with a
  defined write set;
- `resolved`: fresh replay confirms that the original mismatch no longer
  zeroes the affected candidate;
- `machine-local`: the mismatch depends on machine-local behavior that cannot
  be corrected without hardcoding;
- `blocked`: the cause is verified, but progress requires a user decision or
  external change;
- `excluded`: evidence shows that the record was not a zeroing divergence.

Preserve the verification evidence in the record when its current state
changes.

A failed fix remains `in progress` while it is being corrected or returns to
`verified` when investigation resumes. It does not become `resolved` merely
because JavaScript changed.

The normal transitions are:

```text
observed -> verified -> in progress -> resolved
                 ├────────────────→ machine-local
                 └────────────────→ blocked

observed or verified -> excluded
```

A screen or RNG mismatch at the candidate boundary is not a zeroing
divergence. The standard loop handles the boundary itself.

Mark a divergence `resolved` only when:

- the C and JavaScript source paths are aligned;
- focused tests pass;
- the end-to-end witness no longer diverges before the candidate boundary;
- a fresh census confirms that the original mismatch no longer zeroes the
  candidate;
- no temporary diagnostics remain in scored code.

Mark a divergence `machine-local` only when the input does not define the
machine-local value. Document the source of that value and do not hardcode a
recorded path, banner, or environment-specific value.

Mark a divergence `excluded` when fresh replay or source verification shows
that it does not satisfy the zeroing-divergence definition. Record the reason
and remove it from the active set.

Do not close the associated standard-loop candidate when its divergence is
resolved. The human decides when that candidate or goal is ready to close.

## Process safeguards

- Run each development session in a fresh Node process. Segments within one
  session must still share their intended storage.
- Before treating a screen or saved-state mismatch as a game bug, check
  whether the protected `js/isaac64.js`, `js/terminal.js`, or `js/storage.js`
  files have local edits. The scorer replaces these files with its own
  versions, so it is important to test the game with the same setup. If the
  mismatch comes from the test setup rather than the game, mark it `excluded`
  and record why. If the setup prevents you from checking a real game
  mismatch, mark it `blocked` until the setup is fixed. Never edit the
  protected files as a gameplay fix.
- Treat `node scripts/scan-sessions.mjs` as an inventory and triage tool because
  its complete scan is not isolated per session.
- If a mismatch appears only after another session runs, reproduce it in a
  fresh process before changing gameplay code.
- Keep diagnostic fields and temporary instrumentation from changing production
  state.
- Do not manage standard-loop goals, slices, or closure state from this
  workflow.
