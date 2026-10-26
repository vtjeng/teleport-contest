# Source-audit triage at `d5b4ccf871320b8a292636b7acfd4fcad0e74c8d`

The scan emitted 12,622 entries. These are source leads, not defects. The
companion `source-audit-20261026.json` records five exact evidence-keyed review
decisions for reuse with `source-audit.mjs classify`. The broader explanations
below are source-identity notes for related warnings; they do not classify every
edge from an owner. Recheck on a changed source or compiler configuration.

Two focused failing tests were prepared from this scan without a new C gameplay
recording: `src/mon.c:monkilled` pet-golem farewell and
`src/engrave.c:doengrave` cancelled-wand dust. Both use C-source-derived
expectations, a supported initialized JS API setup and nearby controls. Their
source commits are `325dd70469f91f4feedc42dadaccbd859016d8a3` and
`ee16ba2d55e473c23a3b8622e38518fb07d6fa71`; a later correction updates
an obsolete throw-expectation test. The combined validated Main SHA is
`f719ff20d6818b452afddea028c84e3aa4e01e85`.

Explained negatives and covered paths:

- `src/sit.c:dosit` ice feedback is in `js/sit.js:955`; literal extraction
  missed the JS construction.
- `src/engrave.c:doengrave -> resists_blnd` is already handled in
  `js/engrave.js:1116`.
- `src/trap.c:water_damage` is split into `js/trap_water_damage.js`, not
  omitted because it is absent from `js/trap.js`.
- `src/pickup.c:query_objlist`'s self-pickup text requires a fake hero object
  in the queried object list; this is not a supported inventory/floor case.
- `src/mon.c:lifesaved_monster` constructs the cited text by interpolation in
  JS rather than a single source literal.
- `src/mhitu.c:gazemu`'s sleepy-gaze lead is under the excluded pinned
  `PM_BEHOLDER` compile condition.
- `src/mcastu.c:castmu`'s `AT_MAGC/AD_FIRE` message has no matching monster in
  the pinned catalog.
- `src/spell.c` Ctrl-A repeat had a strict C/JS Priest control match: 2,119
  RNG entries and 11 screens/cursors.
- `src/lock.c:doopen_indir -> pick_lock` is implemented in `js/lock.js:1230`.
- `src/dig.c:zap_dig -> expels` is implemented in `js/dig.js:1959`.
- `src/steal.c:remove_worn_item` already calls the relevant off callbacks in
  `js/steal.js:395`.

A third focused red test, `scripts/dbridge-visible-hero-portcullis.test.mjs`,
uses `create_drawbridge`/`close_drawbridge` and an empty-bridge control. It
covers `src/dbridge.c:do_entity`'s visible-hero messages, which were already a
source-audit backlog lead. It is C-source-derived, not a fresh C execution
witness. Other open source leads need reachability and state-contract review;
for example `src/allmain.c -> wizard.c:intervene` is not test-ready.

Timestamps are wall-clock observations, not active effort: audit output at
20:17:16 UTC; golem focused-test file at 20:31:50, wand at 20:35:50, and
scratch drawbridge test at 20:52:48. Lead-selection start times were not
recorded, so no lead-to-handoff duration is asserted. The first combined
Checkpoint failed one stale throw-expectation test, then passed on the
corrected SHA; retain that rework evidence instead of counting it as another
repair.

Later focused follow-up: `src/vault.c:gd_move`'s visible guard picking up
pre-existing gold at its new corridor square was test-ready at 21:26 UTC.
`scripts/vault-guard-newspot-gold.test.mjs` constructs a coherent initialized
vault-room/escort state. The no-gold control passes; the gold case originally
threw `ReferenceError: gdEnv is not defined`. The focused fix passes both
cases and affected escort tests. This is C-source-derived evidence, not an
executed C recording; publication remains subject to the usual combined gates.

Shopkeeper throw-site follow-up: `src/shk.c:shk_move:4903-4931` handles a
following shopkeeper beside the hero. `scripts/shk-move.test.mjs` replaced an
obsolete throw expectation with valid shopkeeper/customer state and three
source-derived cases: a different customer ends pursuit, a current customer
stays adjacent before the reminder deadline, and a later reminder updates
`gf.followmsg` with exactly one `rn2(9)` draw. The wrong-customer and
same-customer cases were red on the unsupported boundary before the fix.
Adjacent non-following movement remains a passing control. No new C recording
was made; full checkpoint and publication gates remain required.

Drawbridge follow-up: `src/dbridge.c:do_entity:743-753` gives a visible
monster a drink-and-disappear line under Hallucination when it jumps from a
closing portcullis into the moat. `scripts/dbridge-hallu-fall.test.mjs` uses
an initialized drawbridge and mobile gnome; the ordinary fall line and local
miss/jump rolls are controls. The hallucinated line was red on Main before
the narrow message fix. Its expected text is source-derived, without a new C
recording, and still requires the normal hosted gates.

Two tempting gaps remain unqualified: `steed.c:mount_steed`'s petrification
call cannot be reached with an ordinarily saddled cockatrice because
`can_saddle` excludes its class; polymorph of an already saddled mount was
not established. `do.c:dodown` records `goto_hell` as unported, but a fresh
Castle trapdoor recording with `#wizmap` then `>` matched JS exactly across
25,853 RNG calls and 60 screens/cursors, with both reaching the Valley.
Neither source warning alone justifies a repair.
