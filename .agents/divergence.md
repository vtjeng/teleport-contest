# Resolving a divergence inside ported code

A divergence fix is the goal kind that `.agents/selection.md`, "Choosing a
goal", rule 2 opens: a development session's first mismatch falls inside a C
function that is already ported whole, so a difference inside ported code
causes it rather than a gap. This document defines that workflow. A file port
covers a recorded gap or an unported function, and both stay outside it.

A divergence fix is complete when the session's first mismatch has moved past
the function the goal named, or the record is classified `machine-local` or
`excluded` with a recorded reason.

## Reference documents

- `AGENTS.md`: source authority, holdout access, session-specific hardcoding,
  protected files, and escalation;
- `.agents/selection.md`: the divergence queue and how to read an entry;
- `.agents/validation.md`: recording, replaying, and comparing cases;
- `.agents/loop.md`: the loop that opens and closes the goal;
- `.agents/scoring.md`: score evidence and holdout-result recording.

## Workflow

### 1. Establish the inventory

Run `node scripts/score-development.mjs` and save its development screen
counts as the before measurement. Run `node scripts/divergence-queue.mjs` for
the session's entry: the step, the kind, and the C function it names.

### 2. Confirm and record the divergence

Reduce the session to the shortest useful reproduction. Confirm in a fresh process
with:

```sh
node frozen/ps_test_runner.mjs \
  --worker-session=sessions/<development-session>.session.json
```

Queue the goal with `node scripts/goal-log.mjs queue-goal --kind
divergence-fix`, naming the C file, the function, the session, and the step.
Put the record in its `--detail`:

- the development session, segment, and input step;
- whether the first mismatch is screen or RNG, and its position;
- the exact upstream C file, function, branch, and preconditions;
- the JavaScript owner suspected of causing the mismatch.

Queue the first span with `queue-span`, naming the functions the fix will
read, and write `.cache/span-context.json` with the same fields
`next-span` writes: `goal`, `cFile`, `functions`, `lineRange`, `cLines`,
`jsFile`, and `sessions`.

### 3. Investigate and implement

Verify the divergence against the upstream C source before changing
JavaScript. Confirm the exact C call site, its preconditions, and the last
call the port got right.

For suspected shared state, trace initialization, cloning, saving, restoring,
and reset behavior before changing the caller.

Implement the smallest source-backed general fix. Do not special-case a
session, seed, date, input sequence, screen, RNG position, or expected total.

### 4. Validate and remeasure

Add focused source-pinned tests. Compare messages, complete screen contents
and attributes, cursor positions, RNG calls, and persisted state through the
step the goal named and beyond it.

Validate in this order:

- syntax checks;
- focused unit and source-pinned tests;
- focused C/JavaScript differential replay;
- fresh-process confirmation;
- a refreshed divergence queue.

Run `npm run checkpoint` after every commit that claims the fix. When the fix
changes the development score, the goal's `SCORE.tsv` rows record it; a fix
committed outside a goal appends a row with `event=divergence` and `label=`
naming the session and root cause, following `.agents/scoring.md`.

### 5. Report completion

Report the before-and-after screen counts from `node
scripts/score-development.mjs`, the session's new first mismatch if any, and
the record's final state. Use measurements from the commands, not
worker-reported figures.

## Record lifecycle

Each divergence record has exactly one current state:

- `observed`: the queue names the mismatch, but the cause has not been
  source-traced;
- `verified`: fresh replay reproduces the mismatch and identifies the matching
  C branch and preconditions;
- `in progress`: a verified divergence has been assigned to a worker with a
  defined write set;
- `resolved`: fresh replay confirms that the session's first mismatch has
  moved past the function the goal named;
- `machine-local`: the mismatch depends on machine-local behavior that cannot
  be corrected without hardcoding;
- `blocked`: the cause is verified, but progress requires a user decision or
  external change;
- `excluded`: evidence shows that the mismatch is a gap or an unported
  function, which a file port covers.

The normal transitions are:

```text
observed -> verified -> in progress -> resolved
                 ├────────────────→ machine-local
                 └────────────────→ blocked

observed or verified -> excluded
```

Preserve the verification evidence in the record when its state changes. A
failed fix remains `in progress` while it is being corrected or returns to
`verified` when investigation resumes.

Mark a divergence `resolved` only when:

- the C and JavaScript source paths are aligned;
- focused tests pass;
- the session's first mismatch is past the function the goal named;
- no temporary diagnostics remain in scored code.

Mark a divergence `machine-local` only when the input does not define the
machine-local value. Document the source of that value and do not hardcode a
recorded path, banner, or environment-specific value.

Mark a divergence `excluded` when fresh replay or source verification shows
that a gap or an unported function causes it. Record the reason and the file
port that covers it.

## Process safeguards

- Run each development session in a fresh Node process. Segments within one
  session must still share their intended storage.
- Before treating a screen or saved-state mismatch as a game bug, check
  whether the protected `js/isaac64.js`, `js/terminal.js`, or `js/storage.js`
  files have local edits. The scorer replaces these files with its own
  versions, so test with the same setup. If the mismatch comes from the test
  setup rather than the game, mark it `excluded` and record why. If the setup
  prevents you from checking a real game mismatch, mark it `blocked` until the
  setup is fixed. Never edit the protected files as a gameplay fix.
- If a mismatch appears only after another session runs, reproduce it in a
  fresh process before changing gameplay code.
