# Lua generation discovery adapter

`node scripts/lua-discovery.mjs experiments/lua-discovery/pilot.json /absolute/new/run-directory`

This standalone adapter is for the unpublished discovery hub to import. It does
not write Main, a ledger, scores, challenges, or gameplay files. `discover(config)`
is the programmatic entry point; the CLI accepts a JSON config and a fresh output
directory. Import `ledger.json` as twelve-column rows; retain `summary.json` and
the entire run directory as the details attachment. Hub status vocabulary can map
these explicit outcomes without collapsing missing evidence into a pass.

Config: `cases: [{program, seed}]` builds a supported wizard `#wizloaddes` recipe;
`{program, recipe: "path/to/input-only.session.json"}` uses an existing single
segment, e.g. the Medusa/Hellfill natural-arrival recipes. Both engines always use
the same recipe. Never compare wizard load against natural arrival as equality.
Program names are checked by `lua-sources.mjs`; inventory and registration are
not behavioral evidence. `maxCases` (1..100), `repeats` (1..3), and positive
`budgetSeconds` are required. The time budget stops starting new attempts; an
in-flight attempt retains diff-fresh's 10-minute C and 45-second default JS
watchdogs. These are start budgets, not hard wall-clock cancellation guarantees.

Each attempt retains input, raw C recording, raw JS output, recorder/worker
stdout/stderr/exit status, strict comparison including first mismatch in each
channel, and source/runtime/config/tool hashes. Optional diff-fresh `evidenceDir`
must not already exist; without it the existing API is unchanged. Transformed
comparisons also retain `original.session.json`. Attempts never overwrite runs.
Reproduction commands name the exact saved config and a new output directory;
restore the recorded commit and execution hashes and rebuild its patched recorder.

The bounded pilot uses four independently chosen consecutive seeds 19711001..4
and the neighboring bigrm-11 seed19711001 control, each twice. No natural seed
search was performed. Existing big-room tests already cover registration, map
size, the bigrm-11 placement sequence, and a historical all-false outer-gate
example. This pilot adds real command/recorder evidence for nested percentage
branches rather than duplicating those tests.

C Lua callsites verify general program execution where available. The recorder
only retains two Lua frames, so percent calls identify nhlib.lua, not bigrm-12.
A small exact-source-SHA-pinned recognizer decodes bigrm-12's nine known gates
only at its filename-submit boundary, requiring a complete trace. This is not a
Lua VM. A changed source or incomplete trace stays unresolved. For JS, attribution
is explicitly source route plus agreeing RNG prefix; a prior RNG divergence
prevents branch credit. No claim of private-state equality follows from matching
screens/RNG/cursors/animation frames. Generic recipes without enough program or
supported route evidence remain unresolved even if their output streams agree.
An observed other big-room/Medusa program can mark the requested target unreachable.

Outcomes: matching, mismatch, unresolved, unreachable, infrastructure-failed,
and uncovered (budget). A failed replay is infrastructure-failed, not a behavioral
mismatch. Every result is retained, including unresolved results with a raw first
mismatch. Summary `gateOutcomes` includes only gates with an agreeing JS RNG prefix
and verified route. `cGateOutcomes` retains all reached C outcomes;
`cOnlyGateOutcomes` separately preserves observations lacking that comparison.
A gate may appear in both comparable and C-only maps across different attempts.
`uncoveredPercentSites` refers to comparable coverage; `cUncoveredPercentSites`
refers to C reachability. Absent gates/outcomes remain uncovered.
Ledger status aggregates all repeats: any infrastructure failure remains
`infrastructure-failed`, mixed other outcomes become `unresolved`, and only
all-matching attempts export as matching. Each case's `outcome` retains counts
and a disagreement flag; ledger text names the distribution, including failures. Two identical raw C/JS captures establish repeatability.
Stable IDs hash method/program/input; mismatch fingerprints conservatively dedupe
exact first-difference signatures, not proven independent root causes. Cheap
priority is high only for a repeated identical mismatch, otherwise low. Passing
control IDs are reported when available. Full integration gates belong to Main.
