# Generalization experiment

Status: proposed. Full execution and merging to main await agreement on this
plan. The user separately authorized a C-playing agent pilot and monitoring
dashboard before opening the local holdout. That pilot has run on the isolated
branch. Local-holdout contents have not been inspected; no new holdout or
challenge evaluation has run, and no game behavior has changed.

## Proposed scope

The proposed sequence is one session of work: record a learning plan, open
the entire existing local holdout and improve the port against it, while
creating an expanding generated challenge set in parallel. The user has
agreed to the objectives, opening all eleven sessions for an initial diagnosis,
and using an expanding challenge set without a separate synthetic holdout.
Overall execution remains paused while the plan is reviewed section by section.

The two objectives are to explain the development/local-holdout gap and
determine whether repairs help unfamiliar games. The experiment would use
exposed-corpus and challenge failures instead of the normal development-only
selection loop. Source-porting and regression-validation requirements remain.

Inspection and replay of the eleven files in `sessions/holdout/` are proposed,
not yet started. They would remain at their existing paths. Results after
inspection would be labeled **exposed local corpus**, not unseen-case evidence.
The remote competition holdout would remain unavailable.

The climbing budget remains to be agreed. Three source-backed repairs was
an assistant proposal, not a user-approved limit. Infrastructure, generation,
diagnosis, repairs, dashboard integration, and final evaluation would belong
to the same session. Draft work is isolated on `experiment/generalization`;
nothing may merge to main before agreement.

## Baseline and prior exposure

The source baseline is `86095e93fb4d0fe3e4b427c58e03ff830b13e8a8`. The last
recorded evaluation in that snapshot describes `2427be4`: development
7,031/7,765 screens and local holdout 328/3,640 screens. These historical
figures will be distinguished from new measured results.

Before this plan, a mistaken Git status command exposed local-holdout
filenames during worktree setup. Their contents were not opened. The initial
hypotheses were consequently not fully blind to labels. This plan is recorded
before inspecting those contents.

## Hypotheses and inspection

| Hypothesis | Evidence to seek |
| --- | --- |
| Familiar features contain incomplete branches. | Early failures within source functions already exercised in development, reproduced with independent inputs. |
| The workload contains unfamiliar combinations. | Differences in character, options, commands, objects, conditions, or action order that explain first failures. |
| Early blockers hide downstream progress. | Shared early refusals, output-count shifts, and movement to later blockers after repairs. |
| Screen weighting concentrated prior work. | A few trajectories dominate development gains while independently weighted cases remain weak. |
| Length and scoring differences amplify the gap. | Prefix-length and scoring-component comparisons explain some of the difference. |

Before repairing the exposed corpus, record its workload composition and first
failures at the source baseline. Cluster failures by their source cause, not
by session label. Trace each selected repair to C and preserve an independently
chosen reproducer. Report rejected explanations as well as supported ones.

## Expanding challenge set

Use the exposed-corpus findings and the C source to shape generated workloads.
Existing sessions show plausible play; source analysis identifies missing
behaviors and combinations. C supplies expected outputs. There is no separate
sealed synthetic corpus in this experiment.

Begin with a C-only pilot to establish valid generation, target reachability,
and recording cost. Select the initial batch size after that pilot and within
the agreed session budget. The earlier 25-case pilot and 76-case split were
assistant proposals, not agreed allocations.

Candidate families include ordinary starts and play across roles,
inventory/menus, equipment/item use, combat, conditions over time, level
transitions, and persistence/end-of-game behavior. The final generation mix
remains to be agreed.

Proposed mission generation uses a coverage map rather than relying only on
free-form agent play. Assign missions across behavior families, action histories
(repeat, reverse, interrupt, revisit, save and resume), relevant character/state
conditions, and lengths. Combine familiar actions into longer dependencies,
such as storing food, changing levels, retrieving it, and eating it. Include
ordinary play and focused source-based cases, with debug-assisted setup labeled.
The planner proposes missions; the player adapts to the actual C observations.

Record attempted, reached, and blocked behaviors separately. A stated mission
or an agent's completion report does not establish reachability. Verify the
endpoint from recorded observations and source evidence. Track related variants
as one mission family so new seeds do not inflate the apparent diversity.
Choose later batches from coverage gaps, preserving a broad allocation across
families alongside targeted cases. Coverage views would complement the score
dashboard; they would not estimate remote-holdout coverage.

