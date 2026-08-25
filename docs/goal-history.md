# What the closed goals have carried over

This is analysis for goal selection, read
when choosing work, and it is on no mandatory reading path. The falsified
predictions and measured overstatements recorded here are what
later entries in this file depend on: do not re-derive them.

Twelve goal-closure rows in `SCORE.tsv` carry a holdout figure. Holdout
screens rose by 17, then by 6, then by 21, and the goal that gained 21 is
the one on which a first holdout session passed; after that the pickup,
monster-door and trap goals gained +1, +16 and +8 development screens and
carried nothing. The trap goal's authorized evaluation returned 138 of
3,640 screens, 30,048 of 182,022 random-number values and 1 of 11 sessions,
identical to the three measurements before it.

Three zeros is weaker evidence than it looks. Those three goals were selected
on boundaries blocking 2, 3 and 3 of 33 development sessions. Assume each
holdout session stops on a boundary independently, at the rate that boundary
shows across the 33 development sessions. The chance that none of 11 holdout
sessions stops on a 3-of-33 boundary is then about 0.91^11, near 0.35; across
the three goals the chance of seeing three zeros is roughly 0.06. That
probability is low. The three goals gained +1, +16 and +8 development screens,
so they were plausibly below an 11-session holdout's resolution. Three zeros is
then a statement about effect size. It is not evidence of a broken instrument:
the holdout cannot resolve a goal that small in either direction.

The descent goal tested that reading and contradicted it. Closed on 1
August 2026, it is the largest goal this port has taken: selected on 3,515
screens of `supports` across 8 of 33 sessions, 45% of the 7,765 recorded
development screens, and gated by no role and no prefix. That property
distinguished the two goals whose holdout gain was non-zero. It gained
9 development screens and 5,595 random-number values, and the port now
completes a level transition end to end, with 2,347 of 2,347 descents in
the fresh-seed scan recorded in `scripts/run-leave-level.mjs` reaching a
drawn D:2. The holdout returned 139 of 3,640 screens and 30,048 of 182,022
values: unchanged, digit for digit, from the goal before it. `SCORE.tsv`
records two goal closures between the trap goal and this one. `#ride`
returned 138 of 3,640 screens and 30,048 of 182,022 values, and `eat`
returned 139 of 3,640 screens and the same 30,048 of 182,022 values:
the one screen every evaluation since has repeated.

That is a fourth zero among the goals this file follows, and the size
explanation no longer covers it. The goal's own numbers explain the fourth zero
more simply, and they were available before the holdout ran: 3,515 screens of
`supports` yielded 9 development screens. Every development session that gained
had already been counted, and the 8 sessions the census named still stop. They
now stop on what *follows* a descent, on the step after the boundary the goal
opened.

This finding narrows to `supports`. The instrument measured this behavior
correctly: `supports` ranked it first, and the behavior really was the port's
largest single dependency; the column measures what depends on a boundary,
which is not what porting that boundary earns. Unblocking a boundary moves a
session to the next one. Expect a goal's gain to track the screens between its
boundary and the next stop in the same sessions, which `scripts/scan-sessions.mjs`
reports as `unlocks`, an upper bound. Whoever next selects a goal should treat
a large `supports` as evidence that a behavior is needed. It is not a forecast
of what it will score.

The census cannot count every boundary. It reports the first
fail-closed boundary per development session: the point where the port
ends the segment because the next step needs behavior that is not ported
yet. Within that scope it is accurate. A boundary hidden behind a different
refusal is invisible to it: 20 of 33 sessions stop on an unported hero
command, so everything downstream of a command cannot be counted. Object
squares are the extreme case, the commonest unported destination class
over the 60 freshly generated D:1 levels censused in `GOALS.json` (seeds
7100000-7100059), and the owner of a single census row.

