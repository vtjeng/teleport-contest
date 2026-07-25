# Teleport agent instructions

## Mission and source of truth

Build a maintainable JavaScript port of NetHack 5.0 that behaves correctly for
arbitrary valid seeds, datetimes, options, and input sequences.

- Treat `nethack-c/upstream/` as the game-behavior specification and
  `nethack-c/patches/` as the recorder's deterministic changes.
- Derive implementation from those sources. Development recordings are
  regression tests. Do not treat them as implementation specifications.
- Follow the milestone order in `ROADMAP.md`.

## Always-loaded safety rules

### Sealed local holdout

The files under `sessions/holdout/` are a fixed, sealed holdout.

- Outside the permitted aggregate commands below, never open, read, enumerate,
  search, parse, diff, summarize, copy, visualize, or expose their contents or
  filenames.
- Never send holdout files to another agent or tool. In particular, do not pass
  `sessions/holdout/` or any path below it to `frozen/ps_test_runner.mjs`, the
  Session Viewer, recording utilities, or audit processes.
- Use `node scripts/score-development.mjs` for routine scoring. It evaluates
  the fixed development set in a temporary workspace without replacing
  judge-owned files under `js/`.
- `node scripts/score-holdout.mjs --check` may verify the seal; it reports only
  the file count.
- Only the primary agent may run `node scripts/score-holdout.mjs`, and only
  after the user explicitly authorizes a holdout evaluation for a specific
  milestone. Use only its aggregate result to assess how well results on the
  development set carry over to the holdout set. Never use it to select or tune
  changes.
- Never inspect temporary files, caches, CI logs, or artifacts to recover
  per-session holdout results.
- Do not change or rotate the split without explicit user approval.

These rules rely on agent compliance. Filesystem access and public Git history
do not grant permission to inspect the holdout.

### Source-faithful implementation

- Port complete upstream functions or coherent subsystems. Preserve C control
  flow, state changes, integer behavior, evaluation order, input boundaries,
  rendering order, pseudorandom number generator (PRNG) calls, and upstream
  quirks.
- Keep modules and function names traceable to C or Lua. When the translation
  is not structurally obvious, comment with the upstream file and function.
- Never depend on a known session, seed, datetime, move string, trace position,
  expected output, corpus-wide total, recorded PRNG trace, or recorded screen.
- `js/fastforward.js` is temporary seed-specific replay scaffolding. Its
  trace-derived calls may stay unchanged or shrink, but must never grow. Remove
  a replay call only after source-faithful gameplay performs that call and its
  associated state changes; keep the gameplay implementation.
- Do not modify `js/isaac64.js`, `js/terminal.js`, or `js/storage.js`; the judge
  replaces them.
- Contestant code must remain plain JavaScript ES modules that run directly in
  Node 22+ and modern Chrome. Do not add WebAssembly, build steps, runtime
  filesystem or network access, subprocesses, native addons, or threads.
  Persist cross-segment state only through `input.storage`.

## Load the relevant instructions

Use progressive disclosure instead of carrying every procedure in every task.

| When | Read |
| --- | --- |
| Implementing or validating gameplay | `ROADMAP.md` and `.agents/validation.md` |
| Planning a qualifying behavior slice: one expected to span sessions, cross subsystems, or approach the shared review-window limit | `.agents/quality-workflow.md` and `.agents/implementation-checklist-template.md` |
| Continuing an active qualifying behavior slice | `.agents/implementation-checklist.md` |
| Committing implementation, checking review debt, or scheduling review | `.agents/quality-workflow.md` and `QUALITY.json` |
| Running fresh recordings, differentials, scans, scoring, browser checks, or an authorized holdout evaluation | `.agents/validation.md` |
| Running or recording a formal pass | `.agents/quality-workflow.md` and the named skill |

The referenced instructions are mandatory when their trigger applies.

## Implementation loop

1. Define a live boundary from an existing input or call through the next
   observable event. Include state changes, PRNG calls, messages, rendering,
   and persistence within that boundary.
2. Trace every reachable upstream branch and helper inside that boundary.
   Finish one complete path before starting partial implementations of several
   commands.
3. Add prerequisites only for named consumers in the current roadmap item.
   Connect each prerequisite to the named consumers that need it before the
   item closes. When a small prerequisite and its first consumer fit one
   reviewable chunk, implement and commit them together.
4. Keep each C state value in one canonical JavaScript location. Document each
   non-obvious mapping and the mapped state value's initialization, reset,
   mutation, and persistence boundaries. Duplicate state only when source
   behavior requires distinct values; centralize their updates and tests.
5. Generate large static tables deterministically from upstream C or Lua.
   Commit the generator, plain-JavaScript output, and a regeneration check.
   Translate behavioral control flow directly.
6. Validate the live path as required by `.agents/validation.md`. Focused unit
   tests can validate a prerequisite, but only a fresh end-to-end differential
   through the next boundary can close a behavior slice.
7. Follow `.agents/quality-workflow.md` for chunk size, quality-area assignment,
   commits, score evidence, review scheduling, and formal-pass records.

Keep implementation updates brief and specific: say what now matches upstream,
what remains, and what check comes next. Use each checklist, note, report, or
record format required by `.agents/quality-workflow.md` only when that file's
trigger applies.
