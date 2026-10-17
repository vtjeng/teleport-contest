# Public-input setup recipe book

Use these routines to design independent input-only C recipes. A recipe contains
`seed`, `datetime`, `nethackrc`, and `moves`; captured `steps` belong only in its
recording. Keep character, options, inventory selection, and prompt handling
explicit. Existing recordings below establish the stated observations for their
own inputs; adapting a routine needs its own C observation and required replay.
This guide was checked against upstream C `16ff59115315917b93185d026aeefea06db9b0f4`
and saved evidence available at accepted `5957d0cefd7a25c2dc857a3cfbbb0b1220c818f6`.
No new game was run to write it.

## Choose a hunger state

The source `eat.c:newuhs` maps nutrition to the following states. A status label
identifies an interval, not an exact nutrition value. During eating, messages can
be deferred until the meal ends; observe again at a normal command boundary.

| Nutrition in C | State |
| --- | --- |
| above 1000 | Satiated |
| 151 through 1000 | Not hungry |
| 51 through 150 | Hungry |
| 1 through 50 | Weak |
| zero or below | Fainting eligibility; actual fainting has additional state/RNG logic |

### Quickly reach Hungry in debug mode: verified literal recipe

Start with the complete options/character in
[teleport-hunger-crossing](../recipes/teleport.c/teleport-hunger-crossing.session.json).
Its eight `Ctrl-T` inputs, with the recorded prompt continuations and `.` inputs,
reach `You feel hungry.` and the `Hungry` status at segment 0, step 34 in
[the C recording](../recordings/teleport.c/teleport-hunger-crossing.session.json).
This is a short alternative to hundreds of ordinary waits.

`teleport.c:dotele` calls `morehungry(100)` after its non-trap route. The debug
command bypasses normal ability/energy eligibility, but teleport still changes
position and can encounter traps, monsters, or prompts. Use the literal recipe
as the verified witness. The recipe comment also mentions WEAK; the saved
capture only verifies Hungry. Do not claim that eight teleports establish Weak,
zero nutrition, or a universal final nutrition count. Extra spaces in this old
literal recipe include `Unknown command` frames; they are not elapsed turns.

**Adaptation gate:** select a suitable non-trap setup, perform only the bounded
teleports required by the new plan, and check the actual hunger status and normal
command boundary. Stop if teleport setup or unrelated interaction changes the
planned history. Debug-mode input is appropriate only when the target branch
itself does not depend on `wizard`.

### Reach Weak or fainting: source-backed procedure, not a newly verified shortcut

From an observed Hungry status, use bounded ordinary rest inputs and inspect the
status after each chunk; shorten the chunks near the desired threshold. End the
setup at the first observed `Weak` if that is the target. Do not infer turns from
input-byte count: command prefixes, inventory menus, pagers, occupations, and
incapacitation consume input and game turns differently. Use actual `T:` changes
and the C record. Rest is input-driven, not wall-clock sleeping.

An awake normal food-eating hero ordinarily loses one nutrition per elapsed
`gethungry` call. Hunger, regeneration, conflict, encumbrance, worn accessories,
slow digestion, sleep, and form can change this. A ring of hunger accelerates
loss on randomized accessory ticks; it does not supply a fixed turns-to-state
formula. `iflags.debug_hunger` and invulnerability suppress this routine.

Long-run witnesses exist in
[hunger-faint-starvation-lifesaving](../recipes/eat.c/hunger-faint-starvation-lifesaving.session.json)
and [its Valkyrie variation](../recipes/eat.c/hunger-faint-starvation-valkyrie.session.json),
with matching-path C recordings. They demonstrate faint/wake cycles and eventual
starvation/life-saving feedback (segment 0, steps 2053 and 2092 respectively).
Their genocide, accessory, and long rest setup is substantial; prefer the short
Hungry routine when that state suffices. Do not copy them as a cheap exact
fainting-time recipe or as proof of a different corpse-contact target.
A separate recent 280-rest attempt stopped with hostile interference and never
created its target corpse; it supplies no successful hunger/fainting setup.

### Raise nutrition by eating: verified satiation witness

