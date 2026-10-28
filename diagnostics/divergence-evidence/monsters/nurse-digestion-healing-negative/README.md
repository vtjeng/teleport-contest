# Nurse digestion heals before growth: scoped explained negative

A monster that digests a nurse need not finish the attack at full HP. C first
calls `healmon(magr, magr->mhpmax, 0)`, then applies the ordinary kill's
`grow_up(magr, mdef)`. Maximum HP can grow without current HP growing. JS does
the same. For the focused wounded purple worm, both produce **120/121 HP**;
the stone-golem control produces **32/121 HP**.

This manually investigated hypothesis is **unbound**: no matching scanner lead
was identified, and no nearby scanner key is being claimed for suppression.
It is an explained negative for healing/growth order, not a gameplay fix.

Run from the repository root with Node and a C99 compiler (`cc`, or `CC`):

```
node --test diagnostics/divergence-evidence/monsters/nurse-digestion-healing-negative/probe.test.mjs diagnostics/divergence-evidence/monsters/nurse-digestion-healing-negative/replay.test.mjs
```

Four tests pass. The direct combat fixture uses native species, legal wounded
HP values and legal scripted RNG. It calls production `gulpmm`, which reaches
digestion, healing and growth. The control changes only the victim species and
its normal maximum HP. `c-oracle.mjs` compiles the unmodified C `healmon` plus
the source's victim-growth arithmetic, with a legal rnd=1 and a normal
15th-level, 32/120-HP purple worm. Its unused hero-healing stub aborts if called.
This isolated HP oracle is not a complete C combat simulation.

The separate **unmodified full C recording** uses public debug monster creation
for a tame purple worm and a hostile nurse. The full-moon startup prompt is
answered before creating either. Zero-based steps 109 and 110 reach swallowing,
`Burrrrp!`, the nurse's death, and `The purple worm looks healthy.` All 3311 RNG
entries, 163 screens and 163 cursors match JS. This recording establishes
ordinary branch reachability, not exact equivalence of every monster state.
The 120/121 claim comes from the focused C/JS state oracle, not inferred from
that health message. Debug death-refusal prompts occur in the public witness.

To regenerate its C recording using the repository's configured recorder:

```
node diagnostics/divergence-evidence/monsters/nurse-digestion-healing-negative/record.mjs NEW_PRIVATE_OUTPUT_DIRECTORY
```

Scope: this nurse-healing-before-victim-growth behavior. Do not generalize to
all digestion, all growth rolls, corpse effects, or display messages. Earlier
wraith/green-slime scouts did not reach their intended digestion branches and
remain unresolved. Initial startup-prompt and invalid scripted-roll attempts
are described in `attempts.md`; none is counted as a negative proof.
