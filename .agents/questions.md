# Questions for the user

The loop appends a question here when
`.agents/loop.md` triages it as non-blocking or slice-blocking. Entries
stay open until the user answers, here or in conversation; apply the answer,
then delete the entry. Append new entries at the end.

Entry shape:

```
## Q<n> (<date>) <slice or topic>

- Context: one or two sentences.
- Question: the question, answerable in one line.
- Provisional decision: what the loop did meanwhile, or "slice parked".
- Answer: (open)
```

## Q7 (2026-08-13) Where does a scoped simplification pass leave its record?

- Context: the simplification pass over `eb3a084..3ffdb94` returned 28 raw, 23
  deduplicated, 10 confirmed, 13 rejected and 0 unverified findings, and four
  fixes landed in `3c74ca6` and `43a5171`. `npm run quality --
  record-simplification` refused it: the ledger's simplification frontier
  stands at `e153d07`, three weeks and roughly forty commits earlier, and
  recording a range that starts after the frontier would turn those commits
  into audited history. The refusal is correct and the rule behind it is right.
  But `.agents/review.md` calls `QUALITY.json` the ledger that records
  completed simplification passes, so a pass scoped to a recent range has
  nowhere to go: it is neither recordable nor, like a clarity pass, exempt.
- Question: should a simplification pass scoped to a range narrower than the
  frontier gap be recordable without advancing the frontier, or should the loop
  only ever run simplification from the frontier?
- Provisional decision: the pass leaves no ledger record. Its ten confirmed
  findings are durable elsewhere: four in the two commit messages, six as
  ledger deferrals (`finish-elapsed-turn-env-shapes-duplicated`,
  `menu-heading-style-copied-in-four-wrappers`,
  `unused-import-specifiers-name-dead-symbols`,
  `mintrap-env-literal-spelled-twice-in-monmove`,
  `erase-menu-or-text-takes-a-display-it-derives`,
  `options-menu-recipes-addressed-by-position`). So nothing was lost but the
  thirteen rejections, which the next pass will re-derive. Recording it with a
  base of `e153d07` was rejected as dishonest: the pass never read those
  commits.
- Answer: (open)
