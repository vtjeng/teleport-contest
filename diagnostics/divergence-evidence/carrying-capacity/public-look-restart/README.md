# Look-inside must restart class selection: candidate

JS48aaf656cd64dda0988b6ad4d3326bf604ba4fd5; C16ff59115315917b93185d026aeefea06db9b0f4.
Supported ordinary mixed floor-sack setup (900arrows,49coins), traditional
menustyle. At the class query, enter `:)` then dismiss contents with Escape.
C restarts `What kinds of thing do you want to take out?`; JS consumes the
trailing ')' from the old response and advances to `Take out: 900 arrows...?`.

Target exit1,134 screens/cursors and2351 RNG each. First mismatch zero-based
segment0 step133,row0,col0: C'W', JS'T'; cursors C[57,0,1], JS[44,0,1]. RNG
matches exactly. Control enters only ':' and dismisses; both restart the
class query,133 screens/cursors2351 RNG, exit0 exact. No item transfer is needed
or claimed: exposure is a different pending input state after the same input.

C pickup.c query_classes:214-226 uses goto ask_again immediately after
simple_look (and likewise inventory display). This discards the remainder of
the current response and resets query-local state. JS query_classes:2786-2796
uses continue in the inner character loop; it continues parsing that remainder.
This missing restart is separate from cause5's filtered menu return code, even
though both occur in query_classes. No numeric entry is involved, so cause4
is not re-counted. Main1e786f87d927b72bd07122fc3eead0ecb5d8203c changes the
first3 PR110 causes but leaves query_classes/topl count behavior unchanged.

Checked PR title overlap for query_classes and prior traditional tests; no
matching published case found. observe.mjs asserts target/control output,
RNG, exact final prompts and stable HP/no observed combat. case.json provides
exact source/preconditions/commands/expected exits, actual normalized receipts,
raw recordings and planned unexecuted post-fix check. Fresh output paths needed.

Normal traditional input path; debug wishes/wizweight establish setup only.
Non-debug replay not separately recorded. Recorder binary/source provenance
and missing independent build attestation remain in public-stack-cycle. Elapsed
time unmeasured. No gameplay edits, CI, special effects, consumption, rings,
migration, timers, combat or denied investigations. Main is sole integrator.
