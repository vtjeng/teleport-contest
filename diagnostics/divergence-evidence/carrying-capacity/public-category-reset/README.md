# Successive drop-category reset: scoped negative

Measured JS1dae7d351f5b4cf9de297c585d197cff60aa5a43 on the analysis branch;
C gitlink16ff59115315917b93185d026aeefea06db9b0f4. Two fresh public comparisons
exit0: target64 screens/cursors, control54; both2300 RNG calls. Strict outputs
match independently, and final inventory screens also match across the pair.
This is not an assertion of execution on current Main.

Same seed642919 Valkyrie capacity950 and unchanged90-unit kit; supported debug
wishes provide861arrows49coins. Drop and pick up one arrow into its carried
stack, making only arrows just-picked. Target DAeP combines automatic selection,
food class and pickup history: no object qualifies, so inventory remains951
and Burdened. Then Dc requests weapons only and1e drops one arrow. Control
performs that weapons-only drop without the preceding empty-filter command.
Both finish860arrows49coins, total950, unburdened, with all kit unchanged.
No food is consumed or dropped; no equipment is selected or changed.

C do.c doddrop:932 clears category state with add_valid_menu_class(0) before
calling menu_drop. That reset clears class, BUC, shop and picked filters.
JS doddrop:1799 does the same. These source-backed public witnesses establish
this particular cross-command reset; earlier probes tested filters individually.
No stale-filter bug was observed. The observer checks target intermediate
inventory at step51, final quantities/status/kit, stable HP/no observed combat,
strict C/JS outputs and identical target/control final inventory screens.

Fresh commands and normalized actual receipts are in case.json; use new output
directories. Raw recorder/worker/comparison outputs are copied unchanged.
Elapsed wall time was not captured. Source/binary identity is inherited from
public-stack-cycle/provenance.json; independent recorder build attestation is
unavailable and PR111's separate build does not attest this binary.

One role/seed and debug acquisition; no exhaustive category/state certification.
No consumption, rings, migration, timers, equipment effects, combat, gameplay
edits, CI dispatch, merge or formal approval. Queued causes4–8 are not repeated.
