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
Vrock and cooldown control). Two decision tests and focused lint pass. The
second decision test rejects reuse of these bindings on the previous frozen
run. No new scans, fresh C recordings or gameplay investigations were run.

## Pending import verification

Original run ID: `601667573d5ca5a23adf`.
Expected SHA-256 of uncompressed run.json:
`22dde96e93aafc25876762fe1e4c4be4144c28432f353c2a77a6248d11a8642e`.

The shard reports `/tmp/monsters-discovery-20261028-b/run.json` in its own
execution environment. That path is not assumed to refer to this environment.
PR #12 contains the bindings but not the run file. Parent has requested durable
preservation. Once available, verify the uncompressed hash, then run existing
hub `classify --run RUN --decisions decisions.json --out NEW_OUTPUT` and compare
before/after active views. No provenance values should be reconstructed or
refreshed automatically. Schema validation alone does not verify the reported
fingerprints against the absent run.

Incremental active-view reduction is **unmeasured/pending**; no import was
performed. Expected applicability is two specific rows, conditional on the
original run's verified contents. This is an artifact-availability dependency,
not an access denial. The previous seven-decision batch remains unchanged.

The shard contract is now sufficient in fields: exact key/evidenceKey/runId,
reviewFingerprint and run hash are present. The remaining missing item is the
durable, retrievable immutable run itself. No invented IDs are needed.

New payload: one Markdown report, one JSON decision file and one JavaScript
test; no new compressed evidence, recordings or raw run archive. No publication
has been attempted or requested for this batch.