The modeled half of `scripts/scan-sessions.mjs` closes that gap. It reads
each session's whole recorded input, so an owner standing behind a command
is counted where the first-boundary census could not see it. It reports
`supports`, the screens that depend on each owner, and `unlocks`, the
screens porting it next earns. `.agents/selection.md` states how to run it.

Three closed goals have now measured how far `unlocks` overstates: the
trap goal predicted 46 and delivered 8, `#ride` predicted 82 and delivered
17, and `eat`'s first slice predicted 78 for `seed0900` and delivered 3.
The bound held above the delivered figure in all three measurements,
overstating by 5.8, 4.8 and 26 times. The largest of the three ratios came
from `eat`'s first slice, because a session whose whole visible debt is one
command has had the least opportunity to reveal what else it needs.
`.agents/selection.md` therefore ranks candidates by the look-ahead forecast that
starts from `unlocks` and caps each stopped session's
stretch, and lists the six mechanisms that break the bound. `supports`
stays in the `scripts/scan-sessions.mjs` report as context. Do not re-derive
these three ratios.

This file has recorded two predictions and then falsified both. The pickup
goal was chosen on "fires without a player command" and gained +1
development screen and +0 holdout screens. The trap goal stated that
`seed1500`'s dart is a miss and that closing the miss path would unblock
that session; it did not, because `seed1500` stops earlier, on `simple
monster action requires pet cursed-object feedback`, with its
random-number prefix unchanged by the slice. Both goals treated a property
that is necessary for the session to move as sufficient.

Neither error was the instrument's. `scripts/scan-sessions.mjs` reports the
fail-closed boundary each session reaches first, which is what it claims
to report, and `.agents/selection.md` already states that the steps behind
a boundary are an upper bound, that "sessions blocked on one owner
routinely block again on another", and that the only sound measurement is
to apply the candidate change and re-run the scan. The trap goal's trap
types were read from the sessions' recorded top lines. `AGENTS.md` forbids
that move for implementation, and it is no more reliable for selection.
The scan was not the source for those types, and nothing re-ran it against
the candidate before the slice was promised. Do not replace an instrument
for a failure its own documentation already warns about; use it as
written.

The pet-inventory goal was the test of a different selection method, and
it returned the fifth of those zeros. Closed on 1 August 2026, it was
chosen against the population the holdout samples. Earlier goals had been
chosen by `supports`; this one was chosen by that sampled population: over 600
fresh seeds walking 96 keystrokes on D:1, one of three starting-pet
boundaries was the port's first stop in 51 to 53% of walks. The three are
pet inventory, pet ranged targeting and pet combat evaluation, and pet
inventory was the only one that could be closed. It gained 24 development
screens, from 496 of 7,765 to 520 of 7,765, and 722 random-number values.
The holdout returned 139 of 3,640 screens, 30,048 of 182,022 values and 1
of 11 sessions: identical, digit for digit, to the descent goal's result
and to the `eat` goal's result before it. The two goal closures before
those returned 138 of 3,640 screens.

The goal recorded its prediction before the measurement, and the
measurement answered it: a boundary family standing in front of half of
the censused fresh D:1 walks still failed to move an 11-session holdout,
so the fresh-population census is no better than `supports`, the column it
replaced. `.agents/selection.md` admits a fresh census only to nominate a
candidate; do not promote it there to a ranking rule, and do not treat a
large fresh-population incidence as a forecast of holdout gain any more
than a large `supports`.

The generalization-failure protocol in `.agents/scoring.md` is not
triggered. It runs only where a review confirms behavior special-cased to
a recorded session or hardcoded, and this goal ported whole C functions:
`relobj()`, `mdrop_obj()`, `extract_from_minvent()`, `flooreffects()`, and
`stackobj()`. Each was validated against seeds recorded fresh for the
purpose. Nothing here was fitted to a development session.

