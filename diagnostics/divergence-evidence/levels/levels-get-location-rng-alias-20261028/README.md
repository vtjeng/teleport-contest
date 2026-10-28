# Scoped scanner negative

The exact `edge-c-only` lead in `case.json` is an alias-detection false positive.
C calls `rn2`; JS binds `randomCore` to the imported `rn2` by default and calls
that alias at the corresponding source branch. The test exercises both injected
endpoint values and the default RNG, with a zero-draw fixed-coordinate control.
The expected arithmetic and branch order are read from pinned C source, not
from a C executable. Source hashes and exact hub-generated bindings are retained.

Run the `reproduce` command in `case.json` from the stated repository base with
this evidence directory overlaid. No recorder, dependencies, or gameplay edits
are needed. This is a helper-level negative proof about the named missing edge;
it does not certify whole-function parity or gameplay reachability. In particular,
the get_location fallback and get_room_loc both-negative somexy branches are
outside this proof. Do not suppress unrelated edges or nearby helper findings.

A portable two-lead projection is shared at
`../levels-get-location-rng-alias-20261028/bound-run.json`. It preserves all
original run metadata and selected lead objects, including the original
fingerprint inputs. `projection.json` pins both the original full-run hash and
the projection hash. The original run remains retained in the producer environment;
no container-local path is needed to consume this projection. Its smaller lead
count must not be used to measure whole-run filter yield.

From the repository root, verify both bindings and the projection hash:

```sh
node --test diagnostics/divergence-evidence/levels/levels-get-location-rng-alias-20261028/binding.test.mjs
```

The existing hub `template --run <bound-run.json> --keys <two keys in case.json>`
accepts this projection with the original runId and review fingerprints.
No filter or classification database has been modified here.
