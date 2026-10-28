# Queued map-symbol lookup misses its dispatch arm

Ordinary Ranger seed 421081 has a closed door southeast. Enter `#therecmdmenu`, select simulated click with `_`, acknowledge the tip and More with two spaces, move the cursor southeast with `n`, pick the location with `.` (right click), and choose `d` (Look at map symbol). A following `:` demonstrates that C continues accepting commands. The recipe uses supported `whatis_coord:none` to isolate dispatch from coordinate formatting. No movement, wizard state or object setup is required.

C queues and executes `doclicklook`. JS stores the queued row's `ef_txt`, `clicklook`, in `command` (`cmd.js:5537-5543`; table row `extcmdlist_data.js:207`). Its dispatch arm instead compares `command` against the handler spelling `doclicklook` (`cmd.js:5857`), then falls through to the unsupported-command refusal. C outputs `closed door`; JS stops after the action menu.

The first missing JS screen/cursor is zero-based boundary 20, menu `d`. C records 22 boundaries versus JS 20; all 2,973 RNG calls match. The neighboring control changes only menu `d` to `a` (Open the door) and strictly matches all 22 screens/cursors and 2,978 RNG calls. This is a ready affected command path for Main's dispatch-family overlap assessment, not a claim that every queued command fails.

From repository root:

```
node --test diagnostics/divergence-evidence/commands/clicklook-queued-dispatch/evidence-check.mjs
```

On clean original base `034443e9246cb9fc19dfba9ba2d9c2893132e84c` and refreshed Main `52d1911e5e9e8ad6a185e2561caaf5fd92edc703`, the origin-retention test and control pass, while target deliberately fails. All six test-discovery guard checks pass. The manual .mjs regression stays outside default CI. Complete fixtures, source/tool/recorder hashes and clean-source verification are included. After repair all three checks should pass.

Fresh recordings:

```
node scripts/diff-fresh.mjs diagnostics/divergence-evidence/commands/clicklook-queued-dispatch/target.recipe.json
node scripts/diff-fresh.mjs diagnostics/divergence-evidence/commands/clicklook-queued-dispatch/control.recipe.json
```

The originating scanner observation was `doclicklook -> auto_describe`: C includes configured coordinates/custom output flags while JS prints only the description. It remains **unresolved**, because both map/none coordinate variants stop before that code executes. Its exact immutable run identity, evidence key and review fingerprint are retained; the primary dispatch finding is not mapped onto that different semantic claim. The accepted exporter at `034443e92` produced and validated the compact projection against the full original run. Import leaves the origin active and filters nothing. `coordinate-followup.recipe.json` and its current blocked result provide the next experiment after dispatch is repaired; do not count the coordinate hypothesis as confirmed or negative.

Preliminary invalid option-name and incomplete acknowledgement probes are excluded from qualification and yield. Raw qualified target/control observations are compressed without modification. The map-coordinate raw attempt remains preserved privately with its reproduced recipe/result here.

Original observations retain their original revision and hashes; `current-main-check.json` separately records the new-base replay. Main's intervening extmenu label repair does not change this dispatch arm.
