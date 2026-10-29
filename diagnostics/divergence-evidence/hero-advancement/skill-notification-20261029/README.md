# Practice-ready skill notification component

JS base `fdaa960271b2eab9d9e2314d413f80258122b577`; C gitlink
`16ff59115315917b93185d026aeefea06db9b0f4`.

802 target states and three explicit controls match executed C/JS. Zero candidate
semantic causes; one scoped component negative. These are predicate/state fixtures,
not 802 independent bugs or naturally reached hero histories.

Complete unchanged C bodies for slots_required, can_advance, give_may_advance_msg
and add_weapon_skill are extracted from weapon.c and compiled with GCC 14.2.0.
The actual pinned skills.h supplies enums, field types and practice formula.
Production JS APIs execute corresponding skill arrays. Comparison observes
before/after eligibility, remaining slots, and the exact confidence message.
The JS message observer reads its normal pending-message field; no game function
is replaced. C You_feel observes the awake-hero formatted message before terminal
rendering. No full screen/cursor or More-prompt behavior is claimed.

The matrix varies quarterstaff, bare-handed combat, healing spell, two-weapon
combat and riding; every rank through the declared maximum; practice threshold
−1/exact/+1; initial slots 0..3; increments 0..2; restricted and advancement-count
limit controls. Other skill entries are noneligible. Target states are conditional
component configurations, not complete initialized role catalogs. Increments 0/2
exercise the API contract, not a claim that ordinary pluslvl grants those amounts.

Numeric controls pin a Basic quarterstaff with one slot: practice 79 plus one
slot produces no notification; practice 80 opens eligibility and produces
`You feel more confident in your skills.`; an already-eligible skill remains quiet.
Source output and JS output match for all rows, including no messages for maxed,
restricted or limit-reached skills.

The one C dependency stub is handle_tip with tips disabled. hack.c returns FALSE
immediately under that explicit flag, with no further state changes. Enabled tips,
terminal wrapping and unaware-hero wording are not covered. No RNG is used.
This narrows the practice-ready notification gap; it does not turn the full-runtime
skill-refund recordings into evidence of natural practice acquisition or timer
integration. No excluded combat, object effect, ring or denied setup is used.

Reproduce from repository root with installed Node/GCC:

```
node diagnostics/divergence-evidence/hero-advancement/skill-notification-20261029/run.mjs control
node diagnostics/divergence-evidence/hero-advancement/skill-notification-20261029/run.mjs target
```

Both expect exit 0. All inputs and C/JS outputs, generated C, function bindings,
compiler diagnostics, binary hashes and actual command receipts are retained.
Compressed streams are hashed as stored. The newly compiled oracle has its own
provenance; it does not establish the preinstalled recorder's build origin.

Confirmed new causes: 0; explained negative: this projection; unresolved mismatches:
0. Duplicate: the prior JS add_weapon_skill regression is acknowledged, not
resubmitted as a newly discovered behavior. Exact natural-practice and enabled-tip
integration remain unqualified. Main owns all gameplay work. No CI dispatch,
scoring, merge or formal approval. Timings are elapsed, not active compute.
