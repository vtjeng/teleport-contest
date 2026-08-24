# Teleport agent instructions

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
  goal in progress and the goals queued after it
  (`node scripts/goal-log.mjs --current`). `ROADMAP.md` describes the group
  of game systems the current goals belong to.

## Recorded test sessions

The patched C program records games as session files. Each file contains the
seed, date and time, options, and player inputs, and the random-number calls,
terminal screens, and cursor positions the game produced.

The session files directly under `sessions/` are the development sessions.
Agents may inspect and replay them to find mismatches and detect regressions.
When a session reveals a mismatch, determine the correct behavior from the C
source and patches before changing the JavaScript port.

`sessions/holdout/` contains holdout evaluation sessions whose contents remain
hidden during development. At approved evaluation points, their combined results
show whether development-session progress generalizes to unseen sessions.

## Prevent overfitting to the holdout sessions

Agents must not inspect individual holdout sessions; their contents could
influence implementation decisions and reduce the holdout's value.

Only these commands may access `sessions/holdout/`:

- `node scripts/score-holdout.mjs --check` confirms that the directory contains
  the expected number of session files without reading their contents. It
  reports only the file count.
- `node scripts/score-holdout.mjs --goal <id>` runs the JavaScript port against
  all holdout sessions and reports only combined counts for sessions, screens,
  and random-number calls. Only the orchestrator may run it. The user authorizes
  one evaluation at each goal's close; any other evaluation needs explicit
  authorization. The script refuses a second evaluation for a goal that already
  has one, unless `--despite-prior-evaluation <reason>` records why.

Base implementation decisions on the C source and the development sessions, not
the holdout results. For routine scoring, run
`node scripts/score-development.mjs`, which scores the development sessions in a
temporary workspace and leaves `js/` unchanged.

All other access to `sessions/holdout/` is prohibited:

- Do not list the directory or open, read, search, parse, compare, summarize,
  copy, display, or reveal its files, filenames, or contents.
- Do not pass the directory, any path inside it, or any file from it to another
  agent or tool. This includes `frozen/ps_test_runner.mjs`, the Session Viewer
  in `tools/session-viewer/`, recording tools, and audit tools.
- Do not inspect temporary files, caches, continuous-integration logs, or other
  artifacts to recover results for individual holdout sessions.
- Do not change which sessions belong to the development and holdout sets
  without explicit user approval.
- These restrictions apply even when the files are accessible through the
  filesystem or public Git history.

## Read the instructions for your task

Before starting work, find every matching row below and read every listed file.
Follow all instructions in those files. A **behavior slice** is a portion of a
goal's gameplay behavior that one agent session can implement and validate. The
slice worker (`.claude/agents/slice-worker.md`) completes one slice per run.

| Before you... | Read... |
| --- | --- |
| Choose which goal or behavior slice to implement next | `.agents/selection.md` and `ROADMAP.md` |
| Implement game behavior | `ROADMAP.md`, `.agents/workflow.md`, and `.agents/validation.md` |
| Validate game behavior | `ROADMAP.md` and `.agents/validation.md` |
| Propose a change to tooling or process | `.agents/proposals.md` |
| Plan work likely to continue across agent sessions, involve more than one game system, or approach a total of 500 changed lines of game code | `.agents/implementation-checklist-template.md` |
| Continue the active work described in `.agents/implementation-checklist.json` | `.agents/implementation-checklist.json` |
| Complete one behavior slice as a loop worker | `.claude/agents/slice-worker.md` |
| Commit game implementation | `.agents/workflow.md` and `.agents/validation.md` |
| Append a `SCORE.tsv` event row or respond to a holdout result (orchestrator only) | `.agents/scoring.md` |
| Record a new C run, compare C and JavaScript behavior, scan many fresh cases, calculate a score, test in a browser, or run an authorized holdout evaluation | `.agents/validation.md`, and `.agents/scoring.md` for recording the result |
| Check how much unreviewed code has accumulated, or schedule a review (orchestrator only) | `.agents/review.md` and `QUALITY.json` |
| Run or record a correctness, clarity, simplification, or copyediting pass (orchestrator only) | `.agents/review.md` and the skill named for that pass |
| Mutation-test the lines a slice changes or a review covers, or check whether a module's tests pin its behavior | `.claude/agents/slice-worker.md` for a slice's run, `.agents/review.md` for a review's, and the header comment in `scripts/mutate-sites.mjs` |

