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
  (`node scripts/goal-log.mjs --current`). `ROADMAP.md` lists every C file
  with its ported and unported function counts.

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
  agent or tool, including `frozen/ps_test_runner.mjs`, the Session Viewer,
  recording tools, and audit tools.
- Do not inspect temporary files, caches, or CI logs to recover individual
  holdout results.
- Do not change which sessions belong to the development and holdout sets
  without explicit user approval.
- These restrictions apply even when the files are accessible through the
  filesystem or public Git history.

## Read the instructions for your task

Before starting work, find every matching row below and read every listed file.
Follow all instructions in those files. A **goal** is one of two kinds. A
**file port** ports one C file, or a named group of its functions. A
**divergence fix** repairs one session's first mismatch inside code that is
already ported. A **span** is the unit of work one worker run lands: for a
file port, a contiguous run of its functions in C order; for a divergence
fix, the functions the fix touches. The span worker
(`.claude/agents/span-worker.md`) completes one span per run.

| Before you... | Read... |
| --- | --- |
| Choose which goal to open next | `.agents/selection.md` and `ROADMAP.md` |
| Implement game behavior | `.agents/glossary.md` and `.agents/validation.md` |
| Validate game behavior | `.agents/validation.md` |
| Propose a change to tooling or process | `.agents/proposals.md` |
| Complete one span as a loop worker | `.claude/agents/span-worker.md` |
| Commit game implementation | `.agents/validation.md` |
| Append a `SCORE.tsv` event row or read a holdout result (orchestrator only) | `.agents/scoring.md` |
| Record a new C run, compare C and JavaScript behavior, scan many fresh cases, calculate a score, test in a browser, or run an authorized holdout evaluation | `.agents/validation.md`, and `.agents/scoring.md` for recording the result |
| Decide whether a correctness review is warranted, or run or record one (orchestrator only) | `.agents/review.md` and the skill it names for that review |

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

### Port whole files in C order

1. A file port covers every function of its C file, in the file's definition
   order, whether or not a recorded session reaches it. Do not wait for a
   caller in the running game, and do not defer a branch because no session
   exercises it. `.agents/selection.md`, "Choosing a goal", states which
   function the first span starts from.
2. Wire each ported function where the C calls it, in the same span. A
   function that exists only in JavaScript, or a caller the C does not have,
   is a defect.
3. When a ported function calls a C function that is not ported yet, port the
   callee in the same span if the C uses its return value. If the C discards
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
   the same span.

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
  site. When a span ports a function that throws one, replace the throw with
  the ported branch, or with `note_unported()` where that branch's callee is
  still unported. Delete a class once its last throw site is gone.
- Do not name a file or function after a span, a goal, or the work that added
  it. Those names stop making sense once that work is done.
- Split a ported file only where the C file has separate groups of functions.
  Name each part for the functions it holds, and name the C file and functions
  in a header comment. A large file is fine; the C file is large too.

### Generate large fixed tables from source

When copying a large fixed table from C or Lua, write a script that produces
the JavaScript table deterministically. Commit the script, the generated file,
and a check that compares it with freshly generated output.

### Local serialize fix

`frozen/terminal.js` `serialize()` discards attributes (inverse video,
underline) on leading-space characters. The local copy applies a fix so that
screens with attributed leading spaces compare correctly. The upstream scorer
does not have this fix, so local development and holdout scores exceed the
leaderboard score by a margin that grows with session coverage.

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
game reaches it or produces the complete result. The port's oracle is recorded
play: the 33 development sessions, and the recordings corpus under
`recordings/`, which the patched C program made from the recipes under
`recipes/`. `npm run checkpoint` replays both and fails when a recording stops
matching.

Every file port adds recipes. Before the goal closes, its recipes must reach
each entry point of the ported file at least once, and their recordings must
match. An entry point is a command, monster action, level feature, or startup
path the file implements. Commit a recording only when it matches completely.
When a recipe's recording diverges inside another C file, leave the recipe
under `recipes/<c-file>/` with a comment naming the blocking function, and
record it once that function lands. A span that completes an entry point
records its recipe before closing; a span closes without a new recording when
neither the development sessions nor the recordings lost a match.

When choosing new cases:

- Choose the smallest repeatable set of recipes that reaches each entry point
  of the goal's file. Commit each recipe under `recipes/<c-file>/` and its
  recording under `recordings/<c-file>/`.
- Give each recipe a cheap variation, such as a different role, option, or
  object class, and cover the branches those variations reach. The
  source-pinned tests and the file's later divergences cover the branches no
  cheap recipe reaches.
- When the goal has an explicit limit, run a representative case just outside
  that limit. If the current goal specifies the result, add a passing test. If
  the case belongs to a later span or file port and does not yet match the C
  reference, keep it out of the passing test suite and commit its recipe under
  `recipes/<c-file>/` with a comment naming the function that blocks it.
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

### Check out the C source in a new worktree

Git records `nethack-c/upstream` as a submodule gitlink, and `git worktree add`
leaves that path as an empty directory. The generated-data checks and the
source-pinned tests read the C source from that path, so they all fail until
you check it out. When both sets of failures appear together, the missing
checkout is the likely cause. Run this once in a new
worktree, before its first `npm run checkpoint`:

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
without returning to the user. Stop and ask only for:

- a holdout evaluation outside the close of a goal;
- a change to which sessions belong to the development and holdout sets;
- a complete port: every development session matches and `ROADMAP.md` lists
  no unported function;
- a decision not covered by this file or any file it references.

Report progress when the user asks and when the loop stops. Do not stop merely
to report, and do not ask for a goal that the loop selects.
