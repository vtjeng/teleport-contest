# Medusa stone transition: reached parity, scanner key still active

Key: `source-audit:edge-stub:src/mhitu.c:gazemu:polymon`.

**Unresolved as a whole scanner claim.** The scanner means “callee contains a stub, not necessarily on this path.” A successful ordinary call does not prove every conditional continuation in `polymon` safe. This package preserves a supported reached path, not a negative decision or Main repair handoff.

The target uses the native wizard `#polyself` command to become a flesh golem, creates Medusa through the supported wizard command, explicitly answers `y` to force the unique monster, and waits. Native C step 55 says `You meet Medusa's gaze. You turn into a stone golem!` within the combat line. JS matches all 4624 RNG calls and 57 screens/cursors. The already-stone-golem control reaches Medusa attacks without another transformation and matches 4625 RNG calls and 57 screens/cursors. The target/control count difference is expected and is not itself compared.

C `gazemu` tests visibility, stone resistance and awareness, then `poly_when_stoned` and `polymon(PM_STONE_GOLEM)`. The final fixtures bypass none of those guards. Exploratory recipes accepted the default doppelganger substitute; the included recipes explicitly force native Medusa. Complete small native recordings, recipes, original hashes, recorder fingerprint and clean-base replay receipts are retained.

```
node diagnostics/divergence-evidence/monsters/medusa-stone-transition-scope/replay.mjs target
node diagnostics/divergence-evidence/monsters/medusa-stone-transition-scope/replay.mjs control
```

Both expected exits are 0 for these recorded paths. The runner first asserts genuine Medusa creation, the target transition and the control's absence of that transition, then compares complete streams. No internal-state instrumentation, equipment manipulation or trap scenario is used.

Remaining gap: the conditional callee paths are not fully qualified. Mounted, equipment, trap-release and other exceptional states are outside this witness; excluded scenarios remain excluded and are not proposed as follow-ups. Next safe step is to identify a permitted, source-led continuation that materially narrows this key, or retain its current active status. Do not repeat the ordinary successful transition as if it resolved that gap.

The projection binds the exact original run/key/fingerprint and leaves both this key and the neighboring sleepy-gaze key active, with an empty decisions array. It reuses the durable run from PR #96, linked in the sibling web-call-stub-negative README. The complete original run comparison was verified by the accepted exporter; no full scan or large run copy was added. JS gazemu and polyself are unchanged in behavior from the original run base; the intervening mhitu change is the unrelated accepted acid-engulf predicate.
