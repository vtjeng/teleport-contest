# Opt-in discovery hub

`scripts/discovery-hub.mjs` is a report-only entry point for the existing
source audit, saved mismatch selection queue, compiled-constants comparison,
and the Lua level-generation adapter. An explicit
reviewed structural scenario plan can be supplied with `--plan`; without one,
that adapter is reported as unavailable. The adapters remain separately runnable.
The hub does not edit gameplay, score files, CI, or publication state.

Run it from a checkout with the existing project dependencies and, for compiled
constants, the recorder-profile Clang already available on `PATH`:

```sh
node scripts/discovery-hub.mjs scan --out .cache/discovery-run-1 \
  --game-root /absolute/path/to/accepted-main \
  --lua-config experiments/lua-discovery/pilot.json
```

Use a **new** output directory each time. `--previous OLD/run.json` carries
review history forward and retains unresolved leads even if absent in the next
scan. `--source-previous OLD/backlog.json` imports the source auditor's own
context; it is distinct from the hub's review history. The complete run is
`run.json`; `leads.csv` is a generated index into that JSON, never a separate
source of truth. The CSV has exactly these columns:

`--lua-config` is optional. Without it the Lua method is explicitly
unavailable; with it the hub runs `scripts/lua-discovery.mjs` using the same
bounded config as the standalone adapter. The complete raw C/JS captures,
`summary.json`, `ledger.json`, and `provenance.json` remain under
`NEW_DIR/lua-discovery/`. The hub imports all ledger rows as raw observations
with method `lua-level-generation/v1`, stable program/input identities, and
their aggregate outcomes. A matching screen/RNG/cursor stream is not promoted
to an explained negative or claimed to prove hidden-state equality. Mismatch,
unresolved, unreachable, infrastructure-failed, and uncovered outcomes remain
distinct in the method summary and per-lead raw outcome. Failed adapter output
is reported as failed, never as zero findings. Comparable and C-only gate
coverage remain separate in `run.json` and the saved Lua summary.

`active-leads.json` is a disposable triage view. Classification writes the
corresponding `<reviewed.json>.active.json` view. It lists active keys and an
audit entry for each filtered key with the saved explanation and provenance.
Only an evidence-complete `explained_negative` reviewed for the same C/JS
revisions, adapter implementation, configuration and source hash is filtered.
Legacy reviews without those fingerprints remain active until rechecked.
Unresolved leads and failed fixtures remain active; explicit exclusions are
reported separately and never become a generic suppression rule. All raw
observations and review histories remain in the canonical JSON.

Current reviewed negatives recur around inactive C build branches, moved JS
helpers, assembled message text, and representation-only constants. Those
categories are not automatic detector filters: source preprocessor provenance,
runtime call resolution, or value-use evidence is needed before a general
rule could safely identify each cause without hiding a real discrepancy.
The source auditor does make one narrower, mechanically proved exception:
a message inside a complete, balanced literal `#if 0` frame is retained in the raw report with
`sourceFilter: literal-if-zero` but omitted from candidate leads. `#else`,
`#elif`, unknown feature guards, malformed or continued directives, and failed
gameplay fixtures are not filtered.
Changing the C source or auditor invalidates the old run and its review
fingerprints; no old verdict is silently carried to the new run.

`id,title,methods,source_locations,status,priority,expected_behavior,observed_difference,evidence_summary,next_experiment,last_checked_sha,details_path`

The two array columns contain JSON. `details_path` is a relative JSON pointer
such as `run.json#/leads/42`. Optional unknown fields are blank. Each lead's
JSON detail retains source identity, C/JS revisions, tool/config hashes,
versioned method references, evidence key, attempts, control, review history,
resolution and next experiment when known. The scan run separately records
adapter status, elapsed wall time, coverage, output hashes, and new/duplicate
raw observations. Raw observations are **not** verified bugs or viable-lead
counts. An adapter failure or missing prerequisite is reported explicitly;
neither is converted to zero findings.
The mismatch adapter selects candidates from saved evaluation metadata; it
does not execute fresh C/JS replays. Its run record distinguishes a successful
selection command from `status: empty-input` when nothing was selected, and
records `replayedCases: 0`.

The JSON detail is canonical. `key`/CSV `id` is a stable string; `title` is a
string; `methods` contains `{kind,version,run_id}` references. Kinds are
`missing_message`, `call_graph`, `constant_compare`, `replay_compare`, and
`lua-level-generation` for
the adapters actually used. `version` pins the adapter source hash and `run_id`
links the scan record and its configuration hashes. `source_locations` is an
array of `{side,path,symbol,start_line,end_line,commit_sha}`; side is `C` or
`JS`, unknown symbol/line values are null. Status is the enum below; priority
is optional integer 0–3 (0 highest). Expected/observed/evidence/next-experiment
fields are strings when established, otherwise null. `last_checked_sha` is
the full accepted Main SHA for that scan. Old method observations and review
history remain in the JSON detail, rather than making more CSV columns.
Existing source-audit reviews, when present, are retained as context under
`sourceAuditReviews`. Their weaker classifications are not silently promoted
to hub verdicts, which require the evidence below.

