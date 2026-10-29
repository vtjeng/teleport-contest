# Ordinary multiple-drop boundary: scoped negative

Measured JS d0bd0ea4fe998bf74c56352cf6afc98f1d65c9d4; C gitlink
16ff59115315917b93185d026aeefea06db9b0f4. Three fresh executed C/JS
comparisons match every screen, cursor and RNG call. Full-menu one-arrow and
two-arrow cases each have 56 screens and 2326 RNG calls; combination-menu
case has 48 screens and 2311 RNG calls. All runner exits are 0.

Seed 642919, Valkyrie, strength/constitution 18, capacity 950, unchanged
90-unit starting kit. Supported debug wishes supply 861 arrows and 49 coins.
Only ordinary arrow/coin stacks are selected. Full-menu D drops one or two
arrows and one coin, then pickup merges both stacks again. Combination-menu
D requests a menu through ggetobj and drops one arrow and one coin.
Public inventory snapshots at zero-based steps 33 and 46 establish quantities;
full-menu step 54 establishes restoration. Derived weights are 951→950→951,
951→949→951 and 951→950. Status clears/restores Burdened accordingly.
The observer checks these quantities/status, strict differential parity and
unchanged HP/no observed combat. No internal C weight instrumentation is claimed.

Existing recipes/do.c/multiple-drop-combination.session.json already exercises
combination dispatch; this adds a specific mixed-stack burden boundary, not a
claim of previously untested dispatch. Weight display is disabled to avoid the
already-fixed query_objlist naming defect. No equipment is selected or changed.

Run `node diagnostics/divergence-evidence/carrying-capacity/public-multi-drop/observe.mjs`
for saved evidence. Fresh target/control argv are in case.json; choose a new
output directory for reruns. Receipts normalize completed retained raw runs;
wall elapsed was not captured and is null. The inherited recorder binary hash
and source correspondence are in sibling public-stack-cycle/provenance.json;
independent build attestation remains unavailable. Advancement PR111's separate
build does not attest this older binary. One seed/role and debug acquisition do
not certify natural acquisition, arbitrary menu inputs or the full object catalog.
