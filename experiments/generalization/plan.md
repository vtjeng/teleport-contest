# Generalization experiment

Status: challenge scoring and dashboard integration are authorized, with
validated changes merged to main in chunks. The main working agent owns game
fixes and GOALS.json. This agent owns challenge generation, scoring, dashboard
integration, and the eventual local-holdout diagnosis and source pointers.
The user authorized the next phase on 2026-09-12: opening the entire local
holdout, diagnosing its workload and first failures, and handing source pointers
to the main agent. The diagnosis is isolated from ongoing game changes.

## Objectives and sequence

Explain why development progress has transferred poorly to the local holdout,
then use an expanding challenge set to keep finding missing behavior. There is
no separate synthetic holdout. Challenge scores describe the generated workload;
they do not estimate the remote competition's score.

The agreed sequence is to integrate challenge scoring and monitoring, then
open the entire local holdout for diagnosis and continued development. Rewrite
the holdout instructions at that transition, record the exposure boundary,
and leave the files at their current paths. The main agent must be able to
follow source pointers from the diagnosis without conflicting access rules or
a second game-implementation loop. No repair budget has been agreed here.

The user requested this work in one session. The experiment branch isolates
changes until each chunk is tested. The main working agent has acknowledged
that it will merge tested commits at clean goal boundaries and retain ownership
of its checkpoint and score bookkeeping.

## Baseline and prior exposure

The initial planning baseline was `86095e93fb4d0fe3e4b427c58e03ff830b13e8a8`.
Its last recorded evaluation described `2427be4`: development 7,031/7,765
screens and local holdout 328/3,640 screens. These are historical measurements.
Before this plan, a mistaken Git status command exposed local-holdout filenames
during worktree setup. Their contents were not opened; the hypotheses were
therefore not fully blind to labels.

The experiment subsequently synced to main `b5a06b3e` in merge `50047e4e`.
Checkpoint at that merge passed: development 7,097/7,765 screens, 24/33 complete
sessions, and 105/105 regression recordings. The pilot tools then merged to main as `4dc642af`, whose checkpoint passed
with 7,175/7,765 development screens and 106/106 regression recordings.
The scoring work is based on that tested merge. Main has continued advancing.
Pin a new implementation commit when opening the local holdout; do not present
an earlier baseline as a current measurement.

## Opening boundary

The entire corpus was opened at **2026-09-12 23:30:36 UTC**, after pinning
the implementation to `a8890744786a48de9b20926acafa3c16a777dc67`
(main at the start of this phase).
The opening follows the user’s instruction to continue the agreed plan on
2026-09-12. The files stay in place and retain their historical score columns.
[holdout-baseline.json](holdout-baseline.json) records both corpora at that
implementation, file hashes, scorer hashes, per-session counts, and source
pointers. Later main commits are not part of this evidence.

## Hypotheses and inspection

| Hypothesis | Evidence to seek |
| --- | --- |
| Familiar features contain incomplete branches. | Early failures within source functions exercised in development, reproduced with independent inputs. |
| Unfamiliar combinations expose missing behavior. | Character, options, commands, objects, conditions, or action order explain first failures. |
| Early blockers hide downstream progress. | Shared refusals or output-count shifts, and movement to later blockers after repairs. |
| Screen weighting concentrated prior work. | A few trajectories dominate development gains while independently weighted cases remain weak. |
| Length and scoring differences amplify the gap. | Matching prefixes, gameplay turns, input boundaries, and scorer components explain part of the difference. |

Before fixes based on the exposed corpus, record its workload composition and
first failures at the pinned baseline. Group failures by source cause, not
session label. Give the main working agent the C function, JavaScript caller,
first failure, and an independently chosen reproducer where available. C source
and patches define correct behavior. Record explanations that the evidence
rejects as well as those it supports.

## What opening showed

| Baseline measure | Development | Local holdout |
| --- | ---: | ---: |
| Matching screens | 7,355 / 7,765 (94.7%) | 328 / 3,640 (9.0%) |
| Complete sessions | 24 / 33 | 2 / 11 |
| Segments | 45 | 11 |
| Median screens per session | 98 | 87 |
| Largest three sessions' share of screens | 45.1% | 80.8% |
| Sessions configured with debug play | 9 / 33 | 4 / 11 |
| Mean of individual session screen percentages | 98.0% | 32.4% |

