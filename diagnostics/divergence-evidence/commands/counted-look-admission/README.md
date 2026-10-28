# Counted sighted look rejected before dispatch

On Main `8eec78d622b3ef9cb22a54d1699aaf335e9342e9`, ordinary Ranger input `2::` should perform one counted look, discard the count because that sighted look takes no time, then perform the following look. C records four boundaries; JS records only the initial screen and count prompt. Both consume the same 2,549 RNG calls. The uncounted `::` control matches all three screens/cursors and RNG calls.

The count admission guard in `js/cmd.js:5681-5728` rejects `look` with positive multi before the already-ported look handler at 6671. C `rhack` invokes the handler at `src/cmd.c:3748`; its no-time result resets command variables at 3814-3820. This witness concerns a sighted initial-square look, not all counted commands or blind look. It requires no unusual platform width, object creation, wizard commands or injected state.

From repository root:

```
node --test diagnostics/divergence-evidence/commands/counted-look-admission/evidence.test.mjs
```

Expected on the stated base: control passes, target fails deterministically at zero-based boundary 2 (`:`), with JS missing that boundary. This deliberate parity regression is outside default CI. After repair both should pass. All fixtures are included; only standard repository dependencies are needed.

To regenerate with the standard deterministic C recorder:

```
node scripts/diff-fresh.mjs diagnostics/divergence-evidence/commands/counted-look-admission/target.recipe.json
node scripts/diff-fresh.mjs diagnostics/divergence-evidence/commands/counted-look-admission/control.recipe.json
```

The recipes pin seed, clock, role and complete options. Compressed recordings and raw JS observations preserve the original results. `case.json` pins C/JS bases, recorder binary and tool/source hashes; `clean-base-check.json` records replay from a clean committed source snapshot. This manual finding is unbound, with no fabricated scanner identity. Earlier version-command probes did not qualify the intended hypothesis and are excluded from yield counts.
