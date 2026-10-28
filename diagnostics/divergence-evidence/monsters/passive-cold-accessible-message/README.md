# Passive cold combat drops accessibility coordinates

**Confirmed divergence; ready for implementation.** Case ID
`monsters-passive-cold-accessible-message`, manual/unbound. This is a message and
cursor discrepancy, not a demonstrated damage or RNG difference.

A public wizard recipe creates a tame red dragon and hostile blue jelly, then
sends eight wait/input groups. With `accessiblemsg`, the jelly's passive cold response yields:

- C step 66: `(west): The red dragon is suddenly very cold!--More--`
- JS step 66: `The red dragon is suddenly very cold!--More--`

The full target has 2,750 matching RNG calls and 87 screens/cursors. Step 66 is
the first screen and cursor mismatch. The control changes **only**
`accessiblemsg` to `!accessiblemsg` and matches all RNG, screens, and cursors.
Neither recording has animation frames. Both recordings are complete, untrimmed
outputs from their short recipes; no terminal or RNG data was transformed.

## Pickup commands

From clean base `034443e9246cb9fc19dfba9ba2d9c2893132e84c` plus this directory:

```sh
# Current-base evidence characterization: all three tests pass.
EXPECT_CURRENT_GAP=1 node --test diagnostics/divergence-evidence/monsters/passive-cold-accessible-message/*.test.mjs

# Regression expectation: target fails now at screen 66, control passes.
node --test diagnostics/divergence-evidence/monsters/passive-cold-accessible-message/replay.test.mjs

# Small native-combat API regression: fails now for the missing <57,2> prefix.
node --test diagnostics/divergence-evidence/monsters/passive-cold-accessible-message/probe.test.mjs
```

After repair run without `EXPECT_CURRENT_GAP`; both regressions should pass.
Tests deliberately remain outside default CI. Replay needs the repository's
normal Node dependencies; it does not need to rebuild C. For a fresh C recording,
use the existing recorder setup and a new private output directory:

```sh
node diagnostics/divergence-evidence/monsters/passive-cold-accessible-message/record.mjs target /absolute/new-private-target
node diagnostics/divergence-evidence/monsters/passive-cold-accessible-message/record.mjs control /absolute/new-private-control
```

## Cause and fixture validity

C `src/mhitm.c:1397-1400` calls `pline_mon(magr, ...)` for the nonresistant cold
passive line. `src/pline.c:138-189` associates the attacking monster's coordinates
with the message and inserts the accessibility prefix. JS `js/mhitm.js:1876-1880`
calls its plain message operation without that coordinate association. Existing
`js/pline.js:52` and `js/startup_a11y.js:295` expose the relevant message owners.
This handoff changes no gameplay code.

The public pair establishes shipped reachability through ordinary pet combat.
The small test independently calls real `mattackm` using unchanged native kitten
and blue-jelly attack arrays on visible adjacent squares, with the normal caller's
`gb.bhitpos` contract supplied. The kitten misses; the real passive response still
fires, consumes `d(5,6)` and `rn2(3)`, and removes five HP. Target/control differ
only in accessibility mode, use identical valid bounded rolls, and each ends at
11 HP. No passive helper or combat guard is bypassed. Map coordinate mode is set
through initialized state in this API test; the public recordings use the default
compass mode with supported `accessiblemsg` configuration.

C oracle: upstream gitlink `16ff59115315917b93185d026aeefea06db9b0f4`, repository
recorder patches/config at the pinned JS base, binary SHA and per-source hashes
in `case.json`. Recorder timezone is America/New_York; `recorderIsDst` is retained.
The record contains only the recipe and game observations, no recorder logs or
private paths. Initial full-moon messages and More prompts are dismissed with the recipe's spaces.
Some extra spaces produce harmless `Unknown command ' '.` feedback in both
engines; wait/input groups are not a claim of eight elapsed game turns.

Earlier private experiments are not promoted: a minotaur attempt used the invalid
option spelling `getpos_coords:map` and did not establish the passive branch; it
is not a negative. A longer valid dragon pair had the same first discrepancy and
3,006 matching RNG calls; the shorter independently recorded pair supersedes it
for handoff. A temporary packaging omission of the control file was corrected
before clean-checkout validation.

Adjacent passive fire/electric/stun and cold-resistance feedback use similar
source patterns but are **not qualified cases in this PR**. No broader combat
or accessibility equivalence is claimed.
