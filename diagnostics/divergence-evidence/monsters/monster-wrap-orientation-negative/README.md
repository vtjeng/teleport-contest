# Monster wrap orientation: bounded negative

Manual/unbound case `monster-wrap-orientation-negative`, monsters shard.
Outcome: **explained negative for the missing monster-pair drowning hypothesis**.
No scanner suppression or broad wrapping/combat equivalence claim.

C `mhitm_ad_wrap` (src/uhitm.c:3337–3426) puts drowning in the hero-attacker and
hero-defender branches. Its final branch, where neither participant is the hero,
only clears damage for a cancelled attacker and optionally prints a brush
message. It neither tests water nor creates a hold nor invokes drowning. JS
implements the same split. Absence of monster-pair drowning is not a port omission.
This conclusion comes from the complete C function's branch structure, not from
an arbitrary monster standing in water or a matching seed.

The focused test selects the shipped python's 1d4 AD_WRAP attack and invokes the
production `mhitm_adtyping` dispatcher against a non-hero jackal. At the effect
boundary a valid maximum roll of 4 stays 4 for the ordinary attacker and becomes
0 for the cancelled attacker. Neither call changes the hero's stuck pointer or
marks the damage record done. Damage forwarding is checked, not final HP loss.
Cancellation is an explicit API input; no public-play cancellation sequence or
complete monster turn is claimed. This is not testing an undocumented default
adapter: required message and unsupported callbacks are explicitly supplied.

The C oracle compiles the exact final `/* mhitm */` arm extracted at runtime from
the pinned upstream source. It stubs names, visibility and message output, and
compares the damage result only. It does **not** compile the entire C function,
run a native C game, or establish naming/visibility parity. Source assertions
retain the two preceding hero identities and confirm that the two water checks
are outside the extracted branch. Hero-facing behavior remains outside this proof;
existing `scripts/uhitm.test.mjs` has separate slippery/planned-drowning tests.

From the recorded base with the C submodule initialized, run:

```
node diagnostics/divergence-evidence/monsters/monster-wrap-orientation-negative/proof.mjs
node --test scripts/test-suites.test.mjs
```

Requires Node and a C99 compiler named `cc`. It writes and removes one temporary
compiler directory; no network, private fixture or recorder dependency. Both
focused cases and six suite guard checks pass. The ordinary `.mjs` runner stays
outside default CI. `record.json` pins sources, tools, times and exact scope.

Initial scaffold calls omitted the dispatcher's required `unsupported` callback
and failed before dispatch; those are setup failures, not gameplay evidence. A
catalog inspection used the wrong export name and was corrected by reading the
native table. Neither failed attempt counts toward the negative proof.

No gameplay files changed. No excluded scenario or denied-turn artifact used.
The ten unqualified message-map sites and four earlier unresolved hypotheses are
unchanged. No new full-corpus equivalence or remaining-lead inventory is asserted.
