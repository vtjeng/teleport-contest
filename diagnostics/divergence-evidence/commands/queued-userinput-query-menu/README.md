# Queued user input bypasses query_menu

With query_menu enabled, the altar's queued Sacrifice action shows a text prompt in JS but a Yes/No/Quit menu in C. The CMDQ_USER_INPUT marker is consumed in both; C then runs yn_function_menu, while JS falls through directly to tty_yn_function. Wizard wishes provide a supported altar/floor-corpse setup; Escape stops before any offering effect.

```sh
node --test diagnostics/divergence-evidence/commands/queued-userinput-query-menu/evidence-check.mjs
```

The target deliberately fails outside default CI. Two controls pass: the same queued action with query_menu off, and direct #offer with query_menu on. Complete compressed C recordings make this command runnable without rebuilding the oracle. case.json pins source, recorder, setup and scope; raw results and recipes are included.

This is a separate prompt-routing branch from #60's direction redraw, #58's repeat confirmation and #66's queued command-name mismatch. No gameplay changes; no scanner suppression decision.