The typical holdout session is not longer. Three large sessions dominate its
screen-weighted score: Knight coverage (1,814 screens), the healer game (595),
and wizard hallucination actions (532). The Knight run spans 411 displayed
game turns and ends in the quest Home 5 level; its 1,814 screens include menus,
wishes, and other input boundaries. Development's largest file has 1,953 screens
but contains ten segments with different new characters. All eleven holdout
files have one segment, so cross-segment output shifts do not explain this gap.

Seven of the nine failing holdout games first hit explicit refusals. Another
has a silent prompt mismatch before a later refusal; the healer crashes. These
are incomplete ordinary command branches, caller wiring, and state-dependent
paths, not evidence that a function is complete because a familiar version of
its command already passes. Both corpora contain ordinary play and debug setup;
configuration labels alone do not explain which paths execute.

Screen weighting amplifies the gap, but equal session weighting still leaves
98.0% against 32.4%. This supports the incomplete-branch, unseen-combination,
and early-blocker hypotheses. It rejects longer median sessions and
cross-segment shifts as primary explanations. It does not identify the remote
holdout's distribution or predict its score.

## Source handoff from the baseline

Boundary indices below use the scan's zero-based recorded-step convention.
Each row has the full path, immutable hash, exact metric counts, and additional
C/JavaScript pointers in the baseline artifact. None is a promised screen gain.

| Local-holdout case | First failure | Source work to investigate |
| --- | --- | --- |
| Knight coverage | #jump after 8 captured screens; 8/1,814 match | C apply.c dojump/jump and is_valid_jump_pos; JS cmd.js extended-command fallback. Later quest/level behavior remains behind this first stop. |
| Healer reflection/drummer | Uncaught error on input 47; 0/595 scored | trap_effects.js dart-trap callback → mthrowu.js thitu → attrib.js exercise. The callback omits encumberMessage; C attrib.c:517 calls pickup.c encumber_msg. A separately replayed 46-input prefix matches all 47 screens, but the full scorer discards an errored session's credit. |
| Wizard hallucination actions | Equipped/attached lycanthrope refusal at 109; 109/532 match | C were.c new_were calls mon_break_armor and possibly_unwield; js/mon.js refuses these states. The command being typed is takeoff, but the blocker is monster transformation. |
| Priest extended-command sweep | Chat with a little dog at 29; 29/267 match | C sounds.c dochat → domonnoise (MS_BARK). js/sounds.js stops when a monster occupies the target. |
| Wizard wear/shop | Payment command at 24; 24/127 match | cmd.c rhack → shk.c dopay. JS command admission omits pay. C reports that no shopkeeper is available; this is not evidence that a shop transaction was reached. |
| Wizard polymorph pile | Silent prompt difference at 28; 39/87 match | C invent.c getobj/tty_yn_function and do.c drop with !verbose; JS clears the drop prompt that C retains. RNG and cursor match there. Exact clearing owner remains to be traced; the later water-trap refusal is a separate blocker. |
| Swimmer | Ordinary terrain feedback refusal at 17; 17/73 match | C pickup.c describe_decor, including prior terrain and back_on_ground; js/pickup.js ordinaryDecorPlan refuses the preceding terrain. |
| Ranger quiver/throw/travel | Alternate-weapon quiver selection at 5; 5/27 match | C wield.c doquiver_core alternate-weapon confirmation; JS covers cancel/empty/hands but refuses ordinary inventory items. |
| Tourist eat/throw | Fortune-cookie eating at 5; 5/26 match | C eat.c fpostfx FORTUNE_COOKIE → rumors.c outrumor; js/eat.js refuses the rumor call. |

Orc rogue kick/search (41 screens) and samurai exploration (51 screens) already
match completely. The samurai recording ends on D:1; its filename does not
prove that descent occurred.

