# Naturally earned practice and restored slot eligibility

Three full public C/JS comparisons match. JS82402a4ee97a94f2f45b896f6fbef260e093ddcd; C16ff59115315917b93185d026aeefea06db9b0f4; verified source-built recorder SHA256 cb8a2a847d3c4f1c52213757abdbedd2e74c872339691cd5bef5489c64b891ad.

Wizard level20 supplies sufficient energy and19 free skill slots. Ordinary Zb casts the already-known cure-sickness spell. The hero has no sickness/sliming; this dedicated branch calls healup(0,0,TRUE,FALSE), reports “You are not ill”, and earns3 healing practice on success. It does not call object-effect emulation. Forced #wizcast was rejected as a setup because it skips use_skill.

Ten attempts produce six successes and four failures, hence18 practice below20. Eleven attempts produce seven successes, hence21, and the spell-casting eligibility message. Level loss to1 removes all free slots; gain to2 restores one and the general eligibility message follows. Both controls and the target match RNG, screens and cursor; the verifier separately asserts JS practice, slots, healthy conditions and full HP. Exact C practice memory is not directly read.

The successful-cast history is ordinary play; level setup/transitions remain wizard-assisted. No natural level drain/recovery or naturally spent-slot refund claim. This narrows the prior natural-practice setup gap without creating a semantic discrepancy.

Run `node diagnostics/divergence-evidence/hero-advancement/natural-practice-20261029/verify.mjs`. Fresh recording argv, activation and NETHACK binary/install overrides are in each receipt; use a new output directory. Expected and actual exits0. The bounded JS setup observations are retained separately from executed C evidence.
