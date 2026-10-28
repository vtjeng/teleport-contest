# Mindless brain attacks retain base damage

Bounded manual/unbound explained negative. C's `eat_brains` returns
`M_ATTK_MISS` for a headed mindless target without clearing base damage.
`mdamagem` still applies that damage, and remaining native tentacle attacks run.
JavaScript matches. This does not supply an automatic scanner suppression.

On Main `8eec78d622b3ef9cb22a54d1699aaf335e9342e9`, from repository root:

```sh
git submodule update --init --checkout --no-fetch -- nethack-c/upstream
node --test diagnostics/divergence-evidence/monsters/mindless-brain-damage-negative/*.test.mjs
```

Five tests pass, including replay of both complete C recordings, also checked
from a separate clean checkout of the stated base plus only this directory.
These evidence tests are outside default CI.

The direct probe runs native `mattackm` with a disarmed master mind flayer,
legal native HP, intact attacks and valid low rolls. Against the flesh golem,
one weaponless 1d8 strike plus five 2d1 tentacles cause 11 damage (40 to 29 HP).
All five brain attempts draw rnd(10), print the brain-eaten/does-not-notice
feedback, and leave skipdrin clear. The sentient hill giant control takes five
extra points (64 to 48 HP). The precise HP arithmetic is C-source-derived and
checked in JS; the recordings do not expose a C HP snapshot.

The public target reaches flesh-golem brain feedback at steps 93 and 95 and
later; the control reaches hill-giant brain feedback at steps 123, 128 and 133.
They strictly match all RNG, screen cells/attributes, cursors and animations:
2818 draws/136 screens for target; 2995 draws/175 screens for control.
The recordings are intact, including incidental lichen combat and debug
refusal-to-die prompts. Recipes prefix spaces for the full-moon startup prompt
and use spaces to advance More prompts. They do not inject monster state.

Fresh recording with the repository's already-built recorder:

```sh
source /workspace/.setup/activate.sh
node diagnostics/divergence-evidence/monsters/mindless-brain-damage-negative/record.mjs /absolute/new-private-target
node diagnostics/divergence-evidence/monsters/mindless-brain-damage-negative/record.mjs /absolute/new-private-control ./control.recipe.session.json
```

Two earlier minotaur control attempts matched but never reached brain eating;
they remain private coverage misses with hashes in case.json. The final control
uses a hill giant and explicitly asserts branch coverage before replay.

Scope excludes headless/noncorporeal targets, helmets, life-saving and nutrition.
No broad equivalence is claimed. Broader Archon targeting and later wraith growth
remain separate unresolved hypotheses. Provenance, timestamps and exact file
hashes are in case.json; raw focused observations are in observations.txt.
