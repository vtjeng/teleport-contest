# Embedded-NUL level message: API-scoped divergence

C truncates each `des.message` string at the first embedded NUL because `lspo_message` measures it with `strlen`. JS concatenates the entire string. This is one buffer-construction cause with two targets; shipped exposure is unknown.

## Clean-base pickup

1. Check out Main `d1d8ac170b75dca71abe29819b5daa9972301221` in a clean gameplay checkout.
2. Copy this evidence directory into the same relative path. It contains every fixture and oracle dependency; Node and Clang are required.
3. If using the saved cloud toolchain, run `source /workspace/.setup/activate.sh`.
4. Run `node diagnostics/divergence-evidence/levels/levels-message-buffer-20261028/probe.mjs observe` — exit **0**, prints both mismatches and both matching controls.
5. Run `node diagnostics/divergence-evidence/levels/levels-message-buffer-20261028/probe.mjs target` — deterministic exit **1** on the first differing buffer.
6. Run `node diagnostics/divergence-evidence/levels/levels-message-buffer-20261028/probe.mjs control` — exit **0**.

The deliberately failing runner uses an ordinary `.mjs` filename and is not registered in default CI. It compiles its bundled C oracle in a private temporary directory and removes that directory afterward.

| Calls | C buffer | JS buffer |
|---|---|---|
| `message("alpha\0omega")` | `alpha` | `alpha\0omega` |
| Above, then `message("tail")` | `alpha\ntail` | `alpha\0omega\ntail` |
| `message("alpha")`, then `message("tail")` | `alpha\ntail` | same |
| `message("")`, then `message("tail")` | `\ntail` | same |

Backslash escapes in this table denote characters, not literal backslashes. Lua and JS strings can contain NUL; target.lua and control.lua specify the equivalent public des calls. JS executes those calls through the production startup/mklev loader and stops before finalization. It does not inject the message buffer or call a private helper directly.

The C oracle contains the unchanged upstream `lspo_message` body. A fixed one-string stack adapter returns the argument storage pointer used by `luaL_checkstring`; input bytes after NUL are retained by the adapter. C's own `strlen` and copy logic produce the expected truncation. This is an executed C-function oracle with a documented argument adapter, not a claim that the entire Lua parser ran. No arbitrary Lua runtime was built.

Main can begin at `js/mklev.js:lspo_message`; the discrepancy is in that function's use of full strings versus the C buffer's length calculation. This evidence makes no claim about rendering, screens, player commands, global string conversion, hidden-score impact or shipped-level exposure. The controls pin ordinary and empty-string newline semantics.

The frozen scanner allocation edge prompted inspection of C buffer sizing. Allocation itself is not claimed missing. Original key/evidenceKey/runId/fingerprint are retained with this specific demonstrated difference; the scan is not relabeled to the newer tested base. This case is independent of all parked or denied investigations.

Versioned packaging uses the accepted validator at `d1d8ac170`. Fresh structured target/control receipts at that base retain exits 1/0. Earlier 51f5686fa observations and provenance are preserved in evidence-details.json and verification.json. The planned post-fix command is declared but has not run. Packaging checks do not certify semantics or acceptance.
