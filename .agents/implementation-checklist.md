# Repeated simple commands: second re-audit checklist

## Boundary

- Starting event: an admitted repeated wait, one-square walk, or starting-pet
  collision at a ready D:1 prompt.
- Ending event: the next ready prompt, or the move-one-billion handoff to
  `done(ESCAPED)` after the urgent message and recorder-final boundary.
- Exclusions: every other command and every future-work monster, terrain,
  inventory, combat, transition, and endgame branch listed in `ROADMAP.md`.
- Observables: state and alias ownership, PRNG and call order, messages,
  complete screens and attributes, both cursor owners, queued input, and retry
  atomicity.

## Candidate construction

- Traced `allmain.c:moveloop_core`, `mon.c:movemon_singlemon`,
  `monmove.c:m_everyturn_effect`, `hack.c` capacity helpers, recorder patch 006,
  and the corresponding JavaScript consumers.
- Cross-checked the second full audit's five confirmed findings against the
  complete retry snapshots, fresh matrix, and direct source-state oracles.
- Manual search remains excluded by the authoritative selected goal.

## Implementation table

| Source family | Live reachability | JavaScript owner | Evidence | Status | Next action |
| --- | --- | --- | --- | --- | --- |
| Post-action `encumber_msg` | HUNGRY-to-WEAK changes capacity before clairvoyance and the next prompt | `js/allmain.js:finishHeroTimeEffects` | Full audit finding; `allmain.c` post-action order | missing | Await encumbrance after `hero_seq++` and before clairvoyance |
| Fog-cloud every-turn planning | Every living on-map fog cloud runs upkeep before its movement-ration test | `js/unported_monster_actions.js`; `js/mon.js` | Full audit finding; below- and at-ration cases | missing | Plan through `movemon_singlemon` with clone-safe gas-cloud creation |
| Recorder-final terminal oracle | The final no-key capture must contain the complete rendered frame and independent cursor order | `scripts/allmain-turn.test.mjs` | Full audit finding; recorder patch 006 | missing | Pin full frame/cursor digests and a stale-frame discriminator |
| Capacity branch oracle | Encoded Strength, saturation, coins, boulders, projection, and live cache are valid inputs | `scripts/u-init-inventory-attrs.test.mjs` | Full audit finding; `hack.c` arithmetic | missing | Add source-derived boundary table and ownership assertions |
| Recursive light oracle | Planning must clone a multi-node list and remap every monster owner | `scripts/unported-monster-actions.test.mjs` | Full audit finding | missing | Add monster and object tail identities plus leak mutation |

## Validation

- Commit checked: pending
- Focused tests: pending
- Full suite and generated checks: pending
- Fresh 12-case differential: pending
- Development score: pending
- Quality check: pending
- Browser check: not required for shared engine behavior.

## Readiness

Current mode: Implementation

Reason: five confirmed re-audit rows remain open.
