# Scoped level-generation negative

JS randomOneBased and random parameters default to imported rnd and rn2. Actual C and JS function bodies agree on results, bounds and short-circuit draw counts for seven valid inputs.

Fixed 0/1 lighting uses no draws. Random lighting with rnd >=11 skips rn2; rnd 10 calls it. rn2 zero/nonzero flips the result.

Run `node diagnostics/divergence-evidence/levels/levels-cave-light-rng-20261028/probe.mjs` from the repository root with Node and clang on PATH. The script extracts the pinned production bodies, compiles a temporary C oracle, compares results, and removes its temporary files. `case.json` records bases, source hashes and limits. `observations.json` retains compact raw observations. These helper checks do not establish public-play reachability or universal map parity.

The five exact scanner leads share one portable projection under `../levels-cave-pass-prefix-20261028/bound-run.json`. The discovery base precedes the tested base, but mklev.js, mkmap.c and discovery-hub.mjs are byte-identical between them. Original run IDs and fingerprints are unchanged. The projection preserves all run metadata and selected lead objects; its count is not a full-run filter-yield denominator.