Five zeros support one account of the holdout: its counts move only
where the port gains behavior it cannot yet perform at all. Where a goal
improved behavior the port already performs, the counts held. If four
of the eleven holdout sessions all stopped at a single boundary, the
aggregate would not shift by one screen until that boundary opened. The
next selection should ask which boundary, if any, stands in front of many
sessions at once that resemble the eleven hidden holdout sessions. No
instrument in this repository reports that directly.

`apply-tool-command` closed on 6 August 2026 and is the sixth zero. It ported
`apply.c doapply()`'s entry with its stethoscope and lock-pick arms, forecast
26 steps, and delivered 25 development screens and 104 random-number values,
taking `seed0077-rogue-chargen` to 33 of 33 and the port to two fully matched
development sessions. The holdout returned 195 of 3,640 screens and 32,614 of
182,022 values, identical digit for digit to the evaluation before it. The
boundary stopped 2 of 33 development sessions, and each was gated on a starting
pack (the Healer's stethoscope, the Rogue's lock pick), so it sits behind a
role as well as behind a command.

The question the paragraph above leaves open is now settled, and not by a new
instrument. The user decided on 6 August 2026 that ranking stays on the
development look-ahead forecast and that the holdout's job is to catch a
large inadvertent regression. `.agents/selection.md`, "Ranking the
behavior table", states that rule; this file keeps the measurements behind it.
Six zeros remain consistent with the effect-size reading given above: this
goal's 25 screens are 0.3% of the recorded development total.

`options` closed on 7 August 2026 and is the seventh zero, and it is the one
that tests the account above rather than confirming it. That account reads the
zeros as effect size: "the counts move only where the port gains behavior it
cannot yet perform at all." This goal did gain such a behavior. Before it the
port could not display an options menu at all; after it, `O` builds seven
pages, applies eight boolean picks, and runs a class menu through
`choose_classes_menu()`, with two new ported files and 395 new random-number
calls. It delivered 29 development screens against a forecast of 30, the
largest single-goal gain since the descent goal. The holdout returned 195 of
3,640 screens and 32,614 of 182,022 values, identical digit for digit to the
four evaluations before it.

So a wholly new capability is not sufficient either. What distinguishes
`options` is that it is reached only by typing `O`, and exactly one of the
thirty-three development sessions does. The boundary was ranked on that one
session's stretch, which is what `.agents/selection.md` prescribes and what the
user reaffirmed on 6 August 2026. The runner-up that day, pet melee combat,
was the first stop in 102 of 600 fresh D:1 walks; the selector proposed
admitting that census as a tiebreak and the proposal was declined, on the
ground that the fresh census predicts breadth across unseen play, which is the
holdout's job rather than the ranking's.

That decision stands and this entry is not an argument against it. It records
the price: ranking on development look-ahead selects boundaries the recorded
players happened to reach, and a boundary reached by one rare keystroke cannot
move an eleven-session holdout however much behavior it adds. Seven zeros now
say that about effect size, capability, and reachability in turn.

`twoweapon-command` closed on 7 August 2026 and is the eighth zero. It met its
forecast exactly (25 steps predicted, 25 delivered, `seed0107` from 15 to 40
of 98 screens), and the holdout returned 195 of 3,640 screens and 32,614 of
182,022 values, identical to the four evaluations before it.

This one adds nothing to the account and that is the point. `options` tested
capability and found it insufficient; this goal is smaller, gated on a single
extended command that one of thirty-three development sessions issues, and the
zero it returns is what the reachability reading already predicted. Recorded so
nobody re-derives it.

What the goal is worth is not in the holdout column. Its second slice earned no
development screens at all, by construction: every one of `can_twoweapon()`'s
refusal arms needs a role the contributing session does not have. It was worth
running because the goal's boundary named those arms, and closing on the
forecast alone would have filed the goal complete with a documented gap inside
its own scope. The evidence that they are correct is fourteen fresh C segments
across seven roles (42,032 random-number calls and 243 screens), which no
score column records.

