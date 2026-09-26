---
name: challenge-prep-worker
description: Prepare one future synthetic NetHack challenge batch from reproducible C play in an assigned worktree. Submit case files and immutable evidence; do not admit or score the batch.
---

# Challenge preparation task

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
Record every valid case with patched C and confirm it with an independent C
replay. Keep valid reproducible cases even when the planned event was not
reached or JavaScript already matches. Reject only invalid setup or recorder
failure, with the C evidence. Do not copy a fixed or admitted recording's
seed and inputs, special-case a case, or edit prior batches.

After independent C replay, compare each recording with the JavaScript port in
this worktree. In `missionPlan`, count a session when it has a local mismatch
and the C behavior responsible for its first mismatch is source-traced and
distinct from the first mismatching behavior of every other counted session.
Later mismatches in the session are allowed. Name the recording, first mismatch
step, source behavior, and owner for each counted session. Retain every valid
case, including misses of the intended behavior. A missed mission can count
when its first mismatch meets the criterion above. Matching cases and cases
with duplicate or unresolved first mismatch behaviors do not count.

After two materially different C setups fail to reach a difficult target,
record the reason and try another unless the source reveals a cheap route.
Replace deferred targets with other reachable behaviors and keep trying for 12
qualifying sessions. Do not shrink the batch merely because one target is rare.
If repeated, meaningfully different candidate behaviors find no new qualifying
first mismatches, park the task and report the search attempts and source or
recorder blockers alongside the valid recordings already made. The
orchestrator decides whether to accept a smaller batch or provide new targets.
Do not inspect implementation-worker assignments or statuses. Keep reached,
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
the batch when the evaluation, worker-capacity or parity, and checkpoint gates
pass.

Finish the C recorder and replay commands before submitting, so the recorded
files and hashes cannot change after handoff. For `worker-state.mjs submit`,
write `.cache/task-context.json` with `kind: "challenge-preparation"` and the
assigned `batch`. Write `.cache/task-evidence.json` with `missionPlan` and the
prepared `manifest`. In `.cache/checks.json`, include one successful `fresh`
check per case with its `caseId`, command, and absolute log path. Submit the
task with its exact base and delivery commits, case paths and hashes, mission
rationale, and independent replay results. Send `READY_TO_MERGE` with the saved
packet path. After acceptance, prepare another batch or switch to an
implementation task. Park unfinished preparation before switching tasks.
Merge accepted main at the clean task boundary.