[lesshungry-food-ration-independent-c45](../recipes/eat.c/lesshungry-food-ration-independent-c45.session.json)
uses literal moves `.ed .` for its stated Valkyrie startup inventory. The saved
[C recording](../recordings/eat.c/lesshungry-food-ration-independent-c45.session.json)
shows `Satiated` and the nearly-full warning at segment 0, step 3, then meal
completion at step 4. Letter `d` belongs to this inventory only.

For a new debug setup, wish for an `uncursed food ration`, select its observed
inventory letter with `e`, handle any actual prompts, and allow the meal to
finish before measuring the endpoint. This wish-based variant is a source-backed
template, not a new recorded witness in this guide. A food ration supplies 800
base nutrition (`include/objects.h`); elapsed eating and concurrent metabolism
mean the endpoint is not simply an assumed starting value plus 800. Eating
while already satiated can enter choking logic. Choose the amount/state in the
plan and stop on the observed endpoint; do not repeatedly feed until an
unmeasured number is assumed. Food changes nutrition, not corpse age.

## Obtain and age a corpse

### Create a newly made corpse late: verified parser and acquisition witness

Complete long travel, hunger preparation, and protective equipment first. Then
use `#wizwish`, enter the ordinary species request, and use the object promptly.
For the verified petrifying example, the public inputs are:

```text
#wizwish<Enter>
uncursed +0 leather gloves<Enter>
W<observed gloves letter>
#wizwish<Enter>
cockatrice corpse<Enter>
w<observed corpse letter>
```

The admitted
[stair-fall recipe](../challenges/cases/v96/v96-fumbling-stair-fall-wielded-corpse-selftouch.recipe.session.json)
and [C recording](../challenges/cases/v96/v96-fumbling-stair-fall-wielded-corpse-selftouch.session.json)
verify glove acquisition/wear and corpse acquisition/wield: the corpse appears
at segment 0, step 122 and is wielded at step 124. The complete literal recipe
uses `a`/`b`; these are not reusable inventory constants. Its later target is
outside this setup routine. Gloves protect ordinary handling, but do not prove
safety from the separate `selftouch` branch.

`mkobj.c:mksobj` initializes `age = max(moves, 1)`, and
`objnam.c:readobjnam` sets the requested corpse species through `set_corpsenm`.
The corpse is newly constructed; inventory text does not display a precise age.
Do not add the unsupported adjective `fresh`: a saved C prefix rejected
`fresh cockatrice corpse`; removing that adjective produced the observed object.
Do not create the corpse before a long wait and assume it remains young.
Species can have revival, decay, or special eating behavior; new construction
does not make every corpse safe food.

### Let a corpse age: verified one-case example and source limits

[mildly-rotten-jackal](../recipes/eat.c/mildly-rotten-jackal.session.json) kills and collects
a jackal corpse, searches for 70 turns, then eats it. Its
[C recording](../recordings/eat.c/mildly-rotten-jackal.session.json), segment 0,
step 81, shows `You feel sick.` and meal completion. This verifies that exact
history, not a general rule that every 70-turn corpse is mildly rotten.

For an uniced ordinary corpse, `eat.c:eatcorpse` computes
`rotted = (moves - effective_age) / (10 + rn2(20))`, using C integer division,
then adds 2 for cursed or subtracts 2 for blessed corpses. Species exceptions,
petrification, slime, and the separate rotten-food path matter. Ice adjusts
effective age via `peek_at_iced_corpse_age`; storage and decay timers also need
their own source checks. Do not certify freshness from elapsed turns alone.
For a new age-sensitive recipe, record creation/pickup, actual elapsed turns,
BUC state and storage, then stop at the planned visible C observation. An eating
message confirms the reached branch, not an exact hidden age value.

## Evidence discipline

Reuse the technique, choose independent inputs for new probes, and preserve the
input-only recipe, exact C capture, source attribution, and observation steps.
A new setup must pass its own required reproducibility checks before supporting
a delivered case. These saved C witnesses are not current JavaScript parity
claims, and a setup routine is not a batch admission or a general completion
certificate. Do not copy recorded answers into recipes or edit game state.
