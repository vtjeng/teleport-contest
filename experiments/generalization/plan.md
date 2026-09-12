# Generalization experiment

## Scope and authorization

The user requested one session of work: record a learning plan, open the
entire existing local holdout and improve the port against it, while creating
a synthetic holdout in parallel. This experiment uses that explicit scope
instead of the normal development-only goal-selection loop. The source-porting
and regression-validation requirements still apply.

The eleven files in `sessions/holdout/` are now authorized for inspection and
replay for this experiment. They remain at their existing paths. Results after
inspection are labeled **exposed local corpus**, not unseen-case evidence.
The remote competition holdout remains unavailable.

The first implementation batch targets three source-backed repairs. This is
an engineering allocation, not a promised gain. Infrastructure, generation,
diagnosis, repairs, dashboard integration, and final evaluation belong to
this one session. Work is isolated on `experiment/generalization` so the
unfinished change in the main workspace is not included accidentally.

## Baseline and prior exposure

The source baseline is `86095e93fb4d0fe3e4b427c58e03ff830b13e8a8`. The last
recorded evaluation in that snapshot describes `2427be4`: development
7,031/7,765 screens and local holdout 328/3,640 screens. These historical
figures will be distinguished from new measured results.

Before this authorization, a mistaken Git status command exposed local-holdout
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

## Synthetic generation specification

An independent generator/evaluator worker must not inspect the exposed local
corpus or its diagnosis. It uses C source and existing recorder tooling to
generate new cases, with C providing expected outputs. Implementation workers
may inspect the synthetic development sample but not the synthetic holdout.

The initial C-only pilot includes one ordinary start for each of thirteen
roles and two variants for six scenario families: inventory/menus,
equipment/item use, combat, conditions over time, level transitions, and
persistence/end-of-game behavior. Pilot cases are separate from evaluation.

The first frozen suite targets 76 cases: four independently seeded ordinary
games per role (52), and four variants per scenario family (24). Half of each
group forms an inspectable synthetic development sample; the other half forms
the sealed synthetic sample. These 38-case allocations test the experiment
machinery and transfer; they are not claims of statistical precision.

Use valid role/race/gender/alignment combinations and vary relevant options.
Include short, medium, and longer continuations. Scripted setup may use wizard
mode when that mode does not change the target behavior; report its cases
separately from ordinary play. New seeds can change what subsequent keys do,
so validate target reachability against C.

Freeze sampling and acceptance rules before comparing JavaScript. Reject
recorder failures and invalid C setup using stated criteria, preserve counts
and reasons, and never select seeds or cases by whether JavaScript passes.
If C-only piloting requires a change to this allocation or a scenario,
record the reason before measuring JavaScript and identify the resulting
corpus version. Do not silently report partial generation as a complete suite.

Keep sealed seeds, recipes, recordings, detailed results, and generator logs
outside the implementation checkout, in a private evaluation directory under
the shared Git directory. Only the generator/evaluator worker accesses them.
This is a separation of worker responsibilities, not an operating-system
security boundary. Commit the generator and public specification, plus a
digest of the private manifest. Preserve enough private metadata to reproduce
the exact suite. Visible generator families mean the initial sealed result
measures new instances of those families, not wholly unfamiliar task designs.

## Measurements and schedule

The exposed local corpus and synthetic development sample may be replayed
during diagnosis and repairs. The synthetic holdout is evaluated only at the
source baseline and at the end of the implementation batch. Its evaluator
returns aggregate results only. Generator failures are resolved using C,
without consulting JavaScript outcomes.

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

## Dashboard and repository records

The canonical plan is this file. Structured, sanitized results belong under
`experiments/generalization/runs/`; the dashboard reads those records rather
than a manually maintained score table. Put generator and evaluator tools in
`scripts/`. Keep failing synthetic development cases outside the passing
`recordings/` regression corpus; add passing regression evidence using the
existing source-file recipe and recording conventions.

Extend the existing dashboard with an experiment view: milestone, exposed
local progress, synthetic development progress, and separate discrete sealed
evaluation points. Show corpus/scorer versions and the measured commit. Do not
draw a gain across incompatible corpus versions or imply an old measurement
describes current HEAD. Put RNG and diagnostic detail below the primary scores.

Dashboard builds read recorded summaries and do not run sealed evaluations.
The complete generated HTML payload must omit sealed seeds, filenames,
keystrokes, screens, raw errors, and per-case results. Test that boundary with
invented fixtures and inspect the rendered dashboard in a browser.

## Milestones

- Plan and generation rules recorded before content inspection.
- Baseline exposed-corpus census and diagnosis recorded.
- Synthetic pilot and frozen suite generated independently; baseline scored.
- Three source-backed repairs completed with regression evidence.
- Dashboard displays corpus-specific results and evaluation status.
- Final checkpoint, exposed and synthetic evaluations, and findings recorded.

## Findings

Pending execution. Append measured findings, repairs, limitations, and
changes to the generation specification here; link the structured results.