## Implementation rules

### Implement NetHack behavior from source

- Translate whole C functions or self-contained groups of related functions.
  Match branches, loops, state changes, integer arithmetic, expression order,
  random-number calls, screen updates, and points where the game waits for
  input. Preserve behavior even when it appears accidental.
- Choose JavaScript module and function names that make the corresponding C or
  Lua code easy to find. If the JavaScript structure differs substantially,
  add a comment naming the original file and function.
- Do not special-case a recorded session or any value taken from one. This
  includes its identity, seed, date and time, input sequence, replay position,
  expected output, totals across all sessions, random-number log, and screen
  contents.
- Implement from the C function, not from observed output. A message, screen,
  or recorded trace can help locate the upstream function but does not define
  its behavior.

### Complete common gameplay first

1. Within the current goal, implement gameplay that is likely to happen often
   before rare or special cases. Leave rare or special cases for later unless
   the current goal includes them or they are required to complete the common
   case.
2. For each case you implement, choose an existing starting point in the
   running game: either a player input or a call to a game function. Choose the
   next result that the player or scoring system can observe. Implement all
   behavior between those points. Match every game-state change, random-number
   call, message, screen update, and saved value.
3. Before implementing a helper, data structure, or game mechanic, identify
   exactly where the current goal will use it in the running game and implement
   that use at the same time. If the current goal does not use the code in the
   running game, defer it; do not prepare code for future commands or
   branches. This rule applies to code that makes a random-number
   call, writes output, or changes game state; for pure functions, follow "Port
   pure functions in bulk" instead.

### Keep each game value in one place

Store each C state value in one JavaScript location. When the correspondence is
not obvious, comment which C value it represents and when it is initialized,
reset, changed, saved, restored, or discarded. Create separate JavaScript values
only when the C code treats them as separate, keep their update logic together,
and test that values the C code changes together change together in JavaScript.

### Keep each source file's port in one place

Some code in `js/` is ported from the C or Lua source. The rest prevents
unported code paths from executing and is deleted when those paths are ported.

- Put everything ported from one C file into one JavaScript file with the same
  name, so the C file name tells you which JavaScript file to open.
  `monmove.c` becomes `js/monmove.js`.
- Give each function the name of the C function it comes from. If it covers
  only part of that function, keep the name and say which branches it covers
  in a comment.
- Keep the code that stops unported paths in its own file, named for what it
  stops.
- Do not name a file or function after a behavior slice, a review window, or
  the work that added it. Those names stop making sense once that work is done.
- Split a ported file only where the C file has separate groups of functions.
  Name each part for the functions it holds, and name the C file and functions
  in a header comment. A large file is fine; the C file is large too.

### Port pure functions in bulk

A function is pure here when it makes no random-number calls, writes no
messages or screen output, and changes no game state. Porting a pure function
cannot change what already-working code does, so it does not need a caller in
the running game first.

- Port the pure functions of one C file as a batch, without waiting for a
  caller. Keep them in that file's JavaScript port, in its definition order.
- Confirm purity by reading the C source, not the name. A function that uses
  randomness, writes output, or changes state leaves the batch and follows
  "Complete common gameplay first" instead.
- Before committing a batch, show that it did not change what already worked:
  the full test suite passes and the development score matches call for call
  and screen for screen.
- Give every ported function a test that pins its result to values read from
  the C source. The score cannot check a function the game does not call yet,
  so its test is the only proof it is correct.
- When a ported function replaces a stub or placeholder that stood in for it,
  delete the placeholder in the same batch.

### Generate large fixed tables from source

When copying a large fixed table from C or Lua, write a script that produces
the JavaScript table deterministically. Commit the script, the generated file,
and a check that compares it with freshly generated output.

### Keep the game compatible with the scoring system

- Leave `js/isaac64.js`, `js/terminal.js`, and `js/storage.js` unchanged. The
  scorer replaces them with its official versions before scoring.
- Submit JavaScript ES modules that run directly in Node 22+ and modern Chrome,
  with no build step. Game code must not perform filesystem or network
  operations, start other programs, load native extensions, create threads, or
  run WebAssembly.
