# Questions for the user

The loop appends a question here when `.agents/loop.md` triages it as
non-blocking or slice-blocking. Entries stay open until the user answers.
Apply the answer, then delete the entry. Append new entries at the end.

Entry shape:

```
## Q<n> (<date>) <slice or topic>

- Context: one or two sentences.
- Question: the question, answerable in one line.
- Provisional decision: what the loop did meanwhile, or "slice parked".
- Answer: (open)
```

## Q1 (2026-09-01) hellfill-open-cavern-loader-and-population

- Context: The fresh C replay reaches hellfill.lua through a wizard level port, but its RNG trace does not uniquely identify one of the seven hells[] generator arms. The worker could not complete a safe bounded implementation without that source-path choice.
- Question: Should this slice resume only after a fresh development case pins one specific hells[] generator arm?
- Provisional decision: slice parked; select a different slice in the open goal.
- Answer: (open)