`chat-command` closed on 7 August 2026 and is the ninth zero. It met its
forecast exactly (21 steps predicted, 21 delivered), and the holdout returned
195 of 3,640 screens and 32,614 of 182,022 values for the fifth evaluation
running.

This zero is better evidence than the eight before it. Each of those left its
contributing session unfinished, so a reader could argue the holdout saw only
a fragment of the capability. This one took
`seed0105-valk-chat-lamp-ration` from 9 of 30 screens to 30 of 30, the first
time a goal has carried a development session from partial to complete, and
raised the fully matching count from 2 to 3. A whole session finished end to
end, and the eleven hidden sessions moved by nothing. Reachability is the
reading that survives.

The goal also closed one screen short of its own written boundary, which is
worth recording because the fault was in the writing. The boundary opened with
"every path returning before `price_quote()` at :1288 and `domonnoise()` at
:1302 and :1408" and then enumerated the arms it meant; the general clause
admits four arms the enumeration omits. An audit of all 17 returns above :1408
found every other arm ported and those four refused as one. They were deferred
to the `domonnoise()` work as `chat-no-answer-arms-refused-as-one`, on the
grounds that they move no development session, one of them cannot fire until
`dogmove.c dog_eat()` lands, and the three that can need the same naming
helpers `domonnoise()` needs. A boundary that states a rule and then enumerates
cases invites the two to disagree; enumerate or state the rule, not both.

`commands-deferral-sweep-2` closed on 7 August 2026. It forecast 0 steps and
delivered 0, and the holdout returned the same 195 of 3,640 screens for the
sixth evaluation running.

This is the first close where the holdout guarded something rather than
confirming a zero. The sweep merged `hack.c end_running()` and `nomul()` from
two disagreeing ports into one and rerouted `js/detect.js` through the survivor,
touching five `js/` files while claiming no observable change. Development
matched session by session and the holdout did not move, which is the pair of
results a behavior-preserving merge should produce. A sweep that moved either
number would have meant something other than cleanup happened.

The reading was worth more than the closing, as the rule predicts, but not in
the way the rule frames it. Two of the ten records were substantively wrong and
a third was wrong in a checkable detail. `pick-lock-d-broken-arm-dormant` was
wrong on both halves: `rnddoor()`'s table does reach a real doormask, and
`dat/tut-1.lua:273` takes it in 11 of 60 tutorial levels. The same mistake
had been copied into a `js/hack.js` comment. `the two-meal segment never reaches
its second meal` asserted that dropping a line leaves the suite green; deleting
`js/eat.js:1225` turns one test red, a test written after the entry. Only two
entries closed, and eight survive against named blockers.

A deferral record is a claim written once and read many times, and nothing
re-derives it between those readings. That is the same shape as the fifteen
false absence claims of the preceding four days: cheap to assert, expensive to
falsify, and inherited rather than checked. Sweeps are where the bill arrives.

`hero-combat` closed on 8 August 2026 and is the eleventh zero. It forecast 49
steps and delivered 25, and the holdout returned 195 of 3,640 screens for the
seventh evaluation running.

This is the goal that should have moved it. The ten zeros before it were extended
commands and cleanup (`#chat`, `#twoweapon`, an options sweep), and each could
be dismissed as too rare for eleven hidden sessions to contain. Hero melee combat
is not rare. It is the loop the game is built around, and porting it took the
development set from 1,102 to 1,127 screens across three sessions. Eleven hidden
sessions moved by nothing at all.

The reason is visible in the figure itself. The holdout is at 5.4 per cent of
its screens, so whatever stops those sessions is upstream of everything this goal
touched; they do not reach a fight. Ten zeros made reachability the surviving
reading. This one makes it the only reading, and it says the hidden sessions are
blocked early by something the development set does not exercise. Finding what
that is would be worth more than the next several boundary ports, and nothing in
the current selection rule can point at it, because the rule ranks on development
look-ahead and the development sessions do not stop there.