- A session can contain more than one segment. The scorer calls
  `runSegment(input)` separately for each segment and does not pass the
  returned game object to the next call. Store game state that must survive
  between segments through `input.storage`.

## Validate completed work

A unit test shows that one function works in isolation but not that the running
game reaches it or produces the complete result. Before calling a gameplay case
complete, record a new case with the patched C program, replay the same inputs
with the JavaScript port, and compare everything from the chosen starting point
through the chosen result.

When choosing new cases:

- Choose the smallest repeatable set of cases that covers the behavior and
  outcomes in the current goal. Save the inputs for each case.
- Cover each meaningful branch in the C code that belongs to the current goal,
  including less common branches.
- When the goal has an explicit limit, run a representative case just outside
  that limit. If the current goal specifies the result, add a passing test. If
  the case belongs to future work and does not yet match the C reference, keep
  it out of the passing test suite. Record its inputs and expected failure with
  `npm run quality -- defer`, which persists after the slice and its checklist
  are complete.
- Choose inputs independently rather than copying values from an existing
  recorded session, and change the seed, date and time, options, character
  choices, or input sequence only when that input can affect the behavior being
  checked.

## Commit, review, and report the work

`SCORE.md` summarizes development-score results for completed work. Add entries
at the points listed in `.agents/scoring.md`, "Score evidence"; you do not
need one after every commit.

Keep progress updates short; `.agents/workflow.md`, "Progress reports," states
their required shape.

Create or update a checklist, note, report, or permanent record only when
`.agents/workflow.md` or `.agents/review.md` requires it.

### Check out the C source in a new worktree

Git records `nethack-c/upstream` as a submodule gitlink, and `git worktree add`
leaves that path as an empty directory. The generated-data checks and the
source-pinned tests read the C source from that path, so they all fail until
you check it out. When both sets of failures appear together without mentioning
git or the submodule, the missing checkout is the cause. Run this once in a new
worktree, before its first `npm run checkpoint`:

```
git submodule update --init --checkout --no-fetch -- nethack-c/upstream
```

Confirm: `ls nethack-c/upstream/src/monst.c` prints that path, and `git status`
reports a clean tree with no `T nethack-c/upstream` line. Each worktree gets its
own submodule gitdir under `.git/worktrees/<name>/modules/`, so this checkout
does not disturb other worktrees (31 MiB working tree, 170 MiB gitdir).

### Stage paths by name

Stage the paths that the current work changed:

`git add path/one path/two`

Avoid the whole-tree forms (`git add -A`, `git add --all`, `git add -u`,
`git add --update`, `git add .`); they stage in-progress changes from other
agents in the shared working tree.

Before committing, inspect `git diff --cached --name-only` and confirm that
every staged path belongs to the commit.

Staging also protects work in progress: a restore keeps staged changes and
discards unstaged ones. The next section identifies when that matters.

### Make temporary edits safely

Watching a new test fail means temporarily editing a line of game code in a file
that holds the rest of an uncommitted slice, then restoring the line. Reverse
the edit the way you made it: a text edit that restores the line does not touch
anything else in the file.

Git can do it instead, with one precondition: `git checkout -- <path>` and
`git restore <path>` rewrite the whole path from the index, discarding every
edit since the last `git add`. Stage the file before the temporary edit so that
`git restore <path>` undoes only that edit.

Avoid `git checkout HEAD -- <path>`, because it rewrites the index and discards
the staged version. Avoid `git checkout -- .`, `git checkout HEAD -- .` and
`git restore .`, because they touch every file in the tree, including unrelated
work by another agent; `.claude/settings.json` denies all three.

Write the deny message in `.claude/settings.json` without an apostrophe,
because the message sits inside a single-quoted shell string and an apostrophe
breaks the quoting.

A staged version can still be recovered after `git checkout HEAD -- <path>`:
`git fsck --unreachable` lists it and `git cat-file -p <sha>` prints it. A
version that was never staged is gone.

### When to stop and ask the user

`.agents/loop.md` describes a loop that alternates implementation and review
without returning to the user. Stop and ask only for:

- a holdout evaluation outside the close of a goal;
- a change to which sessions belong to the development and holdout sets;
- a decision not covered by this file or any file it references.

Report progress when the user asks and when the loop stops. Do not stop merely
to report, and do not ask for a goal that the loop selects.
