# Opt-in structural diagnostics

These scripts turn C-versus-JavaScript source differences into reviewable leads
and bounded differential cases. They reuse the C function inventory, command
catalog, recording-prefix coverage, saved mismatch queue, recipe generators and
C/JS comparator. They do not change gameplay, claim work, write scores, dispatch
CI, or add an integration gate. Scanning and case execution are separate commands.

The discovery workflow is hybrid: scripts repeat extraction, ranking, expansion,
comparison, grouping and reduction; a reviewer establishes source semantics,
supported reachability, useful setup recipes, controls and live assignment
clearance. A static warning or repeated mismatch is not a verified distinct bug.

## Source audit

With the existing project dependencies and C source checkout available:

```sh
node scripts/source-audit.mjs scan --out .cache/structural-audit \
  --mappings diagnostics/examples/structural/mappings.json
```

This does not execute C. It writes a corpus report and persistent backlog to a
new directory. Optional `--queue saved-queue.json` and `--previous backlog.json`
reuse saved context; the queue is advisory, not current ownership clearance.
The installed recorder, when present, participates in provenance, but a compiler
is not required for source extraction.

The message audit follows the core method described in the
[pinned Seeing Snakes article](https://github.com/davidbau/mazesofmenace/blob/baf3fc5d31a770a4ce15b6568cc05766c1443690/seeing-snakes/index.html):
select full C print literals of at least 14 characters, extract their longest
fixed fragment without printf fields, and search JS globally. It retains raw
case-sensitive hits separately from decoded/concatenated JS-string hits, so a
comment-only hit does not silently erase a lead. Logical calls cover multiline,
adjacent and conditional C literals. The explicit wrapper registry records
format argument positions; unresolved wrappers, variable/centralized formats and
macro uncertainty remain visible. Buffer construction and input prompt APIs are
not treated as print calls. Global presence does not establish equivalent
execution, formatting or control flow.

The call graph aligns file-qualified C functions with JS functions using names,
imports and declared mappings, then compares edges in both directions. Lexical
visibility and shadowed callbacks are respected; bounded helper traversal can
explain extraction, while inline alternatives require review. Explicit omitted
calls, partial callees containing stubs, JS adapters and unresolved dynamic calls
have separate categories. Callee identity includes its file and lexical location.
Ranks combine distance from real command/turn roots, incoming callers,
RNG/message/state effects and missing-message overlap. Call-site/branch context
and preprocessor guards are attached; these are not branch-feasibility proofs.

The graph uses `src/` plus `win/tty/`, following the existing inventory. Literal
coverage includes other C platform/tool files with a separate file-category
heuristic. The fixed current scope excludes `do.c`, `timeout.c`, `apply.c`,
`newsym`, and cross-file edges targeting symbols in those excluded files. The
report enumerates exact exclusions and wrapper/file category definitions.
EXACT_NAME is not investigated. Unmatched functions and unresolved calls are
reported rather than silently treated as equivalent.

## Review contract and history

Each current entry has an ID, evidence key, sites, ranking signals, overlap
annotations and review history. Only `observed: true` entries are current leads.
A review decision supplies the current `id`/`evidenceKey`, `classification`,
`rationale` and `sourceRefs`:

```sh
node scripts/source-audit.mjs classify \
  --backlog .cache/structural-audit/backlog.json \
  --decisions /path/to/current-reviewed-decisions.json \
  --out .cache/structural-reviewed.json
```

Allowed classifications:

- `needs-investigation`: unresolved semantics or supported reachability.
- `confirmed-missing-behavior`: source review establishes a missing operation
  on a supported reachable path, with both C and JS references. A syntactically
  absent call alone is insufficient. This still does not claim a replay witness.
- `alternate-implementation`: reviewed rename, inline/helper/macro or adapter
  explains the structural warning.
- `unreachable`: the relevant state/path is excluded under a stated supported
  configuration or source invariant. Injected impossible states do not establish
  gameplay reachability.
- `already-fixed`: a recorded repair resolves the lead. Record the repair commit
  separately from whether it was applied to the historical measured baseline.

Use the latest classified backlog as the next scan's `--previous` input. Matching
source/tool/build evidence carries decisions forward; changed evidence expires
the active verdict while retaining history. Disappearance alone never means
fixed. Replay links are accepted only as `reviewer-reported` annotations with
recipe/result/control references. The source audit does not machine-verify
arbitrary receipt paths. Actual pipeline results remain separate evidence.

`diagnostics/examples/structural/reviewed-backlog.json` is a small **historical
subset**, not a fresh full backlog for this checkout. It preserves the initial
reviews and two later resolutions:

- `polymon → instapetrify`: the C call is syntactically absent, but supported
  gameplay cannot reach the mounted-petrifying-steed state. Saddle restrictions
  exclude cockatrices/chickatrices; changing a mounted steed into them dismounts
  first. The main workflow reported a controlled pony-to-cockatrice replay with
  2,866 matching RNG entries and 129 screens plus cursors. Those replay artifacts
  were not supplied to this diagnostic session, so it is retained as reported
  negative evidence, not local machine verification.
- `do_entity` disappearance message: fixed by accepted repair
  `462b798181c86d27e4b2664619c16287156784f0`, now in the PR's base. The historical
  measured baseline did not contain the fix.

The ten reviewed examples now contain five alternate implementations, two
unreachable entries, one fixed entry and two linked unresolved entries. There
are no active source-confirmed omissions in that reviewed subset. Original
artifact paths in the historical source references are preserved as provenance;
`resolution-evidence.json` supplies the compact resolving evidence here.
Revalidate decisions against newly generated evidence keys before using them
for current execution. `review-history.json` is an illustration of the append-only
history; applying it to a changed source hash intentionally fails.

## Bounded matrix and differential execution

Expand supported existing generators without running games:

```sh
node scripts/structural-matrix.mjs \
  diagnostics/examples/structural/matrix.json .cache/structural-plan.json
```

The example names the fresh audit path above. Each selected source ID must still
exist and not be classified alternate/unreachable/fixed when executing. Update
obsolete IDs only after source review; this is a scaffold, not a guarantee that
future Main keeps the same leads.

With the repository's existing recorder available, execute explicitly:

```sh
node scripts/run-structural-pipeline.mjs \
  .cache/structural-plan.json .cache/structural-run
node scripts/run-structural-pipeline.mjs \
  .cache/structural-plan.json .cache/structural-repeat \
  --compare .cache/structural-run/summary.json
```

Respect the repository's local execution permissions for fresh C runs. The tool
never installs/builds a recorder automatically. Its default binary/install path
is `nethack-c/recorder/install/games/lib/nethackdir`; existing alternatives can be
supplied through `NETHACK_BINARY` and `NETHACK_INSTALL`. Both C and JS use one
canonical environment (locale/timezone, explicit paths/timeout), excluding
inherited game options, wizard kit and loader/Node overrides. Provenance binds
source, tool scripts, installed recorder/data, frozen code and Node; a mid-run
change withholds the consistent-baseline summary.

Every output directory must be new. Keep previous artifacts instead of
replacing them. Results preserve recipes, C recordings, comparator payloads,
setup observations, provenance, negative-cache receipts and a manifest/archive.
No private C state trace is available; matching screens/RNG does not establish
hidden-state equality before the first observable divergence.

### Parameters

| Input | Supported contract |
| --- | --- |
| Generator | Allowlisted `attributes`, `pray-decline`, `fire`; imports their existing recipe loaders. |
| `rows` | Distinct zero-based generator segment indices. |
| `axes.seed` | Explicit nonnegative integers or null to retain a curated seed. |
| `axes.options` | Ordered `{id, append}` nethackrc lines; agent selects compatible role/race/gender/options. |
| `axes.commands` | Ordered `{id, changes, expectC?}`; changes may set/append/replace `moves` only. |
| Date/time | Retained by matrix adapter; explicit lower-level recipes can supply a valid datetime. |
| Level/state/objects/monsters | No direct injection axis. Agent-authored supported public commands and setup gates are required. |
| Targets | Nonempty ordered C message-onset observations for every family/variant; empty is allowed only for controls. |
| Controls/reductions | Explicit nearby control recipes/mutations and shortening mutations; no autonomous scenario synthesis. |

Ordering is family, row, seed, options, commands in declaration order. Duplicate
recipes, missing rows, unsupported axes and excessive products are rejected.
Limits: eight families, nine probes per family (base plus eight variants), 32
fresh calls, twelve declared reductions and four controls per family. A positive
integer follow-up reservation is checked before running generators. The generated
plan defaults to four promotions, at most eight. Caps are not automatically raised.

The lower-level pipeline also accepts inline clean version-5 recipes or existing
repository `recipePath` inputs, complete variant recipes, and moves/nethackrc
mutations. Each case has one segment and at most 2,000 input characters. Use
`--cache previous/negative-cache.json` to reuse source-bound rejected reductions;
complete hashed recipe/recording/result receipts are required. Errors are retained
but not cached as negative behavior evidence.

All declared probes run before bounded follow-up. A passing base does not suppress
an unseen divergent variant: its exact recipe, fingerprint and reachability
contract become a candidate. Reduction must preserve both that contract and the
strict observable fingerprint. Every promoted candidate receives its own controls;
inapplicable controls remain nonpassing, and budget-limited work is marked partial
or pending. Controls cannot certify untested members of a group.

Cross-family grouping requires a canonical signal set plus the observable
fingerprint and retains exact evidence membership. This distinguishes repeated
observations conservatively; it is not proof of a shared root cause. Review and
normal integration tests remain required.

## Evaluation provenance and limits

Initial isolated evaluation used Main `362972c8776200aa1afa01b960c8d82b3f26839a`,
C `16ff59115315917b93185d026aeefea06db9b0f4`, Node 24.19.0 and existing recorder
SHA256 `d0e5dceb8871d889b5bd46a5ec27ce1dd060b8aec49a0412d3b8a7458d6a7b13`.
These historical measurements are not a fresh coverage claim for the PR base.

- 303 eligible C files yielded 5,932 qualifying literal occurrences. Ordinary
  print APIs had 246 raw JS misses; decoded matching reduced these to 164,
  including 80 in gameplay-classified files. Diagnostic/file categorization is
  heuristic, and the article's historical counts are not current bug counts.
- The predeclared matrix used 16 probes across three generator families, six
  seeds, three roles and two races, plus three controls. All 19 matched C twice;
  no setup failures or novel divergences. Gates proved command entry, not each
  referenced missing edge. Script times were 17.83s/18.24s; agent-assisted plan
  construction was separately recorded as 121.14s elapsed, including interleaved
  review/tests.
- A separate known traditional-spell gap demonstrated passing-base → divergent
  variant promotion, four-to-two-key reduction and a passing full-menu control,
  reproducibly. It is infrastructure regression evidence, not new bug yield.
- Full source-audit repetitions took 55.71s/56.64s and retained identical review
  history before the later main-workflow resolutions documented above.

Independent review identified and drove fixes for lexical/file identity,
fragment/wrapper handling, exclusions, replay labels, empty variant contracts,
inapplicable controls, budgets, partial follow-up and exact group membership.
The initial combined focused suite had 58 passing tests. Large historical
recordings, generated full scan dumps and archives are deliberately not part of
this PR. Existing regression/acceptance requirements are unchanged. No held-out,
compute-consumption, guaranteed-bug or time-savings claim is made.

Run focused infrastructure checks without C gameplay execution:

```sh
node --test scripts/source-audit.test.mjs scripts/structural-signals.test.mjs \
  scripts/structural-cases.test.mjs scripts/run-structural-pipeline.test.mjs \
  scripts/structural-matrix.test.mjs
npm run lint
```

No package scripts, workflows, mandatory gates or main workflow settings are
changed. New tests use mocked evaluators; the bounded C runner is opt-in only.