The forecast miss is the other lesson, and the record predicted it. The goal was
selected at 49 capped steps over three sessions, of which `seed0006` carried 32.
It delivered 8. Its remaining 24 sit behind the Options and "Autopickup what?"
menu, which is exactly the block the selector's own classifier had flagged as its
lowest-confidence reading, saying the redraws were "verified at code level but not
screen by screen". The selector then argued the margin survived discounting that
session, and it did: `hero-combat` still ranked first on 25 against a runner-up
at 31 raw, and the two other witnesses delivered their forecasts exactly. So the
ranking was right and the number was wrong, and it was wrong in the one place the
selector had already said to distrust. A flagged low-confidence block should be
discounted in the figure rather than only in the argument.

Three formal correctness passes ran inside this goal, at `e8e6ccb`, `561f6f1` and
`e489fe6`, confirming 34 findings between them. Eighteen were tests. The third
pass found why: the refusal tests asserted a refusal's message and nothing else,
so a refusal that fires after the state changes it was meant to prevent still
passed, and so did a refusal wider than the C condition it stood for. Two of the
first and three of the second reached formal review in a port whose defining
property is being fail-closed. The sharpest instance was `xkilled()`'s pit arm,
which refused every kill of a pit-trapped monster where C acts only when a boulder
is present: wrong, unreachable today, and held in place by a test that pinned the
wrong behavior. Refusal tests now assert position (no draw and no state change
before the stop) rather than text.

`enhance-command` closed on 8 August 2026 and is the twelfth zero. It forecast
34 and delivered 35, and the holdout returned 195 of 3,640 screens for the
eighth evaluation running.

It is the first goal to beat its forecast, and it did so because the forecast
was deliberately pessimistic. The selector ranked it on 34 against a raw 35,
discounting step 51 as the one step whose screen it could not verify against a
live replay. That step matched. The instruction that produced the discount came
from `hero-combat`, which had lost 24 steps by flagging a low-confidence block
in its argument and leaving it at full value in its number. Discounting in the
number cost one step of forecast here and would have cost nothing had the
selector been right; leaving it undiscounted cost 24 there. The asymmetry
favours the discount.

The same discipline collapsed two much larger figures in the same census. The
level-teleport menu path fell from 195 raw to 4 and engraving from 238 to 6,
both verified screen by screen rather than modelled. A ranking that had taken
those raw figures at face value would have selected either of them over a goal
worth eight times more.

On the holdout there is nothing new to say and that is itself the point. The
eleventh zero, `hero-combat`, established the reading: the hidden sessions stop
at 5.4 per cent of their screens, upstream of everything these goals touch, so
they never reach the behavior being ported. `#enhance` is a menu the hidden
sessions have no more chance of reaching than a fight. Until something finds
what blocks them, further boundary ports selected on development look-ahead
should be expected to return this same figure, and that expectation is now
strong enough that a result other than 195 would be the thing needing
explanation.

`trap-activation` closed on 8 August 2026 and is the thirteenth zero. It
forecast 24 steps and delivered 24, and the holdout returned 195 of 3,640
screens for the ninth evaluation running. `seed0015-valk-level2-pit-dog-wait`
now matches completely, the fourth development session to do so.

The goal's own arithmetic is unremarkable: the second consecutive forecast to
land exactly, after the discount-in-the-number rule came in. What it produced
instead is the clearest evidence yet for why the port refuses the way it does.

The pit arm's first score run returned **0 of 44 screens for `seed0015`, worse
than the 28 it already had**. `KEEPTRAITS()` answers TRUE for every tame
monster, so the dead dog's corpse carried the monster itself into
`mkcorpstat()`, which raised a plain `Error` rather than a named refusal. The
scorer treats a bare `Error` as a hard failure and discards the segment's whole
matching prefix, so porting the behavior correctly made the session score less
than not porting it at all. Closing the slice required `mkobj.c save_mtraits()`
and `mon.c copy_mextra()` on top of the arm itself.

