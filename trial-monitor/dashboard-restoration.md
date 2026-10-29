# First reporting overlay on the restored gameplay baseline

The original O overlay restored a frozen reporting view. The local bulk candidate described below adds a separately enumerated set of source patches; frozen outcome records are not an applied-repair inventory.

- Gameplay foundation E: `d0e6129d5eddb3a3db1eaaa64b65370a12997972`.
- Its full tracked tree equals G `736b8cd0424817ab9838e29b7ffb7e04228a354b`, tree `1103791acf7cb7f04986928c4dd03104f6815e00`.
- Reporting source P: `fa6ac3709a0acf413c83bd459c6772b16476343f`.
- `dashboard-restoration.json` pins the unchanged P evidence snapshot by SHA-256. Each observation also retains its original source/run revisions. Outcomes in that snapshot are historical, not assertions that P's repairs exist on G.

The workflow reducer, DOM renderer and their display tests come from P. The reducer tests retain model/snapshot cases only: evidence-adapter tests are omitted because the adapter is not restored. The renderer's heading/freshness copy explicitly labels historical scope. The builder adds only embedding, pin verification and provenance text; it retains E's existing sequential data/queue derivation. E's repair register, trial manifest, score records, snapshot, dashboard-data generator and trial reducer are unchanged.

Original feature provenance: dashboard `8ed6edc9b9e0685980aeb1d19c8bd13bc8511736`, integrated by `2f80ba5210a57819a2aaa8dbf5b8c88618b85242`; later renderer corrections are taken from P. No refresh/generator/discovery adapter is included. The snapshot is intentionally frozen; do not run later refresh instructions from another revision against this overlay.

At the original O overlay boundary, inspected but excluded: concurrent builder `10b15b6c3a`, sparse workflow checkout `3e7e809bbc`, refresh feature `302533c8ef` and its integration/corrections, and shared-validation display `ffa4671df2` with its mixed repair-register changes. No workflow, acceptance gate, game module, input/rendering engine, package dependency, C source, generated gameplay asset or historical repair data is restored from P.

Build with `node scripts/build-dashboard.mjs /tmp/dashboard-overlay.html`. The unchanged historical Pages workflow would perform the same build on a future approved Main push. Building is not publication. Local sparse validation can label the mismatch queue unavailable when recordings/sessions are absent; that does not become evidence of parity. Browser preview previously met an administrator restriction and is not retried here.

Current local bulk preparation starts from N `9d0de92cfd2a5fe3dadf1edf8f7e8ff84392f110`, which already includes the separately approved concurrent builder and sparse Dashboard checkout. It does not include the separately prepared public-read tooling branch. `reintroducedSources` lists only the original gameplay source SHAs actually selected for this candidate. Exact selection, dependency review and omissions are recorded in `experiments/restoration/later-source-selection-20261029.json`. Associated test and reporting reconciliation is identified separately there. This is local preparation, not acceptance or publication; the historical P snapshot remains unchanged and does not certify these restored patches or hidden-score impact.
