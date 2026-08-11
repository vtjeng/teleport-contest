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
- Answer: (2026-08-11) Run the experiment once and change no rule. Spend one
  goal on a command the ranking rule cannot nominate, then read the holdout at
  the authorized evaluation that closes it. `.agents/selection.md` keeps
  ranking on `unlocks`. This entry stays open until that goal is queued in
  `GOALS.json`, whose `--forecast-basis` records it.
