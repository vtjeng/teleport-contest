# Proposed changes

Costed changes to tooling or process that nobody has scheduled. `ROADMAP.md`
holds open game behavior; nothing here is selectable work.

Each entry states what it would change, what it costs, what prompted it, and
what it leaves unfixed. Delete an entry when the change lands or a decision
retires it.

## Report a ported function that no production code calls

**What it changes.** A check would list every function exported from `js/` that
no other `js/` module calls, and flag the subset whose name also appears as an
injected operation. `AGENTS.md`, "Port pure functions in bulk", already requires
that "when a ported function replaces an injected operation that stood in for
it, delete the injection in the same batch"; nothing detects a batch that
skipped it.

**Scope.** One script beside `scripts/check-namespace-members.mjs`, which
already parses `js/` imports for a related purpose, plus its test and a line in
the checkpoint summary. Informational, in the pattern of the sweep-candidate
line; it prints and does not block, because a pure-function batch is allowed to
land ahead of its caller and only becomes a defect once an injection stands in
for the same behavior.

**What prompted it.** `3d33c40` on 24 July 2026 ported `artifact.c
touch_artifact()`'s monster branch into `js/artifacts.js` with tests, and
deleted none of the five injections that stand in for it
(`js/monmove.js postmov()`, four in `js/unported_monster_actions.js`). It went
unnoticed for thirteen days. On 6 August the `monsters` sweep spent most of one
slice rediscovering it: two agents in succession reasoned about a capability
the port already had, and the closing entry
`touch-artifact-ported-but-unwired` exists only to record work that the
original batch was required to finish.

**Cost.** Small. Resolving which module a symbol comes from needs the import
block parsed rather than grepped, which `check-namespace-members.mjs` already
does.

**What it leaves unfixed.** It cannot tell a batch that is correctly ahead of
its caller from one that is overdue, so the flagged subset is a reading list
rather than a verdict. It also says nothing about an injection that stands in
for a function nobody has ported yet, which is the ordinary and correct state.

## Let a review pass scope an audit-fix tail on its own

**What it changes.** `scripts/audit-worktree.mjs prepare` would accept a range
whose head is behind the active implementation checklist's `Commit checked`,
when the range holds no slice of its own.

**Scope.** One option, or a relaxation of the existing equality test, plus the
reason recorded in the manifest so a later reader knows the checklist was
deliberately ahead of the range.

**What prompted it.** Recording the `b7cc9a3..b51b1d2` correctness pass failed:
`npm run quality` refused to advance the `world-effects` and `monsters`
frontiers, because `bf96cda..b7cc9a3` is not empty. It holds `8de4b76`, the
audit-fix commit for the *previous* pass, whose twenty-five production lines
across `js/mon.js`, `js/monmove.js` and `js/trap_effects.js` no pass had read.
The refusal was correct and caught a real gap. But the natural repair -- a light
delta pass over `bf96cda..b7cc9a3` alone -- could not be prepared, because
`prepare` requires the checklist to cover the range head and the checklist
covered `b51b1d2`. `--no-checklist-reason` is rejected whenever a checklist
exists, so there is no way to say "this range predates the checklist".

The range was widened to `bf96cda..21cea25` instead, which works and is
arguably better -- it audits the applied fixes too, and a fix is not audited by
the pass that proposed it. But the widening was forced. It also mixes an
unaudited tail with a range whose findings must not be re-reported,
which the prompt then has to spend three paragraphs fencing off.

**Cost.** Small: the check already parses both SHAs. The judgement of whether a
range holds a slice is the author's, and the option records that judgement.

**What it leaves unfixed.** Nothing forces an audit-fix tail to be reviewed
before the next slice's pass, so the debt can still accumulate silently until
`record-review` refuses. A check that compares each area's frontier against the
first production commit after it would surface that earlier, and is a separate
proposal.

## Print the remaining unenforced advisories

**What it changes.** Five checks that turn prose rules into printed numbers
(`node scripts/goal-log.mjs calibration`, a sixth, landed on 2 August 2026):

- `scripts/phase-log.mjs --summary --goal <id>` prints elapsed wall time
  since the last slice close that improved the development score, so the
  six-hour goal budget in `.agents/loop.md` becomes a printed figure.
- `npm run quality` warns when dirty-tree changed lines exceed 500 while no
  `.agents/implementation-checklist.json` exists, the checklist-creation
  trigger in `.agents/implementation-checklist-template.md`.
- `npm run checkpoint` runs `npm run quality -- slice-mutants` over new
  commits as an informational line, so a missing `Mutants:` trailer
  surfaces without anyone invoking the check by hand.
- A turn-end warning prints `git log --oneline origin/main..HEAD` when
  commits sit unpushed, the push rule in `.agents/workflow.md`,
  "Pushing and CI".
- `scripts/score-holdout.mjs` takes a required `--goal <id>` and refuses a
  second evaluation for the same goal without a recorded override, the
  one-evaluation-per-goal rule in `AGENTS.md`. This one needs a decision
  on where the per-goal record lives before implementation.

**Scope.** Each item is a small addition to an existing script and its test
file; the first adds one subcommand.

