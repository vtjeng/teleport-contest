# castmu attack ownership: unresolved, bounded normal-path witnesses

The general `castmu → mon_spell_hits_spot` warning remains **active and unresolved**. It is not discharged by the exact cleric or armor-slot negatives in this batch.

C castmu passes literal AD_MAGM/AD_COLD (and AD_FIRE) to the floor helper. JS's two implemented elemental arms pass `mattk.adtyp` after awaited message work. The generated template attacks are frozen, but `monst_globals_init` clones them into mutable game records. For ordinary Angel, Yeenoghu and Asmodeus magic attacks, production `getmattk` returns that mutable record by reference. A frozen-template argument is therefore insufficient. The normal adapter binds TTY messaging; this investigation does not claim that TTY changes attacks, nor invent a malicious/custom callback as a gameplay witness.

Two existing independent public-input recipes were freshly recorded: Tourist takes an Angel magic-missile spell (3202 RNG calls, 131 screens/cursors), while Wizard's starting Antimagic yields the bounce message (2390 RNG, 131 screens/cursors and 22 animation frames). Both match C completely. No RNG overrides, custom attack table, equipment edits or callback mutation were used. Ordinary native missile behavior matches; this is not a newly found gameplay issue.

Run on Main `b977a2a5f2edbfcf72a8d8d651518793fd862074`, C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`:

```sh
node diagnostics/divergence-evidence/monsters/castmu-attack-ownership-scope/replay.mjs target
node diagnostics/divergence-evidence/monsters/castmu-attack-ownership-scope/replay.mjs control
```

Both exit 0 and first run the read-only attack-ownership check. The helper check covers normal initialized data only; the public recordings provide reachability for the two Angel branches. It does not certify all monster states or arbitrary adapter callbacks.

Missing step: establish the admitted callback/attack-ownership contract across suspension for all supported inputs, or narrow the decision to a proved production caller. AD_COLD is still not witnessed here. A future experiment should trace production callbacks/continuations and then select a supported cold-spell control if it adds evidence. Do not repeat the matching Angel recordings as a universal-equivalence argument. Existing AD_FIRE catalog evidence is not repeated.

Original run and projection provenance are reused from PR #96 (run `2bfc89cdcbaa6139046f`, SHA-256 `4e7ab2870a6c57b5c1d586b651917cfabf28056c485f9f92ebc0e202cfcc1b93`). Export/validation against the complete original run confirms one selected key stays active, with no decisions. This record consolidates the previously private ownership triage; it is not a new root cause or a Main implementation handoff. No excluded investigation or denied-turn artifact is used.


## Clone/disappear selector supplement: still unresolved

The two diagnostic-message keys are now retained in this same investigation rather than separate per-attempt PRs. `guard-proof.mjs target` compares the complete selected clone guard arms for iswiz false/true and positive Wizard counts 1, 2, 3. `guard-proof.mjs control` compares all 16 boolean combinations of invisibility, invisibility-blocked, peacefulness and hero see-invisible. Each set includes accepted and rejected predicates. C and JS agree on every row. The runner compiles the selected original C arm and evaluates the selected original JS arm: it does not claim a full spell runtime oracle or reachable setups for every predicate combination. No object or equipment transition is exercised.

```sh
node diagnostics/divergence-evidence/monsters/castmu-attack-ownership-scope/guard-proof.mjs target
node diagnostics/divergence-evidence/monsters/castmu-attack-ownership-scope/guard-proof.mjs control
```

Precise gaps: clone selection rejects counts greater than one, while execution requires exactly one. A zero-count live-Wizard setup is **not** introduced; production count positivity must be established before claiming the diagnostic unreachable. For disappear, selected guards reject invisible/blocked casters, but state stability between selection and effect remains necessary. These guards are not a general castmu equivalence proof. Existing production disappear tests already cover ordinary blocked selection; no duplicate gameplay test is added.

Next useful work is a bounded production invariant/continuation audit, not another matching broad recording. All three projection keys stay active, with zero negative decisions. Relevant source files and C gitlink are unchanged between the retained witness base b977a2a5f and fetched Main 176bb0e38117602afab165ee6d4e363c11943fdb; new source-check receipts use the same clean witness base. No historical replay receipt is rewritten.
