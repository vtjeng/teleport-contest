# Configuration-scoped route negative

The missing call is real, but its zero-room branch is bypassed by the pinned shipped routes. Main Mines/Sokoban/Quest endpoints lie before minimum Medusa depth 21. Castle/endgame endpoints have named levels. Other dungeon endpoints use named or fill levels. Fort Ludios starts floating; mk_knox_portal only activates it above Medusa and passes explicit vault coordinates. Ordinary makelevel asserts rooms exist; special fixup routes zero-room default areas through place_lregion, which supplies explicit selected coordinates.

64 initialized layouts, 896 endpoints (64 floating); no unnamed-maze endpoint. Synthetic additional unnamed-maze endpoints are flagged by the route classifier. These controls are not claimed reachable gameplay fixtures.

Only successful generation using the pinned shipped dungeon configuration and the documented callers. The helper omissions remain real outside this scope. No universal source equivalence or supported arbitrary-Lua/custom-dungeon claim. Do not suppress globally from sample matches. Re-review when dungeon templates, branch activation, named/fill dispatch, or region/branch caller logic changes. Failed/missing level loads are outside this proof, not false positives.

Run `node diagnostics/divergence-evidence/levels/levels-maze-branch-routing-20261028/probe.mjs` from the repository root with Node. Expected exit 0. The template/route controls deliberately reject an uncovered slot or hypothetical unnamed-maze endpoint; those are detector controls, not claimed public-play setups.

The portable scanner handoff uses the PR #43 exporter at commit `a879e944617577d3eb59c14afc87ddbdb2724b18`, in an isolated checkout. `projection.json`, `manifest.json`, and `decisions.json` preserve the original identity and decision. Full-run validation verified all 12,525 original leads against this one-lead projection: active 1 → 0, filtered 0 → 1, excluded 0 → 0. The manifest pins the original immutable run hash and tool hashes. The decision applies only to the documented successful shipped configuration; the real helper omission remains outside that domain.

Consumers can validate the portable handoff from the pinned exporter checkout without access to our private run path:

```sh
node scripts/discovery-project.mjs validate --projection /absolute/evidence/projection.json --decisions /absolute/evidence/decisions.json
```

Original-run comparison was additionally performed before publication with `--run /tmp/levels-hub-20261028-05/run.json`; its verified receipt is in the manifest. The eight matching fresh recordings in `exploration.json` are bounded observations, not a proof of all special-level behavior or of Lua attribution.

Clean-base verification: both documented probes passed in a separate checkout of `58ad57cea2dcd8b94b8d1f7644e9e21fc02c7cd1` with evidence files overlaid and gameplay source unchanged.

Publication freshness check: fetched Main `8eec78d622b3ef9cb22a54d1699aaf335e9342e9`; the C gitlink and all four relevant JS routing/configuration files are unchanged from the tested base.