That is the failure mode `dosounds-refusal-escapes-as-hard-failure` has been
describing in the abstract since 5 August, and it has now been measured: the
cost of a bare `Error` is not the branch it stops, it is every matching screen
before it. A named refusal in the same position would have cost 16 screens and
left 28; the bare one cost all 44. Any port that raises a plain `Error` is
carrying that liability wherever it sits, and the census tooling has been
working around this particular one with a loader shim for four goals.

On the holdout there is nothing to add. Trap activation is ordinary early-game
behavior on dungeon level one (a hero stepping into a bear trap, a pet falling
into a pit), and it moved the hidden set by nothing, exactly as the eleventh
zero predicted for anything reached after the 5.4 per cent mark.

`armor-takeoff` closed on 8 August 2026 and is the fourteenth zero. It forecast
18 steps and delivered 17, and the holdout returned 195 of 3,640 screens for the
tenth evaluation running.

The step that went missing is worth naming, because it is the ordinary kind of
miss rather than the systematic kind. `seed0367` was forecast 11 and delivered
10: its step 61 stops on a fleeing monster's teleport at `monmove.c:745`, an
unported branch nothing in the goal touched. No monster-scan refusal fired a
turn early anywhere in the three stretches, which is what the goal record
predicted after the previous census measured that failure at 2.7 times its read
value.

What this goal is really evidence for is the review cadence rather than the
score. Its correctness pass produced a confirmed finding in **both** refusal
directions on the same range, which no earlier pass had. `heldStepIgnoresDestination()`
was narrower than C (it skipped `preflight_dotrap()` entirely, the silent-admission
direction `AGENTS.md` forbids), and `mintrap()`'s tail was wider than C. The
first of those was written by the *previous* pass's audit fix, making this the
second consecutive pass to find a defect in the last one's work. That is the
argument for the frontier stopping short of audit-fix commits, and it is now
made twice by evidence rather than by principle.

The wider refusal is the more instructive half. It was invisible to the
development set entirely: all 33 sessions scored identically before and after
narrowing it. Finding its cost took scanning 6,600 fresh segments for a monster
that survives a pit (five exist) and recording two. Those two went from 3 of
41 screens to 41 of 41, and from 6 of 8 to 8 of 8. A defect worth 38 screens on
a fresh case can sit at zero on the development set indefinitely, which is the
sharpest available argument that the development score is a floor and not a
measure.

On the holdout there is nothing new. Taking armor off is as ordinary as
behavior gets, and the hidden sessions moved by nothing, exactly as the eleventh
zero established for anything reached beyond their 5.4 per cent.

`objects-deferral-sweep` closed on 8 August 2026, the third sweep. It forecast 0
and delivered 0, and the holdout returned 195 of 3,640 screens for the eleventh
evaluation running. The area went from ten open non-scope entries to five.

Both sweeps so far have found roughly a third of their records wrong, and this
one identified why in a way the first did not. Two of the ten described defects
that had **already been fixed and never closed**: `artifact_light`'s five
copies converged in `4d2a9cb` and the merged-gold weight in `9914fd3`, ten hours
after its own entry was filed; a third named a blocker that had since been
cleared, `armoroff()` waiting on a `nomul()` that `daae919` gave one port.

A deferral record is a claim frozen at the moment it was written, read later
against a tree that has moved. Nothing re-derives it in between. That is the same
shape as the nineteen false absence claims and the twelve duplicate ports: cheap
to assert, expensive to falsify, and inherited rather than checked. The sweep is
the only mechanism that re-reads them, which is an argument for running one when
the gate names an area rather than treating the gate as an interruption.

The orchestrator made the same mistake in this goal's own opening commit,
`8f14eca`, which asserts that the `hero-combat` slice was told to converge the
`artifact_light` copies and did not. It did. The claim came from the deferral
record rather than from the tree, and it is wrong in a commit message that
cannot be amended. It is corrected in the goal's `detail` and here.

