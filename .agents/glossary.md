# Glossary

Agent hierarchy, scheduling, worktrees, and lifecycle are defined in
`.agents/architecture.md`. A **task** is one queued execution assignment;
its type is exploration, implementation, or rework. A **deliverable** is the
versioned result whose acceptance is tracked independently. Completed tasks
remain completed when their deliverables need correction.

An **exploration task** answers one bounded source-based question and returns
reproducible evidence to Prep. A **rework task** corrects a named deliverable
revision, carries findings and required checks, and produces a new revision.
It can be assigned to another worker; it does not reopen the original task.

An implementation task can be one of the following:

- A C file port covering whole functions in a selected range.
- A port of one whole Lua file.
- A divergence fix.

`GOALS.json` records the integration plan for an implementation task as a
**goal**; `goal-log.mjs` registers it and `task-handoff.mjs accept` records its
accepted outcome. A closed task record is not a whole-source certification.
`.agents/selection.md` states how the mismatch queue orders implementation
tasks. `node scripts/goal-log.mjs roadmap` lists C declarations separately from
verified functions, and every Lua program with its completion evidence.
Goals recorded before 2026-09-05 were boundary ports with a forecast and
slices; `GOALS.json` keeps them as history.

A **batch deliverable** assembles a future synthetic batch from C source,
recipes, recordings, and independent C replays returned by exploration tasks.
The legacy ledger calls this a **challenge preparation task**; that historical
transport identity is not an additional general-worker task queue. Local JavaScript
comparisons identify distinct source-traced first mismatch behaviors. The
prepared manifest follows `.agents/selection.md` for retained cases and delivery
size. Recipes, C recordings, and search notes for redundant probes remain
preparation evidence, not batch tests.
The worker does not choose recipes to exploit JavaScript
results or admit and score the batch. The orchestrator admits and scores it
after the gates in `.agents/selection.md` pass.

A **file port** is an implementation task that ports one C file, or one named
group of functions in a C file, every function in the selected range in C
order. Workers own source review and runtime evidence (`AGENTS.md`,
"Validate completed work"). Main accepts it from CI results under `.agents/loop.md`,
without independently certifying every source unit.

A **Lua port** implements one whole `dat/*.lua` program, including its
helper functions, top-level statements, and production dispatch. It uses the
same worker evidence as a C file port; loader registration is inventory.

A **declaration** is a matching JavaScript name. A **verified source unit**
has the explicit completion evidence defined in `.agents/validation.md`.
Historical `ported` flags count declarations only.

A **divergence fix** is an implementation task that repairs a source-traced
defect in implemented behavior at a fixed-workload or synthetic case's first
mismatch. `.agents/divergence.md` defines its workflow.

Historical **spans** and older **slices** remain readable in `GOALS.json` and
`SCORE.tsv`. New implementation tasks define their complete scope up front, so
workers do not plan or close a separate span. A deliverable may need correction revisions before acceptance; the unified
queue assigns each correction as a linked rework task. Legacy ledger records
may retain those revisions under their original task identity.

A **gap** is a call to an unported C function that the port records with
`note_unported()` and skips. `AGENTS.md`, "Port whole source units and wire their callers",
states when a call may be skipped.

A **mismatch** is the first step at which a session's replay stops matching
its recording: on the random-number log, on the screen, or at a refusal the
port raised. A defect in implemented behavior is a **divergence**; missing or
partial behavior needs a C or Lua source port. The **mismatch queue** lists
each fixed-workload session's first mismatch and its source owner when known;
`node scripts/mismatch-queue.mjs` prints it. Synthetic diagnostic entries come from saved per-batch evaluations under
`.agents/selection.md`. Fixed and synthetic inputs retain their provenance and
score denominators, but both feed the same assignment queue.

A **recipe** is a session file holding replay inputs only: seed, date and
time, options, and keystrokes, with no recorded steps. A **recording** is a
recipe recorded with the patched C program, carrying C's random-number log,
screen, and cursor for every key. The scorer's fixed-workload sessions under
`sessions/`, including `sessions/holdout/`, are recordings; the port's own
form the **recordings corpus** under `recordings/` and replay in
`npm run checkpoint`.

A **coherent implementation chunk** is one reviewable production change with
its focused tests, and may be one of several commits inside a task.

A worker's current queue task is **claimed** until it is completed, blocked,
or superseded through the supported ownership protocol. `GOALS.json` records
central integration and accepted implementation outcomes, not every queue
assignment. A persistent worker keeps its worktree across task types and uses
a branch per assignment. Acceptance closes a deliverable's integration goal;
it does not certify every source unit. A **parked** goal or blocked task
preserves unfinished work and identifies what is needed to resume it.

A **superseded** goal is a retired plan whose work belongs to another named
goal. It retains its history and evidence but is neither pending nor completed
work. `.agents/selection.md` gives the retirement command.

A **check** is routine diff inspection, testing, source comparison, or
`npm run quality`. `.agents/review.md` defines the review vocabulary: a
formal review pass, an audit, and an evidence snapshot.