Use valid role/race/gender/alignment combinations and vary relevant options.
Include short, medium, and longer continuations. Scripted setup may use wizard
mode when that mode does not change the target behavior; report its cases
separately from ordinary play. New seeds can change what subsequent keys do,
so validate target reachability against C.

Freeze each batch's sampling and acceptance rules before comparing JavaScript.
Reject recorder failures and invalid C setup using stated criteria, preserve
counts and reasons, and never select seeds or cases by whether JavaScript
passes. Record generator changes with a new version. Do not silently report
partial generation as a complete batch.

For each batch, score a pinned implementation before inspecting JavaScript
failures or making repairs. Preserve that first evaluation, then inspect the
cases and add their failures to the implementation backlog. Keep each batch's
membership and C recordings immutable; the overall challenge corpus grows by
adding versioned batches. A correction to an invalid case is explicit and
creates a new manifest version rather than rewriting past measurements.

First evaluations describe unfamiliar instances of the generated workload.
They are not evidence of independence from known scenario families or an
estimate of the remote distribution. Compare synthetic and remote changes on
the same commits when remote measurements become available. Broaden challenges
when the current corpus is exhausted instead of declaring the port complete.

## Measurements and schedule

The exposed local corpus and existing challenge batches may be replayed during
diagnosis and repairs. Each new batch gets a recorded first evaluation before
its failures guide fixes; later replays are recorded as reassessments.
Generator failures are resolved using C, without selecting for JavaScript
success. There is no synthetic-holdout evaluation schedule.

Each result identifies the exact implementation commit, corpus identifier,
corpus digest, scorer identity, evaluation time, and whether evaluation
completed. Report matching screens and RNG values with denominators, complete
sessions, and an equally weighted mean of per-session screen fractions. Add
matching-prefix and first-failure diagnostics where the tooling supports them.
Distinguish missing measurements, failed evaluations, and measured zeros.

Retain the existing local serializer identity in result records. The local
serializer differs from the official scorer; remote scores are therefore
reported separately and are not inferred from synthetic results.

Run focused checks for changes and a final checkpoint for the complete
committed experiment. Game fixes require source/caller evidence and recorded
play. Keep source-function and validation evidence with each repair's commit
and in the experiment findings. Do not claim complete source ports for partial
branches or claim passing recipes that remain blocked.

## SCORE.tsv and dashboard accounting

The user explicitly requested that the expanding challenge set be represented
in both `SCORE.tsv` and the existing dashboard. `SCORE.tsv` remains the canonical
aggregate score history. Detailed per-case artifacts and immutable batch
manifests may live under `experiments/generalization/`; they are evidence for
the score rows, not a competing manually maintained score history.

Extend the score schema to identify the corpus, evaluated case-set version or
manifest digest, batch or cumulative scope, measured implementation commit,
scoring version, and evaluation kind. Distinguish a batch's first evaluation,
later reassessments, and corpus-expansion events. Record sessions, screens,
RNG values, and cursors with matched and total counts, plus the mean per-session
screen fraction when available. Link each measurement to its detailed artifact.

Preserve historical measurements and their original meaning during the schema
migration. Missing values remain missing; do not infer synthetic scores for
older commits. Record the old local corpus's exposure boundary so historical
unseen evaluations remain distinguishable from later development evaluations.
Keep original development, exposed local, and generated challenges identifiable
as separate corpora. Do not combine their figures into an unlabeled total.

Use one schema-aware score reader for command-line reports and dashboard data.
The current dashboard reads positional columns directly and derives progress
from goal events, so both assumptions need updating for challenge evaluations.
Standings and deltas must be scoped to the correct corpus, case set, scoring
version, and evaluation kind. Retain the first evaluation of each batch even
after every case has been repaired.

The dashboard should show:

- Current challenge-corpus size and matching sessions/screens with denominators.
- Per-batch first-evaluation results alongside the latest result for that same
  batch, with the corresponding commits and generator/scoring versions.
- Implementation progress measured on unchanged cases. Calculate a code-change
  delta only from the same case set and scoring version.
