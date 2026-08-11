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

## Q4 (2026-08-10) May a worker write a deferral?

- Context: `AGENTS.md`, "Validate completed work", tells whoever validates to
  record a case outside the goal's limit "as a deferred entry with `npm run
  quality -- defer`, which outlives the slice and its checklist".
  `.agents/loop.md` says the worker "runs no formal review pass, reads no
  threshold, and records nothing in the quality ledger". `QUALITY.json` holds
  both review records and deferrals, so the two readings collide whenever a
  slice leaves a case just outside its limit.
- Question: does "records nothing in the quality ledger" exclude only review
  records, leaving deferrals to the worker as `AGENTS.md` directs?
- Provisional decision: kept the worker's entry. The pray-command slice
  recorded `angrygods-cases-above-1` with two recorded-ready inputs and their
  expected failure, which is the case `AGENTS.md` names; discarding it would
  lose evidence the orchestrator would have to re-derive. Read `.agents/loop.md`
  as scoping its sentence to review records, which is what the surrounding
  bullet is about.
- Answer: (open)

## Q5 (2026-08-11) Can a sweep schedule its own successor indefinitely?

- Context: `.agents/selection.md` gates a fail-closed boundary port behind
  clearing every sweep the quality report names, and names an area at ten open
  entries. The first slice of `objects-deferral-sweep-2` took `objects` from ten
  counted entries to seven, and in the same run recorded one new entry against
  `startup` for a divergence it found while working. That took `startup` from
  nine to ten, so `npm run quality` now prints `Sweep candidate: startup holds
  10 open deferrals`. Clearing one area scheduled the next.
- Question: when a sweep's own findings push a second area to the threshold,
  does the gate bind immediately, or may a boundary goal run before the new
  sweep?
- Provisional decision: none taken yet, because nothing is blocked today: the
  `objects` sweep is still open and continues on its own entries. The rule
  answers the next goal selection on its face, and the loop will follow it. The
  question is whether the rule should answer it that way. Recording the tension
  now so the answer is not invented under time pressure at the next close.
  Worth noting on the other side: the new entry is honest bookkeeping about
  real debt, and suppressing it to protect a boundary goal's turn would be
  worse than sweeping again.
- Answer: (open)

## Q6 (2026-08-11) Should a goal be spent testing why the holdout is flat?

- Context: the holdout has not moved across the last four goal closes, and has
  moved once in sixteen. A goal-selector found a mechanism that fits, and it is
  structural rather than statistical. The census's `unlocks` figure is non-zero
  only where a behavior is a session's *earliest* unmet one. Eight commands sit
  at `unlocks` 0 while carrying the largest `supports` figures in the table:
  `quaff` 2411, `puton` 2005, `wear` 1551, `read` 1450, `travel` 1150, `throw`
  1018, `wield` 987 and `up` 526. Every development session that needs them is
  stopped earlier by something rarer, so the ranking rule in
  `.agents/selection.md` can never nominate any of them, by construction rather
  than by judgement. The holdout matches 6.2 per cent of its screens against
  the development set's 18.4 per cent, so its sessions stop earlier, plausibly
  still inside that family of ordinary item and movement commands. The one goal
  that moved the holdout was `drop-command`, attributed to `dodrop()` by the
  authorized run at `74c622c`, and `d` belongs to that same family.
- Question: should the loop spend one goal porting a command the ranking rule
  cannot nominate, such as `wear` or `read`, and read the holdout afterwards?
- Provisional decision: none taken, and none is needed yet. The loop opened
  `pet-step-onto-cursed-object`, whose 27 steps are measured to a full-session
  pass, and continued. `.agents/selection.md` admits a fresh-seed census only
  when every ordinary candidate caps at 0, which is not the case, so the rule as
  written cannot ask for this experiment and the loop will not take it unasked.
  Against spending the goal: the mechanism is a fit rather than a proof, one
  attributed data point is thin, and the same file forbids ranking on the
  holdout at all. For it: sixteen goals have produced one movement, and no
  cheaper experiment distinguishes "the hidden sessions stop on ordinary
  commands" from "carry-over is simply slow".
- Answer: (open)
