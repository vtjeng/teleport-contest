# Gas-cloud construction defaults: bounded negative

The two construction forms intentionally differ in C. Coordinate form passes map-absolute coordinates directly to a size1 cloud constructor, consumes one rn2(3), and defaults to lifetime4..6. Selection form uses the already-resolved selection coordinates, consumes no random draw, and keeps create_region's default lifetime-1. Explicit ttl values greater than-2 override either result after construction.

Eight harmless single-cell fixtures match C: coordinate/selection forms × omitted,-1,0,5 ttl. With map origin(10,6), coordinate2,2 remains(2,2), while selection_area(2,2,2,2) resolves to(12,8). The fixed RNG draw2 yields coordinate default6 even when a later override replaces it. Selection default remains-1.

```sh
node diagnostics/divergence-evidence/levels/levels-gas-cloud-defaults-20261028/probe.mjs
```

Expected exit0 on Main `32578f23091dad34635a9b4fe0bfb45ed9840e39`, with Node24/Clang19. Everything needed is bundled; no C checkout or recorder required. Private temporary builds are removed.

JS runs full startup/production mklev loader and public level initialization/map setup. It calls the exported production gas-cloud API with the actual frame and supported injected RNG. The selection is independently consumed through terrain to verify its absolute point. The C oracle executes unchanged create_region, add_rect_to_reg, both cloud constructors and lspo_gas_cloud; its fixed table/selection adapter represents these inputs. Registration/visual side effects are captured after construction, with no hero interaction and zero damage. Full Lua parsing is not claimed.

Scope is only these eight construction results. Multi-cell growth, damage, activation, expiration and runtime effects are not tested. Manual/scanner-unbound. Source/tool hashes, raw observations and clean-base/suite guard receipts are included. Save-export and all excluded investigations remain untouched.
