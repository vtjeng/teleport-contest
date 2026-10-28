# Teleport agent instructions

## Temporary single-agent operating mode

Vincent directed this workflow change on 2026-10-19. It overrides the agent
topology, dispatch, and continuous-loop instructions below until Vincent
explicitly changes the mode:

- Vincent is the human project owner. dot is Vincent’s supervising assistant.
  This Codex session is the sole hands-on Teleport executor, managed by dot.
  It performs source inspection, setup, implementation, review, and validation
  sequentially in this workspace.
- Do not delegate, claim work for another agent, respawn a lead or worker, or
  run automated dispatch, polling, or dashboard-refresh loops. The historical
  role and queue procedures below remain reference material, not active
  execution routing.
- Preserve existing commits, results, queue history, and partial evidence.
  Reconcile saved ownership and any in-flight command before starting related
  work; do not duplicate or erase prior work.
- Keep the existing source-tracing, test, validation, acceptance, scoring, and
  publication requirements. Single-agent mode changes who performs the steps,
  not the evidence or correctness gates.
- For each investigated discovery lead, retain a stable source identity, check
  time, source/tool provenance, and the evidence for its disposition. A failed
  or invalid setup remains unresolved. Group recurring explained negatives for
  the separate tooling work; filter them only when a source-backed rule and
  positive controls preserve genuine differences. Recheck a disposition when
  its relevant source, configuration, or detector changes, and measure a new
  filter on fixed inputs before relying on it.
- Four separately authorized analysis-only sessions may submit evidence PRs
  under `diagnostics/divergence-evidence/<shard>/<case-id>/`, scoped to level
  generation, player commands/conduct, monster movement/combat, and
  object/inventory mechanics. Their confirmed cases and explained negatives
  are candidate handoffs, not accepted repairs. This session remains the sole
  gameplay integrator and Main writer; excluded or denied investigations stay
  excluded, and evidence PRs do not waive gameplay validation.
- On restart, resume in this single-agent mode and consult the current
  continuation state before acting. Keep this mode until Vincent explicitly
  changes it.

### Default source-repair batching (approved 2026-10-26)

- Prepare up to four independent C-backed parity fixes per candidate. A fix is
  locally ready only after its own witness and control recordings, regression
  tests, affected existing tests, and focused lint pass. Keep a separate commit
  and register identity for each fix, including corrections under their
  original repair.
- Start a ten-minute fill clock when the oldest fix becomes locally ready.
  Freeze earlier if no other qualified lead is progressing; publish a smaller
  batch rather than waiting past the clock or inventing a fix to fill it.
  Prepare the next batch from private source evidence during hosted waits, but
  do not change the frozen candidate or run overlapping full Checkpoints.
- Run one full hosted Checkpoint on the final combined SHA, import its exact
  archive and compare every fixed and admitted synthetic case with accepted
  Main. Publish no intermediate commit alone. Require exact-SHA Main Lint and
  Dashboard success before counting any member accepted, then verify the
  complete receipt and carry it into the next ordinary repair commit.
- Record batch membership, local-ready and freeze times, shared CI identity,
  publication and receipt times, and any failure or isolation work for the
  next-day assessment. Do not raise the four-fix cap without a new decision.

## Goal and authoritative sources

Build a maintainable JavaScript port of NetHack 5.0 that behaves correctly for
every valid seed, date and time, set of options, and input sequence.

- `nethack-c/upstream/` contains the original NetHack C source. Implement game
  behavior from that source.
- `nethack-c/patches/` contains changes applied to the C program for
  comparison: seed and time control, stable sorting, random-number logging,
  and terminal-screen capture. Match the behavior and output these patches
  produce.
- Select each goal as `.agents/selection.md` states. `GOALS.json` records the
  goal being integrated and the goals queued after it
  (`node scripts/goal-log.mjs --current`). Agent hierarchy and queue/worktree ownership are defined in
  `.agents/architecture.md`; `.agents/loop.md` covers Work lead's integration loop.
  `node scripts/goal-log.mjs roadmap` lists C declarations separately from
  verified functions, and every Lua program with its completion evidence.

For public-input hunger and corpse setup witnesses and their adaptation limits,
see [.agents/setup-recipes.md](.agents/setup-recipes.md).

## Recorded test sessions

The patched C program records games as session files. Each file contains the
seed, date and time, options, and player inputs, and the random-number calls,
terminal screens, and cursor positions the game produced.

