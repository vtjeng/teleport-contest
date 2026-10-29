# Rectangle allocation diagnostic: unreachable caller guard

The init_rect diagnostic after alloc cannot execute under the source allocator contract: alloc returns nonnull or panics without returning; MONITOR_HEAP redirects the caller to nhalloc, which also panics before returning null.

Exact alloc/init_rect/free_rect bodies compiled in normal and MONITOR_HEAP configurations, with exact nhalloc in the latter. A deterministic malloc adapter returns null; a nonreturning panic capture verifies the allocator-level message is reached, never Could not alloc rect. Successful adapter controls exercise init/reinit/free/reinit and match production JS capacity56, count1 and full-map rectangle. global.h declares and documents the nonnull/nonreturning contract and monitor macro redirection.

Control: Both successful-allocation configurations produce malloc call counts1,1,2 across initialization/reuse/reallocation and bounds0,0,79,20; JS reuses storage before free and allocates fresh storage afterward.

The proof covers both outcomes of allocation: a nonnull pointer makes the caller condition false; a null malloc result reaches a nonreturning allocator panic before the caller can test it. Under MONITOR_HEAP, global.h redirects callers to nhalloc; although its inner alloc may return null, nhalloc checks it and does not return null to init_rect. The pinned global.h contract is included. This is a source-backed unreachable-branch result, not an untested setup reported as a false positive.

Clean-base reproduction:

1. Check out `27c8ae6e0fed4ae144a1a194541e5d6ce31a1036` with C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`.
2. Copy this evidence directory into that checkout without gameplay changes.
3. Use existing Node24.19.0 and Clang19.1.7 (`source /workspace/.setup/activate.sh` in this environment); no installation/network dependency.
4. Run `node diagnostics/divergence-evidence/levels/levels-rect-allocation-guard-20261028/probe.mjs target` (expected0; both allocator configurations stop before the caller guard).
5. Run `node diagnostics/divergence-evidence/levels/levels-rect-allocation-guard-20261028/probe.mjs control` (expected0; successful init/reinit/free/reinit matches JS in both configurations).
6. Run `node --test scripts/test-suites.test.mjs`.

Limits: Control-flow proof for the specific post-allocation init_rect null diagnostic only, under the pinned nonreturning panic/non-null allocator contract. Do not suppress allocator-level failures, arbitrary panic messages, capacity diagnostics, changed allocators or overrides that return after panic. Target uses a deterministic malloc adapter and a nonreturning panic capture; it does not exhaust memory or run a full process shutdown. MONITOR_HEAP test sets logging already initialized/disabled, so no log/environment access occurs. Both compile branches execute their exact allocator source bodies. JS controls cover successful initialization, reinitialization storage reuse, free and fresh reallocation only. No actual JS/C OOM parity, arbitrary fragmentation, production gameplay reachability or shipped-score claim. Prior rectangle-choice/order evidence is not expanded.

Only the exact message key is reviewed. The allocation edge and other rectangle diagnostics remain unreviewed. Official exporter validates one active key becomes filtered against the immutable original run.

Latest frozen inventory:33 negative keys/19 causes,3 candidate keys,8 stale,479 undisposed. Candidate routing, manual solidfill and three parked gaps remain separate and unchanged.
