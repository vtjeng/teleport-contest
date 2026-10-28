# Direct fire magic: native catalog exclusion

Explained negative for exactly
`source-audit:message:src/mcastu.c:castmu:2539bfa243197280`.
The absent “You're enveloped in flames.” message belongs to direct `AD_FIRE`
monster magic. No native monster has `AT_MAGC/AD_FIRE` in the pinned catalog,
and `getmattk` substitutions do not introduce that pairing. This is an
unreachable-path explanation, not a claim that the fire implementation exists.

```sh
git submodule update --init --checkout --no-fetch -- nethack-c/upstream
node --test diagnostics/divergence-evidence/monsters/fire-magic-catalog-negative/probe.test.mjs
```

The focused test compiles actual upstream monsters.h with MAIL_STRUCTURES and
without CHARON, matching the recorder/JS configuration. All 48 magic slots match
JS exactly. Real positive controls retain Angel and Yeenoghu magic missiles and
Asmodeus cold attacks with their native dice. Native getmattk rows are sampled
with cancellation/cooldown variants, and source checks pin that substitutions
never assign AT_MAGC or AD_FIRE. The test passed separately from clean Main
8eec78d622b3ef9cb22a54d1699aaf335e9342e9 plus only this directory.

Clerical FIRE_PILLAR is a different dispatch path and is not suppressed. Neither
are fire breath, explosions, other missing messages, or future catalog additions.
Recheck this decision on catalog, attack-substitution, dispatch or configuration
changes. No gameplay recording is needed to prove the absent native pairing;
this is a compiled catalog/source proof with positive catalog controls.

The original complete scanner run is reused from the durable gzip published in
PR #12 (linked in case.json). The new exporter from PR #43 was run in an isolated
checkout of a879e944617577d3eb59c14afc87ddbdb2724b18 with all dependencies together.
It emitted export/projection.json, manifest.json and review-template.json from
the unchanged complete original run and the final decisions.json. Export and
validate both verified exact metadata/fingerprint identity and the active-view
effect: selected active 1 -> 0, filtered 0 -> 1. No large run is duplicated.

From that exporter checkout, using absolute paths to these files:

```sh
node scripts/discovery-project.mjs validate --projection /absolute/case/export/projection.json --run /absolute/original-run.json --decisions /absolute/case/decisions.json
```

The manifest pins run, exporter, hub, projection and decision hashes. case.json
adds C/JS source hashes and timestamps. No scanner decision was created for the
separate unresolved castmu-waterwall-scout.
