# Glossary

A **goal** is one tracked unit of work in `GOALS.json`, written through
`node scripts/goal-log.mjs`. It is a C file port, a Lua port, or a divergence fix.
`.agents/selection.md` states how the mismatch queue orders goals, and
`node scripts/goal-log.mjs roadmap` lists C declarations separately from
verified functions, and every Lua program with its completion evidence.
Goals recorded before 2026-09-05 were boundary ports with a forecast and
slices; `GOALS.json` keeps them as history.

A **file port** is a goal that ports one C file, or one named group of
functions in a C file, every function in the selected range in C order. It
closes when every function has recorded whole-source, caller, and validation
evidence and its recordings reach every entry point in scope (`AGENTS.md`,
"Validate completed work").

A **Lua port** implements one whole `dat/*.lua` program, including its
helper functions, top-level statements, and production dispatch. It uses the
same completion evidence as a C file port; loader registration is inventory.

A **declaration** is a matching JavaScript name. A **verified source unit**
has the explicit completion evidence defined in `.agents/validation.md`.
Historical `ported` flags count declarations only.

A **divergence fix** is a goal that repairs a source-traced defect in
implemented behavior at a fixed-workload or synthetic case's first mismatch.
`.agents/divergence.md` defines its workflow.

A **span** is the unit of work one worker delivery ports, wires, and lands: for a
file port, its unverified functions in C order up to the planner's line cap;
for a Lua port, its whole program; for a divergence fix, the functions the
fix touches. Existing partial functions stay in scope.
`node scripts/goal-log.mjs next-span` plans a source port's span and writes
`.cache/span-context.json`; `.agents/divergence.md`
states how a divergence fix queues one. A span closes when its commits pass
`npm run checkpoint` without the fixed-workload sessions or the recordings losing
a match, and the separate synthetic evaluations pass the acceptance checks
in `.agents/scoring.md`.

A **gap** is a call to an unported C function that the port records with
`note_unported()` and skips. `AGENTS.md`, "Port whole source units and wire their callers",
states when a call may be skipped.

A **mismatch** is the first step at which a session's replay stops matching
its recording: on the random-number log, on the screen, or at a refusal the
port raised. A defect in implemented behavior is a **divergence**; missing or
partial behavior needs a C or Lua source port. The **mismatch queue** lists
each fixed-workload session's first mismatch and its source owner when known;
`node scripts/mismatch-queue.mjs` prints it. The synthetic work queue is
separate: it selects admitted challenge cases from saved per-batch evaluations
under `.agents/selection.md`, without changing the fixed workload's denominator.

A **recipe** is a session file holding replay inputs only: seed, date and
time, options, and keystrokes, with no recorded steps. A **recording** is a
recipe recorded with the patched C program, carrying C's random-number log,
screen, and cursor for every key. The scorer's fixed-workload sessions under
`sessions/`, including `sessions/holdout/`, are recordings; the port's own
form the **recordings corpus** under `recordings/` and replay in
`npm run checkpoint`.

A **coherent implementation chunk** is one reviewable production change with
its focused tests, and may be one of several commits inside a span.

A worker's current span is **in progress** from initial assignment or announced
selection until handoff or an explicit block, as the runtime ledger in
`.agents/loop.md` records. The central `GOALS.json` open/queued states describe
integration and its backlog, not all concurrent worker activity; opening and
closing remain serialized. A worker persists across span deliveries in its
assigned worktree. A source port
closes after its spans close and entry-point coverage is verified. A
**parked** goal preserves unfinished work while a higher-priority blocker is
addressed.

A **superseded** goal is a retired plan whose work belongs to another named
goal. It retains its history and evidence but is neither pending nor completed
work. `.agents/selection.md` gives the retirement command.

A **check** is routine diff inspection, testing, source comparison, or
`npm run quality`. `.agents/review.md` defines the review vocabulary: a
formal review pass, an audit, and an evidence snapshot.
