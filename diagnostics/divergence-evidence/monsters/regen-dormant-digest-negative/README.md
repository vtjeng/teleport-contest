# Dormant regeneration meal-completion edge

Explained negative **only for the shipped call graph**: the exact scanner lead `source-audit:edge-c-only:src/monmove.c:mon_regen:finish_meating` points into `if (digest_meal)`. The only C source caller is `mon.c:1193`, with `FALSE`. Normal monster meal countdown/completion belongs to `m_move` in both C and JS. No meal, object-effect, or broader combat equivalence is claimed.

**Do not apply this decision to a direct true-argument API contract.** C implements that branch; JS explicitly throws even for a monster with no meal. This limitation is preserved by a positive true-argument C control and an assertion of JS's unsupported result. The evidence does not promote that dormant API gap as a ready gameplay issue.

Run explicitly from repository root, with Node and C99 `cc`:

```sh
node --test diagnostics/divergence-evidence/monsters/regen-dormant-digest-negative/proof.mjs
node --test scripts/test-suites.test.mjs
```

The proof enumerates every `mon_regen` identifier in `src/*.c` after removing comments, rejecting extra calls or address-taking. A repository-wide C/header search additionally found only the extern declaration. It extracts and compiles the entire unchanged C `mon_regen`; surrounding healing and completion are small explicit stubs. False preserves the meal counter; true completes it. The JS false case agrees. Separate source assertions pin the ordinary `m_move` completion owner and production binding; they are not a full runtime meal simulation. Existing healing/cooldown tests in `scripts/mon.test.mjs` are reused as context, not counted as another new negative.

Base and exporter/hub identity: Main `1c4be74beb32edbfc897de805f218e180f8c6002`, accepted tooling including `034443e92`. C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`. Relevant `js/mon.js`, `js/monmove.js`, and `js/dogmove.js` have no changes since original scanner base `5826a75fcc149b8895af22af4d38ea750bad13c8`; source hashes are in `case.json`. Clean-base focused checks: 2 pass. Assembled-tree suite guard: 6 pass. Runner uses ordinary `.mjs`, outside default CI.

`decisions.json` retains the hub-generated exact review fingerprint. `projection.json` and `manifest.json` were produced by the accepted exporter, not reconstructed by hand. Validation against the complete immutable run confirms one active lead becomes one filtered lead. The reusable original gzip is [published here](https://github.com/vtjeng/teleport-contest/blob/5011e3c8e/diagnostics/divergence-evidence/monsters/vrock-gas-delegation-negative/discovery-run.json.gz); decompress once and verify SHA-256 `22dde96e93aafc25876762fe1e4c4be4144c28432f353c2a77a6248d11a8642e` before validation:

```sh
node scripts/discovery-project.mjs validate --projection diagnostics/divergence-evidence/monsters/regen-dormant-digest-negative/projection.json --run /absolute/original-run.json --decisions diagnostics/divergence-evidence/monsters/regen-dormant-digest-negative/decisions.json
```

Reopen this exact decision if a new caller, generated caller, function pointer or true-argument API use is admitted. Do not generalize it to other missing calls. Prior Archon targeting, later wraith growth and castmu water-wall wording remain unresolved and separate. Initial local test import mistakenly requested `mons`; corrected to shipped `MONSTER_TEMPLATES` before successful validation; the failed import provides no behavioral evidence.