One finding has no precedent in this project: the C reference **segfaults** on a
mixed-case wish. `wishymatch()`'s case-folding entry closed on that evidence:
23 of 25 boundaries crash on "Helmet", and "Gloves" does too, while lower case
passes end to end at 2,314 of 2,314 draws. There is no C behavior to match, so
the fold stays, with the recording kept beside it.

`drop-command` closed on 8 August 2026. It forecast 25 steps and delivered 25,
and **the holdout moved for the first time in fifteen goals**: 195 to 207
screens, 32,614 to 32,682 random-number values, 5.4 to 5.7 per cent.

**Correction, measured the same day.** The paragraphs this replaces argued that
the movement was very unlikely to be the drop command and most likely the
two-line `dosounds` fix, on the reasoning that a named refusal class can only add
matched output. The user authorized one attribution run at `74c622c`, the commit
after the `dosounds` slice and before drop. It returns **195 of 3,640 screens and
32,614 of 182,022 values**: exactly the fifteen-goal figure. The `dosounds` fix
moved the holdout by nothing. The twelve screens came from `dodrop()`.

The argument was clean and wrong. "A named class can only add output" is true and
was never the question; whether any hidden session actually reached that throw
was, and none did. Reasoning about which of two changes caused an effect, when
one measurement separates them, is a thing to measure rather than argue. This is
the same lesson the census reads taught five times over, applied here to a
holdout figure instead of a step count.

What the measurement actually says is more interesting than what the argument
claimed. A boundary port moved the holdout, which no boundary port had done in
fifteen goals. So the reading established at `hero-combat` (that the hidden
sessions stop upstream of everything being ported and never reach it) is at
best incomplete. They reached `drop`. Whatever the 5.4 per cent represents, it is
not a wall that ported behavior cannot touch.

The bare-`Error` class keeps its measured costs and loses the speculative one:
`seed0015`'s 44 screens in `trap-activation`, and five consecutive censuses whose
instrument it broke until this slice. `js/` holds 316 such sites, and
`UnsupportedSearchError` escapes the turn-loop seam with a *named* class, recorded
as `search-refusal-escapes-from-the-turn-loop`. Those are worth fixing on their
own evidence, without the twelve holdout screens that turned out not to belong to
them.

`reachable-refusal-escapes` closed on 9 August 2026. It was directed by the user
rather than ranked, forecast no steps and delivered none, and the holdout held at
207 of 3,640.

It was opened to convert refusals that escape `runSegment()` and discard a
segment's earned prefix. Almost none of it turned out to be conversion work.

Of the six sites it examined, **one was reachable and also wrong**:
`dungeon.c surface()` answered `'floor'` for the hero's arrival square where C
answers `'stairs'`, because `On_stairs()` reads the stairway list rather than
the terrain, so every blind `:` on turn one mismatched. Converting it, which was
the plan, would have left that. **One was an env assertion**, not a refusal of
unported C: converting it would have declared `makemon()` unported when it was
merely unwired. **Four were unreachable**, and carry derivations rather than
refusal classes nothing can raise.

The premise for the first slice was three facts, each verified: the class sits in
the command-seam list, it is absent from the turn-loop list, and the caller
runs outside a converting `try`. All three were true and the conclusion drawn
from them was false, because nothing raises the class: C gates every refused
branch behind `!aflag`. Sixty fresh Ranger cases over twelve seeds produced zero
escapes.

That is the same error three times in one day, in three different registers: a
holdout movement attributed by argument rather than the one measurement that
separated two commits; a deferral record read as current when the tree had moved
under it; and here, a mechanism verified and a consequence assumed. Checking that
a mechanism exists is not checking that anything reaches it, and this project's
instruments (fresh recordings, seed scans, per-session diffs) exist precisely
to close that gap. The rule that keeps earning its place is the narrow one:
**measure the thing you are about to claim, not the thing next to it.**

