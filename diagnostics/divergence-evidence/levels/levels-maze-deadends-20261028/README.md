# Maze dead-end removal: finite API negative

```sh
source /workspace/.setup/activate.sh # if present
node diagnostics/divergence-evidence/levels/levels-maze-deadends-20261028/probe.mjs
```

Expected exit 0. Node and Clang are required; no dependencies are installed by the probe. It compiles the bundled oracle in a private temporary directory and cleans up afterward. This ordinary `.mjs` runner is not registered in default CI.

The scanner lead is the apparent missing `rn2` call in `maze_remove_deadends`. JS calls its injected `random` argument, defaulted to `rn2`; production `create_maze` uses that default. The focused experiment enters through `des.level_init`, following production startup and the special-level loader. It initializes stone, optionally sets `corrmaze`, then generates a maze with explicit corridor width, wall thickness, and dead-end setting. It stops before finalization.

Sixteen fixtures cross two seeds (28105001/28105002), ROOM/CORR maze flags, widths 1/2, wall thickness 1 and dead-end removal off/on. Every complete 80×21 terrain map matches C. Every removal-on result differs from its off control and consumes additional draws: 36/42 at width 1 and 13/15 at width 2. This covers ordinary and scaled maze generation, not every scale or random stream.

The oracle contains unchanged C `okay`, `maze0xy`, `maze_inbounds`, `maze_remove_deadends`, non-MICRO `walkfrom`, and `create_maze` bodies plus the upstream direction macro. It starts with the verified stone-map/default-bound postconditions of the public setup. Its RNG reads the JS-generated draw tape, checks each requested bound/value, and requires complete consumption. Thus this is a deterministic, coupled-input topology and call-order comparison; it does **not** independently verify ISAAC or establish all-seed equivalence. Sixteen full terrain arrays are retained in observations.json; tapes regenerate from the pinned JS base and seeds.

The inventory receipt distinguishes current observed leads, stale review bindings, and ownership routing. A historical scanner key is never converted into a new review identity by inference. The initial clean-worktree inventory attempt lacked `espree` and produced only unobserved carried leads; it is retained as a failed attempt, not counted as a current scan. A second attempt uses the same accepted Main SHA and its existing dependencies.

The refreshed run is `ea2181cadbad5793b4be` on Main `32578f230`; its hash and tool fingerprints are in inventory.json. Raw file scope: 571; permitted view: 523; historical current reviews: 0; stale review bindings: 8; remaining unreviewed without historical bindings before this case: 515. Three old fixed-cause bindings are no longer observed. After this case: 1 current reviewed negative, 8 stale historical bindings, 514 otherwise unreviewed. Forty-four function overlaps are held for exact-cause comparison with Main-owned candidates; they are not declared negatives or automatically equivalent to those bugs. Only the maze hypothesis was qualified in this refresh; the inventory count is not a count of ready experiments.

`projection/` was generated and validated with the accepted exporter at `32578f230`. It preserves the original run identity and verifies this exact decision changes the selected active view from 1 active to 1 filtered. The complete immutable run remains private and unchanged; the projection, final decision, manifest, and scoped inventory are portable. Older manual cases remain unbound, and stale fingerprints were not reconstructed.

Main advanced during handoff to `51f5686fa`, implementing PRs #74/#77/#79. The focused probe and suite guard also pass there with identical observations. The inventory and projection remain pinned to the original scan base; their fingerprints are not silently relabeled. See verification.json and inventory.json for the separate receipt and ownership update.
