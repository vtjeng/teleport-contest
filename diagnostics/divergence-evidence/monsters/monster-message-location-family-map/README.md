# Monster message location family: bounded source map

Status: **unresolved source inventory**, manual/unbound. No new confirmed divergence,
explained negative, scanner suppression, or runtime equivalence claim. This batches
remaining source discrepancies so Main can assess one bounded formatting repair
instead of receiving one repetitive PR per message. Main owns implementation.

Exact revisions, source SHA-256s, line anchors, timestamps and observations are in
`inventory.json`. From repository root at JS base
`51f5686fac30306411156df215ca83ae910cf6bf` with C submodule
`16ff59115315917b93185d026aeefea06db9b0f4`, run:

```
node diagnostics/divergence-evidence/monsters/monster-message-location-family-map/verify.mjs
node --test scripts/test-suites.test.mjs
```

The first command checks only source identity, not behavioral parity. It needs no
fixture, recorder, private path, network access or scanner artifact. No deliberate
failing test is added to default CI.

## Bounded scope and missing experiments

| Function | C location-bearing sites / JS plain messages | Missing qualification |
| --- | --- | --- |
| `passivemm` | Cold resistance, cold damage (already PR65), stun, fire resistance/damage, electricity resistance/damage | Reach each new passive branch with real monsters and native resistance; preserve living/noncancelled defender, random passive gate and attacker visibility. Compare accessibility on/off. PR65 establishes only its cold-damage route. |
| `gazemu` | Ineffectual stoning gaze, reflected Medusa petrification, stunning gaze, cancelled reaction | Establish each actual gaze/cancellation/reflection route. Shipped exposure for the stunning branch is not established here. Preserve `canseemon`, awareness, reflection and visibility guards. |
| `mdisplacem` | Attacker petrifies on contact | Establish an actual eligible displacement pair with petrifying defender, nonresistant/gloveless attacker, no stone-polymorph escape, visible/nonquiet action. No arbitrary direct-helper state is supplied as a production witness. |

Expected C behavior is conditional location formatting through `pline_mon` when
`accessiblemsg` is enabled; observed JS evidence is **source-only** use of plain
`message`. No new C oracle was executed. Ordinary gameplay reachability for these
11 sites remains unqualified. The 12th listed site is the existing PR65 witness,
not a new finding. Inventory is deliberately limited to these three functions,
not an exhaustive audit of all monster messages.

## Controls that constrain the repair

Do not wrap every message in these functions:

- `passivemm` floating-eye and gelatinous-cube paralysis sentences use C `pline`,
  not `pline_mon` (C 1382/1390; JS 1841/1855).
- `gazemu` serpent-cut joke and unnoticed reflection sentence use plain C `pline`
  (C 1713/1732; JS 3028/3061). Hero-facing `You(...)` messages are also distinct.
  Confusion and fire gaze already use JS location adapters; that source observation
  is not a new proved negative.
- `mdisplacem` attempted/successful displacement narration uses plain C `pline`;
  its petrification sentence alone is located in the scoped branch.
- [PR88](https://github.com/vtjeng/teleport-contest/pull/88) supplies the native
  opposite-direction control: spoken `"Bright light!"` must remain unprefixed.

Existing related witnesses are
[PR65](https://github.com/vtjeng/teleport-contest/pull/65) (passive cold),
[PR73](https://github.com/vtjeng/teleport-contest/pull/73) (sleep grip, API scope),
and [PR90](https://github.com/vtjeng/teleport-contest/pull/90) (Pestilence touch).
Reuse their exact limitations and fixtures. Similar formatting does not itself
establish a single implementation cause or justify changing all callers.
PR87's default name/article issue is separate from this location-prefix map.

Next useful experiment: adapt PR65's supported combat route to one distinct
resistant/elemental passive branch with an accessibility-off control. Other two
clusters require independent supported reachability before ready classification.
The four earlier unresolved hypotheses remain separate; no previously excluded
investigation or denied-turn artifact was used here.