The 44-session fixed development workload consists of the 33 regular files
directly under `sessions/` and the 11 files directly under `sessions/holdout/`.
The directories preserve provenance and historical score labels, and all 44
files are ordinary development inputs for default scans, mismatch selection,
checkpoint scoring, and completion evidence. List each directory directly and
keep recordings in their existing directories. The direct-listing rule is a
traversal safeguard for any future nested session directories; it keeps the
open local-holdout files in scope.

The user authorized opening the entire local holdout on 2026-09-12. The local
`sessions/holdout/` corpus is open for inspection, replay, comparison, and
discussion as part of the fixed 44-session workload. The pre-exposure
implementation is `a8890744786a48de9b20926acafa3c16a777dc67`;
`experiments/generalization/plan.md` records the diagnosis and source handoff.
Agents may inspect, replay, compare, and discuss every local-holdout session,
including through workers and review tools. The remote competition holdout
remains separate and unavailable. Use exposed holdout failures to locate
missing behavior, then implement from the C source and patches. Preserve the
recorded files and choose independent inputs for new reproductions. Do not
special-case a session or its seed, inputs, expected output, or replay position.

The current operating mode prioritizes synthetic local holdout mismatches;
`.agents/selection.md` defines selection, continuous batch preparation,
and admission at safe integration boundaries. Keep the 44-session fixed
workload as a regression check. The current `challenges/manifest.json` remains
frozen as batch `v1`; new batches use new versioned manifests and retain every
previous batch and its evaluation history. Synthetic results remain separate
from fixed-development scores and remote competition evidence. Preserve
historical Development, Local holdout, and Challenges rows and labels; the dashboard combines the historical Development
and Local holdout measures into one Development set series and keeps the
synthetic local challenge measure separate (the dashboard may retain its
historical “Synthetic local holdout” label).

`node scripts/scan-sessions.mjs --json` diagnoses the fixed 44-session
workload. `score-development.mjs` is its aggregate scorer. The separate
`score-holdout.mjs` evaluator remains available for provenance and historical
comparison, while workers leave all aggregate score recording to the
work lead.

## Read the instructions for your task

Before starting work, find every matching row below and read every listed file.
Follow all instructions in those files. A queue **task** is one execution
assignment for a worker. A deliverable's acceptance lifecycle is separate; `.agents/architecture.md` defines exploration,
implementation, and rework assignments. An **implementation task** is a C **file port**, a **Lua port**, or a
**divergence fix**. A file port implements whole C functions in its selected
range; a Lua port implements a whole `dat/*.lua` program; a divergence fix
repairs a source-traced defect. `GOALS.json` records implementation tasks as
**goals** for historical continuity. New implementation tasks define their
complete source scope before code edits start and do not require separate span
selection or closure. Existing spans and slices remain historical records. A
**challenge preparation task** in the legacy ledger represents a batch
assembled from exploration results, without admission or scoring; see the
architecture's separate execution-task and deliverable lifecycles.

Read `.agents/architecture.md` for the Coordinator, sibling Work lead,
Challenge lead and Process analyst, the single prioritized queue, three
persistent general workers, rework, and worktrees. That file also identifies
the current tooling migration boundary;
use the supported enable/migration commands without discarding legacy work.
`.agents/loop.md` owns Work lead's integration and publication procedures;
`.claude/agents/queue-worker.md` is the common worker entry point.

| Before you... | Read... |
| --- | --- |
| Coordinate agents, claim work, or change assignment type | `.agents/architecture.md` and `.claude/agents/queue-worker.md` |
| Run or resume the implementation loop | `.agents/architecture.md` and `.agents/loop.md` |
| Choose the next implementation task | `.agents/selection.md` |
| Generate or admit a new synthetic local holdout batch | `.agents/selection.md`, `.agents/validation.md`, and `.agents/scoring.md` |
| Implement game behavior | `.agents/glossary.md` and `.agents/validation.md` |
| Validate game behavior | `.agents/validation.md` |
| Propose a change to tooling or process | `.agents/proposals.md` |
| Complete an implementation task as a loop worker | `.claude/agents/implementation-worker.md` |
| Prepare a synthetic challenge batch as a loop worker | `.claude/agents/challenge-lead.md`, `.agents/selection.md`, `.agents/validation.md`, and `.agents/scoring.md` |
| Commit game implementation | `.agents/validation.md` |
| Append a `SCORE.tsv` event row or read an aggregate remote-holdout result (work lead only) | `.agents/scoring.md` |
| Record a new C run, compare C and JavaScript behavior, scan many fresh cases, calculate a score, test in a browser, or run a synthetic local challenge evaluation | `.agents/validation.md`, and `.agents/scoring.md` for recording the result |
| Decide whether a correctness review is warranted, or run or record one (work lead only) | `.agents/review.md` and the skill it names for that review |

