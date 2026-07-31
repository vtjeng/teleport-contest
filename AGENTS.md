# Teleport agent instructions

## Goal and authoritative sources

Build a maintainable JavaScript port of NetHack 5.0 that behaves correctly for
every valid seed, date and time, set of options, and input sequence.

- `nethack-c/upstream/` contains the original NetHack C source. Implement game
  behavior from that source.
- `nethack-c/patches/` contains changes applied to the C program used for
  comparison. These changes control the seed and time, stabilize sorting, log
  random-number calls, and capture terminal screens. Match the behavior and
  output produced after these changes are applied.
- Complete the milestones in the order listed in `ROADMAP.md`.

## Recorded test sessions

The patched C program records games as session files. Each file contains the
seed, date and time, options, and player inputs, along with the random-number
calls, terminal screens, and cursor positions produced as the game runs.

The session files stored directly under `sessions/` are the development
sessions. Agents may inspect and replay them during development to find
mismatches and detect regressions. When a session reveals a mismatch, determine
the correct behavior from the C source and patches before changing the
JavaScript port.

`sessions/holdout/` contains a fixed set of holdout evaluation sessions. Their
contents remain hidden during development. At approved milestones, their
combined results show whether progress on the development sessions carries
over to previously unseen sessions.

## Prevent overfitting to the holdout sessions

Agents must not inspect individual holdout sessions because their contents
could influence implementation decisions and make the holdout results less
meaningful.

Only these commands may access `sessions/holdout/`:

- `node scripts/score-holdout.mjs --check` confirms that the directory contains
  the expected number of session files without reading their contents. It
  reports only the file count.
- `node scripts/score-holdout.mjs` runs the JavaScript port against all holdout
  sessions and compares its screens and random-number calls with the recorded C
  results. It reports only combined counts for sessions, screens, and
  random-number calls. Only the orchestrator may run it. The user authorizes one
  evaluation at the close of each goal in advance; an evaluation at any other
  time needs explicit authorization for that specific run.

The holdout result measures whether completed work generalizes to unseen
sessions. In contrast, implementation decisions come from the C source and
evidence gathered with the development sessions.

For routine scoring, run `node scripts/score-development.mjs`. It scores the
development sessions in a temporary workspace and leaves the judge-supplied
files under `js/` unchanged.

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
Follow all instructions in those files.

| Before you... | Read... |
| --- | --- |
| Choose which goal or behavior slice to implement next | `.agents/selection.md` and `ROADMAP.md` |
| Implement game behavior | `ROADMAP.md`, `.agents/workflow.md`, `.agents/validation.md`, and `QUALITY.json` |
| Validate game behavior | `ROADMAP.md` and `.agents/validation.md` |
| Propose a change to tooling or process | `.agents/proposals.md` |
| Plan work likely to continue across agent sessions, involve more than one game system, or approach a total of 500 changed lines of game code | `.agents/workflow.md` and `.agents/implementation-checklist-template.md` |
| Continue the active work described in `.agents/implementation-checklist.md` | `.agents/implementation-checklist.md` |
| Complete one behavior slice as a loop worker | `.claude/agents/slice-worker.md` |
| Commit game implementation or record a development score | `.agents/workflow.md` and `.agents/validation.md` |
| Record a new C run, compare C and JavaScript behavior, scan many fresh cases, calculate a score, test in a browser, or run an authorized holdout evaluation | `.agents/validation.md` |
| Check how much unreviewed code has accumulated, or schedule a review (orchestrator only) | `.agents/review.md` and `QUALITY.json`, which lists the tracked parts of the code, review limits, and completed correctness and simplification passes |
| Run or record a correctness, clarity, simplification, or copyediting pass (orchestrator only) | `.agents/review.md` and the skill named for that pass |
| Mutation-test the lines a review covers, or check whether a module's tests pin its behavior | `.agents/review.md` and the header comment in `scripts/mutate-sites.mjs` |

## Implementation rules

### Implement NetHack behavior from source

- Translate whole C functions or self-contained groups of related functions.
  Match the C code's branches, loops, state changes, integer arithmetic,
  expression order, random-number calls, screen updates, and points where the
  game waits for input. Preserve behavior even when it appears accidental.
- Choose JavaScript module and function names that make the corresponding C or
  Lua code easy to find. If the JavaScript structure differs substantially,
  add a comment naming the original file and function.
- Do not special-case a recorded session or any value taken from one. This
  includes its identity, seed, date and time, input sequence, replay position,
  expected output, totals across all sessions, random-number log, and screen
  contents.
- Implement from the C function, never from observed output. A message the
  program prints, a screen it draws, or a recorded trace points at the upstream
  owner; it does not specify it. Find the function that produces the output and
  translate that.

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
   exactly where the current goal will use it in the running game. Implement
   that use at the same time. If the current goal does not use the code in the
   running game, defer it. Do not prepare code for future commands or branches.
   This applies to code that makes a random-number call, writes output, or
   changes game state. Pure functions follow "Port pure functions in bulk".

### Keep each game value in one place

Store each C state value in one JavaScript location. If the connection is not
obvious, explain which C value it represents and when the JavaScript value is
initialized, reset, changed, saved, restored, or discarded. Create separate
JavaScript values only when the C code treats them as separate. Keep their
update logic together. If the C code changes separate values together, test
that the JavaScript does the same.