**What prompted it.** A survey of the instruction documents for rules that
present as limits or cadences while nothing detects a violation. Two
siblings landed the same day it ran: the review-gate refusal in
`score-holdout.mjs` and the review-gate line in the checkpoint summary.

**Cost.** Small per item. None blocks; each prints, in the pattern of the
sweep-candidate line.

**What it leaves unfixed.** Compliance stays voluntary: these make skipping
a rule visible, and the reader still decides. Rules the same survey judged
unenforceable by construction, such as report word caps, are outside this
entry; rewording fixes them.

## Let `npm run checkpoint` write its own log

**What it changes.** `scripts/checkpoint-checks.mjs` would capture each
check's output into a run log itself, keep streaming to the terminal when
stdout is a TTY, and print the per-check summary, each failing test's
location, and the log path. The redirect-and-tail recipe in
`.agents/validation.md`, "Routine validation", then shrinks to the command
and the printed log path, and the `--test-reporter=dot` warning moves to a
code comment beside the reporter choice.

**Scope.** Output capture in `runCheckpointChecks()`, the recipe cut in
`.agents/validation.md`, and the `scripts/checkpoint-checks.test.mjs`
assertion that explains why detail rides the summary line, which moves with
the recipe.

**What prompted it.** The reading audit of the agent briefs on 2 August
2026: every reader of `.agents/validation.md` pays about 20 lines of
redirect recipe, byte counts included, for a mechanic the script can
perform itself.

**Cost.** Small in code but it changes the one command every agent runs.
Capturing a child's stdout replaces `stdio: 'inherit'`, which streamed live
progress; the TTY case has to keep streaming, and the summary must stay at
the end of the log so a tail read stays valid while agents migrate.

**What it leaves unfixed.** The checkpoint's output volume: the log keeps
its 14,491 lines on disk, and an agent that opens it whole still drowns.

## Give the session scan a notion of partial command support

**What it changes.** `scripts/scan-sessions.mjs` would model a command the port
dispatches but refuses partway through, so such a stop earns a row in the
behavior table and can be aimed at with `--ahead=`.

**Scope.** The model that resolves recorded bytes to command names and tests
them against the port's supported-command set, plus the reconciliation section
that reports the disagreement, plus `.agents/selection.md:132-137`.

**What prompted it.** Slice 1 of `experience-level-gain`, at `984da15`, produced
the first partially supported command. It added `levelchange` to the supported
set while `adjabil()`'s gain branch stays refused, so the model names each
session's next unmet *command* while the port stops mid-command. Two
consequences, each measured:

- The behavior table carries no row for the `adjabil()` boundary, so its
  `unlocks` reads 0 and the boundary never reaches the ranking. Only the
  observed boundary census names it.
- `--ahead` cannot be aimed at it. The boundary string returns "No session stops
  first on ...", and the modeled name measures the wrong stretch:
  `--ahead=takeoff` prints `seed0361` steps 40..43, where the stretch that
  slice opens is 22..40. The 66-step ceiling for slice 2 had to be computed by
  hand from the
  reconciliation section's paired indices.

`.agents/selection.md:133-137` calls a stop with no modeled behavior at the
refused step "the serious case", says the model believes the port supports what
the port just refused, and asserts "That count is 0 today." Running
`node scripts/scan-sessions.mjs` at `984da15` prints five `UNRECONCILED` rows,
one per session in this goal, so the count is 5. The reason is benign and the
port is correct -- each stop is the welcome screen for the level whose innate
entry `adjabil()` refuses -- but the document's sentence and the scan's model
both need the third state.

**Cost.** Moderate, and it touches the instrument selection depends on. The
document's repair is a sentence; the model's is not.

**What it leaves unfixed.** The ranking still cannot put a figure on a boundary
that sits inside a supported command until the model can name it, so a goal like
this one is nominated by the observed census alone.

## Check that a deferral cites a symbol its file defines

**What it changes.** `npm run quality` would extract each open deferral's
`js/<file>.js <symbol>()` pairs from its `detail`, read the file, and print
every pair whose file does not define that symbol.

**Scope.** A regex over each record's `detail` and one informational line beside
the sweep-candidate line. It prints, rather than blocking: a record may name a
symbol the file has yet to define.

