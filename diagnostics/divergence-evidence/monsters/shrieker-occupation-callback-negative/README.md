# Shrieker interruption is wired through normal monster actions

Bounded explained negative for the hypothesis that the missing literal `stop_occupation` call in JS's shrieker helper loses occupation interruption during normal monster turns. **No automatic scanner suppression is proposed:** the bare `m_respond` API without a supplied callback is outside this proof.

The actual production path is `runSimpleMonsterAction` → `dochugw` → `runDirectMonsterAction` → `dochug` → `m_respond` → `m_respond_shrieker`. The outer wrapper supplies the real `stop_occupation` adapter, and the environment carries it through those calls. The helper's differently named `stopOccupation` callback therefore performs the interruption.

A native adjacent shrieker executes the full normal action against an initialized human Valkyrie with an active searching occupation installed through `set_occupation`. Its callback is inert because this experiment tests interruption, never occupation advancement. Hearing target: the shriek is emitted, real `stop_occupation` clears the handler and prints `You stop searching.` Deaf control: no shriek output and the handler remains active. A valid nonzero summon draw avoids creation, and both JS cases consume the same two bounded draws. No visibility or stop callback is injected by the fixture.

The C oracle extracts and compiles the complete unchanged `m_respond_shrieker`. Naming, message, stop and aggravation owners are explicit stubs; summon creation fails the oracle if unexpectedly reached. It proves the hearing guard calls stop and both cases aggravate; it does not simulate a full C monster turn, occupation completion or summons. The real JS owner performs the tested occupation change. This is not a claim of broader shrieker or spell parity.

Pinned JS/tool base `32578f23091dad34635a9b4fe0bfb45ed9840e39`; C `16ff59115315917b93185d026aeefea06db9b0f4`. Run from repository root with Node and C99 `cc`:

```sh
node --test diagnostics/divergence-evidence/monsters/shrieker-occupation-callback-negative/proof.mjs diagnostics/divergence-evidence/monsters/shrieker-occupation-callback-negative/oracle.mjs
node --test scripts/test-suites.test.mjs
```

Clean detached base verification: 3 focused checks and 6 suite-guard checks pass. Ordinary `.mjs` names keep these evidence runners outside default discovery. Source hashes and raw observations accompany the case.

The exact matching original scanner lead identity and hub-generated review fingerprint are in `scanner-binding.json`. The original run remains reusable at [this published gzip](https://github.com/vtjeng/teleport-contest/blob/5011e3c8e/diagnostics/divergence-evidence/monsters/vrock-gas-delegation-negative/discovery-run.json.gz), uncompressed SHA-256 `22dde96e93aafc25876762fe1e4c4be4144c28432f353c2a77a6248d11a8642e`. Relevant `js/mon.js` is unchanged since that run's base. No final whole-lead decision/projection is supplied because other entry contracts are not qualified; retaining the lead is intentional. Reuse this proof only for normal action-wrapper wiring, and recheck when environment forwarding or callback ownership changes.

Four previously unresolved hypotheses remain separate. No gameplay changes, excluded scenarios or denied-turn artifacts are involved.