- Explicit additions to the challenge corpus, showing how many new cases and
  screens were added and how many matched on their first evaluation.
- Separate original-development and exposed-local trends; RNG and first-failure
  detail can be secondary to screen/session results.

When a batch is added, assess the old and expanded sets at the same commit to
separate corpus growth from code changes. Adding passing cases is not an
implementation gain; a lower percentage after adding harder cases is not by
itself a regression. A matched-case gain and a newly failing case are reported
separately rather than hidden in a net total. First-evaluation rates across
different batch mixes are descriptive, not automatically a comparable trend.

Show evaluated commit and time, and distinguish an unmeasured corpus, a failed
evaluation, and a measured zero. Builds read saved score records and do not
launch challenge evaluations. Test schema migration, batch growth at unchanged
code, same-batch improvements/regressions, preservation of first evaluations,
and missing/failed results. Inspect the rendered dashboard in a browser.

## Repository organization

The canonical plan is this file. Put generation and scoring tools in `scripts/`
and challenge manifests and detailed evidence under `experiments/generalization/`.
Keep intentionally failing challenge cases outside the passing `recordings/`
regression corpus. Add passing regression evidence for repairs using the
existing source-file recipe and recording conventions. Preserve generated
cases and their first results after they start passing.

## Milestones

- Plan and hypotheses recorded before content inspection.
- Baseline exposed-corpus census and diagnosis recorded.
- Generated challenge pilot validated; initial versioned batch scored before
  inspecting its JavaScript failures.
- Source-backed repairs completed within the agreed climbing budget, with
  regression evidence.
- SCORE.tsv and dashboard distinguish corpus growth, first evaluations, and
  implementation improvements on unchanged cases.
- Final checkpoint, exposed and challenge evaluations, and findings recorded.

## Findings

The authorized pilot used two `gpt-5.6-luna` agents with `xhigh` reasoning.
One agent built `scripts/explore-c.mjs` and played ordinary games; the other
used debug wishes for container setup and then ordinary commands. Each action
re-records its complete input prefix in a private C installation. The driver
retains its recipe, canonical recording, action log, and latest screen.

| Run | Inputs / boundaries | Observed result |
| --- | --- | --- |
| scout | 17 / 18 | Inspected inventory and escaped via the starting D:1 upstairs. This did not satisfy the intended descent-and-return objective. |
| journey | 56 / 57 | Explored D:1, descended to D:2, returned to D:1, inspected inventory, and stopped at 6/16 HP after combat. |
| containers | 172 / 173 | Used floor insertion/removal, tipped mixed contents and a nested sack into a carried bag of holding, removed the nested sack, and inspected the remaining food and scroll. |

The journey and container recipes were independently replayed in separate
private C installations. Their complete parsed recording objects matched the
pilot recordings, including screens, cursors, and random-number logs. This
establishes reproducibility of those two cases, not JavaScript parity. Their
JavaScript behavior has not been scored or inspected. Artifacts remain in
`/tmp/teleport-c-pilot/<run>/`; verification recordings are in
`/tmp/teleport-c-pilot-verify/`. These pilot outputs are not yet an accepted
challenge batch or part of the passing recordings corpus.

The early scout exit supports explicit mission endpoints and independent
reachability checks. The other two trajectories demonstrate adaptive C play
and repeatable multi-feature cases; this small pilot does not establish a
representative workload or transfer to the remote holdout.

`scripts/monitor-c-explorers.mjs --runs /tmp/teleport-c-pilot` serves current
screens and action histories on loopback port 8766. Its `--snapshot <html>`
option creates a standalone page that checks for later uploaded snapshots
every 30 seconds when hosted. Focused tests cover read-only access, artifact
isolation, damaged status files, and safe snapshot embedding. Chromium checks
covered loading, empty, populated, error, disconnected, and expanded-history
states at widths from 320 to 1,920 pixels, plus standalone snapshot refresh.

Sites project `appgprj_6aa4ff25659c8191994e6b39f28b7469` was created for the
monitor; its source checkout is `/tmp/teleport-c-pilot-site`. Ownership and
owner-only access were verified. Automatic approval review rejected the source
upload and requested explicit approval for the destination and payload. That
approval is pending; no Sites version has been published.
