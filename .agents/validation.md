# Validation and scoring

Read this file when implementing gameplay or running recordings,
differentials, scans, scoring, browser checks, or an authorized holdout
evaluation. The sealed-holdout rules in `AGENTS.md` always apply.

## Routine validation

- Diagnose from upstream source, focused development sessions, and the full
  development suite. Never diagnose from the sealed holdout.
- For each coherent implementation chunk, inspect the diff and run focused
  tests plus the full suite before committing. Use
  `npm run checkpoint -- --focus <test-file>` to run focused tests, the full
  suite, generated-data checks, and the development score in one command.
- For nontrivial behavior, differentially test against the C recorder using
  newly chosen seeds, datetimes, options, character configurations, and input
  sequences.
- Verify the PRNG log, complete 24x80 screens and attributes, cursor positions,
  and persisted state through the next observable boundary.

Launch a browser only when browser-specific code, DOM/CSS, input/storage, or
browser-only presentation changes. Shared engine or glyph-output changes do
not need browser validation when the renderer is unchanged and focused tests
cover its input contract.

## Fresh differentials

- Record fresh cases in the canonical `America/New_York` timezone. Recorder
  patch 001 carries the recording-time `tm_isdst` bit into fixed-datetime
  parsing. Preserve the resulting `mktime()` normalization and emitted
  `recorderIsDst` metadata.
- Run strict cases with `node scripts/diff-fresh.mjs --seed ...`.
- Recipes contain replay inputs only. They must never contain recorded `steps`,
  weaken sealed-path checks, or reference the sealed holdout.
- Before closing a nontrivial slice or milestone, run a reproducible matrix
  that varies inputs relevant to the change. Cover ordinary cases and rare
  branches identified from source; exhaustive combinations are unnecessary.
- Check in any matrix intended for repeated use as a recipe or script that
  calls `scripts/diff-fresh.mjs`.

When exploring many cases, use
`node scripts/scan-fresh.mjs <scan-plan.json>`. It groups cases by their first
JavaScript error or PRNG, screen, or cursor mismatch and retains one original
case per group. Add newly exposed paths to the implementation checklist and
inspect sibling branches owned by the same upstream subsystem. Run individual
cases only to reduce or diagnose a selected group.

When a fresh differential fails:

1. Keep the original failing recipe.
2. Remove irrelevant options and inputs until the case is minimally useful.
3. Locate the responsible behavior in upstream source.
4. Add a regression test for the general behavior.
5. Implement from source, never from the observed trace.

## Score evidence

End each completed implementation chunk with an estimate formatted:

`<shown> shown + <hidden> hidden = <total> total`

Use current published aggregates when available. Otherwise estimate from
development and fresh-differential evidence and state the uncertainty. Never
run the sealed holdout merely to produce an estimate.

After committing a completed implementation chunk, add its exact code commit
SHA, estimate, evidence, and uncertainty to `SCORE.md`. Tracker-only commits do
not need their own score entry.

Prefer source-faithful subsystem improvements to isolated score gains. If an
authorized aggregate holdout evaluation fails to transfer, first compare the
source, implementation diff, and development evidence. Run the protocol below
only if that review confirms that fixture-specific or hardcoded behavior passed
development checks but failed to transfer.

## Generalization failure protocol

1. Stop tuning against the aggregate holdout result.
2. Spawn a fresh subagent to analyze the responsible change, why development
   checks accepted it, and which source-faithful approach should replace it.
   Give the subagent only the code diff, relevant upstream source, development
   evidence, and aggregate holdout signal. It must not inspect the sealed
   holdout or per-session results.
3. Replace the shortcut and add a development or newly recorded test for the
   general failure class.
4. Add a concise, reusable rule to `AGENTS.md` that would have prevented the
   failure. Every verified incident requires this update. Exclude
   incident-specific scores, session filenames, and progress notes.
