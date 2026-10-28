# Shifted relative selection negation loses part of the level

C negates an absolute selection over the whole level. JS negates its relative storage grid, preserves that frame marker, then shifts/clips the result when `des.terrain` consumes it. Cells left of or above the map origin are omitted.

| Origin | Operation | C painted cells | JS painted cells |
|---|---|---:|---:|
| 10,6 | singleton negate | 1658 | 1049 |
| 10,0 | singleton negate | 1658 | 1469 |
| 1,6 | singleton negate | 1658 | 1184 |
| 1,0 | singleton negate control | 1658 | 1658 |
| 10,6 | no-argument negate control | 1659 | 1659 |
| 10,6 | singleton control | 1 | 1 |

Each fixture runs full startup and the production specialLevelLoader, initializes floor, then establishes the origin through a real 3x3 `des.map` call. `selection_area(0,0,0,0)` is first consumed independently through `des.terrain`, asserting that it denotes exactly the C absolute singleton. The negated selection is then consumed as CORR terrain. No manually changed frame marker or private JS function extraction.

## Clean-base pickup

1. Check out Main `32578f23091dad34635a9b4fe0bfb45ed9840e39`.
2. Overlay this complete evidence directory at its repository-relative path, or apply its evidence-only commit.
3. Use Node24/Clang19 (`source /workspace/.setup/activate.sh` in the supplied environment).
4. Run `node diagnostics/divergence-evidence/levels/levels-selection-negate-20261028/probe.mjs target`: expected exit1, assertion `10,6 negate`.
5. Run the same command with `control`: expected exit0, three matching controls.
6. Run it with `observe` for all six raw 79x21 painted bitmaps (exit0). After a repair, target/control should both exit0.

Everything needed is bundled, including the C oracle. No recorder, C checkout or Lua runtime is required. Temporary builds are private and cleaned up. Ordinary `.mjs` runner stays outside default CI; the suite guard receipt is included.

## C contract and related ownership

The oracle runs unchanged `selection_not` and `selection_iterate` from C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`, over minimal 0/1 point storage. Its singleton postcondition is the source contract of `l_selection_fillrect`/`get_location_coord`: relative0,0 becomes the map origin. Independent JS operand consumption verifies the equivalent precondition. The Lua constructor/clone parser itself is not executed. C's exact iterator supplies the callback footprint, including exclusion of map column0.

This is a demonstrated supported-API difference. Shipped exposure/hidden-score impact is unknown. It is related to PR #67's mixed-frame binary operators; Main should deduplicate the underlying representation cause and may repair both together. This evidence demonstrates an additional unary domain failure, not a claim that a separate gameplay repair is required. Manual/scanner-unbound. Save-export remains parked.
