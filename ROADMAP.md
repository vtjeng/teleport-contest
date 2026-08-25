# Source-faithful port roadmap

This file describes the group of game systems the current goals belong to.
It holds no goal state. `GOALS.json` records the goal in progress and the goals
queued after it; read it with `node scripts/goal-log.mjs --current` and write
it only through that script, which records the look-ahead forecast at open
and computes delivered figures from `SCORE.tsv` at close.
`docs/goal-history.md` holds what the closed goals carried over; its
falsified predictions and measured overstatements are recorded so nobody
re-derives them. Deferred findings live in `QUALITY.json`, read with
`npm run quality -- deferrals`.

## Accessories and equipment

Putting on and taking off rings, amulets, and blindfolds — `doputon()`
and `dotakeoff()` in `do_wear.c`. The port already handles the armor
half of `accessory_or_armor_on()` and `armoroff()`; the current goal
ports `doputon()` and the accessory effects `Ring_on()`, `Amulet_on()`,
and `Blindf_on()`.

## Exploration

Movement beyond the first unobstructed step, then running, search, doors,
traps, pickup, stairs, terrain effects, vision, and status updates. This is
what a hero does moving around a level before fighting or using items. The
heading labels the system goals belong to and orders nothing;
`.agents/selection.md` states how the next goal is chosen.
