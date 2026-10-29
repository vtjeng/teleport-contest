# Ordinary carrying-capacity arithmetic audit

One scoped explained negative; zero confirmed divergence causes, zero scanner
keys, zero unresolved attempted cases. This is executed arithmetic evidence,
not a gameplay recording or whole-function certification.

Base: `176bb0e38117602afab165ee6d4e363c11943fdb` (fetched Main).
C gitlink: `16ff59115315917b93185d026aeefea06db9b0f4`.
Packaging tools: the same Main commit; version 1.

## Execution

From repository root, with an initialized pinned C submodule, Node and cc:

```
node diagnostics/divergence-evidence/carrying-capacity/arithmetic/probe.mjs target
node diagnostics/divergence-evidence/carrying-capacity/arithmetic/probe.mjs control
node scripts/evidence-package.mjs validate diagnostics/divergence-evidence/carrying-capacity/arithmetic/case.json --commit HEAD
node scripts/checkpoint-preflight.mjs --commit HEAD
```

All expect exit 0. Stored target/control receipts capture actual executions,
source hashes, compiler version and elapsed seconds (not active compute).
The runner extracts complete upstream function bodies without edits, compiles
in a temporary directory, executes C and compares production JS return values
and capacity cache. It deletes only its private temporary directory.
The adapter aborts if excluded temporary property restoration executes.

Target: 11,700 weight rows across 52 attribute pairs: encoded strength
3,17,18,19,49,50,99,100,118,119,121,122,125 and constitution 3,10,18,25.
For each pair it checks integer weights immediately below/at/above capacity
multiples 1,1.5,2,2.5,3, coin quantities 0,49,50,149,150 and extra weight
-1,0,1. The generator uses the documented formula only to choose test points;
expected results are executed C outputs. The odd-capacity half boundaries use
ceil before integer +/-1, covering transitions on both sides.

Another 16,008 rows check rounddiv for every numerator -1000..1000 and divisors
-100,-7,-2,-1,1,2,7,100. Total 27,708 rows, zero differences. Six controls assert
explicit C and JS outputs for normal load, first burden, next burden and signed
half rounding. Existing `node --test scripts/hack.test.mjs`: 81/81 passed.

## Prior work and limits

Reconciled, not counted as new findings:

- `d62fd324981d3848eef6f6d3bd85900e8ab2a3ca`: weight_cap levitation order;
  existing hack tests cover its restoration/deferred-boots behavior.
- `c3edea4b5608ec9d68dee0dfe2a877f7437e3221`: active-form overexertion HP.
- `1a1d48fdde963f656a2a7fa6d541080ca095f32f`: exertion fainting/interruption.

No overlapping capacity packages were found in checked-in case manifests or
GitHub PR title search for capacity. This is an overlap check, not a guarantee
against differently named investigations.

C ACURR supplies final valid attributes, so this does not test C attribute
updates or acurr. Ordinary object weight is a supplied integer arithmetic
input; the ROCK tag only selects the ordinary branch and does not claim that
each supplied weight is obtainable for a rock. Inventory construction,
multiple ordinary objects, capacity <=1, polymorph scaling, equipment/property
branches, integer overflow, zero divisors and gameplay reachability remain
coverage gaps. No exclusion or failed-turn artifact was investigated. No
recorded-play witness was attempted because no discrepancy emerged to qualify.

Do not use this negative to filter different state branches or claim all
carrying-capacity behavior is correct. Counts are matrix fixtures, not 27,708
independent causes. Main remains the gameplay writer and integrator.
