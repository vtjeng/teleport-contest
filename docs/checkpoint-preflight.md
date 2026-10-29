# Cheap candidate input checks

Run `node scripts/checkpoint-preflight.mjs --commit CANDIDATE --base ACCEPTED_BASE`
before a full Checkpoint. The delivery preflight uses its recorded delivery base.
All input reads use the committed candidate, not dirty working files. A nonzero
exit blocks dispatch. Without an explicit base the comparison covers the commit's
own changes; merge candidates require an explicit base. Use an explicit accepted base for a multi-commit batch.

Existing layout validation only checked test placement. It did not parse the
repair register or run dashboard assertions. Changed `trial-monitor/repairs.json`
or `trial-monitor/manifest.json` now triggers JSON parsing of both committed files
and the existing `createTrialMonitor` validator. No duplicated schema is added.
This checks versions, trial-clock shape, stable unique repair IDs, candidates,
SHA shapes and run-history arrays to the extent the existing validator does.
It does not certify source claims, receipt truth, every run field or gate success.
Deleted/missing dependencies fail; unchanged historical data is not revalidated.

Changes to these inputs, dashboard scripts/template/tests, build-dashboard,
trial-monitor or single-worker-activity select:

```sh
node --test scripts/dashboard-data.test.mjs scripts/trial-monitor.test.mjs
```

Run once in the exact candidate checkout and retain the result. This is a
recommendation in `focusedTests`, not a claim of execution or an automatic test
gate. It detects covered stale display assertions (including shared-batch titles)
but cannot prove every browser interaction. Dependency selection is explicit,
not a complete transitive import graph; other changes may warrant focused tests.
No workflow, CI dispatch or full validation gate changes are made.

Local validation on base `1e786f87d927b72bd07122fc3eead0ecb5d8203c`:

- Committed malformed quote escaping and wrong register schema rejected; correctly
  serialized quoted titles pass. Dirty repairs cannot conceal committed errors.
- A temporary copy of the existing dashboard shared-validation test using a
  deliberately stale template title failed with the expected title assertion;
  the original template passed. This reproduces the failure class, not a claim
  to have recovered the original failing candidate SHA.
- Five warm-process samples: layout 60–73 ms; changed-input/schema check 109–154 ms
  (median 67 versus 129 ms). This includes Git reads; dashboard tests are separate.
  The selected dashboard/trial tests passed 76 checks in 1.87 seconds (Node test
  runner duration). Local order/cache effects apply. No hosted time-saving claim is made.

Integrate this tooling with a compatible ordinary batch, not a dedicated heavy
Checkpoint boundary. Full hosted gates still run once on the final candidate.
