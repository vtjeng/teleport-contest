# Exact scoped negative decisions, 2026-10-28

Three manually reviewed decisions import successfully through the existing hub.
This is a frozen-run review artifact, not a general suppression rule or an
automatic shard-record converter. No gameplay or production tooling changes.

Branch base: `128fba220b25c44e18c5907c15bab10b0e8ac918`; C gitlink:
`16ff59115315917b93185d026aeefea06db9b0f4`. This deliberately uses the
evidence-era source base, independently of pending PR #5. It is not a review
of later Main. Relevant source files were compared to the evidence PR heads;
eight focused checks passed (growth two, area one, Medusa three, container one,
inaccessibles one). The original shard run files were absent locally. A fresh
hub scan produced run `0d5255ecbeb6fd9acac2` in 82,946 ms; raw output is frozen
as `run.json.gz`. Decisions use that run's newly reviewed fingerprints, not the
older shard evidence keys. The proof URLs identify immutable evidence commits;
source hashes and scope are also embedded in each decision.

## Measured effect on identical frozen inputs

- 12,537 active, zero filtered before classification.
- 12,534 active, three filtered afterward; all 12,537 raw leads retained.
- No additional detector rules, no prior reviewed-negative suppressions.
- Existing literal inactive-C filtering remains part of the original detector;
  PR #5's incremental rules are not in this base or measurement.
- Source audit complete; mismatch queue empty; compiled constants, Lua discovery
  and structural pipeline unavailable. These statuses are not passing coverage.
- No time-saving claim; scan elapsed time is measured, downstream savings are not.

Successful bindings:

1. `source-audit:message:src/mhitu.c:gazemu:0dfe9e7fb294fee3`
   — PR #7's exact unreachable ugly literal, not other gaze behavior.
2. `source-audit:edge-js-helper:src/pickup.c:tip_ok:isContainer`
   — PR #8's exact macro expansion, not the whole tipping command.
3. `source-audit:edge-c-only:src/sp_lev.c:load_special:ensure_way_out`
   — PR #10's missing-call hypothesis: the call lives in JS `des.finish`, with
   the same flag and ordering plus focused effect/control. Other escape-method
   leads stay active; three matching Minetown streams do not certify Lua coverage.

PR #6 growth and reversed-area-bounds records cannot safely bind to this run.
They supply no canonical lead key/evidence key or originating run/review
fingerprint. More importantly, the observed nearby growth lead is
`lspo_region -> selection_do_grow`, a missing call-edge claim, which is not
refuted merely by correctness of the separate JS grow helper. There is no
observed area-constructor behavioral claim matching the reversed-bounds proof.
Do not relabel either case to force a binding.

The diagonal-line difference remains one unresolved cause across PRs #6/#10.
It is not emitted by this source-audit-only run; no decision is fabricated for
it. Keep its evidence record and coverage uncertainty visible in shard tracking.

## Minimal shard contract

For a scanner-origin claim, include the immutable originating `run.json` (or
its retrievable path plus SHA-256), exact `key`, `evidenceKey`, `runId`, and the
`reviewFingerprint` produced by hub `template`. Attach the scoped hypothesis,
source proof, controls, source hashes and evidence paths to that row. A raw lead
alone omits run-level fingerprint inputs such as `inputHashes`, `toolHashes`
and `exclusionsSha256`; do not reconstruct missing values by assumption.

For a manually discovered behavioral claim, explicitly say it has no scanner
lead. Preserve it separately until a genuinely matching canonical lead exists;
provide no nearby helper-name substitution. Fresh scans require an explicit
scope/source re-review before producing a new template. This manual review is
why a generic conversion script would not remove the substantive work here.

## Reproduction and guards

From repository root, decompress to a new local file and use the existing CLI:

```sh
gzip -dc diagnostics/reviews/scoped-negative-decisions-20261028/run.json.gz > /tmp/scoped-negative-run.json
node scripts/discovery-hub.mjs classify --run /tmp/scoped-negative-run.json --decisions diagnostics/reviews/scoped-negative-decisions-20261028/decisions.json --out /tmp/scoped-negative-classified.json
node --test diagnostics/reviews/scoped-negative-decisions-20261028/check.test.mjs scripts/discovery-hub.test.mjs
```

The output must not already exist. Tests verify the frozen input hash, exact
three-row reduction, unchanged raw input, rejection of stale source/run/tool/
config/input provenance, rejection of a mismatched evidence key or retargeted
helper domain, and visibility of nearby and unresolved leads. The active view
also restores visibility when its source/tool/config provenance becomes stale.

Do not import these decisions into a different run, even if its stable IDs are
unchanged. Main owns review of later source changes and integration. This local
artifact has not been published.
