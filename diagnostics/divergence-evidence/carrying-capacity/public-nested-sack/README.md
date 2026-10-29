# Nested ordinary sacks: scoped negative

JS6ea005a52da700e1cf84ba2ba3873ecec0d0ae9e; C16ff59115315917b93185d026aeefea06db9b0f4.
Same supported seed642919 Valkyrie, capacity950/kit90. Two plain empty sacks15
and831 arrows. Public stash puts arrows in inner sack (846), then inner sack
into outer sack (861). Inventory totals951 throughout. Drop outer sack ->90;
pickup ->951. Extract inner sack -> outer15+inner846+kit90. Extract one arrow
->inner845+arrow1. Drop arrow ->950/unburdened; pickup ->951/Burdened.

Target115 screens/cursors and2349 RNG exactly match, exit0.830-arrow control
matches115 screens/cursors and2334 RNG, exit0; corresponding totals are one
lower and remain unburdened. observe.mjs checks weights, public burden states,
stable HP/no observed combat and complete C/JS output equality.

Source C weight() recursively sums contents. Ordinary public in_container and
out_container update weights before inventory capacity reporting. This covers
a two-level plain-container chain and extracting its inner bag before changing
contents. It does not claim remote mutation of a still-contained bag, arbitrary
nesting depth, magical bags, effects, timers, consumption or combat. Existing
partly-eaten-container and special tip repairs are excluded and not new findings.

Exact commands/expected exits/normalized actual receipts/source hashes are in
case.json. Raw recorder and official-overlay JS outputs are retained unchanged.
Use new output paths for reruns. Independent recorder build attestation remains
unavailable; sibling public-stack-cycle provenance pins installed binary and
source correspondence. Elapsed time unmeasured. No gameplay changes or CI.
