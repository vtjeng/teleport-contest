# Queued direction incorrectly treated as redraw input

Ordinary Ranger seed 421081 starts next to a closed door southeast. Configure `BINDINGS=n:redraw,N:movesoutheast`, enter `#therecmdmenu`, give direction `N`, and select `a` (Open the door). The action queues `doopen` and a southeast `CMDQ_DIR`. No wizard commands, state injection, object setup or movement is required.

C converts the queued direction to `n` and jumps to `got_dirsym`, **past** the prompted-input redraw check (`cmd.c:3962-3980`, `4013-4021`). Because `n` was rebound away from movement, C shows invalid-direction help. JS also converts to `n` but performs its redraw test regardless of the input origin (`js/cmd.js:1574-1622`), so it redraws and asks for a new direction.

| Zero-based boundary | Input | C | JS |
| --- | --- | --- | --- |
| 14 | Enter | In what direction? | Same |
| 15 | N | Nearby menu, including Open the door | Same |
| 16 | a | cmdassist: Invalid direction key! | In what direction? |
| 17 | Space | Never mind. | Same |

Target has 20 screens/cursors and 2,973 RNG calls; RNG matches. The control removes only `n:redraw`, retains the alternative `N` binding and all input, and strictly matches 20 screens/cursors and 2,978 RNG calls. This is supported key configuration with an unusual but defined C result, not an invalid constructed direction.

From repository root:

```
node --test diagnostics/divergence-evidence/commands/queued-direction-redraw/evidence.test.mjs
```

On clean Main `034443e9246cb9fc19dfba9ba2d9c2893132e84c`, control passes and target deliberately fails at boundary 16. Both should pass after a repair. The failing test stays outside default CI. Complete fixtures and source/tool/recorder fingerprints are included, with clean-source verification in `clean-base-check.json`.

Fresh recorder commands:

```
node scripts/diff-fresh.mjs diagnostics/divergence-evidence/commands/queued-direction-redraw/target.recipe.json
node scripts/diff-fresh.mjs diagnostics/divergence-evidence/commands/queued-direction-redraw/control.recipe.json
```

Scope is queued direction handling in `getdir`, not door implementation or universal direction equivalence. PR #56's byte-helper proof did not cover this control-flow distinction. This manual case is unbound. Preliminary probes that failed to reach the menu/queue are excluded from qualification and yield; raw notes remain private. All published C/JS captures are preserved without modification.