What the goal produced instead of conversions were a C function ported and
corrected, a hook wired, four derivations, a new fresh matrix for
`allmain.c:342-344` which had none, and the first test in the repository that
pins a refusal *class* rather than its message.

## A capping read must resolve each message to the C function that writes it

`bear-trap-capture` forecast 137 development screens and delivered 18. The two
small slices met their forecasts to the screen (12 for the catch, 5 for the
trapped turns), and the slice carrying 120 of the 137 delivered 1.

The port is not at fault. `do.c heal_legs()` is correct: `seed0004-feeding-pony`
step 51 matches, with C's `Your leg feels better.  Your movements are now
unencumbered.`, Dexterity back from 8 to 9 and `Burdened` gone from the status
row. The session then stops one step later, at step 52, where C draws `The
kobold misses!`, a monster attack on the hero, owned by `mhitu.c mattacku()`,
which was already refusing before the goal opened and which no owner of the goal
names.

The capping read is what failed, and the way it failed is repeatable. It
classified steps 52-53 as "hero melee". Step 53, `You kill the kobold!`, is the
hero's; step 52 is the kobold's. Both look like melee in a message stream, and
nothing short of resolving each recorded line to the C function that writes it
separates them. The honest cap was step 51, which makes the goal worth 18 rather
than 137, close to what it delivered.

This is the second recorded instance. The `pray-command` close missed by six for
the same reason: its forecast read `seed0017`'s remaining twenty steps as all
reachable, and six of them needed `options.c optfn_pickup_types()` rather than
anything in `pray.c`. Appendix A of `.agents/selection.md` already says to cap at
the first message implying an unported behavior; what both misses show is that
**a message implies its writer, and the writer is not always the actor the
message names.** A line about a monster may be written by the hero's code and a
line about the hero by the monster's. Resolve the owner before counting the step.

The rest of the goal was sound, and its cost was not the forecast. Three slices
lifted four fail-closed refusals and deleted an injection; the correctness pass
over them confirmed thirteen findings, including a state leak in the planning
clone that nine earlier defects of the same shape had only ever surfaced by
symptom.

## Holdout carry-over does not track the development look-ahead, and that is settled

Five goals have closed with a holdout run. Three were boundary ports:

| goal | development screens | holdout screens |
| --- | --- | --- |
| `pickup-command` | +26 | +16 |
| `force-fight-command` | +40 | 0 |
| `wish-name-resolution` | +69, its forecast exactly | 0 |

The two deferred-area sweeps between them forecast zero and delivered zero,
which is what a sweep should do.

The loop spent three goals building an explanation for the gap. The first was
that ordinariness in play, not the size of the boundary, decides carry-over:
`,` is something a player presses constantly and `F` is not. The
`wish-name-resolution` selection tested that against the corpus and found
wishing ordinary *here*: 34 wishes across 7 of the 33 development sessions, 9
of 33 in `playmode:debug`. It recorded its own caveat that "ordinary in this
corpus" and "ordinary in the holdout" are different populations it could not
check, and the holdout then answered that they differ.

A better-fitting explanation, offered late and never tested: a prefix-matching
score only gains at the frontier, so anything past a session's earliest stop is
invisible regardless of how ordinary it is. The holdout is at 6.1 per cent of
its screens against development's 17.6, so its sessions stop far earlier. `,`
arrives in the first few dozen turns; `F` and wishes do not. On that reading the
capped look-ahead measures the right quantity (where sessions first stop)
over a population that has drifted ahead of the holdout's.

**The user decided to finish the development set first and use the holdout as
a regression test.** So the capped development look-ahead stays the primary
ranking rule, and `.agents/scoring.md` already says what the holdout is for:
it guards against a large inadvertent regression, and a goal that does not
move it is ordinary. Do not re-derive the calibration above, do not re-rank
candidates on expected carry-over, and do not read a flat holdout as a defect.
The figures are recorded here so the question is not reopened by someone
noticing the pattern afresh.
