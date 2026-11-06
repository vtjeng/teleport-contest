# Advancement integration beyond the restricted oracle

JS base `9cd25dd87fe2df24bbf04ea3897aaa725b9758ea`; C gitlink
`16ff59115315917b93185d026aeefea06db9b0f4`.

Five final public-input C/JS recordings match exactly, including every RNG call,
screen cell/attribute, cursor and animation frame. Zero candidate semantic causes;
one scoped negative package. These are five fixtures, not five causes.

| Row | Executed path | RNG calls | Screens | Exit |
| --- | --- | ---: | ---: | ---: |
| below (control) | Tourist receives 19 sightseeing XP; remains level 1 | 11144 | 13 | 0 |
| equal | Tourist receives 20 XP; incremental level 2 at equality | 6049 | 13 | 0 |
| above | Tourist receives 21 XP; level 2 retains 21 XP | 6260 | 13 | 0 |
| skill-spent-control | Knight spends all five slots; long sword Expert | 2493 | 53 | 0 |
| skill-refund | Knight gain/loss changes speed and refunds a spent skill | 2496 | 129 | 0 |

C and JS have no animation frames in these rows. `verify.mjs` recomputes strict
parity from archived outputs and independently asserts the reached XP statuses,
welcome messages, skill ranks, speed gain/loss messages and slot counts.
`verification.txt` gives the skill menu's zero-based steps: 52 shows zero slots,
90 shows one, and 128 shows two after long sword drops from Expert to Skilled.

## Runtime qualification

This uses the existing isolated recorder plus frozen JS scoring overlay, with
ordinary non-polymorphed characters and no injected internal state. Debug
`wizlevelport` is a zero-turn setup: it transports the Tourist to a new depth
19/20/21, where production goto_level awards level_difficulty() sightseeing XP
and invokes more_experienced/newexplevel/pluslvl. It does not call pluslvl(FALSE)
to manufacture the XP transition. The depth is debug-assisted; a normal walking
history remains unqualified. No monster combat/drain, item effect, death or
status-expiry path is used as setup. Normal startup generation still occurs.

For the skill path, public #levelchange first raises a Knight to level 6 (five
slots). #enhance's supported wizard option advances long sword Basic→Skilled
(cost 2)→Expert (cost 3). #enhance without that option exposes zero remaining
slots. Raising to 7 grants speed and one slot. Dropping to 5 removes speed while
consuming that slot, then rolls back the last skill advancement and refunds the
two slots left after paying for the second level loss. Real adjabil and weapon
skill code run on both sides; there are no stubs. This is debug-assisted practice
setup, not evidence about how combat earns skill practice. No skill advancement
is performed while slots are negative.

The concrete C/JS message/resource/skill-menu sequence is tested; hidden fields
which do not affect those observations are not fully certified. The preinstalled
C binary still lacks a retained build attestation. Its digest and the matching
adjacent exper.c/attrib.c/weapon.c/do.c/wizcmds.c source hashes are recorded in
environment.json. We did not rebuild or strengthen that historical provenance.

## Out-of-domain control blocker

An exploratory Wizard→D:20 control used seed 73160291. It exits 1 with matching
screens/cursors but the first RNG transcript mismatch at call 3345, input step 4
(zero-based newline): C `rn2(8)=4`, caller `nh.random src=nhlib.lua:10
parent=lua(themerms.lua:854)`, versus JS `rnd(8)=5`. Both RNG lengths are 8005.
Artifacts are under wizard-control-blocker/. Its cause is **unresolved and
out-of-scope** (level generation owned by Levels); no advancement defect or
semantic equivalence is inferred. It was not retried or normalized away.
The successful below-threshold Tourist is the scoped advancement control.

This exploratory observation predates the final per-recipe runner; it is not
promoted into a versioned command receipt with a retroactive runner hash. The
exact original recipe and C/JS outputs are retained for the owning session.
The helper refactor also had one syntax-error invocation before any recorder
started; it was fixed before final runs. Neither event counts as a negative.

## Prior work, reproduction and limits

PR #99 establishes static tables; #106 establishes initial full-resource debug
roundtrips; #109 supplies restricted compiled arithmetic evidence. This package
adds executed incremental sightseeing and spent-skill refund integration.
The old `8585e9745` level-one XP repair is preserved: the scope does not reopen
its already-fixed cause. The earlier parked shared timer-engine trial is not
resolved by these zero-turn debug paths.

Run from repository root with the existing supported recorder installed:

```
node diagnostics/divergence-evidence/hero-advancement/integration-20261029/run.mjs below
node diagnostics/divergence-evidence/hero-advancement/integration-20261029/run.mjs equal
node diagnostics/divergence-evidence/hero-advancement/integration-20261029/run.mjs above
node diagnostics/divergence-evidence/hero-advancement/integration-20261029/run.mjs skill-spent-control
node diagnostics/divergence-evidence/hero-advancement/integration-20261029/run.mjs skill-refund
node diagnostics/divergence-evidence/hero-advancement/integration-20261029/verify.mjs
```

All expect exit 0. Fresh output directories are exclusive; don't reuse archived
invocation paths. Compressed outputs preserve original bytes on decompression;
manifest hashes cover stored gzip bytes. Receipts cover actual final commands,
not the preliminary setup probes. Elapsed windows from recipe capture to saved
result are wall time and exclude setup/reconciliation/packaging/publication.

Confirmed new causes: 0. Scoped negatives: five final paths. Duplicate findings:
none resubmitted. Unresolved observations: one out-of-domain RNG mismatch above.
Coverage gaps/next frontier are tracked in ../COVERAGE.md. No exhaustive claim,
gameplay change, CI dispatch, scoring, merge or formal approval. Main remains
sole gameplay writer and integrator.