The main agent retains game implementation and goal bookkeeping. The combined
mismatch queue now includes both fixed corpora and preserves the `holdout/`
identifier prefix. At this baseline its first candidate is apply.c for jumping;
the healer, lycanthrope, and chat failures follow. Recompute at main's current
commit before selecting a goal. Use these traces to investigate the whole C
function or responsible family, including production callers and independent
reproductions. Do not patch session labels, seeds, or expected output.

## Expanding challenges

Use C source, ordinary play, and eventually the exposed-corpus findings to
choose missions. Vary behavior families, histories (repeat, reverse, interrupt,
revisit, save and resume), relevant character/state conditions, and lengths.
Combine actions across time, such as storing food, changing levels, retrieving
it, and eating it. Include ordinary play and clearly labeled debug setup.

Choose missions before inspecting their JavaScript results. The player adapts
to C observations; the planner checks which behaviors were actually reached.
Retain every valid, reproducible recording even when its mission was missed.
Reject invalid setup or recorder failures using C evidence, record the reason,
and never select cases by whether JavaScript passes. New seeds alone do not
establish diverse coverage. Input boundaries include menus and do not measure
elapsed gameplay turns.

Before a new case's JavaScript failures guide fixes, save its first evaluation
at a committed implementation. Preserve it after the case starts passing.
Recordings are immutable; extend `challenges/manifest.json` with new IDs and
files under `challenges/cases/`. A correction gets a new ID and an explanation;
keep the original measurement history. Intentionally failing challenges remain
outside the passing `recordings/` regression corpus.

## Scoring and dashboard

`SCORE.tsv` remains the aggregate history. Development, local holdout, and
challenges have separate fields. A challenge row links an immutable evaluation
under `challenges/evaluations/` and identifies its exact case-set digest. The
artifact records the implementation SHA, measurement time, scorer digest,
individual results, and totals. The digest covers sorted IDs and recording
hashes; descriptive metadata does not change the measured case set.

The dashboard shows **Development**, **Local holdout**, and **Challenges**
in the same format, each with the age of its measured commit. Challenge
details appear below Work by source file. Three history charts share a time window and minimap, with the corpus labels
retained. There is no remote-holdout score on the dashboard.

Show matched/total screens and fully matching/total sessions. RNG and cursors
remain available as detail. Historical local-holdout rows lack session and
cursor counts; those values stay unknown. The serializer identity stays in
challenge evidence because local serialization differs from the official scorer.

For challenges, show each case's first and latest results; retain exact
measured commits in saved evidence and show commit ages on the score cards.
Between consecutive complete evaluations, retain added cases/screens separately
from screen gains and losses on unchanged cases in the saved evidence. Compare only identical
recordings, denominators, and scorers. A changed scorer makes that comparison
unavailable. A changed case set or implementation makes an older measurement
stale. Missing and failed evaluations remain distinct from measured zeros.
Dashboard builds read evidence and do not launch challenge evaluations.

Commit challenge inputs and game/scorer changes before measuring:

```
node scripts/score-challenges.mjs --output challenges/evaluations/<new-name>.json
node scripts/score-challenges.mjs --record challenges/evaluations/<new-name>.json
```

The first command refuses to overwrite an evaluation. It saves runner failures
as failed attempts with no aggregate counts. The second command appends the
artifact's evidence to SCORE.tsv and rejects duplicate imports. Import in
measurement order. Commit the artifact and row together. During the main
implementation loop, reassess challenges after the goal's implementation
checkpoint; a mismatch is expected evidence for later source work, not a
passing-regression-corpus failure. Ordinary development score commands keep
their existing meanings.

## Pilot evidence and source handoff

Two authorized `gpt-5.6-luna` agents with `xhigh` reasoning played the original
C game. `scripts/explore-c.mjs` re-records each complete input prefix in a private
C installation and retains the recipe, recording, actions, and latest screen.
All three complete parsed recordings matched independent C replays.

| Case | Inputs / boundaries | Observed behavior |
| --- | --- | --- |
| scout | 17 / 18 | Inventory and escape via the D:1 upstairs; missed the intended descent mission. |
| journey | 56 / 57 | D:1 to D:2 and back, inventory and combat; ended at 6/16 HP and game turn 40. |
| containers | 172 / 173 | Debug setup followed by ordinary floor/carried container operations and nested-container transfer; game turn 8. |

