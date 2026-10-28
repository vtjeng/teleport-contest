# Trapped-door mimic creation: confirmed level-generation divergence

C `dosdoor` replaces a trapped ordinary door with a mimic after its difficulty
and RNG gates. JS clears the door mask but omits creation. The minimal supported
witness is seed **28103505**, input `.` then Ctrl-V, `10`, Enter. The first RNG
mismatch occurs while generating D:10, before any subsequent command. No custom
Lua runtime or injected state is needed. `trace.json` retains the successful C
gates and the ensuing creation draws. The same route with seed **28103504** is
the passing control. Both were repeated twice with identical hashes.

From the repository root (Node only; no C checkout/build needed for replay):

```sh
node diagnostics/divergence-evidence/levels/levels-door-mimic-20261028/replay.mjs witness
node diagnostics/divergence-evidence/levels/levels-door-mimic-20261028/replay.mjs control
```

The witness is a deliberate red focused test: exit 1 on the stated base, expected
to pass after implementation. The control exits 0. Both remain outside default CI.
All setup, C oracle recordings and replay dependencies are bundled or existing
repository tools. A configured recorder can regenerate each with
`node scripts/diff-fresh.mjs --recipe <witness.recipe.json|control.recipe.json>`.

`case.json` pins source, recorder, patches and tool/config identities. The three
exact source-audit edges have a shared portable run projection with original
fingerprints. No suppression or gameplay database is changed. Initial exploration
is retained compactly in `exploration.json`; matching seed cases prove no general
equivalence. The reduced Lua-adapter runs remain raw `unresolved` because they
cannot attribute natural D:10 generation to the adapter's unused Arc-filb label.
The actual input, D:10 status screen, source-annotated RNG prefix and repeatable
comparison independently establish this witness; no Arc-filb loading is claimed.

Main should start at C `mklev.c:650-661` and JS `dosdoor`. Preserve the C species
availability guard and source-order creation/disguise calls. The all-species-gone
branch is a source requirement, not a separately qualified divergence here.
