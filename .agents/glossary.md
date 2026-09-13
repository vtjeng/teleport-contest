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
implemented behavior at one fixed-workload session's first mismatch.
`.agents/divergence.md` defines its workflow.

A **span** is the unit of work one worker run ports, wires, and lands: for a
file port, its unverified functions in C order up to the planner's line cap;
for a Lua port, its whole program; for a divergence fix, the functions the
fix touches. Existing partial functions stay in scope.
`node scripts/goal-log.mjs next-span` plans a source port's span and writes
`.cache/span-context.json`; `.agents/divergence.md`
states how a divergence fix queues one. A span closes when its commits pass
`npm run checkpoint` without the fixed-workload sessions or the recordings losing
a match.

A **gap** is a call to an unported C function that the port records with
`note_unported()` and skips. `AGENTS.md`, "Port whole source units and wire their callers",
states when a call may be skipped.

A **mismatch** is the first step at which a session's replay stops matching
its recording: on the random-number log, on the screen, or at a refusal the
port raised. A defect in implemented behavior is a **divergence**; missing or
partial behavior needs a C or Lua source port. The **mismatch queue** lists
each fixed-workload session's first mismatch and its source owner when known;
`node scripts/mismatch-queue.mjs` prints it.

A **recipe** is a session file holding replay inputs only: seed, date and
time, options, and keystrokes, with no recorded steps. A **recording** is a
recipe recorded with the patched C program, carrying C's random-number log,
screen, and cursor for every key. The scorer's sessions under `sessions/` are
recordings; the port's own form the **recordings corpus** under `recordings/`
and replay in `npm run checkpoint`.

A **coherent implementation chunk** is one reviewable production change with
its focused tests, and may be one of several commits inside a span.

A goal or a span is **in progress** from the moment work starts on it until
it **closes**. Work written down but not begun is **queued**. A source port
closes after its spans close and entry-point coverage is verified. A
**parked** goal preserves unfinished work while a higher-priority blocker is
addressed.

A **check** is routine diff inspection, testing, source comparison, or
`npm run quality`. `.agents/review.md` defines the review vocabulary: a
formal review pass, an audit, and an evidence snapshot.
