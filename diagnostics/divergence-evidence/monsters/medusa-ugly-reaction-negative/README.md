# Medusa's unreachable ugly-text alternative

Versioned explained negative for exactly
`source-audit:message:src/mhitu.c:gazemu:0dfe9e7fb294fee3`.
This does not suppress `gazemu` generally, its location formatting, or the separate
sleepy-gaze literal retained as an active neighbor in the exported projection.

C initializes `react = -1` before the attack-type switch and does not change it
before the AD_STON arm. Inside that arm, the only assignment before the ternary
sets `react` to 4 or 2 for an unaware hero, then immediately breaks out. Whenever
the subsequent text ternary is evaluated, `react` remains -1. Therefore `!react`
is false, even for a cancelled Medusa: `doesn't look all that ugly` is unreachable.
The actual alternative is `gazes ineffectually`, which JS implements.

`proof.mjs` checks the complete function prefix and the relevant arm's assignment
and exit structure, then compiles the exact C AD_STON pre-reflection arm with a
visible, aware, nonhallucinating display harness. Target is cancelled Medusa;
control is uncancelled but blinded Medusa. Both C and the production JS `gazemu`
API print `Medusa gazes ineffectually.` using Medusa's native gaze attack.

The oracle is an extracted C branch, not a complete C game. Display and perception
are stubbed in C. The JS fixture supplies effect-boundary cancellation/blindness
state, not a public-play method for applying either status. The negative's
unreachability proof is the local C control flow, not those fixture assumptions.
No conclusion about unrelated gaze attacks, reflection, visibility or unconscious
reaction messages follows. This is not proof of entire-function equivalence.

From base `b313cde5b50f3c5b5e8f622ff32418cbc1ae12be` with C submodule initialized:

```
node diagnostics/divergence-evidence/monsters/medusa-ugly-reaction-negative/proof.mjs target
node diagnostics/divergence-evidence/monsters/medusa-ugly-reaction-negative/proof.mjs control
node --test scripts/test-suites.test.mjs
```

Both focused commands expect exit 0. Node and C99 `cc` are required; the runner
removes its temporary compilation directory. Actual clean-base receipts and
outputs are bundled. The ordinary `.mjs` runner is outside default CI. Packaging
uses the accepted v1 validator at the stated tooling base; validation is not
semantic acceptance.

## Immutable discovery handoff

The new fixed-checkout run is `2bfc89cdcbaa6139046f`, raw SHA-256
`4e7ab2870a6c57b5c1d586b651917cfabf28056c485f9f92ebc0e202cfcc1b93`.
`discovery-run.json.gz` is its one reusable complete copy (1,529,196 bytes), with
no redaction or rewritten identity. It contains source snippets and discovery
provenance, not credentials, environment dumps or recorder logs. Generic workspace
paths remain as original provenance. Reuse this artifact rather than duplicating
it in later cases. Its gzip hash is recorded by `case.json`.

The source audit completed (12,472 raw leads, not verified issues). Saved mismatch
selection was empty. Compiled constants were **unavailable** because generated
recorder headers were not configured via TELEPORT_RECORDER_INCLUDE; no headers
were changed and no constant-equivalence claim is made. Lua/structural methods
were not requested. Source and tooling did not change during execution.

The accepted exporter produced `projection.json` and `manifest.json` from the
complete original and final `decisions.json`. Validation against the original
verified 2 active rows before and 1 active / 1 filtered after. Only the exact ugly
literal is filtered; the neighboring sleepy-gaze lead remains unreviewed/active.
To independently verify original identity and active-view effects:

```
gzip -dc diagnostics/divergence-evidence/monsters/medusa-ugly-reaction-negative/discovery-run.json.gz > /tmp/monsters-ac-original-run.json
node scripts/discovery-project.mjs validate --projection diagnostics/divergence-evidence/monsters/medusa-ugly-reaction-negative/projection.json --run /tmp/monsters-ac-original-run.json --decisions diagnostics/divergence-evidence/monsters/medusa-ugly-reaction-negative/decisions.json
```

Use a fresh private output filename if that example path is already occupied.
The original canonical key, evidenceKey, runId and hub-generated reviewFingerprint
are retained by the exporter and final decision. No prior reviewed decisions were
silently carried forward to this new source/tooling identity.

An initial clean-worktree checkout was refused because preserved untracked
historical evidence would be overwritten. That invocation's subsequent checks
ran on the prior base and are not the published receipts. Historical files were
moved aside, the expected base was asserted, and target/control plus suite guard
were rerun successfully. No denied operation or changed gameplay was involved.
