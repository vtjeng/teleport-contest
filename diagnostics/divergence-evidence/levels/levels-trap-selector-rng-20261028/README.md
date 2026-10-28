# Trap-type selection: RNG delegation

Direct C RNG edges are delegated through levelTrapEnv.random in both JS trap-type selectors. These five edges share one delegation cause; supplied legal draw values produce the same results and checked draw bounds/counts in the finite domain.

7000 exact-C/general-JS selector comparisons:25 initial trap choices ×7 secondary values ×10 contexts (ordinary depths1..8, hell depth26, one-level Knox depth18) ×noteleport0/1 ×NOSPIDERONWEB0/4. Results match, including2746 NO_TRAP returns,4254 accepted choices and280 hole cases making a second rn2(7) call. Exact C bodies and trap enum are included; C level predicates use asserted context adapters. JS uses production level_difficulty and single_level_branch with explicit minimal dungeon state.

Control: All seven legal Rogue rn2(7) choices match exact C and each uses one draw. General matrix includes accepted and rejected threshold/flag controls. This is helper-contract evidence, not trap construction, whole dungeon-state equivalence, independent RNG, retry/placement or runtime effects.

Clean-base reproduction:

1. Check out `b977a2a5f2edbfcf72a8d8d651518793fd862074` with C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Copy this evidence directory into that checkout without gameplay edits.
3. Use existing Node24.19.0 and Clang19.1.7 (`source /workspace/.setup/activate.sh` here). No install/network dependency.
4. Run `node diagnostics/divergence-evidence/levels/levels-trap-selector-rng-20261028/probe.mjs target` (exit0;7000 comparisons).
5. Run `node diagnostics/divergence-evidence/levels/levels-trap-selector-rng-20261028/probe.mjs control` (exit0;7 Rogue controls).
6. Run `node --test scripts/test-suites.test.mjs`.

The ordinary/hell/Knox fixtures provide state only for queried context fields. C receives the asserted corresponding difficulty/hell/single-level values; this isolates the selector contract rather than pretending to execute dungeon initialization. Typed RNG adapters reject unexpected bounds and check draw counts; the C bodies are copied exactly, with source hashes. Compact receipts retain exact input/result hashes; the runner deterministically reconstructs every row. Early fixture construction omitted the one-level branch record and correctly failed before comparison; the final fixture supplies a downward branch and verifies computed difficulty. Those setup failures were not classified as divergences.

Limits: Finite selector-contract domain only:25 initial choices,7 legal secondary values,ordinary difficulty1..8/hell26/Knox18,noteleport0/1 and flags0/4. No all-depth/all-flag or complete topology claim. C exact selectors use context adapters for level_difficulty, Inhell and single_level_branch. JS calls its production context functions with minimal explicit dungeon state; actual difficulty is asserted. These adapters do not establish C/JS dungeon-state computation equivalence. RNG values are supplied through checked interfaces, not generated independently. Tests compare selection and draw bounds/counts; they do not construct traps, execute retries/placement, create victims, change monsters/objects, or test runtime effects, finalization or shipped exposure. The seven Rogue controls exhaust legal draws for that switch only. No broad equivalence or suppression of other trap placement/runtime warnings follows.

Official exporter validation against the original immutable run verifies all five keys become filtered. Five keys represent one shared RNG-delegation cause. Frozen inventory now38 negative keys/20 causes,3 historical candidate keys,8 stale,474 without current disposition. Candidate counts retain historical discoveries; parent confirms solidfill and engraving fully accepted at this base as related repair extensions (accepted-routing.json). Mazewalk final receipt remains unconfirmed in this shard. Three parked gaps remain unchanged.
