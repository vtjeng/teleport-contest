# Public coin rounding and burden

Scoped explained negative: two target cycles and one control, not three causes.
With seed 642919's unchanged 90-aum starting kit, St18/Co18 capacity 950,
860 arrows plus 50 gold starts Burdened. Public `d1$` leaves 49 gold and clears
Burdened; comma picks the coin back up and restores Burdened. A 859-arrow,
150→149→150-coin variant behaves the same. The 49→48→49 control stays clear.

Both sides display minimum coin object weight 1 aum for 1..49 gold while the
carrying formula contributes zero. observe.mjs validates public quantities,
coin object weights and status separately; it does not sum the displayed
minimum-one value into carrying weight. All HP remains 16/16; no combat.

Strict C/JS results: round50 47 screens/cursors and 2292 RNG calls; round150
48 and 2292; control49 47 and 2285. All channels match. Existing merged-gold
rounding unit test covers a different constructed 50+50 case; this supplies
public partial-drop/pickup exposure. Earlier negatives are unchanged.

Measured base 998a1071bb686b55ce07c411b0d1ce3fed923529 (analysis-only commits;
gameplay still f3e2e6d638383a5f77f153057d0af6684ca64cfb), C gitlink
16ff59115315917b93185d026aeefea06db9b0f4. Source bindings, original argv and
normalized actual execution receipts are in case.json. The sibling
public-stack-cycle/probe.mjs is the unchanged runner; use a fresh output
directory when rerunning. All three live commands and observe.mjs expect 0.
Existing inherited recorder binary/source provenance limits apply. Elapsed
duration was not measured and is not reported as active compute.

This does not certify all gold pickup. The separate public-gold-limit package
contains a confirmed preflight refusal at maximum capacity. Debug wish and
wizweight are setup/observer tools; no ordinary acquisition claim is made.
