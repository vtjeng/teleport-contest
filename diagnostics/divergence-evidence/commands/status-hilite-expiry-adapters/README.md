# Status expiry predicate and change-bank adapters

Two scanner observations share one representation explanation: C's expiry helper is inlined in JS, and C's two chained change-flag assignments are performed by a JS helper. This batch retains both exact observations without claiming two gameplay defects.

For unchanged fields, with no prior dirty status and positive configured duration, C chooses the minimum eligible positive temporary timer. Its final dirty flag is true exactly when some eligible timer is earlier than the current turn and `multi` is zero. If a previously chosen minimum is not expired, any later expired timer is smaller and replaces it. JS tests that existence predicate directly. For changed fields, both implementations update both timer banks, clear both change flags and dirty status, even when `multi` is nonzero.

The evidence calls the actual compiled C `status_eval_next_unhilite`, not a reimplementation. It covers 1,536 boundary combinations: timers 0/9/10/11 around turn 10, temporary/persistent rules, all change-bit combinations, `multi` -1/0/1, and initially dirty/clean status. JS matches the dirty flag, times and change flags in both initialized AC/HP banks. The finite partitions corroborate the source proof; they do not establish universal gameplay equivalence.

Scope: initialized matching rule banks, positive highlight duration, safe non-overflowing turn arithmetic, and only these dirty-flag/time/change transitions. Timer creation, rendering, fallback initialization, malformed states and other helper callers are not covered. The separate `_statusHiliteChangeBanks` lead remains unreviewed and active.

Run from repository root with the standard recorder source/generated headers:

```
source /workspace/.setup/activate.sh
clang -ffunction-sections -fdata-sections -I nethack-c/recorder/include nethack-c/recorder/src/botl.c diagnostics/divergence-evidence/commands/status-hilite-expiry-adapters/expiry-oracle.c -Wl,--gc-sections -o /tmp/commands-expiry-oracle
/tmp/commands-expiry-oracle
node --test diagnostics/divergence-evidence/commands/status-hilite-expiry-adapters/evidence.test.mjs
```

The oracle's unchanged JSON lines are in `oracle.jsonl.gz`. Three ordinary input controls also match: counted waits (4 boundaries, 15 animation frames), individual waits (7 boundaries), and accepted prayer (11 boundaries, 15 frames). Their recipes and compressed raw C/JS captures are included. The time field changes every turn, so those controls alone are not an expiry proof. Run any recipe with `node scripts/diff-fresh.mjs <recipe-path>`.

Original scanner bindings are retained. Relevant JS function bodies are byte-identical between the original run base and reviewed Main; hashes are in `binding-source-check.json`. The projection and manifest were produced and validated against the complete immutable run using PR #43's tested exporter at `a879e944617577d3eb59c14afc87ddbdb2724b18`, with matching hub dependencies in an isolated checkout. The after-view filters these 2 decisions and retains 1 unreviewed helper lead; stale configuration metadata filters none. Recipient validation can use that exporter checkout with this package's projection and decisions, omitting the unavailable full original run; the manifest retains the full-original comparison already performed.

All files are scoped evidence. No gameplay, recorder-source or default-CI files change.