## GitHub push authorization

The user authorizes normal pushes to `vtjeng/teleport-contest` for hosted
candidate validation and accepted publication. On 2026-10-17, Vincent reaffirmed
standing approval for normal pushes to this repository, including candidate
case files, manifests, baseline evaluations, SCORE and dashboard reports.
A new branch or commit alone does not require renewed approval. This scope
applies to `https://github.com/vtjeng/teleport-contest.git` only.
Keep unaccepted candidates on
`integration-checkpoint/*` branches; publish only accepted work to `main`.
Do not force-push or delete refs. Existing validation and publication checks
still apply.

Accepted pushes to `main` also authorize the normal Dashboard workflow's public
deployment to `https://vtjeng.com/teleport-contest/`. No separate confirmation
is needed for each deployment through that tested publication workflow.

For a standalone push, use
`git push -- https://github.com/vtjeng/teleport-contest.git <refspec>`. The trusted project
rule in `.codex/rules/teleport-push.rules` allows that exact destination after
Codex reloads its configuration. It does not allow arbitrary remotes or
publication wrappers, or override managed restrictions.

Prefer hosted validation. If automatic review rejects an authorized push,
report the exact request and denial so the user can approve it; do not work
around the denial or treat it as a lasting reason to validate locally.

## Local command execution

- Check the project documentation before using an unfamiliar command or
  interface. If it is undocumented, consult an existing example or its
  implementation. Reuse syntax already established in the session.
- For multiline JavaScript, use a heredoc with a quoted opening delimiter,
  such as `node --input-type=module <<'JS'`, and an unquoted closing `JS`
  on its own line. Quoting the opening delimiter prevents the shell from
  interpreting JavaScript backticks, dollar signs, and backslashes.
- The default shell in this workspace is zsh. Capture exit status with
  command_rc=$?; status is read-only. Preserve the command's exit code
  when displaying its logs.

### Codex execution

- When wrapping exec_command or write_stdin in functions.exec, return
  session_id, exit_code, and output. Retain the session ID and wait on that
  command with write_stdin until it exits.
- Workers send completion messages automatically. When blocked on a worker,
  use collaboration's notification-aware wait. Reserve list_agents for
  recovering ownership or diagnosing an unexpected state.

### Codex sandbox restrictions

Under this workspace's restricted permission profile, the following
commands have failed because the sandbox denied a subprocess launch
(`spawnSync … EPERM`) or a Git metadata write. Request escalation on their
first invocation while the same restrictions apply:

- `git add` and `git commit`, when the profile makes .git read-only.
- `node scripts/mismatch-queue.mjs`.
- `node scripts/scan-sessions.mjs`.
- `node scripts/goal-log.mjs` with `roadmap`, `queue-goal`,
  `record-evidence`, `close-span`, or `close-goal`.
- `node scripts/diff-fresh.mjs` and fresh-differential matrix runners
  that invoke the C recorder.

`goal-log.mjs --help` and `<command> --help` only print syntax and can run
inside the sandbox.

Keep ordinary source reads, searches, and supported focused checks
sandboxed. These exceptions do not mean that every command launching a
subprocess needs escalation.

Pass established restrictions to workers using those commands. If another
command encounters the same restriction, carry that finding forward for
the session. Recheck restrictions when the permission profile changes.

## Implementation rules

### Implement NetHack behavior from source

- Translate whole C functions or self-contained groups of related functions.
  Match branches, loops, state changes, integer arithmetic, expression order,
  random-number calls, screen updates, and points where the game waits for
  input. Preserve behavior even when it appears accidental.
- Choose JavaScript module and function names that make the corresponding C or
  Lua code easy to find. If the JavaScript structure differs substantially,
  add a comment naming the original file and function.
- Generalize behavior across inputs and derive it from the C function. Use a
  message, screen, or recorded trace to locate the upstream branch; the C
  source defines behavior for every valid input. Keep session identities,
  seeds, inputs, expected outputs, totals, random-number logs, and screens as
  test data rather than special cases.