**What prompted it.** Three entries went stale on 11 August 2026.
`wlt-mkmaze-owner-comment` closed because the file had been corrected on 3
August and the entry never was. A correctness pass falsified
`feel-location-ported-twice`'s "strict subset" claim. And `earth_sense()'s
notice is refused rather than printed` cites `js/mklev.js place_lregion()`,
which is defined at `js/mkmaze.js:92`.

**The measurement.** This entry first proposed comparing an entry's `area` label
against the areas `areas[].paths` assign to the files its record cites. At
`4930664`, over 92 open entries, that check flags 15 of the 59 citing a path,
and most of the 15 are sound: `pick-lock-lookalike-pile-top-has-no-fresh-case`
is filed under `commands` and cites `js/display.js`, where the helper lives. The
symbol check examines 47 pairs and flags 2 real issues.

The two find different faults. The area check finds a correct citation under a
wrong label, which is what mis-schedules a sweep. The symbol check finds a wrong
citation, which misleads a reader. Neither finds the other's fault:
`cloneObjects()` does appear in `js/unported_monster_actions.js`, so the symbol
check passes both entries whose `startup` label prompted this proposal.

**What has landed.** `refile-deferral --id <id> --area <id> --note <text>` at
`ea2494d`, the second half of this entry. Before it, `assign` mapped a file to an
area and `defer --area` set a label at creation, so a wrong label needed a hand
edit of `QUALITY.json`.

**What it leaves unfixed.** Two findings from 47 pairs is a small sample, and
both surfaced on one day. The check reads only entries that cite a symbol; 33 of
the 92 open entries cite no `js/` path. Dropping the area check gives up the
one failure with a demonstrated cost: a mislabel once scheduled a sweep measured
at 0 recorded steps ahead of a boundary goal measured at 21.

## Report the screen serializer's dropped leading-space attributes upstream

**What it changes.** An issue opened on `github.com/davidbau/teleport-contest`
would report that `serialize()` in `frozen/terminal.js` writes a row's leading
spaces without their attributes, so a menu heading the port draws correctly
decodes to the wrong grid. No file in this repository changes. Both places the
fix could go belong to the judge, and the issue would name both:

- `frozen/terminal.js:679-684` chooses a row's first column by scanning for the
  first cell whose character is not a space, then emits a cursor-forward jump
  when that column exceeds 4 and literal padding otherwise. Both arms run ahead
  of the row's first SGR sequence, so a leading run of attributed spaces decodes
  as default-attribute spaces. Selecting the first cell that is not a
  default-attribute space would preserve the run, which is what C records:
  `\x1b[20C\x1b[7m    Name` jumps to the start of the highlighted run and prints
  its spaces literally. `screensVisuallyEqual()` in `frozen/ps_test_runner.mjs`
  compares the two sides after decoding each to a 24x80 grid, so this changes
  only what a contestant's bytes decode to, and every recorded C screen stays
  valid. It would also expose ports that omit the highlighting: cells the
  serializer erases today would begin to differ, so screens that pass now could
  fail.
- `frozen/screen-decode.mjs:144` sets `SPACE_VISIBLE_ATTRS = 0x1 | 0x4`, so
  `diffCell()` counts inverse and underline on a space and reports `attr`.
  Removing inverse from that mask would end the mismatch without touching the
  serializer, at the price of a heading drawn with no highlight at all scoring
  as correct. `docs/API.md:288-291` presents the current mask as deliberate,
  "Inverse-video and underline DO matter on a space", and `docs/API.md:272-276`
  promises that two screens match when "every cell renders the same pixels,
  regardless of how the underlying byte sequence got there". The serializer is
  the end that departs from that published contract. The issue would say so and
  leave the choice to the organizers.

**Scope.** One issue holding the reproduction, the two candidate fix sites, and
the measured impact. `AGENTS.md`, "When to stop and ask the user", requires the
user's authorization before anything is published outside this repository, so
this entry stops at the proposal.

**What prompted it.** The open deferral `an indented inverse menu heading cannot
match`, area `display`, records the ceiling the port has to live with. It
settles nothing about whether the organizers should hear of it. Both arms
reproduce against the frozen files alone, with no game code loaded:

```
C recorded : "\x1b[20C\x1b[7m    Name\x1b[0m"     spell menu, jump arm
JS emitted : "\x1b[24C\x1b[7mName\x1b[0m"
  cols 20-23  attr  C={ch:" ", attr:1}  JS={ch:" ", attr:0}   4 cells differ

C recorded : "\x1b[7m General\x1b[0m"             options menu, padding arm
JS emitted : " \x1b[7mGeneral\x1b[0m"
  col 0       attr  C={ch:" ", attr:1}  JS={ch:" ", attr:0}   1 cell differs
```

Twelve recorded screens across nine development sessions carry the spell menu's
heading, one to three per session, counted by matching `\x1b[<n>C\x1b[7m` before
a run of spaces over `sessions/`. `seed0200-monk-north-search` holds one of them
among 40 steps, so it caps at 39 however correct the rest of the port is. The
options-menu heading, which `options.c:8584` formats as `" %-30s "`, cost one
earlier goal 15 of its 28 forecast steps, measured during the
`options-simple-menu` goal and recorded in that deferral's note.

**Cost.** Small to write. Two checks come first: whether someone has reported
this already, and whether the issue tracker is the channel the organizers want.
`README.md:467` answers the second for contestants in general, directing
questions to an issue on the repository it tells readers to fork,
`davidbau/teleport-contest` at `README.md:34`, which is also this repository's
`upstream` remote.

**What it leaves unfixed.** An accepted issue changes no session already
recorded, and this port's ceiling stands until a corrected scorer runs. Neither
fix is backward-compatible with scores already published: `README.md:460-463`
states that public scores recompute on every push and held-out scores when the
two-hour cron fires, so a serializer fix moves every row whose port omits the
highlighting, and a comparator fix moves every row whose port draws it. Nothing
here weighs a scoring change against a corpus recorded under the current
behavior, which is the organizers' call.

