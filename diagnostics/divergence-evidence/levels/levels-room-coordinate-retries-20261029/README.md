# Room-coordinate retry delegation

In the tested normal rectangular-room environment, get_location delegates to the default somexy picker and get_free_room_loc normalizes the same supplied coordinate environment. Missing direct-call/extra-environment-helper edges do not imply a coordinate or retry divergence in this domain. Two keys share one room-coordinate delegation cause.

Exact ten C coordinate/eligibility helper bodies versus production JS exports. 204 target comparisons: explicit or random initial location on a dry fountain, then success on each fallback attempt1..101 or101 failures before scheduled success102. C/JS agree on coordinates, failure and draw count. Actual room contains14 floor cells and one fountain; no invalid empty-room premise. Whole room_coordinates.js is unchanged from the frozen scanner base.

Control: Four direct-floor controls (explicit/random initial position, early/late unused success tape) return10,6 with0/2 draws and no fallback. C panic adapter longjmps to record nonreturning failure; no diagnostic-string/error-runtime parity claim. Shared legal draw tape tests consumption, not independent RNG. Regular5x3 room only, no objects/subrooms/irregularity/water-level/custom picker; no full caller placement/finalization/runtime claim.

Clean-base reproduction:

1. Check out `2f80ba5210a57819a2aaa8dbf5b8c88618b85242`, initialize C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Copy this evidence directory into the same relative path.
3. Use existing Node24.19.0 and Clang19.1.7 (`source /workspace/.setup/activate.sh` in this environment). No installation or network dependency.
4. Run `node diagnostics/divergence-evidence/levels/levels-room-coordinate-retries-20261029/probe.mjs target` (exit0,204 comparisons).
5. Run `node diagnostics/divergence-evidence/levels/levels-room-coordinate-retries-20261029/probe.mjs control` (exit0,4 comparisons).
6. Run `node --test scripts/test-suites.test.mjs`.

The fountain is DRY-eligible but not ROOM. Thus initial get_location accepts it, and get_free_room_loc performs its separate floor retry. Both implementations accept success on attempt101, because only failures increment the counter;101 failures terminate without consuming scheduled attempt102. Failure leaves output coordinates-1,-1. Random initial location consumes2 additional draws. C create_trap initializes x/y to-1 before calling this helper, but this test stops at the coordinate helper and does not execute trap construction.

Limits: One regular5x3 room at10,6..14,8,14 ROOM cells and one dry FOUNTAIN; no subrooms, irregularity, custom predicate/picker, water-level, objects or frame conversion. Initial packed coordinate is explicit0,0 or random/defaultDRY, original output coordinates are-1,-1 as in the C room trap caller. Exact ten C function bodies execute with minimal struct/global adapters and an empty object grid; out-of-domain pool/lava/impossible branches abort. Enum is copied from pinned rm.h, coordxy is int16_t and getloc_flags_t uint32_t. C panic adapter longjmps to capture nonreturning failure; diagnostic wording/process termination differences are not tested. Legal deterministic draws choose fountain until the designated success index, then adjacent ROOM. Shared tapes test call count/consumption and branch boundaries, not independent RNG implementation, seed frequency or universal topology. 204 target comparisons exhaust success1..101 and101-failure boundary for two initial-coordinate forms; four direct-floor controls. These finite domains do not establish general get_location/somexy equivalence, full trap/altar construction, runtime or finalization. Source hashes invalidate this proof on changes; entire JS coordinate module is unchanged from frozen scan base. This is a compiled helper proof with production JS exports, not a full public Lua API or shipped recording. No runtime behavior of traps/objects/monsters is exercised.

Official exporter verifies2 selected active keys become filtered against the original frozen run. Two keys, one scoped delegation cause. Updated accounting:56 negative keys/24 causes,4 historical/candidate keys,8 stale,455 without disposition. Manual cases and three parked gaps remain separate. Main-owned map corrections untouched.