### Port whole source units and wire their callers

1. A C file port covers every function in its selected source range, in
   definition order, including existing partial implementations. Select the
   whole function or self-contained family responsible for the current
   mismatch as `.agents/selection.md` specifies. A Lua port covers the whole
   program, including top-level statements. Acceptance does not certify source
   completeness; preserve existing certification separately from worker claims.
2. Wire each ported function or Lua program where the source calls it, in
   the same task. Match every JavaScript function and caller to its source site.
   Keep each implementation and caller aligned with a corresponding source
   site.
3. When a ported function calls a C function that is not ported yet, port the
   callee in the same task if the C uses its return value. If the C discards
   the result, record the gap and skip the call:
   `note_unported('<file.c> <function>')`. Never invent a random-number call,
   message, screen write, or state change to stand in for unported code, and
   never use the return value of `note_unported()` as data.
4. A function is pure when it makes no random-number call, writes no message
   or screen output, and changes no game state. Confirm purity by reading the
   C source, not the name. Give every pure function a test that pins its
   result to values read from the C source. An impure function's evidence is
   the recorded play that "Validate completed work" describes; it needs no
   test of its own.
5. When a ported function replaces a stub, an injected operation, or an
   `Unsupported*Error` refusal that stood in for it, delete the placeholder in
   the same task.

### Keep each game value in one place

Store each C state value in one JavaScript location. When the correspondence is
not obvious, comment which C value it represents and when it is initialized,
reset, changed, saved, restored, or discarded. Create separate JavaScript values
only when the C code treats them as separate, keep their update logic together,
and test that values the C code changes together change together in JavaScript.

### Keep each source file's port in one place

Some code in `js/` is ported from the C or Lua source. The rest stands in for
code that is not: it records a gap with `note_unported()`, or, in a file not
yet ported whole, throws an `Unsupported*Error` to refuse an unported path.
Delete both when the path is ported.

- Put everything ported from one C file into one JavaScript file with the same
  name, so the C file name tells you which JavaScript file to open.
  `monmove.c` becomes `js/monmove.js`.
- Give each function the name of the C function it comes from. If it covers
  only part of that function, keep the name and say which branches it covers
  in a comment.
- `js/unported.js` holds `note_unported()` and the `game.unported` set it
  fills; keep them there. Do not add an `Unsupported*Error` class or throw
  site. When a task ports a function that throws one, replace the throw with
  the ported branch, or with `note_unported()` where that branch's callee is
  still unported. Delete a class once its last throw site is gone.
- Do not name a file or function after a task, a goal, or the work that added
  it. Those names stop making sense once that work is done.
- Split a ported file only where the C file has separate groups of functions.
  Name each part for the functions it holds, and name the C file and functions
  in a header comment. A large file is fine; the C file is large too.

### Generate large fixed tables from source

When copying a large fixed table from C or Lua, write a script that produces
the JavaScript table deterministically. Commit the script, the generated file,
and a check that compares it with freshly generated output.

### Keep the game compatible with the scoring system

- Leave `js/isaac64.js`, `js/terminal.js`, and `js/storage.js` unchanged. The
  scorer replaces them with its official versions before scoring.
- Leave the files under `frozen/` as upstream ships them, so local scores
  equal the judge's. After `git fetch upstream`,
  `git diff --stat upstream/main -- frozen/` prints nothing.
