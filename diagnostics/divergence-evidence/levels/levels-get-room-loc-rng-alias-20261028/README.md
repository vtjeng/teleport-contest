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

The immutable discovery run is retained once at the path and SHA-256 in
`case.json`, rather than copied into this PR. Its runId, key, evidenceKey and
reviewFingerprint identify the exact inputs for the separate negative-filter
review. No filter or classification database has been modified here.