To append review decisions, first generate bound decision rows for selected
lead keys, then fill in status and evidence. The template supplies `runId`,
`evidenceKey`, and `reviewFingerprint` automatically; the reviewer does not
construct or copy provenance metadata. An older template cannot be applied to
a different run, baseline, tool version, or configuration merely because the
warning text stayed the same:

```sh
node scripts/discovery-hub.mjs template \
  --run .cache/discovery-run-1/run.json \
  --keys /absolute/path/to/selected-keys.json \
  --out .cache/discovery-run-1/decision-template.json
```

After filling the decision rows, generate a new reviewed JSON and CSV:

```sh
node scripts/discovery-hub.mjs classify \
  --run .cache/discovery-run-1/run.json \
  --decisions /absolute/path/to/decisions.json \
  --out .cache/discovery-run-1/reviewed.json
```

Allowed statuses are `investigating`, `unresolved`, `confirmed`,
`explained_negative`, `excluded`, and `fixed`, plus the initial `unreviewed`.
`confirmed` requires a reachable failing witness, nearby passing control and
C-grounded expected behavior. An explained negative requires concrete proof of
an equivalent implementation, true unreachability, or an invalid scanner
assumption. A failed setup or inability to reproduce remains `unresolved`, with
attempted setup, observed outcome and next discriminating experiment. `fixed`
needs the accepted SHA and receipt. Exclusions use an opaque scope ID; do not
reconstruct excluded investigations. When relevant evidence changes, a prior
resolved verdict becomes `unreviewed` with `reviewFreshness: needs-review`;
an unresolved lead remains unresolved but is marked `needs-review`. Both keep
their history. Exclusions remain excluded. Missing observations do not erase
unresolved work.

The CSV is a compact view; keep exact commands, setup limits, source proof,
control results, and review rationale in the JSON detail. Do not infer active
compute time from adapter wall time or treat thousands of scanner warnings as
thousands of bugs.


## Portable run projections

Use the supported exporter instead of hand-selecting run metadata. `keys.json`
is a nonempty JSON array of exact canonical lead IDs. The original run is read
without mutation; every top-level field is preserved, and only `leads` is
projected, in original order. Unknown/future metadata is preserved too.

```sh
node scripts/discovery-project.mjs export \
  --run .cache/discovery-run-1/run.json \
  --keys keys.json \
  --out .cache/discovery-projection-1 \
  --decisions decisions.json
```

`--decisions` is optional when preparing a review. The new output directory
contains `projection.json`, `review-template.json`, and `manifest.json`. The
manifest records original/projection SHA-256, original lead count, selected
IDs, exporter/hub hashes, optional decision hash, and before/after active-view
counts. It lives outside the projection so original run metadata is unchanged.
The exporter validates everything before writing output and refuses overwrites.

Validate a received projection with the same supported command:

```sh
node scripts/discovery-project.mjs validate \
  --projection .cache/discovery-projection-1/projection.json \
  --decisions decisions.json
```

Add `--run ORIGINAL_RUN.json` when available to verify exact metadata and
selected-lead equality, fingerprints and original active-view membership.
Without that original the result explicitly says `originalComparison:
not-supplied`; it checks completeness and review behavior, not the claimed
original full-run hash. Compare the received projection bytes to its manifest
hash as part of artifact transfer.

Both exporter and validator require run-level `methodConfigHashes` and
`methods.sourceAudit.sourceHash` for observed source-audit leads, as well as
identity/tool/input metadata. A matching review fingerprint alone is not enough:
when decisions are supplied, an explained negative must actually enter the
filtered view. An observed unresolved decision must remain active. Stale
source/tool/config reviews are never forced through by loosening the active-view
guards. Stale or unobserved historical rows can still be projected without new
decisions and retain their existing visibility/history.

Do not reconstruct omitted metadata from a lead's provenance or a neighboring
run. Return to the immutable original and export again. Projection counts cover
only selected leads, never a full-corpus filter-yield denominator.

Validation example from the tooling pilot: original run
`601667573d5ca5a23adf` (12,537 leads), three selected leads and two known exact
negative decisions exported and validated with **3 active → 1 active, 2 filtered**.
The incomplete PR #30 projection was rejected with
`missing run.methodConfigHashes`, rather than reported as a successful filter.
No discovery scan or gameplay replay was performed for this pilot.