### Keep each source file's port in one place

Some code in `js/` is ported from the C or Lua source. The rest only stops
paths that are not ported yet, and is deleted when they are.

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

A function is pure here when it makes no random-number call, writes no message
or screen output, and changes no game state. Porting one cannot change what
already-working code does, so it does not need a live consumer first.

- Port the pure functions of one C file as a batch, without waiting for a
  caller. Keep them in that file's JavaScript port, in its definition order.
- Confirm purity by reading the C source, not by judging the name. A function
  that turns out to use randomness, write output, or change state leaves the
  batch and follows "Complete common gameplay first" instead.
- Before committing a batch, show that it changed nothing that already worked:
  the full test suite passes and the development score is identical, call for
  call and screen for screen.
- Give every ported function a test that pins its result to values read from
  the C source. The score cannot check a function the game does not call yet,
  so its test is the only proof it is correct.
- When a ported function replaces an injected operation that stood in for it,
  delete the injection in the same batch.

### Generate large fixed tables from source

When copying a large fixed table from C or Lua, write a script that produces
the JavaScript table the same way every time. Commit the script, the generated
JavaScript file, and a check that compares the committed JavaScript file with
freshly generated output.

### Keep the game compatible with the scoring system

- Leave `js/isaac64.js`, `js/terminal.js`, and `js/storage.js` unchanged. The
  judge replaces them with its official versions before scoring.
- Submit JavaScript ES modules that run directly in Node 22 or later and modern
  Chrome, with no build step during scoring or runtime. Game code must not
  perform runtime filesystem or network operations, start other programs, load
  native extensions, create threads, or run WebAssembly.
- A session can contain more than one segment. The scorer calls
  `runSegment(input)` separately for each segment and does not pass the
  returned game object to the next call. Store game state that must survive
  between segments through `input.storage`.

## Validate completed work

A focused unit test can show that one function works by itself. It does not
show that the running game reaches that function or produces the complete
result correctly.

Before calling a gameplay case complete, record a new case with the C reference
program and replay the same inputs with the JavaScript port. Compare everything
from the chosen starting point through the chosen result.

When choosing new cases:

- Choose the smallest repeatable set of cases that together covers the behavior
  and outcomes in the current goal. Save the inputs for each case.
- Cover each meaningful branch in the C code that belongs to the current goal,
  including less common branches.
- When the goal has an explicit limit, run a representative case just outside
  that limit. If the current goal says how the program should handle that case,
  add a passing test for the specified result. If the case belongs to future
  work and does not match the C reference yet, keep it out of the normal
  passing test suite and record its inputs and expected failure in the active
  implementation checklist.
- Change the seed, date and time, options, character choices, or input sequence
  only when that input can affect the behavior being checked.
- Choose inputs independently instead of copying values from an existing
  recorded session.

## Commit, review, and report the work

`SCORE.md` summarizes development-score results for completed work. Add entries
at the points listed in `.agents/validation.md`, "Score evidence". You do not
need to add an entry after every commit.

Keep progress updates short. "Progress reports" in `.agents/workflow.md` states
their required shape.

Create or update a checklist, note, report, or permanent record only when
`.agents/workflow.md` or `.agents/review.md` requires it.

### Check out the C source in a new worktree

Git records `nethack-c/upstream` as a submodule gitlink, and `git worktree add`
leaves that path as an empty directory. The five generated-data checks and the
source-pinned tests read the C source, so every one of them fails until you
check it out. Those two sets of failures arriving together, naming neither git
nor the submodule, are the symptom. Run this once in a new worktree, before its
first `npm run checkpoint`:

```
git submodule update --init --checkout --no-fetch -- nethack-c/upstream
```

Two commands confirm the checkout. `ls nethack-c/upstream/src/monst.c` prints
that path, and `git status` reports a clean tree with no `T nethack-c/upstream`
line. Git writes a separate submodule gitdir under
`.git/worktrees/<name>/modules/` for each worktree, so this checkout disturbs no
other worktree. It costs 31 MiB for the working tree and 170 MiB for that
gitdir.

### Restore paths by name

Never run `git checkout -- .`, `git checkout HEAD -- .`, or `git restore .`.
Name the paths you mean to restore. A bare restore discards every uncommitted
change in the tree, including another agent's work in progress.
`.claude/settings.json` denies these commands, so a tool call that tries one is
refused. Its deny message sits inside a single-quoted shell string, so it can
hold no apostrophe; an apostrophe there breaks the hook, and a broken hook fails
every Bash call.

If you run one anyway, staged work survives as an unreachable blob:
`git fsck --unreachable` lists it and `git cat-file -p <sha>` prints it back.
Unstaged work is gone.

### When to stop and ask the user

"Continuous operation" in `.agents/workflow.md` describes a loop that
alternates implementation and review without returning to the user between its
steps. Stop that loop and ask the user only for:

- a holdout evaluation outside the close of a goal;
- a change to which sessions belong to the development and holdout sets;
- publishing anything outside this repository;
- a decision that this file and the files it names do not settle.

Report progress when the user asks and when the loop stops. Do not stop merely
to report, and do not ask for a goal that the loop selects.
