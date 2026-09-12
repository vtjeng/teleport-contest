# Generalization experiment

Status: challenge scoring and dashboard integration are authorized, with
validated changes merged to main in chunks. The main working agent owns game
fixes and GOALS.json. This agent owns challenge generation, scoring, dashboard
integration, and the eventual local-holdout diagnosis and source pointers.
Local-holdout contents remain sealed during this first tooling change.

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

The dashboard has two headline scores: **Development + local holdout**, with
separate development/local breakdowns, and **Challenges**. Combine the fixed
corpora only when their evidence identifies the same full implementation SHA.
Otherwise show the available breakdowns and the missing or older measurement.
Keep the existing historical development chart labeled as development.
There is no remote-holdout score on the dashboard.

Show matched/total screens and fully matching/total sessions. RNG and cursors
remain available as detail. Historical local-holdout rows lack session and
cursor counts; those values stay unknown. The serializer identity stays in
challenge evidence because local serialization differs from the official scorer.

For challenges, show each case's first and latest results with measured commits.
Between consecutive complete evaluations, report added cases/screens separately
from screen gains and losses on unchanged cases. Compare only identical
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

## Monitoring and validation

`scripts/monitor-c-explorers.mjs --runs <run-directory>` serves original
C screens and action histories on loopback port 8766. Use a run directory
under the repository’s `.cache/` for future pilots. `--snapshot <html>` makes
a standalone page that checks for updated hosted snapshots every 30 seconds.
All three pilot agents have completed. Future missions can reuse this monitor.

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
