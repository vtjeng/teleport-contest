# Level engraving retains text after an embedded NUL

Reported-ready supported-API divergence, related to the accepted level-message C-string prefix case (#92, repair4222eaf89). Two argument forms exercise one construction boundary; this does not claim two independent repairs or hidden-score impact.

Public setup creates an ordinary floor then calls either `des.engraving({x:2,y:2,type:"engrave",text:"alpha\0omega"})` or `des.engraving([2,2],"engrave","alpha\0omega")`. Embedded NUL is a valid Lua/JS string byte. C's exact table reader/positional dupstr and make_engr_at store only `alpha` in all three text states, with engr_szeach6 and engr_alloc18. JS retains alpha-NUL-omega in all three, with size12/allocation36. Location (3,2), engraving type2, time0 and default guard/degrade metadata otherwise agree.

Six controls pass: plain alpha, empty string and UTF-8 café, each through both forms. They distinguish ordinary string handling, empty allocation and byte length from the NUL-prefix defect. Observations store text as hex, preserving the embedded byte without ambiguity.

Clean-base reproduction:

1. Check out `27c8ae6e0fed4ae144a1a194541e5d6ce31a1036` with C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Copy this evidence directory into the checkout without gameplay changes.
3. Use existing Node24.19.0 and Clang19.1.7 (`source /workspace/.setup/activate.sh` in this environment); no install/network dependency.
4. Run `node diagnostics/divergence-evidence/levels/levels-engraving-string-prefix-20261028/probe.mjs target` (expected exit1; two targets).
5. Run `node diagnostics/divergence-evidence/levels/levels-engraving-string-prefix-20261028/probe.mjs control` (expected exit0; six controls). After repair the unchanged target should exit0.
6. Run `node --test scripts/test-suites.test.mjs`.

The oracle preserves every input byte in its hex decoder, supplies its storage pointer through typed Lua readers, and lets unchanged C routines perform truncation. It does not pretruncate the target as an expected-value shortcut. Exact production wrapper and constructor code execute. Actual allocation, text copying, engraving lookup and default field writes are used. The full Lua VM and setup parser are not supplied; equivalent Lua recipes are documentation only. No player command is invoked.

Limits: Engraving construction only: text-state contents and allocation-size metadata, fixed valid local2,2 coordinates and explicit ENGRAVE type. No rendering, player commands, reading descriptions, runtime engraving effects, conduct changes, replacement/deletion, special-word behavior, shipped exposure or score claim. C executes exact lspo_engraving, get_table_str, dupstr, make_engr_at and engr_at with actual string copies/allocation and the upstream engraving struct/macros. Fixed typed Lua adapters return the input byte storage; coordinate adapter applies default origin1,0. No full Lua interpreter. Unsupported side effects abort. One additional API family related to levels-message-buffer-20261028, whose repair4222eaf89 affects level-message storage only. Main should deduplicate the C-string prefix relationship before counting independent causes. Two argument-form targets are not two repairs.

The frozen dupstr edge prompted inspection; missing allocation alone is not the claim. Official projection retains immutable discovery identity and confirms the reviewed candidate stays active. Scanner counts:31 negative keys/17 causes,1 historical accepted candidate,1 published mazewalk candidate with final receipt unverified here,1 reported-ready engraving candidate,8 stale,481 without disposition. The manual solidfill related-path handoff is separate and adds no scanner key. Three parked gaps unchanged.
