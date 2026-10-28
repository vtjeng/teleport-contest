# Guardian slime transition: unresolved reachability supplement

This supplements [PR #81](https://github.com/vtjeng/teleport-contest/pull/81), without promoting its guardian-admission hypothesis. **Zero confirmed divergences; zero explained negatives.** Four supported public-input attempts failed to reach the necessary transition. This case is manual/unbound and must not suppress any discovery lead.

The earlier wand route met Angel magic resistance. The new route is native green-slime touch: `mhitm_ad_slim`'s monster-pair arm calls `newcham` after cancellation, chance, slimeproof and munslime checks, without the wand's `resists_magm` gate. No guard or monster data was modified. The genuine tame guardian comes from the shipped `recipes/monmove.c/guardian-angel-movement-cat.session.json` Astral entry recipe. Count prefixes are supported by `create_particular_parse`; there is no supported creation adjective for increasing slime level or speed.

The precise remaining uncertainty is a **landed, non-negated green-slime-to-guardian touch that passes the chance/self-cure checks and performs the C transition, followed by guardian movement**. The four-slime recording reaches a retaliation, but it misses. The eight-slime variation increases nearby attackers but reaches hero-directed touches and guardian kills instead. Neither is a negative proof. Do not repeat a count escalation or the failed wand route without a materially new setup rationale.

## Reproduce the packaged observations

From a clean checkout of the `case.json` JS base, copy this directory unchanged and initialize the pinned C submodule. Run:

```
node diagnostics/divergence-evidence/monsters/guardian-slime-reachability/replay.mjs target
node diagnostics/divergence-evidence/monsters/guardian-slime-reachability/replay.mjs control
```

Both are expected to exit 0 for recorded parity, **not successful target coverage**. Target is attempt 4 (eight slimes); control is attempt 3 (four slimes). The control checks the specific missed retaliation. The target has 10,530 RNG calls and 380 screens/cursors; control has 9,626 RNG calls, 380 screens/cursors and one animation frame. Separate current-base replay receipts are supplied. There is no post-fix check because no repair is qualified.

All four recipes are retained. Attempts 1–3 were captured/replayed on b313cde5b50f3c5b5e8f622ff32418cbc1ae12be; attempt 4 on the declared newer base. `observations.json` preserves original recording SHA-256, C gitlink and recorder binary fingerprint. Complete small native recordings for attempts 3 and 4 are compressed here. The earlier recordings remain private; attempt 1 never created a slime, and attempt 2 never reached a slime attack against the guardian. No failed attempt is counted as a negative.

Fresh capture, if a materially improved setup is justified, uses the existing recorder:

```js
import fs from 'node:fs';
import {runDifferential} from './scripts/diff-fresh.mjs';
const recipe=JSON.parse(fs.readFileSync('diagnostics/divergence-evidence/monsters/guardian-slime-reachability/attempt-4.recipe.json'));
console.log(await runDifferential(recipe,process.env,{evidenceDir:'/absolute/new/private-directory'}));
```

The saved native screens contain ordinary incidental Astral gameplay. Those events are not additional claims or an investigation of object effects. No artifacts from denied turns are used.

## Other bounded source observations this pass

At the declared JS/C bases, `mhitm_ad_slee` preserves C's unusual double `sleep_monst` call in the monster-pair arm. `mcast_confuse_you` and `mcast_death_touch` already account for hallucination resistance. Spell dispatch delegates through the real action environment. These inspections produced no new witnessed discrepancy and are **not published negative decisions or broad equivalence claims**. The neighboring sleepy-gaze scanner lead stays active.

Next experiment: identify a supported positioning/action sequence that lets a native slime survive and land the guardian-directed touch, rather than adding more identical count probes. Until then, PR #81 and this supplement remain unresolved. The ten unqualified prefix sites and the other three older hypotheses retain their previous status.
