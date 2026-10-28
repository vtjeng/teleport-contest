# Slowing feedback and repeated negation: scoped explained negative

The first successful monster slowing attack can print two messages. C's
`mon_adjust_speed` prints `seems to be moving slower`; the AD_SLOW handler then
prints `slows down`. An already-slow target prints neither, but magical
negation is still evaluated before the speed gate. JS follows both details.

```
node --test diagnostics/divergence-evidence/monsters/skeleton-repeat-slow-negative/probe.test.mjs diagnostics/divergence-evidence/monsters/skeleton-repeat-slow-negative/replay.test.mjs
```

Four tests pass. The focused test uses a native skeleton's 1-point slowing
attack against an ordinary visible large dog. Normal-speed and already-slow
controls both consume rn2(10)=9 for magical negation. The first ends with
mspeed=permspeed=MSLOW and both source messages; the second keeps MSLOW and
emits no message. Physical damage is left unchanged for the caller to apply.
The slow starting state can result from a prior slowing attack or wand.

The complete public C witness reaches the skeleton's touch at step 153, the
first feedback line at 154, the second at 155, and another touch at 158. That
repeat consumes rn2(10)=1 without either slowing line. All 2999 RNG entries,
166 screens and 166 cursors match JS. This gives both first-hit and repeated-hit
coverage, not merely matching startup output.

The initial focused assertion expected only the attack-handler message and
failed because the real speed owner emitted its message first. C source and
the recording explain the pair; this was an incorrect expectation, not a port
defect. The final assertion retains both lines. The claim is limited to this
visible, mobile, unequipped-target behavior and negation-before-speed ordering;
it does not establish general speed, equipment, petrification or visibility
equivalence. This is an unbound manual case, with no scanner suppression key.
Regenerate via local `record.mjs` with a new private output-directory argument
using the configured repository recorder. No gameplay changes are included.
