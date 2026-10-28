# Default-import delegation rank hint

`default-import-delegation-v1` adds a -10 rank hint to an existing C-only call
warning when its paired JS owner calls a const-bound environment property or
destructured alias and a simple local factory defaults that property to the
matching named import. The scanner also resolves that import to a real function
through its existing module resolver. It is not a name-only match.

The bounded tracer accepts top-level const bindings and factories with one
object-return statement. It follows a direct named import or the terminal
fallback of `??`, rejects later spread overrides, duplicate properties, known
writes, local shadowing, computed calls and unknown factories. Each module is
parsed once per audit; results are cached by owner. Other binding forms are
left unchanged, rather than guessed. Overrides, mutation through external
calls, argument meaning, branch reachability and RNG draw order remain
unproved. This is a heuristic and never removes a candidate or changes status.

The source audit stores the version, delta, default binding/import trace and
limitations. The hub preserves that evidence. The new helper's bytes are in
both source-audit identity and hub tool fingerprints; existing identities also
cover source, imported modules, mappings and runtime configuration. Changing
or removing a known default binding invalidates evidence and removes the hint.

## Frozen measurement and reproduction

Same pre-existing 12,537-lead source-audit input used for the macro experiment,
source base `128fba220b25c44e18c5907c15bab10b0e8ac918`. No discovery scan was run.
The 4,019 eligible C-only candidates are retained in `ranking-input.json.gz`
(64,128 bytes), with the full original backlog hash. The measurement script
loads source from the pinned Git commit, not whichever gameplay source happens
to be checked out. It uses the production hint and module resolver.

- Delegation: **2 deprioritized, 0 filtered**, all 12,537 raw/active leads retained.
- Macro experiment, separately: 165 deprioritized, 0 filtered. Kinds are disjoint;
  no candidate gets both penalties. Existing base rank deductions remain.
- Both delegation hits are the PR #21 room-coordinate RNG aliases.
- Repeated application is identical; pinned-source reproduction also agrees.
- The recorded 1,443 ms ranking evaluation excludes module loading and parsing;
  it is not a scan benchmark or a compute-saving claim.

```sh
node diagnostics/reviews/delegation-ranking-20261028/reproduce.mjs
node --test scripts/delegation-ranking.test.mjs scripts/macro-ranking.test.mjs scripts/source-audit.test.mjs scripts/discovery-hub.test.mjs
```

41 focused tests pass. The real auditor fixture deliberately reverses draws
and uses wrong bounds: its warning is merely demoted and remains active and
unreviewed. Unknown/default-removed binding controls restore the old rank;
source identity changes. Stub and different-target controls receive no hint.
These tests prevent lexical delegation from becoming an equivalence verdict.

## Separate exact PR #21 decisions

PR #21 at `ea73b34ebd04c058e18d0e8992ddc85899c498e3` supplied a two-lead
projection for run `141a19a089813e75a9ae`. Independently verified projection
SHA-256 `070935772f1fbc7dda8264392a236e5228ca727e2030882c0c7b0e9448aec396`.
The shard records original run SHA-256
`79589345756287551d73f4d0a94f28ee33070cd817bbd3c51849168fc78fabc2`;
the full run is not copied here or independently rehashed in this batch.

`pr21-bound-run.json` retains original lead objects and fingerprint inputs.
`pr21-decisions.json` applies the source-reviewed missing-edge proofs with the
original fingerprints: **projection active 2 to 0**. This exact review is
separate from the general heuristic and its frozen measurement. No full-run
active-count claim is inferred from the projection's original count of 12,525.
Tests verify import and reject changed run identity. Fallback and `somexy`
branches remain outside these scoped proofs; no blanket RNG parity claim.

The implementation is stacked on the macro-ranking PR #19. No gameplay changes,
new recordings, rescans, or acceptance-gate changes. Main owns integration.
