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

## Q1 (2026-08-10) the deferred-area sweep threshold counts entries no sweep can close

- Context: `.agents/selection.md:11` gates every fail-closed boundary port behind clearing each deferred-area sweep the report names, and `:16-20` sets that threshold at ten open entries excluding `scope`. `monsters` now stands at ten. Reading all ten found that four of them name unported behavior as their own recorded closing condition — the planning clone's unfired trigger, the postmov minvis redraw waiting on monster equipment changes or monster item use, `dochug()`'s PHASE FOUR residue waiting on `mattacku()`, and the minliquid flyer refusal waiting on `mon.c`'s drown and burn arms. A fifth keeps a production gap waiting on `mattacku()` too. Those five can only be retired by the boundary ports the threshold blocks, so the area has a permanent floor of five that counts toward its own gate. Separately, the sweep that just closed retired five entries and opened five, two of them into `monsters`, which is what raised this gate: a sweep's value is that reading finds defects, and recording each find opens an entry counting toward the same threshold that triggered the sweep.
- Question: should the threshold exclude an entry whose recorded closing condition names unported behavior, the way `scope` entries are already excluded because they "name unported territory a boundary goal attacks"?
- Provisional decision: the loop ran the `monsters` sweep rather than skipping it, because clearing it honestly costs one worker run and line 11 is a gate rather than a preference. Excluding those four would drop `monsters` from ten to six today.
- Answer: (open)

## Q2 (2026-08-10) the ordinariness calibration has no instrument the selection rules permit

- Context: two goal closes measured that a boundary's development-census count does not predict what it carries over. `pickup-command` delivered 26 development screens and moved the holdout 16; `force-fight-command` delivered 40 and moved it 0. The difference was how ordinary the command is in play, not how large the boundary was. `.agents/selection.md:58-62` ranks candidates by the capped development look-ahead and admits the fresh-seed census only once every census candidate caps at zero. So a boundary that is common in play but blocks no recorded session — `dead-monster-drops-equipped-gear`, measured at 11 of 216 seeds behind `scripts/run-hostile-melee-kill.mjs`, is the current example — cannot be ranked while census candidates remain, even though the calibration says it is the one most likely to generalize.
- Question: should the selection rules admit a measured incidence-in-play figure alongside the capped development look-ahead, rather than only after the census is exhausted?
- Provisional decision: the loop kept ranking by the census, so `dead-monster-drops-equipped-gear` stays a deferred entry rather than a goal.
- Answer: (open)

## Q3 (2026-08-10) two census-ranked boundary ports in a row have carried over nothing

- Context: this extends Q2 from an argument to a measurement. Five goals have now closed with a holdout run. `pickup-command` delivered 26 development screens and moved the holdout 16. Every boundary port since has moved it zero: `force-fight-command` delivered 40 and moved nothing, and `wish-name-resolution` delivered 69 — its forecast exactly, the most accurate of the session — and moved nothing. The two sweeps between them forecast zero and delivered zero, which is correct for a sweep. So the ranking rule in `.agents/selection.md:58-62`, the capped development look-ahead, has now selected two consecutive ports that generalized not at all, and the one goal that did generalize was chosen before the calibration was noticed. The `wish-name-resolution` selection argued explicitly that the development corpus makes wishing ordinary — 34 wishes across 7 of 33 sessions, 9 of 33 sessions in `playmode:debug` — and recorded its own caveat that "ordinary in this corpus" and "ordinary in the holdout" are different populations it could not check. The holdout has now answered: they differ.
- Question: should the capped development look-ahead stop being the primary ranking rule, given that it has selected two consecutive non-generalizing goals, and if so what replaces it — the fresh-seed census the same file admits only after the census is exhausted, or something else?
- Provisional decision: the loop kept ranking by the rule and recorded the outcome. It did not switch instruments, because doing so would change the selection policy on its own authority.
- Answer: (open)
