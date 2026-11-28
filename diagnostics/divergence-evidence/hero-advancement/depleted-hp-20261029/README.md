# Depleted HP advancement and nonfatal floor

Four public C/JS comparisons match, with exact state and RNG assertions. JS82402a4ee97a94f2f45b896f6fbef260e093ddcd; C gitlink16ff59115315917b93185d026aeefea06db9b0f4; verified source-built recorder SHA256 cb8a2a847d3c4f1c52213757abdbedd2e74c872339691cd5bef5489c64b891ad. Build inputs and binary origin remain in the linked recorder package.

The Wizard starts beside a wall. One ordinary kick deals2 HP and skips wounded legs. HP18/20→gain3:20/22→loss2:18/20→loss1:10/12 preserves the2-point deficit. Four kicks have damage draws2,4,5,5 and wound-branch draws2,1,1,2: none wounds. Displayed HP20→18→14→10→5 includes one ordinary regeneration point. The next wizard loss subtracts the stored8-point increment and clamps5−8 to1, displayed1/12. The prefix control ends at5/20. All paths remain nonfatal and use no combat or object effects.

This resolves a bounded natural depleted-HP setup gap and the public below-one loss clamp. It does not qualify reduced maxima, the higher-level minimum-max branch, upper-current clamp, natural level drain or Welcome back history. C saved increments are inferred from source and public transitions; the verifier checks exact JS slots separately. Four-kick JS prequalification observations are retained, but C recordings provide the comparison evidence. No new semantic discrepancy.

Run `node diagnostics/divergence-evidence/hero-advancement/depleted-hp-20261029/verify.mjs` for archived full parity and runtime assertions. Fresh recordings use the receipt argv with a new output directory, activation `/workspace/.setup/activate.sh` and recorded NETHACK_INSTALL/NETHACK_BINARY paths. All expected/actual exits0. No additional tools, installs or engine instrumentation. Elapsed time is not active compute.
