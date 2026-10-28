# objects-an-buffer-lifetime

**Unresolved, source-only; not implementation-ready.** Scanner lead `source-audit:edge-c-only:src/objnam.c:an:nextobuf` identifies a representation difference. C `objnam.c:138-145` rotates twelve mutable scratch buffers; `an` obtains one at line 2147. JS `objnam.js:736-744` returns an immutable string without changing a buffer index.

Hypothesis: a production caller that retains an `an` result across a complete scratch-buffer cycle might observe overwritten text in C and retained text in JS. A helper-level retention probe leaves JS's `an('apple')` value unchanged after twelve later `an('stoneN')` calls. C source implies an analogous retained pointer aliases the twelfth overwrite. This is not a demonstrated gameplay difference: no public command path retaining that pointer through twelve unreleased allocations has been established, and no C runtime capture is claimed.

Attempt/control: inspected the allocator and a concrete copying consumer, `safe_qbuf` (`objnam.c:5624-5696`). That consumer copies its prefix into its destination before calling short_oname and releases the temporary object-name buffer. It therefore does not establish the hypothesized stale-pointer path. The JS helper probe and its direct per-call output controls pass; that passing probe supplies no gameplay equivalence or reachability proof.

```
node --test diagnostics/divergence-evidence/objects/objects-an-buffer-lifetime/check.test.mjs
```

Next discriminating experiment: identify a specific production caller that retains an `an` pointer across nested naming or inventory output without copying/releasing it, count the intervening buffer allocations, and construct a public C/JS command sequence with a shorter-call-count control. If caller lifetime rules exclude such retention, record their bounded proof. Do not label arbitrary missing scratch-buffer calls equivalent merely because JavaScript uses garbage collection, and do not report this constructed helper probe as a confirmed bug.

Exact scanner binding and both review decisions are in `../objects-novel-direct-name/{binding,bound-run,decision-template,decisions}.json`. The compact projection preserves hub review fingerprints; the full run remains available in the shard workspace.
