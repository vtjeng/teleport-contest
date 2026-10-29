# Gold capacity preflight refuses supported ordinary pickup

**Candidate: one semantic cause, two failing public variants and one passing
control.** At capacity950, unchanged kit weight90 and2759 arrows, carry one gold
piece and leave49 on the floor. Public comma makes C pick48, reaching49 carried
gold without adding carrying weight; the last floor coin is correctly refused.
JS stops before the pickup at zero-based segment0 step60. Supported runSegment
onBoundary observation confirms the exact error:

`unsupported hero command: an unported branch of this command: unsupported pickup: pickup() requiring a partial or failed lift`

C produces68 screens/cursors and2449 RNG calls; JS stops at60/2314. The official
runner has error:null because runSegment intentionally catches that boundary;
boundary.mjs supplies the missing diagnostic without modifying game state.

## Cause and control

JS pickup.js preflightPickupObjects rejects an aggregate-capacity estimate
unless a source-owned exception applies. sourceZeroLift, sourcePartialStackLift
and sourceMultiSelectionCapacityBoundary all exclude COIN_CLASS. Thus the
actual C carry_count gold branch never executes for this valid ordinary floor
pickup. C uses GOLD_CAPACITY to choose48, calls splitobj and merges through
pick_obj/addinv. That branch exists in JS carry_count but the guard blocks it.

A second variant has2758 arrows. C takes all49 coins, ending at50. JS still
stops at the same guard. This is the same cause: initial combined-weight
estimation includes floor gold's minimum-one object weight, then C's gold
capacity branch resolves the allowed count. A control with2757 arrows avoids
the boundary guard and matches all68 screens/cursors and2396 RNG calls. The
all-gold failing variant has C2396/JS2314 RNG calls. These are not separate
arithmetic causes or two independent bug counts.

Source trace: pickup.c carry_count1570..1701, GOLD_CAPACITY macro, lift_object,
pickup_object; JS preflightPickupObjects guard and carry_count. Main owns
repair: preserve the live C order/count decision rather than weaken the test
or special-case fixture quantities. Post-fix live target expectations are0;
pre-fix targets expect1 and control0. Evidence and observations stay immutable.

## Public setup and qualification

Seed642919, clock20320612101500, same ordinary Valkyrie setup as the sibling
public-stack-cycle package. Wizard wishes for arrow ballast and49 gold; `d$`
drops all coins; wish for1 gold; comma tries the pile. Inventory menus before
and after expose exact coin counts/weights. All C frames keepHP16/16; no combat.
The inherited binary is hashed with matching relevant source files; no build
attestation is invented. Debug setup does not claim normal acquisition.

observe.mjs validates expected C counts, matching prefixes/strict control,
missing JS outputs and boundary receipts. boundary.mjs uses the supported
onBoundary seam in an official-overlay workspace; it does not create state.
Source/argv/hash receipts retain actual saved runs, not expected-result data.
Elapsed duration was not measured. Source bindings and commands are in case.json.

Measured JS base998a1071bb686b55ce07c411b0d1ce3fed923529; C gitlink
16ff59115315917b93185d026aeefea06db9b0f4. A fresh Main check at
2cb9a55c12a2bbee4403ca48ed22f46522076eeb found no pickup.js changes from the
measured gameplay base. No matching case/PR title was found. Existing
single-heavy-stack-pickup and source-multi-selection repairs deliberately
retain gold exclusions; the existing 50+50 gold projection test only covers a
fully admissible merge. They are reconciled, not recounted as fixes.

This is separate from the silent status-redraw cause in public-upper-boundaries.
No gameplay code, CI settings or denied mechanics were changed or investigated.
