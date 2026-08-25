# Source-faithful port roadmap

This file describes the group of game systems the current goals belong to.
Goal state lives where `.agents/selection.md`, "Where goal state lives,"
describes.

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
