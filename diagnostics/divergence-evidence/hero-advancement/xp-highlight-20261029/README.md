# Parsed XP-percentage highlight transition

Five supported public Tourist recordings match full C/JS output. Control travels
to depth 9 (9 XP, below 50% of level-one's 20); target to depth 10 (10 XP,
exactly 50%). Both stay level 1 with showexp disabled. Control has 12 screens /
4558 RNG calls; target 13 / 9020. Additional terminal-point controls use <100%/red and =100%/green: XP18 remains red (13 screens/6083 RNG); XP19 selects green at the source special-case100% (13/6397); XP20 advances to level2 and selects red again (13/5671). Zero new semantic causes, one scoped negative.

Startup config supplies experience-level/<50%/red and >=50%/green rules with
statushilites:5. The verifier checks actual parsed runtime rules, XP and selected
rule identity before/after through supported runSegment replays. Initial Xp:1
cells are red; control stays red; target becomes green. Archived C and JS screen
colors, attributes, cursors and RNG match. Thus this is an exercised rule-selection
transition, not merely a passing transcript with an unverified option.

The control's cached percent remains 0 despite XP9; its selected rule stays red.
The 50% target's cached percent becomes 50 and its selected rule green. The terminal-point target selects100%, and the level-gain case resets to0%. These runtime
observations are JS-specific; C's corresponding evidence is rendered cell color.
No claim is made to observe C rule pointers or isolate exp_percent_changing's
redraw request from every other level-travel redraw cause. No-rule predicates
were previously qualified in score-gates; this is separate integration coverage.

Prior repair 49626a5673d361969361e57768c75e70dbab1104 compares long highlight
thresholds numerically. Its startup regressions cover large integer/string
threshold ordering. This witness uses small integer percentages and is a scoped
extension, not a rediscovery of that accepted fix. Existing level-arrival tests
already exercise JS percentage predicates; those alone were not a C oracle.

JS base 1d2ad76f770232281a6e5abaeeb539f2da479509; C gitlink
16ff59115315917b93185d026aeefea06db9b0f4. Full-recorder build attestation remains
unavailable; prior binary hash/source checks remain a dependency. Transport is
wizard-assisted, not ordinary walking. No excluded effect or failed-turn artifact
is used. Runtime verifier reads normal state without changing gameplay functions.

Run from repository root with the existing recorder prerequisites and fresh dirs:

```
node diagnostics/divergence-evidence/hero-advancement/xp-highlight-20261029/run.mjs control /tmp/hero-highlight-control-new
node diagnostics/divergence-evidence/hero-advancement/xp-highlight-20261029/run.mjs target /tmp/hero-highlight-target-new
node diagnostics/divergence-evidence/hero-advancement/xp-highlight-20261029/run.mjs terminal-control /tmp/hero-highlight-terminal-control-new
node diagnostics/divergence-evidence/hero-advancement/xp-highlight-20261029/run.mjs terminal-target /tmp/hero-highlight-terminal-target-new
node diagnostics/divergence-evidence/hero-advancement/xp-highlight-20261029/run.mjs gain-reset /tmp/hero-highlight-gain-reset-new
node diagnostics/divergence-evidence/hero-advancement/xp-highlight-20261029/verify.mjs
```

All expect exit 0. Actual receipts and raw outputs are archived; hashes cover
stored compressed bytes. 77 focused tests pass (startup/lifecycle highlight,
level-arrival and level-change). No unresolved comparison in this package.
Timings are elapsed, not active compute. Main owns gameplay; no CI dispatch.
