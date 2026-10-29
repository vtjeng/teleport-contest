# Cleric floor-spell call-site negatives

Two exact scanner keys are explained negatives:

- `source-audit:edge-stub:src/mcastu.c:mcast_fire_pillar:mon_spell_hits_spot`
- `source-audit:edge-stub:src/mcastu.c:mcast_lightning:mon_spell_hits_spot`

Both C and JS callers pass a literal damage type: AD_FIRE (2) or AD_ELEC (6). The complete JS callee contains a single `note_unported` marker, in the else arm of `AD_MAGM <= adtyp <= AD_ACID` (1 through 8). It never reassigns `adtyp`. Neither call can select that marker. The proof checks the C constants against JS values, both complete caller bodies, and the callee guard. AD_PHYS (0) is an out-of-range discriminator control, not an invalid gameplay fixture or a negative finding.

This is the same constant-argument reasoning as the sibling WEB case, applied to two additional exact keys. It does not certify general terrain, inventory, or spell behavior. The variable-argument `castmu` edge and `gazemu → polymon` remain active in the projection; no blanket callee suppression is proposed.

## Native witnesses and reproduction

Existing source-selected `recipes/mcastu.c/grand-master-fire-pillar-independent.session.json` and `grand-master-lightning-independent.session.json` are reused unchanged. Supported wizard level/monster commands create the native Grand Master encounter. Fresh C captures pin the recorder binary and current source provenance; the recipes themselves are not new discoveries.

| Variant | Reached effect | Complete C/JS match |
| --- | --- | --- |
| Fire-pillar target | Fire pillar message, completed effect and subsequent caster curse | 2835 RNG, 90 screens/cursors |
| Lightning control | Non-reflected lightning, completed post-hit blindness feedback | 2564 RNG, 99 screens/cursors |

No random draw, attack table or callback is overridden. Full recordings total about 22 KB compressed. Capture and initial replay were on evidence-only commit 4472bdbaa7255c3b8b4208e43986597133cb2b40; `git diff --quiet b95445f519c19c3cbce5be6252c18e03e77275a7 4472bdbaa7255c3b8b4208e43986597133cb2b40 -- js nethack-c` passed. Clean-base receipts use the exact Main base declared in case.json. C gitlink and recorder SHA-256 are retained in observations.

```
node diagnostics/divergence-evidence/monsters/cleric-floor-spell-stub-negative/replay.mjs target
node diagnostics/divergence-evidence/monsters/cleric-floor-spell-stub-negative/replay.mjs control
```

Both expected exits are 0 from the stated base with the pinned C submodule initialized. The runner checks source constraints and native spell completion before comparing every recorded RNG call, screen and cursor. Source/config dependencies and actual receipts are hashed. No intentional failure is registered in default CI.

## Original scan and controls

This reuses run `2bfc89cdcbaa6139046f`, raw SHA-256 `4e7ab2870a6c57b5c1d586b651917cfabf28056c485f9f92ebc0e202cfcc1b93`, from [the durable PR #96 artifact](https://github.com/vtjeng/teleport-contest/blob/9c2df4fe2eda635c3a92afc6b3673626d595ebe1/diagnostics/divergence-evidence/monsters/medusa-ugly-reaction-negative/discovery-run.json.gz). No full scan or duplicate original run was added. Both mcastu.js and zap.js are unchanged from the original scan base b313cde5b50f3c5b5e8f622ff32418cbc1ae12be.

The accepted exporter and original-run validator verify four active keys becoming two active and two filtered. Only the two literal-argument edges receive decisions, with hub-generated fingerprints. The finite inventory summary in the sibling WEB package advances to five recorded reviews: four resolved negatives, one unresolved; 684 of 689 keys have no recorded review. Other prior unqualified/parked hypotheses retain their status.
