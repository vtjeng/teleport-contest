# Travel to current square clears a flag C retains

Ordinary input `_  .;!d` reaches the difference without moving the hero. `_` begins travel; the two spaces acknowledge its More prompt and initial farlook tip; `.` chooses the current square; `;` enters farlook; `!` enables location menus; `d` opens a door menu. The ordinary Ranger start has visible doors. All setup and input are pinned in the recipe.

C prints "You are already here." and returns before clearing `getloc_travelmode` (`cmd.c:5354-5362`). JS clears that flag inside the early return (`cmd.js:2764-2773`). Consequently the later nontravel menu says **Pick a door for travel destination** in C versus **Pick a door** in JS. This is the observed C behavior, regardless of whether retaining the flag was intentional.

The control changes only current-square `.` to Escape, causing travel cancellation; it matches all eight screens/cursors and 2,973 RNG calls. The target also has eight boundaries and identical RNG, with the first strict difference at zero-based boundary 7 (`d`). The comparator first reports a title-highlight attribute difference; the visible title suffix also differs.

From repository root:

```
node --test diagnostics/divergence-evidence/commands/travel-current-square-mode/evidence.test.mjs
```

On clean Main `034443e9246cb9fc19dfba9ba2d9c2893132e84c`, control passes and target deliberately fails. Both should pass after repair. The deliberate failing test is outside default CI. All fixtures and source/tool/recorder fingerprints are included; `clean-base-check.json` records verification before and after running the documented command from clean committed sources.

Fresh recorder commands:

```
node scripts/diff-fresh.mjs diagnostics/divergence-evidence/commands/travel-current-square-mode/target.recipe.json
node scripts/diff-fresh.mjs diagnostics/divergence-evidence/commands/travel-current-square-mode/control.recipe.json
```

Scope is the current-square travel return and subsequent menu title; no broader pathfinding claim is made. No wizard commands, objects or injected state are needed. This manual finding is unbound. Preliminary probes that remained in the startup prompts are excluded from qualification and yield. Published original C and JS captures are compressed without modification.
