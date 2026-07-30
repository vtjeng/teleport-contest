# Proposed changes

Costed changes to tooling or process that nobody has scheduled. `ROADMAP.md`
holds open game behavior; nothing here is selectable work.

Each entry states what it would change, what it costs, what prompted it, and
what it leaves unfixed. Delete an entry when the change lands or a decision
retires it.

## Mutate the changed lines at each correctness pass

**What it changes.** After a correctness pass freezes a commit range, a script
enumerates the mutable sites in the lines that range changed, applies one
mutation at a time, runs the test files that import the mutated module, and
reports the mutants that survived. The test-quality finder in
`/audit-diff-correctness` then verifies that list.

**Scope.** Relational operators, `&&`, `||`, boolean literals, and plus or minus
one on integer literals, in the changed lines alone. Method calls, statement
deletion, and files outside the range stay untouched. A general framework such
as Stryker adds instrumentation and whole-repository runs this scope has no use
for.

**Cost.** Two figures are measured and one is not.

A mutant costs 0.45 seconds against a three-file targeted set and 0.72 seconds
against six files, both timed on 29 July 2026. The full suite runs 1,840 tests
in about 12 seconds, which bounds any single mutant, and a median recorded
correctness pass takes 1,338 seconds across the 36 passes in `QUALITY.json`
that carry `auditMetrics`.

Mutable-site density is unsettled. Counting relational operators, `&&`, `||`,
and boolean literals over the 925 lines `js/` gained in `HEAD~40..HEAD` at
`0371daf` yields 0.10 sites per added line. An earlier count that included
integer literals gave 0.34. Neither is reliable, because a regular expression
cannot separate a mutable integer literal from an array index, a bit mask, or a
number quoted in a comment. So a 1,000-line review window, the gate
`.agents/review.md` sets, carries somewhere between about 100 and 350 mutants,
and the serial runtime is an extrapolation of roughly one to four minutes.
Settle the density by writing the enumerator before committing to the estimate.

The unmeasured tail is modules with many importers, where the targeted test set
approaches the full suite.

**What prompted it.** Four defects confirmed by audit on 29 July 2026 are
relational or enumerated-value survivors this would have caught:

- `js/mondata.js:156` splits flyers on `msize <= MZ_SMALL`. Changing it to `<`
  left all 64 tests in the monsters area passing.
- The `dist2 <= BOLT_LIM * BOLT_LIM` bound in `js/monmove.js` survived the first
  fixture written for it, because that fixture tested only a distance exceeding
  both the real bound and the mutant.
- `hasAdjacentResistanceTrap()` in `js/monmove.js` owns three trap types and one
  was exercised.
- The `wtcap` encumbrance gate in `js/regen.js` decides whether a draw happens
  at all, and every case passed `wtcap = 0`.

**What it leaves unfixed.** A mistyped substitution name in a test. The
production line is correct in that case and the test's own tripwire is
disarmed, so no mutation of production code reveals it. `ROADMAP.md`, under
"Unresolved: a mistyped substitution name disables a test", records that
separately.
