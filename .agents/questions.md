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

```

## Q1 (2026-09-16) Exact screen target and configuration pathname

- Context: The seed2200 recording includes the recorder host's absolute HOME-derived configuration pathname. C options.c option_help() prints cfgfiles.c get_configfile(), but docs/API.md and frozen/ps_test_runner.mjs replayInputFor() supply only configuration text, not HOME or a pathname. The passing checkpoint at cc1b4453d14fd4a0e995170e3842ad622790c8a5 measured 221/230 screens for this session, with all 3018 RNG calls matching. Its investigation attributes the nine missed screens to this environment-only difference.
- Question: How should the replay contract or scoring treatment define this machine-local pathname so the exact 11,405-screen target can be reached without hardcoding recorded output?
- Provisional decision: Preserve the portable .nethackrc fallback and the immutable recordings. Continue all authorized source-backed implementation; keep the original target active and do not claim these nine screens match. A contract/scorer change needs a concrete proposal and user decision.
- Answer: (open)
