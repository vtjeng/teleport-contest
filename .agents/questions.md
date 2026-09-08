# Questions for the user

The loop appends a question here when `.agents/loop.md` triages it as
non-blocking or span-blocking. Entries stay open until the user answers.
Apply the answer, then delete the entry. Append new entries at the end.

Entry shape:

```
## Q<n> (<date>) <span or topic>

- Context: one or two sentences.
- Question: the question, answerable in one line.
- Provisional decision: what the loop did meanwhile, or "span parked".
- Answer: (open)

## Q1 (2026-09-08) hack.c revive_nasty dependency

- Context: The queued hack.c span ports `revive_nasty()`, whose qualifying branch consumes the boolean returned by `do.c revive_corpse()`; that chain depends on the still-unported `zap.c revive()` behavior.
- Question: Should the loop open the `do.c`/`zap.c` dependency as a separate file-port goal before resuming the parked hack.c span?
- Provisional decision: span parked; continue with the next hack.c span that has no value-producing unported dependency.
- Answer: Keep the current worktree and port the `do.c`/`zap.c` dependency
  chain in this hack.c span, as far as needed to return the exact boolean.
```
