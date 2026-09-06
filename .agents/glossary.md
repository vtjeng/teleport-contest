# Glossary

A **goal** is one tracked unit of work in `GOALS.json`, written through
`node scripts/goal-log.mjs`. It is either a file port or a divergence fix.
`.agents/selection.md` states how the divergence queue orders goals, and
`ROADMAP.md` lists the C files with their ported and unported function counts.
Goals recorded before 2026-09-05 were boundary ports with a forecast and
slices; `GOALS.json` keeps them as history.

A **file port** is a goal that ports one C file, or one named group of
functions in a large C file, every function in C order. It closes when every
function in its range has a same-named JavaScript function and its recipes
reach each entry point of the file (`AGENTS.md`, "Validate completed work").

A **divergence fix** is a goal that repairs one development session's first
mismatch when the C function the mismatch names is already ported whole.
`.agents/divergence.md` defines its workflow.

A **span** is the unit of work one worker run ports, wires, and lands: for a
file port, a contiguous run of its functions in C order; for a divergence fix,
the functions the fix touches. `node scripts/goal-log.mjs next-span` plans a
file port's span and writes `.cache/span-context.json`; `.agents/divergence.md`
states how a divergence fix queues one. A span closes when its commits pass
`npm run checkpoint` without the development sessions or the recordings losing
a match.

A **gap** is a call to an unported C function that the port records with
`note_unported()` and skips. `AGENTS.md`, "Port whole files in C order",
states when a call may be skipped.

A **divergence** is the first step at which a session's replay stops matching
its recording: on the random-number log, on the screen, or at a refusal the
port raised. The **divergence queue** lists the development sessions' first
divergences, each with the C function it names;
`node scripts/divergence-queue.mjs` prints it.

A **recipe** is a session file holding replay inputs only: seed, date and
time, options, and keystrokes, with no recorded steps. A **recording** is a
recipe recorded with the patched C program, carrying C's random-number log,
screen, and cursor for every key. The scorer's sessions under `sessions/` are
recordings; the port's own form the **recordings corpus** under `recordings/`
and replay in `npm run checkpoint`.

A **coherent implementation chunk** is one reviewable production change with
its focused tests, and may be one of several commits inside a span.

A goal or a span is **in progress** from the moment work starts on it until
it **closes**. Work written down but not begun is **queued**. A goal closes
when its last span does.

A **check** is routine diff inspection, testing, source comparison, or
`npm run quality`. `.agents/review.md` defines the review vocabulary: a
formal review pass, an audit, and an evidence snapshot.
