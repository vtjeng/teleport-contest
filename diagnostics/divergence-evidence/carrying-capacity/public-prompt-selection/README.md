# Public decline versus quit in a selected pickup list

Scoped negative, two fixtures. pickup_burden:u leaves a wished861-arrow pile
on the floor; an800-dart stack is wished then dropped. The pickup menu selects
both, in arrow-then-dart order. Lifting arrows would cross capacity950, so C
asks for confirmation at step34. Answer n declines only that row: the later
darts are picked up, inventory weight890. Answer q stops the selection before
the later row: inventory remains90. Both stay unburdened and HP16/16.

Each case matches all41 screens/cursors and2291 RNG calls. Observer checks
public prompt, final dart/arrow counts, weights and no combat. This tests the
distinct lift_object return0 versus -1 and caller loop continuation/break. It
does not treat single-item n/y coverage as proof of multi-item q behavior.

First calibration guessed darts slot e, but the rejected arrow wish had
already consumed that letter; public C showed f. That setup is invalid for
this question, preserved locally, and not counted as a negative. Corrected
recipes use df and select the observed a/b menu entries.

Measured JS79106c9dfcf91a634825e279859cf5a342d7201d; C gitlink
16ff59115315917b93185d026aeefea06db9b0f4. case.json binds exact source/inputs,
actual normalized receipts and unchanged sibling live runner. Live commands
and observe.mjs expect0. Use fresh outputs. Elapsed was not measured. Standard
recorder build-attestation limitation and debug-setup exposure limits apply.
