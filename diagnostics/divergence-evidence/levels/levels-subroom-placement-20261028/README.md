# Subroom placement: finite explained negative

```sh
source /workspace/.setup/activate.sh # if present
node diagnostics/divergence-evidence/levels/levels-subroom-placement-20261028/probe.mjs
```

Expected exit **0**, ten matched fixtures. Node and Clang required. The runner uses a temporary oracle executable and is not part of default CI.

The scanner's `create_subroom:rnd` edge is implemented by the JS `randomOneBased` parameter, whose production default is `rnd`. Public `des.region` constructs the parent; its callback invokes `des.room`. The parent bounds are checked before the child request. Child chance 0 selects the requested type unconditionally, lit 0 avoids lighting randomness, and filled 0 avoids filling. The test stops before finalization.

Controls cover explicit near-edge (1 becomes 0) and far-edge (+1 abutment) adjustments, two seeds each for random placement, random dimensions/placement and minimum 4x4 parents, plus 3x4 and 4x3 rejection. Every child callback bound matches C's add_subroom parameters. Too-small parents draw nothing and produce no child callback. Random size draws precede random position draws with exactly matching bounds and consumption.

The oracle executes the unchanged C create_subroom body. Its fixed parent input represents the independently checked public parent postcondition. The add_subroom adapter captures the constructor handoff; it does not allocate C room state. RNG replays a checked JS tape, so no independent ISAAC or all-seed equivalence is claimed. This is not evidence for C room storage, topology, sibling collisions, metadata, filling, finalization or orig_rtype. The parked state-export investigation remains untouched.

The clean probe and suite guard pass on Main `51f5686fa`. The scanner identity stays bound to frozen run `ea2181cadbad5793b4be` at `32578f230`; the relevant JS constructor is byte-identical across these bases. The exporter validates the original run hash, exact decision fingerprint and one-active-to-one-filtered effect. No rescan occurred.
