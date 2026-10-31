# Testing

This page lists the checks the project runs, where their inputs live, how
to run each one and what it compares. It also lists the cases that still
fail. `.agents/validation.md` describes when the loop runs each check;
this page describes the checks themselves.

## Set up a fresh checkout

```sh
git submodule update --init --checkout --no-fetch -- nethack-c/upstream
npm ci
```

The source-pinned tests and the generators read the C and Lua source from
`nethack-c/upstream/`, so they fail until the submodule is checked out.

## Checks

| Check | Command | Inputs | What it compares |
| --- | --- | --- | --- |
| Unit and tooling tests | `npm test` | `scripts/*.test.mjs` (1,225 files), directly under `scripts/` | Source-pinned function results, short replays and tooling behavior. A test file outside `scripts/` fails the suite; one in a subdirectory of `scripts/` is neither run nor flagged. |
| One test file | `node --test scripts/<name>.test.mjs` | The named file | As above, for one file. `npm test` takes no file arguments; it accepts only `-- --shard <i>/<n>`. |
| Lint | `npm run lint` | `js/`, `scripts/` | The ESLint rules in `eslint.config.js`. The pre-commit hook runs it too. |
| Generated tables | `npm run check:<name>` (14 of them) | `scripts/generate-*.mjs` | Each table equals fresh output from the C or Lua source. Tests in `npm test` guard the generators without a `check:` script. |
| Static source checks | `npm run check:namespace-members`, `check:relative-imports`, `check:fixed-datetime`, `check:constants`, `check:duplicate-symbols` | `js/` | Import, namespace and constant rules. The last two are informational in Checkpoint. |
| Regression recordings | Part of Checkpoint | `recordings/**/*.session.json`, made by the C recorder from `recipes/` | Every RNG call and every 24x80 screen with its cursor. Animation frames are counted but do not fail a recording. Attributes on blank cells are ignored, as the judge ignores them. |
| Fixed sessions | `node scripts/score-development.mjs` | The 33 files in `sessions/` and the 11 in `sessions/holdout/` | The same comparison, scored by the judge's `frozen/ps_test_runner.mjs`. Checkpoint also fails if the score falls below `score-baseline.json`. |
| Synthetic batches | Hosted Checkpoint, or `node scripts/score-challenges.mjs --batch v<N> --output <file>` | `challenges/manifest.json` (v1), `challenges/manifests/` (v2 to v98), `challenges/cases/` | The same comparison over the 98 admitted batches. |
| Session scan | Part of Checkpoint | The fixed sessions | `scan-sessions.mjs --json`, plus `check-overread.mjs`, which fails if a replay reads past the end of its input. |
| Excluded commits | Part of `npm test` | `scripts/excluded-window.test.mjs` | Fails if game code repeats four consecutive lines that commits `736b8cd04..15ed31f2d` added. |
| Known failures | Part of `npm test` | `scripts/known-failures.test.mjs` | Recordings that do not match yet, reported as `# TODO` without failing the suite. |

## Full validation

The hosted **Checkpoint** workflow (`.github/workflows/checkpoint-trial.yml`)
runs every check above in parallel. It took 10 minutes in run
[41171076629](https://github.com/vtjeng/teleport-contest/actions/runs/41171076629).
A push to any `integration-checkpoint/**` branch starts it, except
`integration-checkpoint/admission/**`, which the Admission workflow handles.
It can also be started by hand (`workflow_dispatch`).

```sh
git push -- https://github.com/vtjeng/teleport-contest.git HEAD:refs/heads/integration-checkpoint/<name>
node scripts/fetch-hosted-checkpoint.mjs <run-id>
```

`fetch-hosted-checkpoint.mjs` needs `gh`. It imports the result into
`.git/checkpoint-results/<commit>/` and prints a summary. HEAD must be the
run's commit, and the tree must have no changes other than report files.

`node scripts/checkpoint-report.mjs [revision] [--json]` prints the archived
result for a commit (HEAD by default): each check's verdict, recording and
fixed-session totals, synthetic totals and every failing synthetic case.

`npm run checkpoint` runs the same checks except the synthetic batches, in a
new worktree of HEAD under `/tmp`. Nobody has run it since lint joined its
checks on 2026-10-12, and it may fail there because the new worktree has no
`node_modules`. Use the hosted run.

## Known failures

| Case | Observed failing on | First difference | Cause |
| --- | --- | --- | --- |
| `experiments/backlog-terminal-lava/recordings/mixed-fire-blind-fatal.session.json` | `3e01a48b4`, `ee49a85f0` | Tombstone screen, step 75, row 10. RNG, cursors and lengths match. | Killer attribution in `explode.c` `explode()` |
| `experiments/backlog-terminal-lava/recordings/lava-mounted-terrain.session.json` | `3e01a48b4`, `ee49a85f0` | RNG call 2,792 (step 93): C calls `rnd(4)` in `sink_into_lava()`, JS calls `rn2(12)` | `trap.c` `sink_into_lava()` while mounted |
| Synthetic `v32-version-build-options` (32/33 screens), `v35-version-feature-report` (35/36), `v48-short-version-command-attempt1` (1/2) | `d6c01204a` | The version text | The Linux recorder's Unix `VERSION_ID` differs from the macOS judge profile in `js/version.js` (`version.c` `getversionstring()`). Left unresolved on purpose; see `investigations/synthetic/`. |
| Synthetic `v35-gehennom-juiblex` (100/109 screens; RNG matches) | `d6c01204a` | Screens and cursors | A screen-buffer overflow in recorder patch 006 corrupted the recording. Not a JavaScript defect; see `investigations/synthetic/v35/v35-gehennom-juiblex.json`. |

Update this table in the commit that fixes or adds a known failure.

## Other workflows and scripts

- `lint.yml` runs ESLint on pushes to `main` and on pull requests.
- `admission.yml` runs batch admission on `integration-checkpoint/admission/**`
  pushes (`scripts/admission-ci.mjs`).
- Three workflows run only by hand: `coverage.yml` reports the `js/` lines
  that neither the tests nor the fixed sessions execute, `regex-resources.yml`
  measures startup regular-expression resources, and `score.yml` scores the
  fixed sessions.
- `npm run score` runs `frozen/score.sh`, the judge's scorer.
- `npm run test:all` runs the same tests as `npm test`.
- A full local `npm test` on `ee49a85f0` took 15 minutes on the development
  machine (13,876 tests on 2026-10-31).
