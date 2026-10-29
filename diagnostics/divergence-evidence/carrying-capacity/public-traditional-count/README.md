# Traditional counted prompt echo: confirmed candidate

Measured JS0fe5207e91a3d4ff68f62b8f56d72e24ccaca602; C gitlink
16ff59115315917b93185d026aeefea06db9b0f4. Latest Main checked
94e6d4a7d307a2435eb3563dbdb2d8675dceb19d; relevant sources unchanged.

Supported public setup: seed642919 Valkyrie, capacity950, kit90,
menustyle:traditional, pickup_burden:u. Stash840 ordinary arrows into plain
sack and drop it; stash60 more via #loot. Take-out class ')' reaches
`Take out: 900 arrows (900 aum)? [yn#aq] (n)`. Enter861 then newline; answer
n or y to the resulting burden prompt. Explicit `#861` is a third variant.
No manual state injection or special object effects.

Three target variants exit1 with identical C/JS RNG and eventual inventory
outcomes but different input-boundary screens/cursors. First mismatch is
zero-based segment0 step105,row0,column44: C '#', JS space. For digit entry
C cursor[46,0,1], JS[44,0,1]; explicit # entry C[45,0,1], JS[44,0,1].
- decline:121 screens/cursors,2340 RNG; count restored to900arrows.
- accept:121 screens/cursors,2361 RNG;861carried/Burdened,39remain.
- explicit-prefix:122 screens/cursors,2340 RNG;900remain after decline.
- yes-no-control:118 screens/cursors,2339 RNG, exit0 exact; y selects whole
  stack, n declines its burden prompt,900remain. No numeric entry.

Root cause: C win/tty/topl.c tty_yn_function:478-529 calls addtopl("#"), then
addtopl for each count digit, and removetopl for erasure. JS topl.js:630-674
parses value/digitLength but never echoes those characters while awaiting the
next input. Updating answered-prompt history at the end cannot reproduce the
intermediate screen/cursor boundaries. Caller path is public #loot ->
traditional_loot -> invent.askchain -> tty_yn_function. This is one semantic
cause across3variants, separate from the3 earlier PR110 causes. Numeric result
handling worked in these probes; no arithmetic/overflow conclusion is claimed.

Existing addtopl cursor and answered-prompt replacement tests both pass; neither
covers this numeric input loop. Checked current source history and PR title
searches for numeric/count prompt overlap; no equivalent published case found.
Main owns implementation/overlap adjudication. Exposure is ordinary traditional
count input; wizard wishes/wizweight provide setup/observation, not the faulty
branch. Non-debug reproduction is not separately recorded.

observe.mjs independently checks mismatch identity, RNG equality, inventory,
remaining counts, final screen equality and stable HP/no observed combat.
case.json pins commands, pre-fix expected exits, normalized actual receipts,
raw C/JS outputs and source hashes. Planned post-fix commands expect0 and have
no execution receipts. Fresh output directories required. Recorder binary/source
provenance remains in public-stack-cycle; independent build attestation unavailable.
Elapsed time unmeasured. No gameplay edits, CI, effects, consumption, rings,
migration, timers, combat or denied investigations.
