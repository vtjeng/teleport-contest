# objects-alchemy-stack-split

**Explained negative for two recorded public paths; manual/unbound objects case.** Hypothesis: alchemy might mishandle split potion stacks, consumption or dilution-dependent RNG. Public debug Valkyrie wishes eight healing potions and one gain-energy potion, then dips healing into gain energy. Target uses undiluted healing; control uses diluted healing. Both complete replays match C. This is not universal alchemy equivalence.

C potion.c:2502-2595 first limits the dipped quantity: diluted always affects two, otherwise a magic mixture may choose 3..8. It splits before messaging and consumes the gain-energy potion before explosion or transformation. In seed 19870701 the undiluted case draws rnd(6)=2, splits four, then rn2(10)=0 causes explosion; four healing potions remain, reagent is gone, HP is 7. Diluted skips that quantity RNG, affects two, avoids explosion and returns two diluted extra-healing potions alongside six diluted healing potions. JS potion.js:3503-3580 preserves these observed branches and order.

Target matches 93/93 screens/cursors and 2754/2754 RNG calls. Control matches 100/100 screens/cursors and 2750/2750 RNG calls. The control intentionally changes subsequent RNG alignment by skipping quantity selection, so it is not an isolated comparison of explosion probability. Focused tests assert both C/JS branch messages, final inventory quantities, consumption and target HP.

```
node --test diagnostics/divergence-evidence/objects/objects-alchemy-stack-split/check.test.mjs
node frozen/ps_test_runner.mjs --worker-session=diagnostics/divergence-evidence/objects/objects-alchemy-stack-split/whole-capture-c.json
node frozen/ps_test_runner.mjs --worker-session=diagnostics/divergence-evidence/objects/objects-alchemy-stack-split/diluted-capture-c.json
NETHACK_INSTALL=/tmp/objects-recorder NETHACK_BINARY=/tmp/objects-recorder/nethack node scripts/record-session.mjs diagnostics/divergence-evidence/objects/objects-alchemy-stack-split/whole-recipe.json /tmp/alchemy-new.json
```

Fresh capture requires the standard patched recorder in a private install. The first target recording ended in the post-explosion naming prompt; the published version dismisses it and reaches inventory. The original matching prefix remains in private triage as alchemy-whole-capture.json. No failed setup is counted. No exact canonical lead covers this combined hypothesis; the nearby potion_dip/doname edge is not repurposed. No automatic scanner suppression is authorized. Other mixtures, quantities, curses, burden/fumbling and randomized outcomes remain unproved.
