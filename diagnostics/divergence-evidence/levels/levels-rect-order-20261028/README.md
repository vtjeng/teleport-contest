# Room-space allocator order: bounded negative

The JS port replaces array entries with copied rectangle objects; C copies rectangle structs into array slots. Eight frozen valid allocation sequences show matching behavior across 28 cuts and 36 exact ordered free-rectangle snapshots, including recursive splitting of overlapping free regions. This comparison preserves ordering because later random rectangle selection depends on it, but does not test RNG itself.

```sh
node diagnostics/divergence-evidence/levels/levels-rect-order-20261028/probe.mjs
```

Expected exit0 on Main `32578f23091dad34635a9b4fe0bfb45ed9840e39`, Node24/Clang19. The probe builds the bundled oracle in a private temporary directory, runs the frozen `allocations.json`, and cleans up. No C checkout or sibling evidence needed.

Every cut is independently asserted to fit a live free rectangle in both implementations. The JS side uses exported init/get/split/free functions used by room generation, without mutating allocator state directly. C executes the full upstream rect.c implementation with unchanged production function bodies; only its header dependency is replaced by minimal types/allocation wrappers, plus an appended fixture driver. Unexpected RNG/capacity/error paths abort.

The threshold control distinguishes [11,9,17,13] from [10,9,16,13]: only the former retains left free rectangle [0,0,9,20]. Additional JS checks verify value-copy lookup and absence of the allocated rectangle from remaining free space. No invalid-setup outcome is called a negative.

Scope is these eight fixed allocator sequences, not all room layouts, random selection, Lua level generation or whole-level equivalence. Manual/scanner-unbound; no historical scanner identity is fabricated. Hashes, observations and clean-base/suite-discovery receipts are included. Save-export remains parked.
