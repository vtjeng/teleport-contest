# Resolving zeroing divergences

A zeroing divergence is a screen or RNG mismatch that occurs before a
standard-loop candidate's boundary and causes `rankCandidates()` to zero that
session's `unlocks` contribution. This document defines the workflow that
resolves them.

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

## Scope

A qualifying divergence must have:

- a screen or RNG mismatch;
- a mismatch position before a standard-loop candidate's boundary;
- a corresponding zeroed `unlocks` contribution.

Unsupported boundaries, ordinary unported gameplay, cursor-only mismatches,
and known serializer differences are outside this workflow.

## Reference documents

- `AGENTS.md` — source authority, holdout access, session-specific hardcoding,
  protected files, and escalation;
- `.agents/selection.md` — standard-loop candidates, the zeroing rule, and
  candidate ranking;
- `.agents/validation.md` — recording, replaying, and comparing cases;
- `.agents/loop.md` — the standard-loop lifecycle;
- `.agents/scoring.md` — score evidence and holdout-result recording.

## Workflow

### 1. Establish the inventory

Run `node scripts/score-development.mjs` and save its development screen
counts as the before measurement. Run `node scripts/scan-sessions.mjs` to
obtain the candidate inventory and its `Divergence candidates` section.

### 2. Confirm and record divergences

Reduce each selected failing development session to the shortest useful
witness. Confirm in a fresh process with:

```sh
node frozen/ps_test_runner.mjs \
  --worker-session=sessions/<development-session>.session.json
```

Create a divergence record only when the earlier screen or RNG mismatch zeroes
a standard-loop candidate. If fresh evidence does not satisfy that condition,
set the record to `excluded` and record the reason.

Each divergence record must identify:

- the affected candidate and boundary;
- the development session, segment, and input step;
- whether the first mismatch is screen or RNG, and its position;
- the exact upstream C file, function, branch, and preconditions;
- the JavaScript owner suspected of causing the mismatch.

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

Validate divergence resolution in this order:

- syntax checks;
- focused unit and source-pinned tests;
- focused C/JavaScript differential replay;
- fresh-process confirmation;
- refreshed divergence census.

Recompute the census after every shared fix and after every fix that removes an
earlier mismatch. When a coherent group of fixes is ready, run the full
development scorer and the repository's test and review gates.

After each committed divergence fix that changes the development score, append
a `SCORE.tsv` row with `event=divergence` and `label=` naming the affected
session and root cause. Follow the append procedure in `.agents/scoring.md`.

### 5. Report completion

When no active divergence records remain, run
`node scripts/score-development.mjs` and report the before-and-after screen
counts using the completion format at the top of this file. Use measurements
from the commands, not worker-reported figures.

## Record lifecycle

Each divergence record has exactly one current state:

- `observed`: the census reports a zeroed candidate contribution, but the cause
  has not been source-traced;
- `verified`: fresh replay reproduces the mismatch, confirms that it occurs
  before the candidate boundary, and identifies the matching C branch and
  preconditions;
- `in progress`: a verified divergence has been assigned to a worker with a
  defined write set;
- `resolved`: fresh replay confirms that the original mismatch no longer
  zeroes the affected candidate;
- `machine-local`: the mismatch depends on machine-local behavior that cannot
  be corrected without hardcoding;
- `blocked`: the cause is verified, but progress requires a user decision or
  external change;
- `excluded`: evidence shows that the record was not a zeroing divergence.

The normal transitions are:

```text
observed -> verified -> in progress -> resolved
                 ├──────��─────────→ machine-local
                 └────────────────→ blocked

observed or verified -> excluded
```

Preserve the verification evidence in the record when its state changes. A
failed fix remains `in progress` while it is being corrected or returns to
`verified` when investigation resumes.

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
that it does not satisfy the zeroing-divergence definition. Record the reason.

Resolving a divergence restores a candidate's eligibility for the standard
loop. It does not close the candidate's gameplay boundary; the standard loop
handles that.

## Process safeguards

- Run each development session in a fresh Node process. Segments within one
  session must still share their intended storage.
- Before treating a screen or saved-state mismatch as a game bug, check
  whether the protected `js/isaac64.js`, `js/terminal.js`, or `js/storage.js`
  files have local edits. The scorer replaces these files with its own
  versions, so test with the same setup. If the
  mismatch comes from the test setup rather than the game, mark it `excluded`
  and record why. If the setup prevents you from checking a real game
  mismatch, mark it `blocked` until the setup is fixed. Never edit the
  protected files as a gameplay fix.
- If a mismatch appears only after another session runs, reproduce it in a
  fresh process before changing gameplay code.
