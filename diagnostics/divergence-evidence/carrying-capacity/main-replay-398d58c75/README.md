# Current-Main handoff: causes 4–8

Latest fetched Main and executed JS base: **398d58c75c1d9761c3f5ff6eb084d3f8a6259f1b**.
C oracle gitlink: **16ff59115315917b93185d026aeefea06db9b0f4**.
All nine target variants still fail; all five controls pass. None of causes4–8
is fixed at this Main. Every comparison record is identical to its historical
record, not merely another failure. See identity-checks.json and raw outputs.
These are14 saved executed-C/official-overlay Main-JS replays, not new fixtures
or fresh C runs. Historical corpus remains71 fixtures/58 matches/13 failures.

| Cause | Supported public symptom and targets | Control | Current evidence / source family |
| --- | --- | --- | --- |
| 4 | Traditional #loot numeric861 or #861 input omits live hash/digit echo in JS; C echoes it. public-traditional-count/{decline,accept,explicit-prefix} | yes-no-control (no numeric input) | All3 fail at step105; RNG/final inventory match. JS topl.js tty_yn_function numeric loop; C win/tty/topl.c:478–529. |
| 5 | At mixed-sack class prompt, m) or m$ requests a filtered menu. C filters; JS shows both arrows and coins. public-menu-request/{weapons-only,coins-only} | all-types (m alone) | Both fail at step132; selected transfers/RNG/final menus match. query_classes returns -2 unconditionally, losing filtered -3. |
| 6 | At class prompt enter :) then dismiss contents. C restarts class selection; JS consumes trailing ) and asks about arrows. public-look-restart/look-then-class | look-only (: alone) | Fails step133; RNG matches; different pending prompt, no transfer claimed. query_classes continues inner loop rather than restarting. |
| 7 | Empty class response, or absent ! then dismiss, makes C ask one-by-one about49coins. JS repeats class query. public-class-fallback/{empty,absent-dismissed} | explicit-all (A) | Fail steps130/132; RNG matches; no transfer claimed. query_classes missing empty/incomplete-selection fallback. No absent object is created. |
| 8 | Full-menu count90071992547409921 selects available900arrows in C and waits for burden confirmation. JS resets count and takes1arrow. public-large-menu-count/unsafe-prefix | safe-control (9007199254740991) | Fails step120; C2382/JS2395 RNG because JS commits a turn. selectAnyTtyMenu resets pendingCount on unsafe integer. C AppendLongDigit supports this count within installed64-bit long range. |

Causes5–7 are distinct control-flow branches in **one query_classes repair
family**, not three independent subsystems. Cause4 is traditional prompt echo;
cause8 is full-menu numeric state and is not its duplicate. These five behaviors
span three source repair families. Downstream RNG/cursor differences and multiple
fixtures are not additional causes. Causes1–3 were separately fixed/verified;
this batch does not reopen them. Main owns final overlap adjudication.

Public setup uses supported debug wishes and normal inventory commands to stage
900 ordinary arrows and49coins in a plain floor sack, Valkyrie capacity950 with
unchanged90-unit kit. Traditional/full menu options and exact input sequences
are in each original package's *.session.json. No constructed inventory chains
or private-state mutation substitute for play. Original packages retain fresh
C/JS target/control receipts, semantic observers, source bindings and exposure
limits. Wizard setup/wizweight aid acquisition and observation; no separate
non-debug acquisition replay is claimed. Cause8 needs an unusually long count.

## Exact current-base target/control commands

From this evidence branch's root, using a clean checkout at the exact Main SHA:

```sh
node diagnostics/divergence-evidence/carrying-capacity/main-replay-398d58c75/replay.mjs /tmp/capacity-main-398d58c75 targets /tmp/capacity-current-targets-NEW
node diagnostics/divergence-evidence/carrying-capacity/main-replay-398d58c75/replay.mjs /tmp/capacity-main-398d58c75 controls /tmp/capacity-current-controls-NEW
```

Expected exits on this exact base: targets1 (all9 fail), controls0 (all5 pass).
Each command saves per-fixture outputs/comparisons and a measured wall-elapsed
receipt. The groups and exact target/control fixture IDs are defined in replay.mjs
and table above. Output directories must not already exist. Original fresh-C
commands remain in each case.json; they are historical-base commands unless run
with an explicitly bound new JS checkout. Do not call their old receipts current.
After a fix, rebind the runner to the new exact Main SHA and expect both groups0;
no such future execution is claimed here.

The runner verifies clean HEAD, C gitlink, JS/frozen tree IDs and helper hashes,
then imports the scoring helpers from that exact checkout. It applies the
ordinary official frozen overlay. A sparse checkout is sufficient:

```sh
git worktree add --detach --no-checkout /tmp/capacity-main-398d58c75 398d58c75c1d9761c3f5ff6eb084d3f8a6259f1b
git -C /tmp/capacity-main-398d58c75 sparse-checkout set js frozen scripts
git -C /tmp/capacity-main-398d58c75 read-tree -mu HEAD
```

The initial full temporary checkout failed with no space left on device and
exit128; Git removed the incomplete checkout. Its absence/registration were
checked before making this sparse checkout. No replay ran from the failed
checkout. Sparse checkout and both replay groups completed; no resource blocker
remains. No approval denial occurred.

Retained C recorder source correspondence and binary hash are unchanged;
independent build attestation remains unavailable. Advancement PR111's separate
build does not attest this older binary. All exclusions remain absolute; no
consumption, rings, migration, timers, equipment-effect or combat investigation,
gameplay edit, CI dispatch, merge or formal approval occurred.
