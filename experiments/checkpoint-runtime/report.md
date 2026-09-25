# Checkpoint runtime

This report measures how much four commits, 22c0f801 through 40c4472c,
shortened `npm run checkpoint`. On a quiet machine the checkpoint took
225.6 s on average against 454.0 s before, a 50 ± 2.5% reduction. The
± is the spread of the three "before" totals as a share of their mean.

## Changes measured

- 22c0f801 scores a large session corpus in parallel batches of frozen
  runner calls instead of one serial call. It affects the development
  score and the recordings corpus.
- 8826ec25 removes the dashboard build test (165 s of the test suite) and
  four repeated scoring-input subtests.
- 26263683 starts the three longest test files first, so none of them
  runs alone at the end of the suite.
- 40c4472c runs `scan-sessions.mjs --json` as its own "session scan"
  check. The end-of-input over-read check reads that scan's cache, which
  only the removed dashboard test had written.

## Method

The harness in this directory runs every check that `npm run checkpoint`
runs, with the checkpoint's own code: `createCheckpointWorkspace()` from
`scripts/checkpoint.mjs` builds a fresh worktree of the commit, and
`checkpointCommands()` and `runCheckpointChecks()` from that worktree's
`scripts/checkpoint-checks.mjs` run the checks. A wrapper around
`spawnSync` records each check's wall time and the CPU time of the bounded
run's cgroup, from `cpu.stat`. Each checkpoint runs as two bounded full
runs, the test suite and then every other check, because
`scripts/run-bounded.mjs` refuses a full run longer than 15 minutes.

- Commits: da68a072 (before), the parent of 22c0f801, and 40c4472c
  (after).
- Samples: three rounds, each running the before checkpoint and then the
  after checkpoint.
- Machine: Intel Core i7-8700K under WSL2, 10 logical CPUs on 5 physical
  cores, Node 22.23.2.
- Conditions: `wait-quiet-then-bench.sh` started the rounds once the
  1-minute load average had stayed below 1.0 for 10 consecutive minutes.
  Everything else was held identical: the harness, the bounded-run limits
  (6 GiB, 15 minutes), and a fresh worktree with an empty `.cache` for
  every run.

## Results

Wall time, in seconds:

| Stage | Before, 3 runs | After, 3 runs | Before mean | After mean | After/before |
| --- | --- | --- | ---: | ---: | ---: |
| Full test suite | 164.6, 164.4, 156.4 | 109.6, 109.3, 109.6 | 161.8 | 109.5 | 0.68 |
| Recordings corpus | 223.3, 220.9, 220.8 | 51.0, 51.7, 51.6 | 221.7 | 51.4 | 0.23 |
| Development score | 51.9, 52.5, 51.8 | 14.8, 14.9, 15.0 | 52.0 | 14.9 | 0.29 |
| Session scan | — | 31.4, 31.4, 31.2 | — | 31.3 | new |
| Review gate | 8.5, 8.0, 7.9 | 8.4, 7.9, 8.0 | 8.2 | 8.1 | 0.99 |
| Other checks and setup | 10.4, 10.1, 10.4 | 10.4, 10.4, 10.1 | 10.3 | 10.3 | 1.00 |
| Total | 458.7, 456.0, 447.3 | 225.6, 225.6, 225.4 | 454.0 | 225.6 | 0.50 |

CPU time of the bounded runs, in CPU-seconds:

| Stage | Before mean | After mean | After/before |
| --- | ---: | ---: | ---: |
| Full test suite | 1201.8 | 1047.3 | 0.87 |
| Recordings corpus | 310.7 | 465.4 | 1.50 |
| Development score | 85.3 | 128.3 | 1.50 |
| Session scan | — | 47.1 | new |
| Review gate | 8.4 | 8.5 | 1.02 |
| Other checks and setup | 11.8 | 11.8 | 1.00 |
| Total | 1618.0 | 1708.4 | 1.06 |

Every "after" run of each changed stage is faster than every "before" run
of that stage. The means of the unchanged stages, the review gate and the
other checks, differ by at most 0.1 s, which is consistent with a quiet
machine.

The checkpoint uses 6% more CPU in total. Batched scoring uses 1.5 times
the CPU of serial scoring, because nine jobs share five physical cores and
each batch starts its own runner process. The test suite uses 13% less CPU
without the dashboard build test.

The session scan is new as a check but not as work: before 8826ec25, the
dashboard build test ran the same scan inside the test suite.

## Limitations

- Three runs per commit bound the resolution. The error bar comes from
  the spread of the "before" totals, 11.3 s. The "after" totals spread by
  0.2 s.
- The benchmark measures the four commits together. Their commit messages
  carry per-change evidence from runs on a shared, loaded machine.
- The harness also estimates other processes' CPU as the machine-wide
  busy time in `/proc/stat` minus the cgroup's time. The estimate came out
  negative for every "after" run, so it is not reliable, and the report
  does not use it. The claim that the machine was quiet rests on the load
  average before the rounds and the agreement of the unchanged stages.
- On a machine shared with other agents' CPU-heavy work, the same
  checkpoint's total varied by 24% between runs. Compare timings only
  from a quiet machine, or alternate the commits and report the spread.

## Reproducing

From the repository root, with the NetHack submodule initialized:

```
bash experiments/checkpoint-runtime/wait-quiet-then-bench.sh \
    "$PWD" da68a072 40c4472c /tmp/checkpoint-runtime 3
python3 experiments/checkpoint-runtime/bench-summary.py \
    /tmp/checkpoint-runtime da68a072 40c4472c
```

`results/` holds the JSON that `profile-checkpoint.mjs` wrote for each
half-run of this report.
