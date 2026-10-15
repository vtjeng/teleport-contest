---
name: challenge-prep-worker
description: Prepare one future synthetic NetHack challenge batch from reproducible C play in an assigned worktree. Submit case files and immutable evidence; do not admit or score the batch.
---

# Challenge preparation task

The Prep lead owns this batch task. Exploration lanes follow "Exploration
lanes" below and their assigned probe plan; they do not claim batch tasks.

Read `AGENTS.md`, `.agents/loop.md`, `.agents/selection.md` ("Generating the
next synthetic batch"), `.agents/validation.md`, and `.agents/scoring.md` before
starting. Use the assigned worktree, batch ID, allowed paths, shared ledger,
and private C recorder installation. Check the worktree root and branch before
editing. Claim `challenge-batch:<vN>` in the ledger before creating cases.

Plan at least 12 new, independent C behavior candidates before comparing
JavaScript results, as `.agents/selection.md` specifies. For each, identify its
source function or branch, required state and actions, and the C observation
that will establish reachability. Earlier admitted cases do not count toward
this target. Prefer reachable gaps drawn from source-traced blockers, parked work,
the roadmap, and prior missed missions, while leaving room for exploratory
cases. Choose different source owners where practical. Vary behavior families,
action histories, and relevant role or state conditions. Changing only seeds
is insufficient.
Record every valid case with patched C. Independently replay each case kept
in the prepared manifest. Compare a mismatching case's reached behavior, state
conditions, and action history with unresolved admitted cases, earlier submitted unadmitted
batches, and other cases in the new batch, as `.agents/selection.md` specifies.
Use saved evaluations and immutable delivery packets; do not replay the archive
for this comparison. Fully matching admitted cases do not disqualify a new
mismatching case.
Name comparable cases in that set and the causal distinction for each included
case. Follow `.agents/selection.md`, "Generating the next synthetic batch",
for retained cases and delivery size; do not add routine matching controls.
Keep valid overlapping probes outside the manifest with their C observation
and earlier case; replay them again only when needed
to establish a blocker. Reject invalid setup or recorder failure with C
evidence. Do not copy a fixed or admitted recording's seed and inputs, special-case a case, or edit prior batches.

Compare valid probes against a fixed accepted JavaScript commit before spending
an independent C replay on retained cases. In `missionPlan`, count a session when it
has a local mismatch and the C behavior responsible for its first mismatch
is source-traced and distinct from the first mismatching behavior of every
other counted session. Later mismatches in the session are allowed. Name the recording, first mismatch
step, source behavior, and owner for each counted session. Retain distinct valid
mismatching cases in the
prepared manifest. A missed mission can count when its first mismatch meets the
criterion above. Matching cases and cases with duplicate or
unresolved first mismatch behaviors do not count.

After two materially different C setups fail to reach a difficult target,
record the reason and try another unless the source reveals a cheap route.
Replace deferred targets with other reachable behaviors. Follow the selection
rules for submitting a nonempty group without waiting for 12 failures, and
continue searching if none qualify. Report concrete search or recorder blockers.
Do not inspect implementation-worker assignments or statuses. The orchestrator
owns admission. After submitting a batch, claim the next unused version and
continue without waiting for acceptance, admission, or a queue threshold.
Handle requested corrections and parked preparation before starting a later
batch. Record idle or blocked turns with a public `summary`
naming the dependency and owner; keep private details in `reason`. Keep reached,
missed, and deferred targets and the remaining candidate list in `missionPlan`
for that decision.
Choose further candidate behaviors from the C source and coverage gaps; do not
alter recipes to exploit a JavaScript result. Keep local comparisons separate
from the orchestrator's saved evaluation, which may find fewer mismatches after
main advances.

Commit only new case recipes and C recordings under
`challenges/cases/<batch>/`. Put the prepared manifest and its case hashes in
the immutable delivery packet, outside `challenges/manifests/`. Preserve the
C replay commands and logs with the delivery. Do not commit a versioned
manifest, run aggregate scoring, append `SCORE.tsv`, edit `GOALS.json`, or
update the dashboard. The orchestrator validates the cases and later admits
the batch under `.agents/selection.md` and `.agents/validation.md`.

Finish the C recorder and replay commands before submitting, so the recorded
files and hashes cannot change after handoff. For `worker-state.mjs submit`,
write `.cache/task-context.json` with `kind: "challenge-preparation"` and the
assigned `batch`. Write `.cache/task-evidence.json` with `missionPlan` and the
prepared `manifest`. In `.cache/checks.json`, include one successful `fresh`
check per case with its `caseId`, command, and absolute log path. Submit the
task with its exact base and delivery commits, case paths and hashes, mission
rationale, and independent replay results. Follow `.agents/loop.md`,
"Notifications", then continue preparation. Keep Prep dedicated to batch
preparation.
At the clean task boundary, merge the commit returned by
`worker-state.mjs accepted-main --file <shared-ledger>`, not an unaccepted Main HEAD.
Claim the next batch at the resulting HEAD. Keep all submitted commits
unchanged; the next delivery includes only its new case paths, with dependencies
on pending ancestor deliveries inferred by submission.

## Exploration lanes

Use one Sol Prep lead and up to six persistent Luna-high exploration lanes,
within the shared agent limit. Give each lane one C-behavior investigation
at a time, with a stopping condition. Keep concurrent lanes on different
source behaviors or caller paths. Reassign a finished lane without waiting
for the others. Lanes do not spawn further agents or implement game fixes.
These are additional Prep agents; A, B and C remain implementation workers.
Spawn `prep-explorer`, or explicitly select `gpt-6-luna` with `high` reasoning
and this procedure when the new role is not loaded yet.
Start with fresh child context containing its plan and instruction references;
reuse the lane for subsequent investigations.

Give each lane a private worktree and recorder installation, disjoint case
paths, the accepted comparison commit, and its source-based probe plan.
Use `worker-worktree.mjs` for recorder setup. Start each lane worktree at the
parent task's base and prefix its case IDs with its unique probe ID.
Keep scratch and returned artifacts in `.cache/` so the worktree stays clean
for the next accepted base. Keep at most two bounded lane commands running
across Prep, including C recording, replay and JavaScript comparison. Retain
the bounded-command limits. Reserve before launch with `recording: true` in
the lane's `prep-probe` event. Record the process handle when available, then
release the slot only after the command exits. If both slots are reserved,
record the blocker and wait for a release notification; do not poll.
The lead wakes recorder-blocked lanes when a slot is released. While lanes
are running, keep C commands in those lanes rather than launching extra
recordings from the lead worktree.

Each lane creates its recipe, records the reached C behavior, compares it
with JavaScript, and returns the result. For a distinct failure, independently
replay it and trace the first mismatch. For a match, duplicate, or deferred
target, preserve the evidence and stop that investigation. Follow the
selection rules for target misses and setup retries.

Record assignments, blocks, completion and process handles with `prep-probe`
events in the shared ledger. Include the parent task, batch-linked probe,
source target and outcome; `worker-state.mjs --help` describes the fields.
The lead starts a probe; its lane or the lead records subsequent observations.
Report to the Prep lead, not Main. Keep commands and artifacts in the private
worktree; return their paths and hashes. A lane never submits a Main delivery.

The lead deduplicates returned causes and assembles one immutable batch
delivery. Recheck ambiguous evidence; do not repeat every investigation.
Import only retained case files, with saved proofs, into the lead worktree.
Finish outstanding probes before submission; defer unfinished investigations
with their evidence and reuse them in the next batch. Keep unused targets for
that batch. Follow `.agents/selection.md` for retained cases and delivery size.
