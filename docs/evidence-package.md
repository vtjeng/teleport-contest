# Evidence case packages, version 1

Use the existing `case.json` as the handoff record. This is not another ledger:
scanner decisions and discovery runs retain their existing formats and owners.
The validator checks packaging and declared receipts, not oracle fidelity,
reachability, semantic correctness, or acceptance. It never runs commands,
fetches dependencies, dispatches CI, or changes a disposition.

Start a new case (the template is deliberately incomplete):

```sh
node scripts/evidence-package.mjs template CASE-ID SHARD > case.json
node scripts/evidence-package.mjs validate path/to/case.json --commit CANDIDATE_SHA
```

Run from the repository/package root. All file paths are relative to that root,
not relative to case.json. Keep the tool and its hub/preflight dependencies from
the same tooling commit; record that commit with the packaging check. The CLI
also runs the existing committed-tree test-layout preflight for the supplied
SHA (default HEAD). This checks the committed layout; file hashes check the
present package bytes. Commit the package before the final publication check.
Neither result is a full Checkpoint receipt.

Exit 0: v1 packaging passes, including explicitly incomplete/unresolved cases.
Read `readiness` and `pending`; exit 0 is not evidence acceptance. Exit 1: invalid
package or layout. Exit 2: legacy case without schemaVersion, retained without
validation or promotion. Unknown versions fail. Do not mass-convert old cases.

## Fields

| Field | Meaning |
| --- | --- |
| `schemaVersion`, `caseId`, `shard` | Version 1, stable case identity, analysis domain. |
| `status` | `candidate`, `explained_negative`, `unresolved`, `invalid_setup`. Candidate is a handoff, not accepted gameplay. |
| `readiness` | `review_ready` or `incomplete`. Unresolved/invalid setup must remain incomplete. |
| `rootCause`, `relatedCases` | Nullable semantic cause identifier and list of related stable case IDs. No invented scanner IDs. |
| `provenance` | Exact `jsSha` and `cGitlink`, using canonical discovery names. |
| `source_locations` | Canonical `{side,path,symbol,start_line,end_line,commit_sha}` entries; side C/JS, nullable symbol/line pair. Each commit matches its declared base. |
| `hypothesis`, `expectedBehavior`, `observedBehavior` | Scope-specific claims for a reviewer. |
| `witness` | `kind`: source/compiled_oracle/production_api/public_recording; explicit `scope` and `limitations` array. |
| `exposure` | `route`: unestablished/api/shipped; `attribution`: unresolved/attributed/not_applicable; hashed evidence paths and `reason`. Independently recorded from witness validity. |
| `origin` | Manual reason with empty keys/null projection references, or scanner keys plus existing projection, manifest and optional decisions paths. |
| `commands` | Target, control and candidate post-fix checks, in the format below. |
| `artifacts`, `dependencies` | Arrays of `{path,sha256,role}`. Every referenced runner, receipt, output, config, projection and sibling dependency must be present and hashed. No silent network downloads. |

Use null `rootCause` when cause identity is unknown. An empty `relatedCases`
list means no relationship asserted. Source locations bind claims to immutable
bases; the validator does not inspect those source bodies or certify that the
base contains the claimed semantics. Record source/config inputs used by commands
as hashed artifacts/dependencies. Hash stored bytes (including gzip bytes), not
an undocumented decompressed representation.

## Commands and receipts

A target may be expected to fail before the fix. Preserve that expectation:

```json
{
  "id": "target",
  "role": "target",
  "argv": ["node", "--test", "diagnostics/divergence-evidence/commands/example/proof.mjs"],
  "cwd": ".",
  "runner": "diagnostics/divergence-evidence/commands/example/proof.mjs",
  "ci": "manual",
  "inputs": ["diagnostics/divergence-evidence/commands/example/recipe.json"],
  "expectedExit": 1,
  "receipt": "diagnostics/divergence-evidence/commands/example/target-receipt.json"
}
```

Declare control and post_fix commands similarly, usually expecting exit 0.
A planned post_fix check has `receipt: null`; it is not reported as executed.
Target/control missing receipts keep readiness incomplete. Receipt files contain:

```json
{
  "schemaVersion": 1,
  "commandId": "target",
  "argv": ["node", "--test", "diagnostics/divergence-evidence/commands/example/proof.mjs"],
  "cwd": ".",
  "jsSha": "<40 hex chars>",
  "cGitlink": "<40 hex chars>",
  "recordedAt": "2026-10-28T20:00:00Z",
  "exitCode": 1,
  "toolVersions": {"node": "v24.19.0", "clang": "19.1.7"},
  "runnerSha256": "<64 hex chars>",
  "inputHashes": {"diagnostics/divergence-evidence/commands/example/recipe.json": "<64 hex chars>"},
  "outputs": ["diagnostics/divergence-evidence/commands/example/target-output.txt"]
}
```

Receipts bind command, bases, runner and declared inputs to saved output artifacts.
They are assertions about an execution, not cryptographic proof that it occurred.
Never fabricate a receipt from an expected outcome or convert a prose pass into
an observed exit code. Reuse existing structured output only through an explicit,
reviewed conversion retaining its original evidence. Keep pre-fix evidence
immutable; post-fix execution at a new base belongs to the integrator's separate
validation record, not a rewritten old receipt.

Manual evidence runners use ordinary `.mjs` names. Tests intentionally included
in default CI use direct `scripts/*.test.mjs` wrappers and `ci: default`. Do not
register expected-failing pre-fix witnesses in default CI. The validator checks
runner placement, not whether its imported dependencies or assertions are complete.

## Discovery bindings and invalidation

Scanner origin references the original exporter outputs; do not copy full run
metadata into case.json. The manifest/projection/decision hashes and selected keys
must agree. Re-export with the final decisions when their bytes change. Extra
unreviewed projection rows are retained. Case negatives require exact negative
decisions for all case keys; unresolved cases cannot carry negative decisions.
Candidate decisions use the existing hub status `confirmed` (not a new hub status).

Existing `validateProjection` enforces import fingerprints and actual active-view
behavior, including stale source/config rejection. The packaging validator checks
that immutable run only; it does not claim its decisions apply to today's Main
or to the case's later witness base. Source review and current-provenance checks
remain necessary before carrying a decision into a new run. No original full run
is duplicated or fetched; standalone validation reports original comparison absent.

## Bounded legacy demonstrations

A local read-only adaptation exercise used current published packages; it did
not rerun evidence probes, publish duplicate data, or edit the historical cases:

| Package | v1 packaging result |
| --- | --- |
| PR #75, regeneration caller negative | 5 referenced files verified; exact projection 1 active → 1 filtered. Remains incomplete because normalized target/control receipts were not supplied. |
| PR #53, original subroom type | 2 referenced files verified; unresolved remains unresolved. Expected target exit 1 and control exit 0 retained; receipts missing. |
| PR #39, extended-menu candidate | 4 referenced files verified; target exit 1, control/post-fix exit 0 declared. Remains incomplete, not automatically promoted from legacy prose. |

These were minimal packaging demonstrations, not complete migrations. Existing
legacy payloads remain usable through their original review process. Synthetic
regression tests separately cover a fully receipted API candidate, stale discovery
metadata, missing files, changed hashes/commands/config, exposure contradictions,
path escapes, legacy handling and committed test-layout failures.
