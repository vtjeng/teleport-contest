# Vrock gas exposes deferred vision at a naming prompt

At JS base `5826a75fcc149b8895af22af4d38ea750bad13c8`, reading a wished scroll of scare monster beside a Vrock creates gas. With acoustics disabled, the unidentified scroll then asks for a name. At that input boundary C redraws the newly occluded squares as remembered floor; JS keeps visible cloud glyphs. The setup uses only public debug commands, ordinary reading, and prompt input. The target path does not branch on wizard mode.

Run from the repository root after applying this evidence-only change:

```sh
node --test diagnostics/divergence-evidence/monsters/vrock-gas-call-prompt-vision/replay.test.mjs
```

Expected on the stated base: **control passes, target fails**. This was verified in a separate initially clean detached checkout of that exact base with only these evidence files copied in. No C build, private files, or additional fixtures are required to replay. Rechecked at current main `cfb72d4699bfe6080b46f21894f929f35b68414f` with the same result (only discovery tooling advanced). The deliberate failing test lives outside the default suite.

The target uses 44 input keys, including one More response followed by Escape from the Call prompt. Its C recording has 45 boundaries. First mismatch: segment 0, zero-based step 43, row 6, column 65: C `.` color 8; JS `#` color 10. All 2,578 RNG calls and all 45 cursors match. The control ends immediately after reading the scroll, at the More prompt; all 2,569 RNG calls, 43 screens and 43 cursors match. Thus gas creation is exercised on both sides before the failing prompt.

Source chain:

- `src/read.c:seffect_scare_monster` calls `monflee`; `src/monmove.c:522-523` creates the Vrock cloud.
- `src/region.c:add_region` blocks sight through visible clouds. The recorded creation trace includes both `monflee` and `create_gas_cloud` draws.
- `win/tty/getline.c:65` emits the prompt through `custompline`; `src/pline.c:266-270` resolves deferred vision before flushing.
- `js/getline.js:113-116` implements that prompt by calling `flush_screen` directly. The deferred-vision step present in `js/tty_message.js:417` is absent here.

This is a UI/vision ownership handoff exposed by a monster action. It is distinct from the existing yes/no prompt repair in `scripts/prompt-deferred-vision.test.mjs`. No gameplay repair is included.

For an optional fresh C confirmation, with the repository recorder installed and Clang environment activated:

```sh
node diagnostics/divergence-evidence/monsters/vrock-gas-call-prompt-vision/record.mjs /tmp/new-vrock-target
node diagnostics/divergence-evidence/monsters/vrock-gas-call-prompt-vision/record.mjs /tmp/new-vrock-control ./control.recipe.session.json
```

Each output path must be new. `runDifferential` makes a private recorder installation per call. The runner prints the comparison; the replay test above is the assertion gate. `case.json` pins the C gitlink, recorder binary, patches, tools, inputs and recordings. The original unreduced observation is retained separately; surplus keys in that attempt were entered into the naming prompt, and are not claimed as elapsed turns.