The preserved first evaluation at `f47b1c25` measured journey at 57/57 screens
and containers at 152/173. Reassessment at `50047e4e` gave the same results.
Those two evaluations are imported with their original timestamps and SHAs.
Scout was not in those evaluations. The first assessment of all three cases
at `64224b4b` matched 220/248 screens and 1/3 complete sessions. Scout added
11/18 screens; journey and containers were unchanged. The artifact is
`challenges/evaluations/pilot-complete-64224b4b.json`. This admission does not
reclassify previously inspected failures as fresh results.

Journey consumed all input with no recorded unported boundary. Containers
stopped before boundary 153 at inventory `#tip`: the JavaScript inventory path
in `pickup.js` refused the command before `getobj`/`tip_ok`. The C selection
branch is `pickup.c:3624`; its subsequent container-to-container transfer loop
is at C lines 3688–3841, another unported branch in `tipcontainer`. These are
source pointers for the main agent, not completion evidence. No game fix was
made here. Scout first stops before boundary 12 on `<`. C `do.c doup`,
lines 1330–1335, asks for confirmation before leaving ledger 1; the matching
JavaScript branch refuses this path. Its random-number log still matches
2,502/2,502 calls. Later escape/end-game behavior remains unevaluated behind
that first stop. The pilot is too small to establish workload representativeness.

## Challenges chosen after opening

Two missions were chosen from the diagnosis before their JavaScript outcomes
were inspected. Both final recordings match independent C replays exactly and
are admitted regardless of whether JavaScript can reach their later actions.

| Case | Setup | Reached behavior | Screens / game turns |
| --- | --- | --- | ---: |
| knight-jump-return | Ordinary human Knight, seed 76391 | Three #jump commands, a pony blocking early attempts, a later changed-position jump, inventory inspection, doors, and return to the upstairs tile | 87 / 40 |
| food-quiver-history | Tourist, seed 76392; debug wish supplies a boomerang | Read a fortune cookie; cancel, fill, clear and refill the quiver; fire, retrieve and re-quiver the boomerang | 50 / 6 |

Their recipes, immutable recordings and hashes are in the challenge manifest.
The first evaluation of this five-case set is saved as
`challenges/evaluations/opening-missions.json`. The prior three cases retain
all earlier measurements; the two new cases add 137 screens. Use that artifact's
separate additions and unchanged-case deltas when assessing progress.

At `de406486`, the existing three cases remained at 220/248 screens. The
new Knight case matched 7/87 before the unported dojump dispatch; the food case
matched 25/50 before outrumor. Both reproduce source blockers with independently
chosen C play. The five-case total is 252/385 screens and 1/5 complete sessions.
The added cases contribute 32/137 screens; the lower aggregate percentage is
corpus growth, not a regression.

The next mission batches should vary actual behavior and history: conversation
with pets and other monsters, terrain transitions in both directions, ordinary
versus equipped monster transformations, verbose versus quiet prompts, and
short versus sustained play. Mix focused cases with sequences that cross these
families. Record whether the C game actually reached the mission, including
missed targets and valid early endings. These are expanding development
challenges, not a claimed proxy distribution for the remote competition set.

## Second challenge batch

The user authorized this batch on 2026-09-13 UTC, while the main agent
continues implementation. Its isolated worktree combines main `ba5a8b3f`
with the opening branch at `96a38147`; integration commit `6d1b6c9d`
preserves both branches' score events. The four missions below were assigned
before their JavaScript results were inspected. Each uses a private C
installation and a fresh seed and date. The explorers receive no JavaScript
results or fixed-corpus recordings.

| Mission | Character and setup | Intended variation |
| --- | --- | --- |
| pet-conversations | Ordinary human Priest, seed 90173 | Chat before and after pet activity, leave and return, repeat or cancel direction selection, and attempt another creature when naturally reachable. |
| terrain-transitions | Human Wizard, seed 90174; debug setup | Put on and remove levitation equipment, revisit terrain, and compare interactions while airborne and grounded. |
| monster-transformations | Human Wizard, seed 90175; debug setup | Transform a monster, attempt an equipped humanoid state, and interact again after its form changes. |
| sustained-journey | Ordinary dwarven Valkyrie, seed 90176 | Explore across levels, manage inventory and food, revisit an earlier place, and sustain a longer history when survival and the input budget allow. |

