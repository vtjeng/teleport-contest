# Scoped negative: secret descriptors preserve an existing door type

C `sel_set_door` creates a DOOR/SDOOR terrain type only when the old terrain is neither. It then removes D_SECRET from the requested mask and ensures a secret descriptor has at least the closed mask. Consequently, applying `secret` to an existing ordinary door preserves DOOR; applying it to floor creates SDOOR. JS does the same.

The unmodified C function and the production JS `lspo_door` API agree on **72 tuples** of resulting terrain, mask, orientation and authored-map bit: three initial types (ROOM, DOOR, SDOOR), six explicit descriptors (nodoor, broken, open, closed, locked, secret), four local neighborhoods, all at (10,10). The existing-DOOR versus floor pair is the distinguishing control. This does not claim equivalence for random descriptors, room-wall placement or arbitrary map states.

Bundle this directory and its `levels-door-orientation-20261028` sibling. From repository root with Node and Clang:

```sh
node diagnostics/divergence-evidence/levels/levels-door-descriptor-20261028/probe.mjs
```

Expected exit 0 on base `8eec78d622b3ef9cb22a54d1699aaf335e9342e9`. The tiny C harness includes the sibling's exact orientation extraction; its own `sel_set_door` body is copied unchanged from sp_lev.c:4647 at C gitlink `16ff59115315917b93185d026aeefea06db9b0f4`. Hashes and observations are bundled.

These are finite unit inputs, not a claim that every transition occurs in the sibling's recordings. Their attribution gaps remain unresolved. This case is manual/unbound and does not invent a scanner identity.

All three documented commands across the two cases passed in a separate clean checkout of the stated base, with only evidence overlaid. The orientation directory includes the clean-base receipt.
