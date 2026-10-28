# Scoped level-generation negative

C mkmap calls pass_one once, pass_two once and pass_three twice only when smoothed. JS mkmap calls corresponding mkmap_-prefixed functions with identical dispatch. Extracted actual C and JS pass bodies match on 12 deterministic full-size maps per pass. Pass one updates in place; two and three buffer before committing.

Uniform maps include stable controls; every pass has changing targets that reject an omitted-pass implementation. Smooth false/true dispatch controls require zero/two pass_three calls.

Run `node diagnostics/divergence-evidence/levels/levels-cave-pass-prefix-20261028/probe.mjs` from the repository root with Node and clang on PATH. The script extracts the pinned production bodies, compiles a temporary C oracle, compares results, and removes its temporary files. `case.json` records bases, source hashes and limits. `observations.json` retains compact raw observations. These helper checks do not establish public-play reachability or universal map parity.

The five exact scanner leads share one portable projection under `../levels-cave-pass-prefix-20261028/bound-run.json`. The discovery base precedes the tested base, but mklev.js, mkmap.c and discovery-hub.mjs are byte-identical between them. Original run IDs and fingerprints are unchanged. The projection preserves all run metadata and selected lead objects; its count is not a full-run filter-yield denominator.