The existing explorer limits each run to 250 successful input keys or 15
minutes. Short setup cases and sustained ordinary play serve different
purposes; input count does not establish gameplay length. Actual reached
behaviors, missed targets, valid early endings, and independent replay results
determine the case descriptions. JavaScript success does not determine
admission.

All four final recordings matched independent C replays exactly and were
admitted before JavaScript evaluation. They add **533 screens**, bringing the
manifest to nine cases and 918 screens.

| Case | Screens / final game turn | Reached behavior and limits |
| --- | ---: | --- |
| pet-conversations | 113 / 48 | Hostile jackal growl, pet bark, combat and corpse eating, eating/yip responses, empty target, cancellation, and leaving and returning. No inventory feeding or level transition. |
| terrain-transitions | 137 / 31 | Ring on/off, stair prompts, airborne pool/lava crossings, grounded avoidance, water entry, item dilution, crawl-out and fountain inspection. No descent, grounded lava entry or fountain drinking. |
| monster-transformations | 81 / 2 | Equipped soldier becomes a dragon; armor is destroyed and shield, helmet and boots fall. A subsequent attack provokes fatal retaliation before a second transformation. |
| sustained-journey | 202 / 208 | Ordinary exploration, rotten-food confusion, lamp use, cancellation, searching and combat. Ends alive on D:1; the explorer did not find downstairs and declined the surface exit. |

The soldier setup requested taming, but `dog.c tamedog` rejects human monsters
after pacifying them. Its actual state was peaceful and non-tame. The recipe
explicitly enables the debug `monpolycontrol` option; this configuration was
added during C exploration and is present in both final reproducible runs.

This batch also exposes limits in mission generation. Menu input errors are
valid recorded inputs but do not establish additional behavioral coverage.
The ordinary journey reached the intended duration without reaching another
level. Future missions should use verified command syntax and distinguish
navigation success from time spent searching; source-guided debug level setup
can supply deeper-state cases when ordinary navigation misses its target.

## Monitoring and validation

`scripts/monitor-c-explorers.mjs --runs <run-directory>` serves original
C screens and action histories on loopback port 8766. Use a run directory
under the repository’s `.cache/` for future pilots. `--snapshot <html>` makes
a standalone page that checks for updated hosted snapshots every 30 seconds.
All explorer runs have completed. Future missions can reuse this monitor.

The user approved periodic publication of pilot screens and actions to the
[private Sites monitor](https://teleport-c-explorer-pilot.jocund-rice-0231.chatgpt.site).
Reuse project `appgprj_6aa4ff25659c8191994e6b39f28b7469`; its separate source
checkout is `.cache/generalization-site` in the main worktree, with assets
under `dist/`. Owner-only access and the published page were verified. The monitor was tested in Chromium
at widths 320–1,920 pixels, including expanded history and snapshot refresh.

For scoring changes, test corpus growth, separate gains/regressions, immutable
first results, missing/failed/zero measurements, and ledger consistency. Browser
checks cover the dashboard's unmeasured, measured, stale, and failed states.
Run focused tests before committing and checkpoint on each committed chunk.
Retain source pointers and findings here; do not create a competing goal log.

The machine restart interrupted the first checkpoint of `64224b4b` and
cleared its temporary worktree. The committed cases and first evaluations
were recovered with matching hashes. The replacement experiment worktree is
`.cache/generalization-worktree` in the main checkout. Its repeated checkpoint
passed at `64224b4b`: 7,175/7,765 development screens and 106/106 regression
recordings. Original action histories remain in the published Sites snapshot.

The baseline was measured with the approved official local runner before the
opening-tool commit. Automatic approval review later rejected an optional
repeat using the new no-argument `score-holdout.mjs` CLI, citing the previous
sealed-corpus rule. Its argument handling, aggregation and cleanup were instead
exercised with eleven synthetic fixtures in a disposable repository. The main
loop can retain its goal-scoped scoring command at closure; the saved baseline
and challenge artifacts are sufficient for this handoff.
