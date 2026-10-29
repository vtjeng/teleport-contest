# Score, beginner and redraw independence

96 target states and two numeric controls match executed C and JS. This is a
scoped component negative, zero new semantic causes. Existing JS tests already
covered these semantics; this adds a C oracle rather than claiming a new repair.

The hypothesis was that beginner status might be tied incorrectly to XP-change
or redraw gates. Source reconciliation predicts agreement: both implementations
place the beginner threshold after the independent XP and score updates. The
matrix tests Wizard threshold 1000 and Tourist/non-Wizard threshold 2000,
resulting score below/at/above, showexp on/off, redraw pending/not pending,
XP-producing and score-only grants, and beginner initially true/false.
Controls pin XP19+2/score0+8 and score990+10 with unchanged XP19 and no redraw.

Two complete unchanged C bodies are extracted: exper.c more_experienced and
botl.c exp_percent_changing. The latter runs under STATUS_HILITES with no rules,
matching JS's empty status_hilites array. Unreachable exp_percentage/get_hilite
dependencies abort if invoked; no rule-selection behavior is inferred. C long
fields and bounded integer grants avoid overflow; SCORE_ON_BOTL remains undefined
as in the pinned config. Production JS APIs run without replacement. No RNG.

These are constructed API states, not natural score-acquisition histories.
No combat, object-effect, ring, death, polymorph or excluded setup is used.
Overflow is a known unsupported numeric domain, not a newly discovered finding.

JS base 029dbe6ffb8fbf04dc6d1b3dd16153b7054363f1; C gitlink
16ff59115315917b93185d026aeefea06db9b0f4. Fresh GCC 14.2 compilation and source,
binary, input/output hashes are retained. This does not strengthen the separately
preinstalled full recorder's provenance. Compiler diagnostics are empty.

Reproduce (repository root, installed Node/GCC):

```
node diagnostics/divergence-evidence/hero-advancement/score-gates-20261029/run.mjs control
node diagnostics/divergence-evidence/hero-advancement/score-gates-20261029/run.mjs target
```

Both expect exit 0. Actual receipts and all outputs are retained; compressed
artifacts are hashed as stored. 68 focused level-arrival/level-change tests pass.
Elapsed compilation/execution windows are not active compute measurements.
No unresolved mismatch here. Highlight-enabled integration remains reachable but
unqualified by this component. Main owns gameplay; no CI dispatch or merge.
