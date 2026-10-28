# Successful monster missile catch aborts a full JS action

Confirmed scoped production-API divergence on Main `1c4be74beb32edbfc897de805f218e180f8c6002`, C `16ff59115315917b93185d026aeefea06db9b0f4`. This is a **combat/inventory boundary handoff** for Main, not a gameplay change or an expansion into excluded object investigations.

An ordinary native ogre starts four squares east of the initialized Valkyrie, carrying one unwielded orcish dagger created by `mksobj` and transferred by `mpickobj`. A small unobstructed ROOM strip is the fixture arena. The full `runDirectMonsterAction` moves the ogre one square and throws the missile through the real production adapters. No catch/vision/hand/capacity predicate is replaced. The hero has DEX 10, giving catch bound 90; the injected bounded random stream differs only in that catch draw.

- Target `rn2(90)=0`: JS throws `simple monster action requires successful monster missile catch`. The dagger has already left monster inventory and is `OBJ_FREE`; hero HP stays 16. This is an observed API abort, not a claim that the public replay permanently loses the object (planning may stop before live execution).
- Control `rn2(90)=1`: the action finishes, hero HP becomes 15, and the dagger is on the floor. This is a JS control; the C oracle does not simulate the subsequent failed-catch damage.
- C's unchanged `u_catch_thrown_obj` passes the successful missile to `hold_another_object` with `You catch the orcish dagger!`, returns TRUE, and the enclosing `m_throw` breaks out of the flight loop. The failed roll returns FALSE without an inventory handoff.

The initial character has free inventory capacity, hands and a free hand. An orcish dagger avoids merging with the starting ordinary dagger. After implementation, the target assertion expects completion, no HP loss and `OBJ_INVENT`. The current failure is deterministic before that inventory assertion.

From repository root, with Node and a C99 `cc`:

```sh
node --test diagnostics/divergence-evidence/monsters/monster-missile-catch/oracle.mjs diagnostics/divergence-evidence/monsters/monster-missile-catch/probe.mjs
EXPECT_CURRENT_GAP=1 node --test diagnostics/divergence-evidence/monsters/monster-missile-catch/oracle.mjs diagnostics/divergence-evidence/monsters/monster-missile-catch/probe.mjs
node --test scripts/test-suites.test.mjs
```

Verified in a clean detached checkout of the stated base with only this evidence directory: default 2 pass / 1 expected target failure; characterization 3 pass; suite guard 6 pass. The runners have ordinary `.mjs` names and are not registered in default CI.

## Oracle limits and provenance

`oracle.mjs` compiles the complete unchanged C catch function extracted from the pinned source. Guard macros are explicit fixture inputs (human Valkyrie, DEX10, no disabling conditions, free hand, unencumbered), and `hold_another_object` is a call-recording stub. It proves the branch, message argument, return and handoff, **not full C projectile/inventory execution**. The JS target reaches the branch with the actual guard owners. No public C recording or full C/JS RNG match is claimed. This supported API witness is scoped accordingly.

Main's likely ownership boundary is `js/mthrowu.js:u_catch_thrown_obj`: the successful branch currently calls `refuseRanged`; `js/invent.js:hold_another_object` is already asynchronous, and the flight-loop caller presently invokes catch synchronously. Main should own integration across those functions. No repair is included.

Manual source inspection found the discrepancy, then an exact existing scanner lead was located. `scanner-binding.json` preserves its canonical key, evidenceKey, runId and hub-generated reviewFingerprint; this is not a suppression decision. Relevant `js/mthrowu.js` is unchanged since the run's base. Original run SHA-256: `22dde96e93aafc25876762fe1e4c4be4144c28432f353c2a77a6248d11a8642e`; reusable [gzip artifact](https://github.com/vtjeng/teleport-contest/blob/5011e3c8e/diagnostics/divergence-evidence/monsters/vrock-gas-delegation-negative/discovery-run.json.gz). Source/tool fingerprints and timestamps are in `case.json`; focused raw output is in `observations.txt`.

A prior ordinary-dagger scout reached the same refusal and failed-catch control; the final orcish-dagger fixture removes future inventory merge ambiguity. Prior Archon targeting, later wraith growth and castmu water-wall wording remain unresolved and separate. Repository PR title search for “catch” returned no matches at review time; Main should deduplicate against any private inventory work before implementation.