- Capture screens with `GameDisplay.serialize()` in `js/game_display.js`,
  not `Terminal.serialize()`. The frozen method drops inverse video and
  underline from spaces before a row's first glyph
  (davidbau/teleport-contest#18).
- Submit JavaScript ES modules that run directly in Node 22+ and modern Chrome,
  with no build step. Game code must not perform filesystem or network
  operations, start other programs, load native extensions, create threads, or
  run WebAssembly.
- A session can contain more than one segment. The scorer calls
  `runSegment(input)` separately for each segment and does not pass the
  returned game object to the next call. Store game state that must survive
  between segments through `input.storage`.

## Validate completed work

A unit test establishes individual function behavior. Recorded play verifies
runtime reachability and complete results: the 44-session fixed workload, and
the recordings corpus under
`recordings/`, which the patched C program made from the recipes under
`recipes/`. `npm run checkpoint` replays both and fails when a recording stops
matching.

Every C or Lua source port identifies its entry points and runtime evidence.
The single reviewed source-led capability trial in `.agents/selection.md` is
an explicit exception: constructed-state production-path tests may support its
runtime-pending delivery, without claiming matching public play or source
certification. Ordinary assignments retain the recording requirements below.
An entry point is a command, monster action, level feature, or startup path the
range implements. An admitted synthetic case may provide evidence when its
recorded replay matches through the cited step range; a later divergence does
not invalidate that range. Cite the batch, case, segment, zero-based steps,
and C/Lua source path exercised. The worker verifies its replay prefixes and
source attribution before submission. If no matching synthetic range
covers an entry point or impure function, create an independent recipe and a
completely matching recording under `recipes/` and `recordings/`. Do not copy
challenge cases into the regression corpus. Keep blocked recipes with a comment
naming the source function that blocks their recording.

Workers submit source findings and runtime evidence as `.agents/validation.md`,
"Source completion evidence", specifies. Work lead accepts from saved CI results
under `.agents/loop.md`; it does not repeat source review or require
`goal-log.mjs record-evidence` or `close-goal`. Whole-source certification is
outside the normal loop and requires a user-requested audit. An isolated test
does not establish production wiring; a blocked recipe does not establish
entry-point completion.

When a new recipe is needed:

- Choose the smallest repeatable set of recipes that covers entry points and
  impure functions still missing matching evidence. Commit each recipe under
  `recipes/<source-file>/` and its recording under `recordings/<source-file>/`.
- Give each recipe a cheap variation, such as a different role, option, or
  object class, and cover the branches those variations reach. The
  source-pinned tests and the file's later divergences cover the branches no
  cheap recipe reaches.
- When the task has an explicit limit, run a representative case just outside
  that limit. If the current task specifies the result, add a passing test. If
  the case belongs to a later task or file port and does not yet match the C
  reference, keep it out of the passing test suite and commit its recipe under
  `recipes/<source-file>/` with a comment naming the function that blocks it.
- Choose inputs independently rather than copying values from an existing
  recorded session, and change the seed, date and time, options, character
  choices, or input sequence only when that input can affect the behavior being
  checked.

## Commit, review, and report the work

`.agents/scoring.md` states when and how to append a `SCORE.tsv` row.

Keep progress updates short; `.agents/loop.md`, "Reports", states their
required shape.

Create or update a note, report, or permanent record only when
`.agents/loop.md` or `.agents/review.md` requires it.

### Dashboard previews

For dashboard previews, update the existing private preview Site rather than
creating a new one. Use localhost if hosted preview is unavailable.

The preview is a fixed snapshot, separate from live dashboard publication:

- URL: https://teleport-dashboard-preview-oct8.jocund-rice-0231.chatgpt.site
- Site ID: `appgprj_6ac86601734c8191b034c533c692565b`

### Check out the C source in a new worktree

Git records `nethack-c/upstream` as a submodule gitlink, and `git worktree add`
leaves that path as an empty directory. The generated-data checks and the
source-pinned tests read the C source from that path, so they all fail until
you check it out. When both sets of failures appear together, the missing
checkout is the likely cause. Run this once in a new development worktree
before running source-pinned tests directly. `npm run checkpoint` initializes
its own private C checkout from the existing local repository:

```
git submodule update --init --checkout --no-fetch -- nethack-c/upstream
```

Confirm: `ls nethack-c/upstream/src/monst.c` prints that path, and `git status`
reports a clean tree with no `T nethack-c/upstream` line. Each worktree gets its
own submodule checkout, so this does not disturb other worktrees.

### Stage paths by name

Stage the paths that the current work changed:

`git add path/one path/two`

Avoid the whole-tree forms (`git add -A`, `git add --all`, `git add -u`,
`git add --update`, `git add .`); they stage in-progress changes from other
agents in the shared working tree. `.claude/settings.json` denies these and
the whole-tree reset forms (`git checkout -- .`, `git restore .`).

Before committing, inspect `git diff --cached --name-only` and confirm that
every staged path belongs to the commit.

### When to stop and ask the user

`.agents/loop.md` describes a loop that alternates implementation and review
without returning to the user, within any explicit user limit or stop request.
During an unbounded run, stop and ask only for a decision not covered by this
file or its references. Matching every fixed or synthetic screen is a milestone,
not a stop condition: generate the next synthetic batch as
`.agents/selection.md` specifies.

Report progress when the user asks and when the loop stops. Do not stop merely
to report, and do not ask for a goal that the loop selects.
