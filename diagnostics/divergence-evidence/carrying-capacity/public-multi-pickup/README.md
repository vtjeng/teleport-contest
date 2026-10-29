# Public menu-ordered ordinary partial pickup

Scoped negative, two fixtures. A275-rock stack is split by dropping2 rocks;
4 arrows are separately dropped. With273 rocks,15 darts and starting kit90,
carried weight2835. Public pickup menu selects arrows then rocks. C and JS take
all4 arrows first, then only1 of2 rocks because each row sees the updated load.
Final inventory274 rocks,4 arrows,15 darts weighs2849 at capacity950.
With4 darts instead, both rocks fit and the control ends at2848.

Target55 screens/cursors,2457 RNG; control54,2456. Strict matches. Observer checks
final counts, total weight, partial-lift message, Overtaxed status and stable
HP/no combat. Existing f562d7d6728ee3578c84c50d2425b35227241571 source-order
repair and PR44 single-count repair are reconciled, not counted again. This
provides additional executed public exposure for the already-repaired path.

Measured JS79106c9dfcf91a634825e279859cf5a342d7201d; C gitlink
16ff59115315917b93185d026aeefea06db9b0f4. Exact inputs/source bindings and actual
normalized receipts are in case.json. Shared public-stack-cycle runner and
recorder provenance apply. Both live commands/observer expect0; output paths
must be fresh. Elapsed duration was not measured. Debug wish/wizweight are
setup/observation only; no gameplay code or excluded mechanics are changed.
Mixed gold selection is not certified; the gold preflight cause is separately
handed to Main and is not repeatedly probed here.
