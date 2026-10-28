# Next local negative review batch

PR #12 reviewed at `00db199d400c36e95c3b19e0ca32b55e9257e6f1`.
This is a separate batch stacked on frozen `d1e6140cb3ebb8223471757d8b07cdf6a40360ce`;
no files in that pending-publication batch changed.

Two exact decisions are prepared in the existing hub format:

- `source-audit:edge-stub:src/mthrowu.c:return_from_mtoss:artifact_hit`:
  only AKLYS enters the pinned returning-weapon path, and no AKLYS artifact
  exists. Invalidate for catalog, return table or caller-gate changes; do not
  suppress other artifact_hit gaps.
- `source-audit:edge-c-only:src/monmove.c:monflee:create_gas_cloud`:
  the default delegate creates the cloud under the ready cooldown gate.
  This refutes a missing-call warning, not complete gas behavior. The separate
  Vrock UI/vision divergence stays with Main and is not resolved by this decision.

All source hashes supplied by both records match this checkout. Four focused
source/behavior checks pass (catalog, ordinary returning-aklys control, ready
Vrock and cooldown control). Three decision tests and focused lint pass. The
second decision test rejects reuse of these bindings on the previous frozen
run. No new scans, fresh C recordings or gameplay investigations were run.

## Completed import verification

PR #12 head `5011e3c8e07714f645bac3aa5ca2b68f36315ac8` now preserves
`diagnostics/divergence-evidence/monsters/vrock-gas-delegation-negative/discovery-run.json.gz`
(1,465,275 bytes). Independently decompressed and verified SHA-256:
`22dde96e93aafc25876762fe1e4c4be4144c28432f353c2a77a6248d11a8642e`.
Original run ID: `601667573d5ca5a23adf`.

The existing hub CLI imported both decisions against that full run without
changing their supplied review fingerprints. Full-run raw count stayed 12,537;
active count fell **12,537 to 12,535**, filtered count zero to two. No new scan.
These counts use a different frozen run from PR #14; do not sum denominators.
`measurement.json` preserves this result. `bound-run.json` is a two-lead
projection with all run-level fingerprint inputs unchanged. Its tests verify
both imports and reject stale run/tool identity; it is not a full-corpus count.

Reproduction: obtain the immutable gzip from the PR #12 commit above, decompress
and verify its hash, then use the existing hub `classify --run RUN --decisions
.../decisions.json --out NEW_OUTPUT`. The projection also supports a local
binding test without downloading the full archive. Run:

```sh
node --test scripts/scoped-negative-decisions-b.test.mjs
```

The separate Vrock downstream UI/vision finding is outside both decisions;
its status is not altered. No generic artifact/catalog/delegation suppression
is introduced. Main owns integration gates.

Payload: one Markdown report, three JSON files (decisions, small run projection,
measurement), one JavaScript test. No duplicate compressed archive or gameplay
recording. The immutable full archive remains in evidence PR #12. This batch
is stacked separately on PR #14's frozen seven-decision branch.
