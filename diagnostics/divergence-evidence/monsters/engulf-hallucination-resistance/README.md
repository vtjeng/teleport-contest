# Acid engulf ignores hallucination resistance

A native ochre jelly's acid engulf uses the hallucination-only sentence in JS
while Grayswandir is suppressing an existing hallucination timeout. C uses the
ordinary burning-slime sentence. This is a raw-property versus effective-property
predicate issue, separate from the location-prefix family.

Target public wizard inputs wish for Grayswandir and a hallucination potion,
drink the potion first, then wield the sword, create a hostile ochre jelly and
wait. C visibly reports hallucination starting and ending as the sword is wielded.
At step 137 C says `You are covered in slime!  It burns!`; JS says
`Ouch!  You've been slimed!`. All 2,874 RNG calls and 138 cursors match; the first
screen mismatch is this final message. The recording stops before death handling.

Control wields the sword before drinking. C `peffect_hallucination` then returns
without setting the timeout. Both engines print the ordinary acid message and
fully match: 2,862 RNG calls, 128 screens/cursors. Counts differ between recipes;
only the within-recipe C/JS comparisons claim matching RNG. No fabricated state,
modified attack, replacement resistance predicate or object-effect fix is used.

C `Hallucination` is `HHallucination && !Halluc_resistance` (youprop.h:120).
`gulpmu` uses it at mhitu.c:1463. JS mhitu.js:2256 reads raw HALLUC properties and
uses that boolean at line 2477. Wielding Grayswandir suppresses the existing timeout;
these fixtures do not claim that artifact or potion implementation is defective.

From repository base `d1d8ac170b75dca71abe29819b5daa9972301221`, with this directory:

```
node diagnostics/divergence-evidence/monsters/engulf-hallucination-resistance/replay.mjs target
node diagnostics/divergence-evidence/monsters/engulf-hallucination-resistance/replay.mjs control
node --test scripts/test-suites.test.mjs
```

Target exits 1 before repair; control exits 0. Both should exit 0 after repair.
The ordinary `.mjs` runner is outside default CI. It uses the repository's scoring
workspace and frozen overlays, with no external fixture or network dependency.
Versioned `case.json` hashes stored fixture bytes, direct tooling/source inputs,
and actual clean-base execution receipts; post-fix validation remains planned.
Packaging validation is not gameplay acceptance.

The small gzip files are complete native C recordings, with input recipes also
provided. `observations.json` pins the recorder binary and records setup misses
and the longer precursor. The original naming-prompt miss is not a negative.
The C oracle is the pinned patched recorder, not an extracted/stubbed function.

Scope: one supported acid-engulf path with suppression established through public
input. No proof of all hallucination checks, all artifact effects, or all engulf
behavior. Manual source-led origin, no canonical scanner key or suppression.
Ten prefix-map sites and four prior hypotheses remain unresolved and separate.
No excluded investigation or denied-turn artifact was used.
