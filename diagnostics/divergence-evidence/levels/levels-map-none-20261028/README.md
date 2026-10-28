# Explicit `none` map alignment centers instead of preserving placement

One confirmed production-API cause, three affected compositions. C maps the source-supported option `none` to -1, exactly like an omitted alignment; JS keeps the string and takes `mapAlignX/Y`'s centering default.

| halign / valign | C origin | JS origin | Outcome |
|---|---|---|---|
| none / none | 10,6 | 39,9 | divergence |
| none / center | 1,9 | 39,9 | divergence |
| center / none | 39,1 | 39,9 | divergence |
| absent / absent | 10,6 | 10,6 | control |
| center / center | 39,9 | 39,9 | control |
| absent / center | 1,9 | 1,9 | control |
| center / absent | 39,1 | 39,1 | control |

All calls supply `x:10,y:6,map:'...\n...\n...'` on a new special level. The fixture uses `newgame_pre_mklev` then the existing supported `mklev({specialLevelLoader})` path, following `scripts/special-level.test.mjs`. Each map returns nine selected points, verified to contain ROOM terrain. The sentinel ends the test after placement, before unrelated finalization. No private API extraction or coordinate marker edits.

## Reproduce from clean stated base

1. Check out Main `1c4be74beb32edbfc897de805f218e180f8c6002`.
2. Copy this entire evidence directory from the PR at the same repository-relative path (or apply this evidence-only commit).
3. Use Node24 and Clang19 (`source /workspace/.setup/activate.sh` in the supplied environment).
4. Run `node diagnostics/divergence-evidence/levels/levels-map-none-20261028/probe.mjs target`: expected **exit 1**, first equality failure `none/none`.
5. Run `node diagnostics/divergence-evidence/levels/levels-map-none-20261028/probe.mjs control`: expected **exit 0**, four matches.
6. Run `node diagnostics/divergence-evidence/levels/levels-map-none-20261028/probe.mjs observe` for all seven raw C/JS results (exit 0). After a repair, both target and control should exit 0.

No extra fixtures, C checkout, Lua interpreter or recorder are needed. The probe compiles its bundled oracle into a private temporary directory and cleans up. Deliberately failing target is outside default CI.

## Oracle and scope

`oracle.c` contains the entire unchanged C `lspo_map` body from gitlink `16ff59115315917b93185d026aeefea06db9b0f4`. Its fixed table adapter resolves the actual function's option arrays, including absent defaults. The fragment adapter asserts the exact 3x3 all-floor input; selection and terrain storage capture the actual loop writes. Room and themed-room contexts are absent; unexpected RNG/callback/reset paths abort. Full Lua parsing, arbitrary map parsing and finalization are not simulated or claimed. Source/function/tool hashes and clean-base receipts are included.

The C option array explicitly accepts `none`; supplied coordinates are legal, dimensions fit and the single-axis branch intentionally retains the default origin before odd-parity adjustment. Thus no shipped recording is needed to establish this supported API contract defect. No shipped dat/*.lua use of explicit none was found in the focused search; exposure and score relevance remain unknown. Manual/scanner-unbound. Main owns implementation. Save-export remains parked.
