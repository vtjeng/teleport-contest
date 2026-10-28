# Psychic blast: mindless hero forms are not immune

Stable ID: `monsters-psychic-mindless-hero-negative`. **Explained negative**, manual
and unbound. The suspected missing immunity in JS is also absent in C: the
monster-target loop skips mindless species, but the hero branch does not. C even
comments that the hero is never mindless in this context. This is distinct from
PR #52's physical brain-eating damage result for a mindless monster.

Run from base `1c4be74beb32edbfc897de805f218e180f8c6002` plus this directory:

```sh
node --test diagnostics/divergence-evidence/monsters/psychic-mindless-hero-negative/*.test.mjs
```

Requires Node, `cc`, and the initialized upstream C submodule. Four tests pass;
none are registered in default CI. No gameplay change or scanner decision is
included.

## Focused hypothesis and results

Hypothesis: when the hero becomes a native mindless iron golem, JS should apply
the same psychic immunity as it applies to an ordinary iron-golem monster.
The complete compiled C `mind_blast` function refutes that expectation for the
specified target/control inputs:

| Hero | Hero damage | Friendly iron-golem damage | Friendly minotaur damage |
|---|---:|---:|---:|
| Human | 1 | 0 | 1 |
| Iron golem | 1 | 0 | 1 |
| Invulnerable iron golem | 0 | 0 | 1 |

JS reproduces all three outcomes through the actual production monster action
adapter. The hostile native mind flayer triggers its real psychic ability,
walks the active monster chain, and then completes its normal action. The hero
is changed with real `polymon`, not by replacing the hero's attack or species
fields. Friendly native iron-golem and minotaur monsters provide the branch
controls. Random outcomes are valid: the 1-in-20 ability gate and 1-in-10 targeting
gates take zero; damage is the valid minimum `rnd(15)=1`.

The initialized API fixture places actor and targets on legal floor squares,
sets their hostility and HP, and supplies ordinary output/redraw and random
owners. The invulnerability control initializes the same `u.uinvulnerable` state
used during protected prayer; it does not bypass the psychic function's guard.
No public-input recording of this setup is claimed. Native iron-golem form is
established by `polymon`; the seed alone does not establish it.

## C oracle and exact limits

`oracle.test.mjs` compiles the entire unmodified upstream `mind_blast` function
from `src/monmove.c`, together with native species mindlessness flags extracted
by the preprocessor from `include/monsters.h`. Source and tool hashes are in
`case.json`. The fixture fixes: actor distance four squares, no hero telepathy,
no Conflict, no half-spell damage, no hiding/appearance, hostile actor, friendly
live targets, and one-point damage. Visibility/output stubs suppress text;
wakeup is a no-op because the controls are already awake; deaths are forbidden.
The control monsters are not telepathic. These predicates are explicit, not
claims about other setups.

The C oracle starts every hero at 80 HP and asserts damage deltas. The JS human
retains initialized human HP while real polymorph supplies golem HP; no lethal
or rehumanization threshold is reached. C consumes two targeting draws and two
damage draws without invulnerability, and one of each with it. JS observations
include the later movement/combat-gate draws too; they are not presented as an
end-to-end C/JS RNG comparison.

This proves only the bounded hero-versus-monster mindlessness asymmetry and
hero-only invulnerability gate for these nontelepathic, nonlethal targets. It
must not suppress other psychic-blast leads, hero polymorph bugs, telepathy,
half-spell damage, awakening, lethal damage, or any unseen/migrating behavior.
Existing tests already cover ordinary monster-chain filtering; this evidence
adds the actual mindless hero form and its controls, not a new claim about that
previously covered filter.
