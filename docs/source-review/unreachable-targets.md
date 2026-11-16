# Coverage targets: C and Lua lines no gated game runs

Written on 14 November 2026 (PT) on branch `coverage-recipes`, against
`map-current/` (main `da8843836`). It lists the unrun lines that later pilots
and recipes can still reach, each with an input outline, and the lines no
valid game can reach, each with its reason. A valid game is what a session
carries: seed, date and time, nethackrc options and one-byte keys. Debug mode
is allowed. Environment variables, sysconf and extra files are not.

- **Probe.** `.cache/lead/covrecipes/probe.py <outdir> <recipe>...` records
  recipes through `recorder-lua/` and prints the C gameplay and Lua lines that
  map-current never ran. It takes a few seconds a recipe. End every recipe on
  a settled prompt: the recorder keeps running after the last key, so lines
  run after an open --More-- count in the probe but in no recorded step.
- **Clusters.** `.cache/lead/covrecipes/clusters.py` writes `clusters.json`
  and `clusters.txt`, which group the unrun gameplay lines by function.

## Where the 11,466 unrun C gameplay lines stand

| Part | Clusters | Lines |
| --- | ---: | ---: |
| All unrun gameplay lines | 1,862 | 11,466 |
| Unreachable by `scripts/c-function-map.mjs --json` (whole functions; dropped) | 27 | 274 |
| Unreachable call sites by `gapsort/classified-all.json`, on unrun lines of kept clusters (`gapsort-unreachable-sites.json`) | 141 | 164 site lines |
| Kept and ranked | 1,835 | 11,192 |
| Examined in this pass: the 80 largest kept clusters (`assign-A`…`D.json`) | 80 | 2,676 |
| Not examined (ranked below) | 1,755 | 8,516 |

The 27 dropped functions include `wornmask_to_armcat` (27), `reorder_fruit` (25), `done1` (18), the
`mkmap.c` room removal (34), `under_ground` (14) and `obj_move_timers` (13).
map-current also counts 40 preprocessor-directive lines as unrun
(`directive-lines.json`). No input runs them.

Of the 80 examined clusters, 22 recipes now run **330 new C lines (307 in
the 20 whose recordings pass)**, measured by `probe.py` on the committed
recipes (union). Most of the rest is unreachable: impossible() and panic()
reports, data-file errors, sysconf and environment settings, Lua binding
options no `dat/` file uses, and status-field types no field has. The
sections below give the reasons.

## Status after the `coverage-targets-5` pass (15 November 2026, PT)

Branch `coverage-targets-5` (worktree `.cache/lead/wt-targets5`, head `49a9a3ea0`), from `origin/main` `5ccfa22ee`. One agent, no forks. "New" means not run in `map-current/` (current through `5ccfa22e`, so it includes passes 2-4). Tools: `.cache/lead/targets5-tools/` (pass 4's tools with paths moved, plus `ctx.py`, `fightwait.py`, `untiladj.py`, `settle.sh`, `seedcheck.sh`); ledger `targets5-tools/ledger.tsv`; union `targets5-tools/union5.json`.

**Totals (measured).** 40 new recipe files, each with a recording: 20 recipes and 20 cheap variations. All 40 recordings replay with PASS at `49a9a3ea0` (`replay-all.sh`), and `endcheck.py` finds none ending on an open --More--, menu or prompt. A `probe.py` run over all 40 recipes, less map-current, runs **79 C gameplay lines** in 18 files and no new Lua lines.

**Defects.** None. No recording failed, so `js/` and `scripts/` are unchanged.

**Coverage of the ranking.** Step 1: all 29 clusters of pass 4's ranks 121-165 that pass 4 left unexamined. Step 2 was sampled, not finished: of pass 4's 74 open or done-in-part clusters, 7 were ruled on (recipes for 114 `cry_sound`, 46 `openone` and 97 `mind_blast`; 160 `whereis_mon` unreachable; 107 `carry_count`, 122 `burn_object` and 154 `ustatusline` read and left open). The other 67 remain as pass 4 left them. Step 3: the fresh ranking (`rank5.py`, 1,318 clusters, 3,298 lines before this pass): fresh ranks 30-54, 57-60, 62-64, 66, 69, 72 and 73. Fresh ranks 55-56, 61, 65, 67-68, 70-71 and 74 onward were not examined. The pass stopped at the recipe cap (40). The line rule was not met: the last 20 fresh clusters examined in rank order (46-73) ran 19 new lines. Rows marked "printed lines only" or "read only" rest on a reading of the C, without a probe.

**Unreachable verdicts below are provisional: each rests on one reading of the C.**

| Rank | Cluster | Status |
| --- | --- | --- |
| pass-4 121 | `teleport.c` `random_teleport_level` | **Unreachable (provisional).** 2250-2256 need nlev < min_depth, possible only after the Is_botlevel nlev -= rnd(3) at 2247; that needs max_depth - 3 < min_depth on a dungeon's bottom level. Non-quest dungeons have min_depth 1 and bottoms deeper than 3; the quest bottom level is reachable only after the locate level, so bottom = dunlevs (5 or more levels) and max_depth - 3 > min_depth. Endgame and single-level branches return at 2196 (read only) (0 new lines) |
| pass-4 127 | `uhitm.c` `mhitm_ad_dren` | **Unreachable (provisional).** AD_DREN appears only as the energy vortex's AT_ENGL attack (grep AD_DREN include/monsters.h: 1083 only); hero engulfing uses gulpum(), which handles AD_DREN itself (uhitm.c 5174), and a monster engulfing the hero uses gulpmu() (mhitu.c 1537), so the uhitm (2426-2428) and mhitu (2431-2434) branches of mhitm_ad_dren() are never called (0 new lines) |
| pass-4 128 | `uhitm.c` `mhitm_ad_sedu` | **Open.** 4640 a cancelled animal seducer (monkey) hitting the hero: reachable (wand of cancellation at a ^G monkey), 1 line, not recorded (recipe budget); 4730-4735 a pet nymph stealing from a monster that wields a cockatrice corpse (mselftouch, trap.c, needs no gloves check), needs a gloved monster to pick up and wield a cursed corpse: not set up (0 new lines) |
| pass-4 131 | `apply.c` `use_royal_jelly` | **Done in part.** 3655-3656 and 3664 run (cursed jelly on an untimed egg, then uncursed or blessed jelly restarts the timer); 3644-3646 unreachable (provisional): jelly_ok() returns GETOBJ_EXCLUDE for non-eggs and getobj() refuses an excluded pick with silly_thing() (invent.c 2071) Recipes: use_royal_jelly-cursed-twice-then-uncursed-on-giant-ant-egg-healer; use_royal_jelly-cursed-then-blessed-on-killer-bee-egg-archeologist (variation). (3 new lines) |
| pass-4 132 | `artifact.c` `mk_artifact` | **Open.** 196 needs a by-alignment gift whose gift_value exceeds max_giftvalue for another role: gifts pass max_giftvalue from pray.c, not traced further, open; 224 a weapon artifact with negative oc_skill (ammo or missile): no artilist.h entry is ammo or a missile; 271 and 302-304 the 'unexpected' non-null otmp with by_align (C comments say cope) (provisional) (0 new lines) |
| pass-4 133 | `artifact.c` `dispose_of_orig_obj` | **Unreachable (provisional).** only callers are mk_artifact 271 and 302, both unreachable above (provisional) (0 new lines) |
| pass-4 134 | `artifact.c` `set_artifact_intrinsic` | **Done in part.** 756-758 run (drop one of two carried CARY(AD_MAGM) artifacts); 728 unreachable (provisional): every caller (do_name.c 407, invent.c 991/1383, worn.c 106/130/173) passes an object with oartifact set; 738 AD_ELEC and 742 AD_DISN unreachable: no artilist.h entry has DFNS or CARY of those types (grep DFNS/CARY include/artilist.h) Recipes: set_artifact_intrinsic-drop-orb-while-carrying-magic-mirror-archeologist; set_artifact_intrinsic-drop-magic-mirror-while-carrying-orb-knight (variation). (3 new lines) |
| pass-4 135 | `artifact.c` `finesse_ahriman` | **Done.** 2254-2259 run (drop the invoked Heart of Ahriman while levitating; variation under a ring of levitation), with do.c drop() 765 and 771 Recipes: finesse_ahriman-drop-invoked-heart-while-levitating-barbarian; finesse_ahriman-drop-invoked-heart-under-ring-of-levitation-barbarian (variation). (8 new lines) |
| pass-4 136 | `attrib.c` `losestr` | **Unreachable (provisional).** 228-229 impossible(); 241-243 need an empty killer name, but every caller passes one (mcastu.c 481 death_inflicted_by, attrib.c 276 poison_strdmg callers fountain.c 307, eat.c 1932/2798, spell.c 164 all pass strings) (provisional) (0 new lines) |
| pass-4 138 | `dig.c` `mkcavepos` | **Open.** only caller mkcavearea() runs when digging rock on the Plane of Earth (dig.c 467-474); 62 the magic portal inside the collapse area, 64-65 a non-wall-passing monster within it, 77 a lit dig spot; 53 the map edge; 83 impossible(): not set up (Plane of Earth with a pick-axe and a monster beside the hero, moderate) (0 new lines) |
| pass-4 139 | `dig.c` `mdig_tunnel` | **Unreachable (provisional).** 1459-1464 impossible() for undiggable rock (provisional) (0 new lines) |
| pass-4 141 | `do.c` `doup` | **Open.** 1318-1319 a steed asleep, paralysed or eating at '<' (stucksteed); 1337-1339 next_to_u() false: a cursed leash whose pet mnexto() cannot put beside the hero (apply.c 891-905), or a steed carrying the Amulet; 1332 debug_fuzzer only (unreachable, provisional). Not attempted (0 new lines) |
| pass-4 142 | `do.c` `deferred_goto` | **Unreachable (provisional).** 2089-2095 need UTOTYPE_RMPORTAL, set only by expulsion(TRUE) (quest.c 196), and every expulsion() call passes FALSE (grep 'expulsion(' quest.c: 336, 341, 353) (provisional) (0 new lines) |
| pass-4 144 | `do_wear.c` `armor_or_accessory_off` | **Done in part.** 1788 runs (T on a shirt under both cloak and suit); 1823-1827 impossible() (provisional) Recipes: armor_or_accessory_off-shirt-under-suit-and-cloak-tourist; armor_or_accessory_off-t-shirt-under-ring-mail-and-cloak-valkyrie (variation). (1 new lines) |
| pass-4 145 | `dog.c` `tamedog` | **Done in part.** 1230 (blessed taming on a punched kitten, mtame 9) and 1188-1189 (taming a lichen stuck to the hero) run; 1209 open: thrown food caught by an unseen pet on a seen square (an invisible pet that stays in the throwing line; not set up); 1251 the quest leader (open, costly); 1266 dog_eat() killing a newly tamed monster (open) Recipes: tamedog-blessed-taming-caps-punched-kitten-wizard; tamedog-taming-releases-sticky-lichen-caveman (variation). (3 new lines) |
| pass-4 146 | `dothrow.c` `return_throw_to_inv` | **Done in part.** 1904 (dual-wielded aklys thrown up) and 1892, 1897 (caught boomerang from the alternate slot, autoquivered) run; 1872-1874 open: unsplitobj() failing for a returned split stack (not traced) Recipes: return_throw_to_inv-twoweapon-aklys-tossed-up-rejoins-valkyrie; return_throw_to_inv-caught-alternate-boomerang-autoquivered-priest (variation). (3 new lines) |
| pass-4 147 | `eat.c` `eatmupdate` | **Unreachable (provisional).** 197-199 the C comment says it won't happen (hallucinating while mimicking gold); 205-206 reallocation only for that longer message (provisional) (0 new lines) |
| pass-4 148 | `eat.c` `eataccessory` | **Done in part.** 2297-2300 run (an invisible metallivore hero eats a ring of see invisible); 2276 death from a sink fall while eating a worn ring (open); 2284 a ring or amulet with no property reaching the default case (provisional unreachable: every ring and amulet in the default branch has oc_oprop, not traced per type) Recipes: eataccessory-invisible-xorn-eats-ring-of-see-invisible; eataccessory-invisible-rust-monster-eats-iron-ring-of-see-invisible (variation). (4 new lines) |
| pass-4 149 | `eat.c` `newuhs` | **Unreachable (provisional).** 3506-3511 need HP below 1 when the hunger state changes; newuhs() itself deals no damage (the old losestr() calls are gone, eat.c 3452-3458 comments), so HP is already above 0 at every caller (provisional) (0 new lines) |
| pass-4 150 | `eat.c` `Popeye` | **Open.** 3939-3940 HUNGER: the C comment says it is not used (callers timeout.c 158/216/427 pass STONED, VOMITING, SLIMED); 3949 and 3952-3953 labels and default; 3931 the tin carried off or the floor out of reach during the opening (open, not set up) (provisional) (0 new lines) |
| pass-4 152 | `engrave.c` `doengrave_sfx_item` | **Done in part.** 883-884 run (engraving with a wished splash of venom); 745 is the shared default label and 886-888 the ILLOBJ impossible(): readobjnam() never makes ILLOBJ_CLASS objects (objnam.c 4550 requires i > ILLOBJ_CLASS) (provisional) Recipes: doengrave_sfx_item-engrave-with-wished-blinding-venom-tourist; doengrave_sfx_item-engrave-with-wished-acid-venom-monk (variation). (2 new lines) |
| pass-4 155 | `invent.c` `merged` | **Done in part.** 869 (#adjust merge of rustproof daggers whose rknown differs) and 894-895 (#adjust of a quivered stack onto an unworn one) run; 896-897 impossible() (provisional) Recipes: merged-adjust-rustproof-daggers-with-differing-rknown-valkyrie; merged-adjust-quivered-ya-onto-split-stack-samurai (variation). (3 new lines) |
| pass-4 156 | `invent.c` `compactify` | **Open.** 1649-1653 three or more '#' (NOINVSYM) letters in a prompt: needs more than 54 inventory slots, about 55 wishes (not done) (0 new lines) |
| pass-4 157 | `invent.c` `ggetobj` | **Unreachable (provisional).** 2216-2220 empty inventory: every caller is guarded (do.c 928, do_wear.c 3030 and 3080, invent.c 2736 runs only with unidentified items); 2238 ident with no letters, but identify_pack calls ggetobj only when unid_cnt exceeds id_limit, so some class is counted (provisional) (0 new lines) |
| pass-4 158 | `invent.c` `display_minventory` | **Unreachable (provisional).** 5376-5378 callers check minvent first (zap.c 632, invent.c 4146); 5381-5383 every caller passes PICK_NONE (zap.c 634, invent.c 4156) (provisional) (0 new lines) |
| pass-4 159 | `invent.c` `display_cinventory` | **Unreachable (provisional).** 5463-5469 the only caller (zap.c 2255) handles an empty container at 2236 and passes PICK_NONE semantics via query_objlist (provisional) (0 new lines) |
| pass-4 161 | `makemon.c` `makemon` | **Open.** 1271 ^G of the hero's own quest leader whose gender is random (Arch Priest, Grand Master, Master of Thieves): cheap, 1 line, not recorded (recipe budget); 1189-1191 impossible(); 1457 inventory before allow_minvent check (not traced); 1484 a monster created mimicking a monster (not traced) (0 new lines) |
| pass-4 162 | `makemon.c` `mkclass_aligned` | **Unreachable (provisional).** 1892-1894 and 1910-1912 impossible() (provisional) (0 new lines) |
| pass-4 163 | `makemon.c` `mongets` | **Open.** 2197 a lawful minion given a negatively enchanted item (random); 2201-2202 a player monster given a sword through mongets(): no m_initweap S_HUMAN branch gives an mplayer a sword (makemon.c 255-300, not fully traced); 2212-2214 Book of the Dead given to a monster (Wizard of Yendor never gets it) (provisional) (0 new lines) |
| pass-4 46 | `detect.c` `openone` | **Done.** 1766-1769 (a wished secret corridor in view) and 1775-1778 (an unseen wished trap in view) run when a blessed Bell of Opening is rung Recipes: openone-blessed-bell-reveals-secret-corridor-and-squeaky-board-healer; openone-blessed-bell-reveals-secret-corridor-and-rust-trap-tourist (variation). (8 new lines) |
| pass-4 97 | `monmove.c` `mind_blast` | **Done in part.** 605-606 run (a telepathic piercer hero hiding on the ceiling, Elbereth keeping the flayer from melee); 611-614 open: the hero mimicking gold after eating a mimic corpse is helpless only for the mimicry window, and 4 seeds never blasted inside it (one blasted during the meal instead) (1 in 20 per flayer move); 634 unreachable (provisional, pass 4) Recipes: mind_blast-unhides-telepathic-piercer-on-ceiling-wizard; mind_blast-unhides-telepathic-iron-piercer-healer (variation). (2 new lines) |
| pass-4 107 | `pickup.c` `carry_count` | **Open.** 1618, 1632-1634 and 1648 need gold or a stack taken from a carried bag of holding while the load is about three times the carrying capacity (max_capacity(), hack.c 4391): not set up (read only) (0 new lines) |
| pass-4 114 | `sounds.c` `cry_sound` | **Done in part.** 638-640 (baby crocodile, MS_CHIRP) and 647-649 (gargoyle, MS_GRUNT) run from a royal-jellied egg hatching in the pack; 625 default unreachable (provisional): the only oviparous monster with an unlisted sound is Scorpius (MS_NEMESIS), and can_be_hatched() turns Scorpius eggs into scorpion eggs (mon.c) Recipes: cry_sound-jellied-crocodile-egg-hatches-in-pack-valkyrie; cry_sound-jellied-gargoyle-egg-hatches-in-pack-samurai (variation). (6 new lines) |
| pass-4 122 | `timeout.c` `burn_object` | **Open.** 1659 and 1665: candles attached to a lit candelabrum; 1467 and 1649 a lit light source on the migrating list; 1672-1674 impossible(): not set up (read only) (0 new lines) |
| pass-4 154 | `insight.c` `ustatusline` | **Open.** 3415 food poisoning and illness at once during a self-probe; 3439, 3460-3462, 3471-3472 as pass 4: not set up (read only) (0 new lines) |
| pass-4 160 | `light.c` `whereis_mon` | **Unreachable (provisional).** 412-417 need write_ls() to find a lit monster on mydogs; mydogs is filled only between keepdogs() and losedogs() inside goto_level(), where savelev() saves only local light sources (maybe_write_ls(): mon_is_local() is false for mydogs monsters), and savegamestate() (save_currentstate, do.c 1969) runs after losedogs(); a tame yellow light taken along by ^V ran 0 lines (provisional) (0 new lines) |
| fresh 30 | `mkobj.c` `shrink_glob` | **Done in part.** 1614 (+ container_weight 2737: glob in nested sacks) and 1549 (catch-up in a floor sack after a level trip) run; 1516-1518 impossible() (provisional) Recipes: shrink_glob-glob-in-sack-in-sack-shrinks-valkyrie; shrink_glob-glob-in-dropped-sack-catches-up-after-level-trip-healer (variation). (3 new lines) |
| fresh 31 | `monmove.c` `mon_regen` | **Unreachable (provisional).** 314-319 need digest_meal TRUE, but the only caller (mon.c 1193, grep 'mon_regen(') passes FALSE (provisional) (0 new lines) |
| fresh 32 | `monmove.c` `dochug` | **Open.** 811-812 a peaceful bribing demon whispering at thin air while the hero, in demon form, is displaced or invisible; 707 m_arrival() result, 786 mstate after tactics(), 927 a vanished vault guard, 976 a worm killed by a passive counterattack: read only, not set up (0 new lines) |
| fresh 33 | `mplayer.c` `mk_mplayer` | **Open.** 124 a non-player-monster type (callers pass player monsters), 250-252 impossible() default; 127 the 'insurance' rloc() of a monster already on the spot (not traced) (provisional) (0 new lines) |
| fresh 34 | `muse.c` `precheck` | **Unreachable (provisional).** 76 and 103 enexto() finding no square for a ghost or djinni from a monster's potion, 81-82 and 108-109 makemon() failing there: need a full level (provisional) (0 new lines) |
| fresh 35 | `muse.c` `mbhitm` | **Unreachable (provisional).** 1665-1668 and 1695-1696: mbhit() is called only for MUSE_WAN_TELEPORTATION, MUSE_WAN_UNDEAD_TURNING and MUSE_WAN_STRIKING (muse.c 864, 978, 1884), so a cancellation wand or another type never reaches mbhitm() (provisional) (0 new lines) |
| fresh 36 | `muse.c` `use_offensive` | **Open.** 2026-2031 impossible() default for an unknown has_offense; 1912 makeknown() after a seen monster's offensive item (not traced, open) (0 new lines) |
| fresh 37 | `pickup.c` `pickup_object` | **Open.** 1811-1813 impossible(); 1824-1825 picking up a worn item from inside an engulfer (open); 1842 carry_count() finding not even one liftable when far over capacity (open: needs about three times the carrying capacity) (0 new lines) |
| fresh 38 | `polyself.c` `newman` | **Open.** 420-422 and 434-435: newman() leaving HP at 0 or below with polymorph control (rare level and HP rerolls; not set up) (0 new lines) |
| fresh 39 | `polyself.c` `rehumanize` | **Unreachable (provisional).** 1400-1404: the C comment says it can only happen if code reduces u.uhp instead of u.mh while polymorphed (provisional) (0 new lines) |
| fresh 40 | `polyself.c` `mbodypart` | **Open.** 2119 stalker HEAD: one try (a debug Healer as a stalker stepping back onto a wished falling rock trap) ran 0 lines, because the stalker form flies; 2091 shark HAIR, 2097 floating eye EYE: message-only body-part names, not tried; 2058-2060 impossible() (0 new lines) |
| fresh 41 | `potion.c` `H2Opotion_dip` | **Done in part.** 1573, 1577, 1580-1581 run (with costly_alteration 802 and read.c recharge 832, counted here): an unpaid potion of water, sold and bought back, unblessed or uncursed by a dip; 1576 open: blessing an unpaid uncursed water needs the shop own uncursed water (a sold-back one is no_charge: uncursed water is worth 0, sellobj gives "seems uninterested"); 1512 the caller passes only potions of water (provisional) Recipes: H2Opotion_dip-unholy-water-unblesses-bought-back-holy-water-in-shop; H2Opotion_dip-holy-water-uncurses-bought-back-unholy-water-in-shop (variation). (6 new lines) |
| fresh 42 | `pray.c` `gcrownu` | **Open.** 894 a crowned hero who already knows the class gift spell, wielding an acceptable weapon; 900 a lawful class gift; 970-973 the default label: crowning needs luck, alignment and prayer timeout set up (not attempted; read only) (0 new lines) |
| fresh 43 | `read.c` `recharge` | **Done in part.** 863 runs (a stripped, previously recharged marker); 785-786 unreachable (the C comment: currently unreachable); 832 an unpaid item charged in a shop (see the shop recipe below); 875 unexplained: by read.c 866-877 six blessed scrolls on a wished camera should pass 127, but the probe never ran 875 (not traced) Recipes: recharge-stripped-marker-dries-out-wizard; recharge-stripped-marker-dries-out-blessed-scroll-priest (variation). (1 new lines) |
| fresh 44 | `read.c` `do_class_genocide` | **Done in part.** 2759-2760, 2763-2764 run (an Unchanging hero in the genocided class); 2687 unreachable (provisional): name_to_monclass() already falls back to name_to_mon() after makesingular() (mondata.c), so class 0 with a valid name_to_mon() needs input both reject differently (newt and jackals ran 0 lines); 2712 a dead monster still on fmon during genocide (open) Recipes: do_class_genocide-unchanging-dwarf-form-genocides-own-class-ranger; do_class_genocide-unchanging-orc-form-genocides-own-class-barbarian (variation). (4 new lines) |
| fresh 45 | `save.c` `tricked_fileremoved` | **Unreachable (provisional).** 340-345 need a level file that vanished while the game runs, which no session input can cause (provisional) (0 new lines) |
| fresh 46 | `shk.c` `money2mon` | **Unreachable (provisional).** 162-163 and 166-167 impossible() for a zero, negative or unaffordable payment (provisional) (0 new lines) |
| fresh 47 | `shk.c` `call_kops` | **Done in part.** 528-531 run (Kops genocided, a teleport robbery; the variation is deaf); 534 open: Kops gone but the Minetown watch answers (not set up); 516 a robbery with no keeper (callers pass one, provisional) Recipes: call_kops-no-kops-after-genocide-robbery-by-teleport-archeologist; call_kops-deaf-robber-no-kops-after-genocide-archeologist (variation). (4 new lines) |
| fresh 48 | `shk.c` `same_price` | **Open.** 970-974 comparing two unpaid stacks billed by different shopkeepers (not set up); 977 impossible() (0 new lines) |
| fresh 49 | `shk.c` `pay_billed_items` | **Open.** 2133-2135 buying a container that holds unpaid items buy_container() will not explain; 2151-2153 PAY_BROKE from dopayobj(): not traced, not set up (read only) (0 new lines) |
| fresh 50 | `shk.c` `stolen_value` | **Open.** 3771-3772 an object with no owner found by find_objowner(); 3809 a stolen floor container holding gold; 3840-3842 a theft that uses up exactly the remaining credit: not set up (read only) (0 new lines) |
| fresh 51 | `shk.c` `getcad` | **Done in part.** 5165-5168 run (a deaf hero digs into a shop wall or breaks the door from two or more squares away); 5146-5147 open: a mute keeper polymorphed into an animal (not set up) Recipes: getcad-deaf-hero-digs-shop-wall-from-afar-archeologist; getcad-deaf-hero-breaks-shop-door-from-afar-archeologist (variation). (4 new lines) |
| fresh 52 | `shknam.c` `nameshk` | **Open.** 509 a negative name index, 526-529 falling back to general-store names when every name of the shop type is used on the level, 536 a '+' or '|' name prefix: need several same-type shops on one level (read only) (0 new lines) |
| fresh 53 | `sounds.c` `growl_sound` | **Open.** 391-393 MS_SILENT unreachable from growl() (it returns first for MS_SILENT); the other caller (mhitu.c 1009, an unseen lycanthrope summoning help) is never MS_SILENT (provisional); 382-384 MS_WAIL open (no tame or angry wailer set up) (0 new lines) |
| fresh 54 | `sounds.c` `tiphat` | **Open.** 1454 tipping a hat down at a helpless steed; 1484 a mimic disguised as furniture or an object in the target spot; 1510-1512 a responding monster in a cursed helmet; 1434 unreachable (caller checks uarmh, provisional): read only (0 new lines) |
| fresh 57 | `spell.c` `learn` | **Open.** 452-455 need a spellbook that becomes cursed while being studied and then rolls rn2(level) = 6 in cursed_book(); a wished cursed book runs cursed_book() from study_book() (606) instead (one try: 'too much to comprehend'); 398 impossible() (0 new lines) |
| fresh 58 | `spell.c` `getspell` | **Open.** 749-753 need 27 or more known spells (27 spellbook wishes and reads; not attempted) (0 new lines) |
| fresh 59 | `steal.c` `relobj` | **Open.** 885-889 a vault guard carrying gold that dies or drops its inventory (not set up) (0 new lines) |
| fresh 60 | `timeout.c` `hatch_egg` | **Open.** 1030 an egg sterilized while its timer runs, 1062 the species going extinct between twin hatchlings, 1148 an egg carried by a monster in water; 1160-1161 impossible() (read only) (0 new lines) |
| fresh 62 | `trap.c` `steedintrap` | **Unreachable (provisional).** 3118-3120 and 3126-3128 impossible() for an arrow or dart trap without a missile (provisional) (0 new lines) |
| fresh 63 | `uhitm.c` `hitum_cleave` | **Open.** 702 a remembered-invisible marker in the cleave sweep with no monster there; 698 a sweep spot off the map; 669-671 impossible() (read only) (0 new lines) |
| fresh 64 | `uhitm.c` `hmon_hitmon_misc_obj` | **Done in part.** 1197-1201 run (wielded royal-jellied eggs, 3 and 5, hit a newt); 1178 is a #define line no input runs Recipes: hmon_hitmon_misc_obj-hero-hits-newt-with-own-jellied-egg-tourist; hmon_hitmon_misc_obj-hero-hits-newt-with-five-own-eggs-samurai (variation). (5 new lines) |
| fresh 66 | `uhitm.c` `mhitm_ad_curs` | **Open.** 3067 a hero curse attack on a non-human-form lycanthrope, 3076-3078 a clay golem lifesaved after losing its word, 3080 an unseen tame clay golem destroyed: printed lines only, not traced (0 new lines) |
| fresh 69 | `uhitm.c` `do_stone_mon` | **Open.** 3954 munstone() curing the stoning monster, 3966-3968 the monster surviving, 3970 an unseen pet stoned: printed lines only, not traced (0 new lines) |
| fresh 72 | `write.c` `cost` | **Unreachable (provisional).** 20 and 23 are MAIL_STRUCTURES preprocessor lines; 52-56 the blank-paper and default impossible() (provisional) (0 new lines) |
| fresh 73 | `zap.c` `maybe_explode_trap` | **Done.** 3605-3610 run (cancellation zapped across a wished magic portal or vibrating square) Recipes: maybe_explode_trap-cancellation-spares-wished-magic-portal-monk; maybe_explode_trap-cancellation-spares-wished-vibrating-square-wizard (variation). (6 new lines) |

## Status after the `coverage-targets-4` pass (15 November 2026, PT)

Branch `coverage-targets-4` (worktree `.cache/lead/wt-targets4`, head `5ccfa22ee`), from `stack-b24` `397f540b7`; forks `coverage-targets-4a`, `-4b` and `-4c` are merged. "New" means not run in `map-current/` (refreshed at 12:29 PT to `397f540b`, so it includes pass 3) and not in the targets-2 union or `union3.json`.

**Totals (measured).** 61 new recipe files, each with a recording: fork A 18, fork B 20, fork C 19 and lead 4, of which 23 are cheap variations (A 8, B 6, C 7, lead 2). All 61 recordings replay with PASS at `5ccfa22ee`, and `targets4-tools/endcheck.py` finds none ending on an open --More--, menu or prompt. A `probe.py` run over all 61 recipes, less map-current, the targets-2 union and union3, runs **157 C gameplay lines** and no new Lua lines (union list: `.cache/lead/targets4-tools/union4.json`). Ledgers: `targets4-tools/ledger-{lead,a,b,c}.tsv`; fork notes: `targets4-tools/notes-{a,b,c}.md`.

**Defects.** None. Fork B suspected that potions thrown at a saddled pony never hit the saddle, but `js/potion.js` potionhit() tests the saddle with the same rn2(10) and holy-water rnl() calls as potion.c 1644-1651; nine misses in a row occur about 39% of the time.

**`dothrow.c` `toss_up`.** The line numbers are correct. `recorder-lua/src/dothrow.c` is identical to upstream, 1333 is the `return FALSE` after a breakable object is destroyed (23 runs, matching 1328), 1334 is a comment, and 1335-1336 are the `hitfloor()` path for an object that survives breaktest(), such as crystal plate mail that does not shatter. Pass 3's suspicion that the lcov lines were shifted was a misreading. The cluster stays open.

**Coverage of the ranking.** `rank4.py` ranked 1,454 clusters (4,393 lines). All of ranks 1-120 were examined, plus fork C's overflow from 122 to 165: 136 clusters (5 done, 33 done in part, 41 open, 57 unreachable). Nine of them (lead rows at ranks 89, 94, 95, 97, 98, 99, 114, 118 and 119) rest on a reading of the printed C lines only, without a probe. Ranks 121-165 outside fork C's slice (29 clusters) were not examined. The pass stopped at the recipe cap (61). The line rule was not met inside ranks 1-120: ranks 101-120 ran 26 new lines. The last 20 examined clusters overall (ranks 117-165) ran 2.

**Unreachable verdicts below are provisional: each rests on one reading of the C.**

| Rank | Cluster | Status |
| ---: | --- | --- |
| 1 | `makemon.c` `clone_mon` | **Done in part.** `recipes/makemon.c/clone_mon-polymorphed-minion-pudding-divides`, `-angered-knight` (variation) (919-927, 6 lines; both pass): a monpolycontrol debug hero turns an aligned-cleric minion into a brown pudding and splits it. Unreachable (provisional): 857-860 impossible(); 900-901 (only puddings, gremlins and long worms clone; none emits light). Also `recipes/makemon.c/clone_mon-shopkeeper-gremlin-multiplies-in-water` (906-907; passes): a shopkeeper forced into a gremlin multiplies in thrown water (validspecmon() refuses puddings for shopkeepers). Open: 863 (enexto() fails only on a full level). |
| 2 | `mhitu.c` `getmattk` | **Done in part.** `recipes/mhitu.c/getmattk-high-energy-hero-energy-vortex`, `-healer` (variation) (364; both pass): 13 blessed potions of gain energy give a level-1 hero over 120 maximum energy, then an energy vortex engulfs. Unreachable (provisional): 322 and 327-335 (SYSOPT_SEDUCE off needs sysconf). |
| 3 | `mondata.c` `Resists_Elem` | **Done in part.** `recipes/mondata.c/Resists_Elem-twoweapon-samurai-slides-off-ice`, `-rogue` (variation) (184; both pass): slippery_ice_fumbling() asks resists_cold(&youmonst) of a two-weaponing hero. Unreachable (provisional): 159-168 (the resists_* macros pass only properties 1-8). Open: 195 (a monster carrying the Mitre of Holiness hit by fire; a peaceful and a tame dwarf left it on the floor in two tries). |
| 4 | `polyself.c` `dohide` | **Open.** Unreachable (provisional): 1802-1808 (domonability() offers hiding only to is_hider or hides_under forms; no eel has either). Open: 1793-1796 (#monster while already hidden or disguised and also stuck or trapped; an attack always unhides the hero first). |
| 5 | `weapon.c` `show_skills` | **Unreachable (provisional).** only caller is end.c 602 dump_everything(), whose body is #ifdef DUMPLOG; config.h 669 leaves DUMPLOG undefined (map runs only end.c 546). (0 new lines) |
| 6 | `weapon.c` `weapon_hit_bonus` | **Done in part.** 1594-1596 two-weapon Skilled, 1628-1629 riding Expert run; 1560-1562 and 1583-1585 impossible() defaults (provisional unreachable). Recipes: weapon_hit_bonus-twoweapon-skilled-samurai; weapon_hit_bonus-riding-expert-knight-mounted (variation). (5 new lines) |
| 7 | `weapon.c` `weapon_dam_bonus` | **Done in part.** 1689-1691 two-weapon Skilled, 1722-1724 riding Expert run; 1655 P_NONE needs use_weapon_skill with a non-weapon, 1658-1660 and 1681 bad-skill defaults (provisional unreachable). Recipes: (same two recipes). (6 new lines) |
| 8 | `zap.c` `montraits` | **Done in part.** `recipes/zap.c/montraits-shopkeeper-killed-and-revived-in-shop`, `-valkyrie` (variation) (812-818, with mon.c replmon 2552 and shk.c replshk 281-286; 11 lines; both pass): a shopkeeper killed by a wand of death is revived by undead turning zapped down on the corpse. Unreachable (provisional): 740-742 (makemon() fails at the corpse spot only when enexto() finds no square). Open: 774 (reviving a dead quest leader). |
| 9 | `zap.c` `bhitpile` | **Done in part.** 2469-2473,2475,2477-2478,2501 run (snake hero hidden under a pile casts force bolt down); 2474-2476 need zz<0, but zap_updown() calls bhitpile() only when zapping down (3244 probing down, 3384 u.dz>0): unreachable (provisional); 2479-2480 not reached (no variation: snakes cannot zap wands). Recipes: bhitpile-hidden-snake-force-bolt-down. (9 new lines) |
| 10 | `artifact.c` `arti_immune` | **Unreachable (provisional).** no caller: grep -rn arti_immune src include finds only the definition (artifact.c 979) and its extern.h declaration. (0 new lines) |
| 11 | `artifact.c` `spec_applies` | **Unreachable (provisional).** 1021 SPFX_DMONS and 1025 SPFX_DFLAG1: no artilist.h entry sets either; 1046 AD_MAGM, 1049-1050 AD_DRST, 1053-1054 AD_STON: no artifact attack has those adtyps (only Magicbane STUN, Stormbringer/Staff DRLI, elemental brands); 1055-1056, 1059 impossible() default (provisional). (0 new lines) |
| 12 | `ball.c` `drag_ball` | **Done in part.** 839-840 run (^T to two squares from the ball with a wished tree in the chain's middle square); 720 and 752 unreachable (provisional): 588 returns early whenever dist2(new, chain) <= 2, so CHAIN_IN_MIDDLE(uchain) cannot hold in the switch; 683 and 692 unreachable (provisional): in case 5 dist2(new, temp) is always 1 and dist2(new, temp2) always 2, so 683 (temp, ==2) and 692 (temp2, ==1) cannot hold; 765-767 impossible(); 806 open (ball jerked back from a chain on a pit or pool with a monster on the chain square, and the to-hit roll succeeds; not set up). Recipes: drag_ball-teleport-beside-ball-past-tree; -vertical (variation). (2 new lines) |
| 13 | `explode.c` `mon_explodes` | **Unreachable (provisional).** 1028-1033 need an AT_EXPL attack with no dice count, and every exploding monster has one; 1044-1047 impossible(). |
| 14 | `mhitm.c` `mdisplacem` | **Open.** Unreachable (provisional): 189, 194 sanity returns; 205 (mm_displacement() refuses a diagonal grid-bug swap first); 227-228 (no displacer turns into a stone golem). Open: 239-241 (a tame displacer beast stoned while unseen; one blindfolded 40-turn wait beside a peaceful cockatrice produced no swap), 248 and 254 (a Rider displacing a tailless long worm). |
| 15 | `mhitu.c` `mattacku` | **Done in part.** `recipes/mhitu.c/mattacku-hidden-piercer-drops-beside-eel`, `-samurai` (variation) (576-580; both pass): a giant eel in a pool attacks a hidden piercer hero on land and draws back. Unreachable (provisional): 515 (dead attackers are skipped by the caller). Open: 590 (a long worm whose tail fills the landing spot), 701 (a polymorphed hero mimicking gold after eating a mimic corpse, attacked during the mimicry), 783, 857 (a purple worm attacking the wrong square; an invisible, displaced level-30 Samurai was found and engulfed in three tries). |
| 16 | `mkobj.c` `dealloc_obj` | **Unreachable (provisional).** 2750-2763 are impossible() and panic() reports for a deleted, non-free, linked or hands_obj object (provisional). (0 new lines) |
| 17 | `sp_lev.c` `create_room` | **Unreachable (provisional).** 1500 needs a des.room type that maps to -1 (get_table_roomtype_opt has no random type in any dat); 1590-1592 a room with a given position or alignment but random size (every dat des.room with x,y or xalign also gives w,h); 1605-1607 xalign right and 1615-1617 yalign bottom: random alignment is rnd(3) in {LEFT=1,H_LEFT=2,CENTER=3} and no dat des.room passes xalign=right or yalign=bottom (grep) |
| 18 | `sp_lev.c` `lspo_gold` | **Unreachable (provisional).** 4491-4498 the 3-argument and (amount, coord) forms: dat uses only des.gold() (hellfill.lua 75) and the table form (knox.lua 58); 4506-4509 nhl_error |
| 19 | `spell.c` `spelleffects` | **Done in part.** 1429-1433 (Skilled cone of cold cast while engulfed: throwspell() zeroes u.dx/u.dy and zapyourself() returns damage) and 1487 (atme: wizard-mode m^T 's' casts teleport away at self) run; 1591-1594 impossible() default (provisional unreachable). Fireball variation: zapyourself() returns 0 for SPE_FIREBALL, so it runs no new line. Recipes: spelleffects-skilled-cone-of-cold-cut-short-engulfed; -skilled-fireball-cut-short-engulfed (variation); spelleffects-teleport-away-at-self-via-m-ctrl-t. (6 new lines) |
| 20 | `spell.c` `show_spells` | **Unreachable (provisional).** only caller is end.c 602 dump_everything(), compiled out (DUMPLOG undefined, config.h 669). (0 new lines) |
| 21 | `steal.c` `mpickobj` | **Open.** Unreachable (provisional): 624-632 impossible(). Open: 642-643 (a monster picking up an unpaid object from the floor; theft, throwing and dropping in a shop all take the item off the bill first, so no source of an unpaid floor object was found). |
| 22 | `trap.c` `maketrap` | **Done in part.** `maketrap-pit-wished-on-iced-drawbridge-span`; `maketrap-trap-door-then-spiked-pit-on-drawbridge-span (variation)` (8 new lines; passes). 536-545 run (pit wished on the castle span after wishing ice: DB_ICE becomes DB_FLOOR, was_ice); 571-572 impossible() (a fixed-destination teleport trap pointing at itself; dat teledest picks a different square) |
| 23 | `trap.c` `domagictrap` | **Done in part.** `domagictrap-ring-invisible-hero-feels-more-hidden`; `domagictrap-intrinsic-invisible-hero-with-see-invisible (variation)` (5 new lines; passes). 4369-4370, 4374-4376 run (fate 11 under see invisible / an extrinsic source); 4432 closing brace after break and 4446-4448 default (fate is rnd(20), every value has a case) unreachable (provisional); 4426 needs a hero on the map edge row or column so isok() fails (open: no level puts floor on x=0/y=0/ROWNO-1 reachable by a sitting hero, not checked) |
| 24 | `detect.c` `object_detect` | **Open.** 618-620 impossible() (provisional); 689 needs a detector finding no object anywhere (floor, buried, monster inventories): a potion of object detection quaffed on arrival at the Plane of Air still detected objects (the Wizard of Yendor arrives with the Amulet); 670 and 740 need a parked vault guard (isgd, mx 0) or a dead monster still on fmon; 706-708 a buried container holding a matching class (not tried). Note: there is no scroll of object detection, a wish for one gives a random scroll. (0 new lines) |
| 25 | `do_wear.c` `accessory_or_armor_on` | **Open.** 2232-2233 open: a converted hero (ualignbase current != original) putting on a helm of opposite alignment in the quest dungeon (not set up: conversion needs an angry god and a cross-aligned altar sacrifice); 2344-2345 unreachable (ublindf is only a towel, blindfold or lenses); 2350-2351 unreachable: equip_ok() excludes every object that is not armor, ring, amulet, meat ring, blindfold, towel or lenses, and W* then a weapon prints 'That is a silly thing to wear.'; 2392-2393 panic() (provisional). (0 new lines) |
| 26 | `dog.c` `wary_dog` | **Open.** Unreachable (provisional): 1300 (every caller tests mtame first). Open: 1305-1308 (a pet that starved to death, then revived), 1322-1323 (an eyeless pet killed by the hero and lifesaved), 1330 (a revived pet going wild, 1 in mtame+1), 1343 (a lifesaved steed turning feral). Not attempted: they need a pet wearing an amulet of life saving or about 1,500 unfed turns. |
| 27 | `dothrow.c` `throwit` | **Done in part.** 1745-1746 (blind Mjollnir return hits the thrower) and 1773-1775 (aklys fails to return while engulfed; wait count from a scan) run; 1724 unreachable (provisional): addinv() never quivers Mjollnir or an aklys (invent.c 1138, and 1282 only quivers missiles or launcher ammo), so the returned weapon cannot carry W_QUIVER; 1669 open (throwing the ball while utraptype TT_INFLOOR); 1689 and 1703 open (a tethered aklys destroyed or handled in flight). Recipes: throwit-blind-mjollnir-returns-and-hits-arm; throwit-aklys-fails-to-return-inside-fog-cloud; throwit-aklys-lands-at-feet-inside-dust-vortex (variation). (5 new lines) |
| 28 | `invent.c` `check_invent_gold` | **Unreachable (provisional).** 4899 and 4903-4910 need gold outside slot $ or two gold stacks in inventory, an impossible() state (addinv() merges coins into $) (provisional). (0 new lines) |
| 29 | `mon.c` `meatbox` | **Unreachable (provisional).** 1361 (the caller tests Has_contents); 1367-1370 and 1378-1380 need a container eaten by something other than a gelatinous cube, but containers are wood, cloth or plastic and only cubes eat organic objects; 1374 (an ice box is plastic, which cubes do not eat). |
| 30 | `mon.c` `replmon` | **Done in part.** 2552 runs in the montraits recipes. Unreachable (provisional): 2521-2524 (montraits() makes the monster with NO_MINVENT), 2550 (a steed is never revived from a corpse). Open: 2528 (reviving the current polearm target), 2537 (a revived long worm), 2548. |
| 31 | `mon.c` `validvamp` | **Done in part.** `recipes/mon.c/validvamp-vampire-forced-vortex-class-becomes-fog-cloud`, `-vlad` (variation) (5036-5038, 5060-5062; both pass). Unreachable (provisional): 5054-5056 (every S_VAMPIRE form is a shapeshifter, so a V class choice returns at 5039-5043). |
| 32 | `potion.c` `potionhit` | **Done in part.** 1685-1688 run (oil thrown upward falls on the hero, unlit then lit); 1721-1723 open (a polymorph potion hitting a saddle, 1 in 10 per hit: 9 port hits on a Knight's pony gave no saddle hit, and the scan was swamped by a kobold fight); 1863 open (water rusting an iron golem below 7 HP); 1920-1922 unreachable (provisional): the C comment says an unpaid potion with no keeper, or one thrown by a monster, cannot happen. Recipes: potionhit-oil-tossed-up-unlit-then-lit. (4 new lines) |
| 33 | `priest.c` `ghod_hitsu` | **Open.** 817-825 need the hero on an east, north or south temple door, not lined up with the altar, when the priest is attacked. Scanned temples with such doors: Dlvl 10 seed 6100798 (door 16,4) and Dlvl 12 seeds 6100749 (43,6) and 6100760 (51,11), Valkyrie, datetime 20420909120000. The priest stays on its altar, so any ranged attack from the door is lined up; a level-30 Valkyrie who angered it in melee was paralysed and killed before returning to the door. |
| 34 | `shk.c` `money2u` | **Open.** 191-198 impossible(); 206-207 need 52 non-gold inventory slots and no gold when a shopkeeper pays (sell part of a stack) or a coaligned priest gives ale money: about 50 wishes, not done |
| 35 | `shk.c` `shop_keeper` | **Unreachable (provisional).** 1065-1077 impossible(): a room resident without eshk (provisional) |
| 36 | `shk.c` `add_one_tobill` | **Open.** 3324 bill_p unset (an object grappled from outside a never-entered shop, see remote_burglary); 3328/3337-3340 a container child that billable() rejects: tried an unpaid candle stashed in a floor bag and in a carried bag that was dropped and picked up in Izchak-type candle shop (minetn-7): both clear the bill first, 0 new lines; an oeaten shop food item inside a picked-up container is untried; 3331-3333 a full 200-entry bill |
| 37 | `sp_lev.c` `splev_initlev` | **Unreachable (provisional).** 2985-2987 impossible(); 2988-2989 style none and 3001-3003 style rogue: no dat level_init uses either (grep level_init); 3014 a swamp with random lit: juiblex.lua 9 passes lit=0 |
| 38 | `sp_lev.c` `lspo_monster` | **Unreachable (provisional).** 3316-3322 tail=false, group=false, adjacentok, ignorewater; 3331 appear_as mon:; 3335-3336 nhl_error; 3367/3374 keep_default_invent true/false: no dat/*.lua passes any of them (grep) |
| 39 | `sp_lev.c` `lspo_level_flags` | **Unreachable (provisional).** 3767 no arguments; 3785-3787 shroud and graveyard; 3801 noflipx; 3822-3827 unknown flag: no dat level_flags call uses them (grep) |
| 40 | `sp_lev.c` `ensure_way_out` | **Unreachable (provisional).** only minetn-6.lua sets inaccessibles; its stairs are levregions placed later and it makes no traps before ensure_way_out (6025-6027), so the stairway (5228-5231) and trap (5234-5238) loops never run (provisional) |
| 41 | `zap.c` `dobuzz` | **Done in part.** 5029-5030, 5032-5035 run (fire and lightning rays break the shop door; 5031 is a comment); 4815 unreachable (provisional): MAGIC_COOKIE needs disintegration breath, i.e. a black dragon hero, which engulf_target() and polymon() 913-919 never leave swallowed; 4809 open (zhitm() leaving u.ustuck null; not traced); 5012 open (an unskilled fireball ray reaching the map edge on the Plane of Air). Recipes: dobuzz-fire-ray-burns-shop-door; dobuzz-lightning-ray-splinters-shop-door (variation). (6 new lines) |
| 42 | `apply.c` `use_pole` | **Done in part.** 3528 (statue trap animated) and 3485-3487 (x-ray-visible spot beyond a wall) run; 3460-3462 open (two poleable monsters in range after hitting one, so the cursor defaults to the remembered target); 3500 open (overexertion() fainting a heavily encumbered hero at low HP). Recipes: use_pole-glaive-wakes-statue-trap; use_pole-eyes-of-the-overworld-cannot-reach. (4 new lines) |
| 43 | `bones.c` `fixuporacle` | **Done.** `fixuporacle-teleported-oracle-moved-home-in-bones`; `fixuporacle-oracle-on-ordinary-level-left-out-of-bones (variation)` (8 new lines; passes). 339-344 and 348 (Oracle teleported out of the Delphi, then bones saved), 318 (a forced Oracle on Dlvl 3 in bones) |
| 44 | `detect.c` `sense_trap` | **Unreachable (provisional).** 875-877 need a null trap with the cursed or hallucinating display, and 892-896 a null trap otherwise (the C comment calls it obsolete): every caller (detect.c 942, 979, 988, 1674, 1683) passes a trap or dummytrap (provisional). (0 new lines) |
| 45 | `detect.c` `furniture_detect` | **Done in part.** 1119 runs (crystal ball on the Plane of Air, which has no furniture); 1107-1113 open: a mimic shown as furniture (M_AP_FURNITURE fountain or altar, which set_mimic_sym() gives in the Delphi or a temple) seen by a crystal-ball furniture search. Recipes: furniture_detect-crystal-ball-plane-of-air; -altar-symbol (variation). (1 new lines) |
| 46 | `detect.c` `openone` | **Open.** only caller openit() (detect.c 1923) runs for a charged Bell of Opening rung while blessed (apply.c 1286) or uncursed inside an engulfer (1258); 1766-1769 need a secret corridor in view, 1775-1777 an unseen non-statue trap in view. One try: a wished blessed Bell rang with 'Nothing happens' (no charges) and the secret-corridor wish needs the hero on a corridor square; not finished. (0 new lines) |
| 47 | `display.c` `map_glyphinfo` | **Unreachable (provisional).** 2639-2644 and 2651-2652 need sysopt.accessibility == 1, a sysconf setting (provisional) |
| 48 | `do_wear.c` `canwearobj` | **Unreachable (provisional).** 2058-2060 need worn armor, but both callers (2225 after getobj, 3432 in equip_ok) see only unworn armor; 2193-2195 need armor in no slot category: every ARMOR_CLASS object is a helmet, cloak, shield, gloves, boots, shirt or suit (provisional). (0 new lines) |
| 49 | `dog.c` `mon_arrive` | **Unreachable (provisional).** 562-563 debug fuzzer; 593-594 somexy() failing; 548-551 a pet arriving by portal on an endgame plane, not tried. |
| 50 | `dog.c` `mon_catchup_elapsed_time` | **Unreachable (provisional).** 636-641 panic() and impossible(); 644 LARGEST_INT moves; 714-716 impossible(). |
| 51 | `end.c` `should_query_disclose_option` | **Unreachable (provisional).** 487-492 and 514-515 impossible() for a bad disclosure index or category |
| 52 | `explode.c` `adtyp_to_expltype` | **Unreachable (provisional).** 1001-1005 and 1008-1010 need an AT_EXPL or AT_BOOM attack of type DRST/DRDX/DRCO/DISE/PEST or another unlisted type; the explode attacks in monsters.h are only fire, cold, elec, blind, hallu, stun and gas spore PHYS (provisional, grep of AT_EXPL/AT_BOOM not repeated per entry). (0 new lines) |
| 53 | `mklev.c` `generate_stairs` | **Open.** 2261/2274 panic(); 2264-2266 and 2277-2279 need a stair room with no free square for somexyspace(); 110,999 generations never had one (rare, not targeted) |
| 54 | `mklev.c` `mkinvpos` | **Open.** 2521-2525 the invocation area clipped within 5 of the map edge (vibrating-square placement keeps it away; provisional unreachable); 2575-2577 impossible(); 2583 a disguised mimic inside the invocation area when the ritual is done: needs the full invocation at the vibrating square (not tried, costly) |
| 55 | `mkobj.c` `mkbox_cnts` | **Unreachable (provisional).** 333-335 default: the only caller (mkobj.c 1021) passes the six listed container types; 357 mkobj() never returns null; 373-376 a magic bag made inside a bag of holding: boxiprobs has no TOOL_CLASS entry, so Is_mbag() never holds (provisional) |
| 56 | `mkobj.c` `place_object` | **Unreachable (provisional).** 2310-2315 off-map impossible()/panic(), 2322-2325 not-free panic() |
| 57 | `mon.c` `vamp_stone` | **Open.** 3792 needs a fog-cloud vampire killed while engulfing the hero by something other than the hero (the hero's own kill expels first); 3793-3799 a fog-cloud vampire killed on a closed door; 3807-3808. |
| 58 | `mon.c` `elemental_clog` | **Unreachable (provisional).** 3940-3948 are the last resort when no monster on a full endgame plane can be removed. |
| 59 | `mon.c` `newcham` | **Done in part.** `recipes/mon.c/newcham-cancelled-chameleon-uncancelled-by-polymorph`, `-barbarian` (variation) (5305; both pass): a cancelled chameleon is uncancelled by a polymorph zap. Open: 5295 (a Rider always resists wands and potions; a green slime under conflict died to Famine first), 5339-5340 (a genocided form passed in: genocide also kills a shapeshifted vampire, and a revived genocided corpse does not get there), 5354, 5423, 5512. Unreachable (provisional): 5338 (50 rejected random forms), 5378 (overflow guard). |
| 60 | `mondata.c` `same_race` | **Done in part.** `recipes/mondata.c/same_race-polymorphed-imp-unicorn-mummy-eat-lichen`, `-samurai` (variation) (806, 820, 830; both pass): a hero polymorphed into an imp, a white unicorn and an ettin mummy eats a lichen corpse in each form. Unreachable (provisional): 813 (the hero cannot take a Rider form), 837-838 (or a ghost form). Open: 855-856 (not traced). |
| 61 | `monmove.c` `m_move` | **Open.** Unreachable (provisional): 1817-1819 impossible(); 2040 (m_in_out_region() fails only through a region callback no region sets). Open: 1737-1739 (a trapped monster killed while escaping), 1797 (a covetous monster killed by its own attack). |
| 62 | `region.c` `m_in_out_region` | **Unreachable (provisional).** 540 and 554 need a region attached to a monster; 546-548, 559 and 571 need region callbacks; no create_region() caller sets either (see pass 3, rank 137). |
| 63 | `shk.c` `shk_move` | **Open.** 4919-4922 a deaf hero or mute shopkeeper following an unpaid customer (Deaf branch of 'Didn't you forget to pay?'); 4925-4928 the 1-in-9 rile; both need a shopkeeper following the hero out of the shop with unpaid goods (not tried) |
| 64 | `sp_lev.c` `get_room_loc` | **Unreachable (provisional).** 1369 panic(); 1371-1377 need get_free_room_loc() retry with a non-negative coordinate, but it passes *x,*y from callers that ask for random placement (448 entries, all random) (provisional) |
| 65 | `sp_lev.c` `generate_way_out_method` | **Open.** 5167-5169 (+x secret door), 5181-5183 (+y), 5209 (no way out): random outcomes of the minetn-6 inaccessible-area fix; 485 generations in map-current never took them; would need a seed scan of minetn-6 layouts (not tried) |
| 66 | `sp_lev.c` `get_coord` | **Unreachable (provisional).** 5342-5345, 5351-5354, 5363-5364 nhl_error for malformed coordinates; dat files pass valid ones |
| 67 | `steal.c` `stealamulet` | **Done in part.** `recipes/steal.c/stealamulet-wizard-takes-unpaid-quest-artifact-in-shop` (758, with shk.c getprice 4326; passes): the Wizard of Yendor steals a sold-back, unpaid Mitre of Holiness. Unreachable (provisional): 740-742, 746-749, 752 (no quest artifact is a suit, shirt, pair of gloves or ring). No variation: costly setup. |
| 68 | `trap.c` `trapeffect_sqky_board` | **Unreachable (provisional).** 1420-1426 need a levitating or flying hero with forcetrap false, but dotrap() 3026 returns first whenever check_in_air() holds without forcetrap, and every forcing path (FORCETRAP, FAILEDUNTRAP, flying while sitting) sets forcetrap; a levitating step onto a wished board ran 0 lines. 1442 needs an in-air monster forced onto a board: mintrap() 3809 returns first and no FORCETRAP caller (muse.c 410/3140, trap.c 2642/6244/6285) uses a squeaky board (provisional) |
| 69 | `wizard.c` `tactics` | **Open.** Unreachable (provisional): 467 (NOTREACHED). Open: 398-400 and 461 (mnearto() finds no room near the target), 425-426, 450. Not attempted. |
| 70 | `worn.c` `m_dowear_type` | **Open.** 967 (a monster replacing lit gold dragon scale mail) and 983-989 (a monster putting on gold dragon armor in a spot the hero could not see before it lit). Not attempted. |
| 71 | `artifact.c` `invoke_taming` | **Unreachable (provisional).** only TAMING artifact is the Palantir of Westernesse, inside an #if 0 block in artilist.h 238-246. (0 new lines) |
| 72 | `artifact.c` `arti_invoke` | **Unreachable (provisional).** 2137-2139 null obj impossible(); 2155 TAMING has no compiled artifact (Palantir is #if 0); 2173-2175 unknown-power impossible() (provisional). (0 new lines) |
| 73 | `bones.c` `resetobjs` | **Done in part.** `resetobjs-unique-corpse-becomes-doppelganger-in-bones` (1 new lines; passes). 164 run (a unique corpse with omonst in bones); 60-63 an in_use object at bones time: a wand broken to death is used up first (open); 138 a scroll of mail with spe 0 needs real mail delivery (unreachable, provisional); 169 the Mines or Sokoban prize carried to another level before dying (open, not tried) |
| 74 | `botl.c` `rank_of` | **Unreachable (provisional).** 342 a monster number that is no role: callers pass role monsters (hero, player monsters, topten classmon()); 353-358 a role without a rank title for the level: every role has all nine male titles (provisional) |
| 75 | `dbridge.c` `destroy_drawbridge` | **Done in part.** `destroy_drawbridge-pit-on-span-deleted-when-bridge-disintegrates`; `destroy_drawbridge-blind-hero-hears-crash (variation)` (3 new lines; passes). 944 (pit on the span deleted) and 935-936 (blind) run; 900 a non-drawbridge location (callers check first, provisional unreachable); 946 a trap on the portcullis square (no trap can be made on DBWALL, provisional); 994-995 a hallucinating hero seeing a monster crushed (open) |
| 76 | `dig.c` `liquid_flow` | **Unreachable (provisional).** 850-856 run only when a caller passes a spot that is not pool, moat or lava; every caller (dig.c 979, 998, 1858; apply.c 4065; music.c 251; trap.c 3205) sets the liquid type first (provisional). (0 new lines) |
| 77 | `do.c` `revive_corpse` | **Open.** 2148 and 2205 need a corpse reviving inside a container carried by a monster the hero can see; a tame dwarf given a bag holding a fresh troll corpse took the corpse out and dropped both before it revived (4 tries); a troll reviving in a bag in the pack runs only lines already covered; 2203, 2238-2241 impossible(), 2216 not traced. (0 new lines) |
| 78 | `do_wear.c` `select_off` | **Done in part.** 2752-2755 run (taking off boots while stuck in lava cooled by a cold zap), and the same recipe runs dothrow.c throwit() 1669 (the carried ball thrown while TT_INFLOOR; counted here); 2702 needs select_off(NULL) (provisional unreachable: callers pass an object); 2817-2818 impossible(). Recipes: select_off-stuck-in-cooled-lava-boots-and-ball. (5 new lines) |
| 79 | `dogmove.c` `dog_nutrition` | **Open.** Unreachable (provisional): 179 (a default label), 199-200 and 202-203 (overflow guards). Open: 198 and 201 (a pet eating gold: a tame rock mole left 400 dropped coins alone for 890 turns; coins are acceptable food, eaten only when the pet is hungry). |
| 80 | `dogmove.c` `mnum_leashable` | **Done.** `recipes/dogmove.c/mnum_leashable-leashed-little-dog-mimics-kitten-samurai`, `-valkyrie` (7 lines; passes). 1463-1469: a leashed little dog quick-mimics a kitten after eating a small mimic corpse (quickmimic 1525-1527) |
| 81 | `dothrow.c` `throw_obj` | **Open.** 151-154 unreachable (provisional): welded() holds only for a cursed wielded weapon, which canletgo() refuses first ('You cannot throw something welded to your hand.'); 289-291 open: needs the thrown object still existing with the split stack's o_id (a counted partial throw; 't' with a count on 5 darts printed 'You can only throw one at a time'). (0 new lines) |
| 82 | `end.c` `done2` | **Unreachable (provisional).** 135-142 answer y to the debug-mode 'Dump core?' prompt, which aborts the program (NH_abort); no recording can continue (provisional) |
| 83 | `hack.c` `classify_terrain` | **Done in part.** `classify_terrain-xorn-in-rock-on-arboreal-quest-home`; `classify_terrain-xorn-in-wished-locked-door (variation)` (2 new lines; passes). 3108 and 3120 run; 3122-3127 a hero over a raised drawbridge span: flying onto the castle span with terrainstatus showed 'Stone' (lastseentyp is not DRAWBRIDGE_UP there) and ran 0 lines (open) |
| 84 | `invent.c` `doperminv` | **Unreachable (provisional).** tty_procs sets WC_PERM_INVENT only under TTY_PERM_INVENT (wintty.c 100-103), which config.h 612 leaves undefined, so doperminv() always takes the 'not supported' branch. (0 new lines) |
| 85 | `invent.c` `dotypeinv` | **Unreachable (provisional).** 3935-3941 need class_count <= 1, but every carried item counts in one of bcnt/ucnt/ccnt/xcnt, so a non-empty inventory adds ' ' plus a BUC letter to its class (3886-3898) (provisional). (0 new lines) |
| 86 | `light.c` `del_light_source` | **Unreachable (provisional).** 109-112 impossible() for LS_NONE; 119-121 default: callers pass only LS_OBJECT or LS_MONSTER |
| 87 | `light.c` `show_transient_light` | **Open.** 287-292 impossible(); 307 a parked vault guard (isgd, mx 0) on the level while a thrown lit lamp or camera flash lights it (not tried) |
| 88 | `light.c` `relink_light_sources` | **Unreachable (provisional).** 544, 549, 552-559 panic() paths for unmatched ids or a bad light type |
| 89 | `mhitm.c` `mattackm` | **Open.** 309 null magr/mdef: callers pass both (unreachable, provisional); 403 and 559 the aggressor dead after a weapon or other attack round; 438-440 a monster with a wielded weapon using a non-weapon attack on a touch-petrifier, without Conflict or confusion (strike forced to 0); 469 a split clone (mdef divides on an iron hit) whose mintrap() kills the aggressor; read 305-310, 400-404, 436-441, 466-470, 556-560 only, not probed |
| 90 | `mhitu.c` `gazemu` | **Open.** Unreachable (provisional): 1883-1885 (impossible() default). Open: 1730, 1744 and 1752 (a gaze reflected back at a gazer that also reflects), 1802. Not attempted. |
| 91 | `mkobj.c` `new_omailcmd` | **Unreachable (provisional).** entries=0; only mail delivery (mail.c 429), splitting or restoring an object that has OMAILCMD; no valid input delivers mail (provisional) |
| 92 | `mkobj.c` `stone_furniture_type` | **Done in part.** `stone_furniture_type-stone-to-flesh-reveals-temple-altar-mimic` (2 new lines; passes). 1285-1286 run (altar mimic in a temple); 1281-1284 a mimic disguised as stairs (random furniture roll in an ordinary room) and 1291 a wall mimic (a door-square mimic on the Rogue level) open |
| 93 | `mkobj.c` `check_glob` | **Unreachable (provisional).** 3435-3442 report an insane glob through insane_object() (sanity check of an impossible weight) (provisional). (0 new lines) |
| 94 | `mondata.c` `ranged_attk` | **Unreachable (provisional).** no caller: grep -rn "[^_]ranged_attk" src include finds only the extern declaration (provisional) |
| 95 | `monmove.c` `mon_yells` | **Open.** 109 and 113-118 are both in the Deaf branch: a deaf hero who can see a watchman or shopkeeper that yells (callers dokick.c 838-855 and monmove.c 186-189: kicking a Minetown door or picking a lock in sight of the watch); read only, not probed |
| 96 | `monmove.c` `monflee` | **Done in part.** `recipes/monmove.c/monflee-gremlin-flees-lit-gold-dragon-scale-mail-tourist`, `-healer` (2 lines; passes). 507-508 run (uarm light named); 470 DEADMONSTER guard (provisional unreachable); 498 an Unaware (sleeping or fainted) hero; 513-515 the 1-in-10 "Bright light!" shout (a 150-turn wait hit a --More-- loop first) |
| 97 | `monmove.c` `mind_blast` | **Open.** 605-606 a hiding hero (u.uundetected, such as a piercer form on the ceiling) when the blast locks on; 611-614 a hero mimicking an object (mimic form, #monster); 634 the m2 == mtmp skip is unreachable (provisional), since 629 already skips any monster whose mpeaceful equals the flayer own; read only, not probed |
| 98 | `mthrowu.c` `thitu` | **Open.** 89 panic() (unreachable, provisional); 99 a caller name starting with "the", "an" or "a"; 137-138 a potion scattered at the hero by an explosion (scatter()); 143-145 a silver missile hitting a silver-hating hero form; read 84-100 and 132-146 only, not probed |
| 99 | `mthrowu.c` `m_throw` | **Open.** 707-711 impossible() for a non-petrifying egg (unreachable, provisional); 725 hitv below -4, a monster throwing from 8 or more squares away; 840 a cream pie or venom blinding that leaves the hero not Blind; read 700-726 and 836-841 only, not probed |
| 100 | `music.c` `do_earthquake` | **Open.** 385 unreachable (provisional): wakeup(mtmp, TRUE) at 368 already calls seemimic() for a mimic (mon.c wakeup), so 383-384 never find one (a drum of earthquake beside a ^G giant mimic ran 0 new lines); 357 unreachable (the C comment: the largest force used is 10); 375-376 open (a seen ceiling hider still mundetected); 445 open (a secret corridor in view, 1/(14-force) per square); 423 and 471 open (a shop door collapsing). (0 new lines) |
| 101 | `o_init.c` `init_oclass_probs` | **Unreachable (provisional).** 255-262 impossible() for a class whose probabilities sum to zero or less; objects[] is fixed |
| 102 | `o_init.c` `doclassdisco` | **Open.** 993-996 need no discoveries at all, but Valkyrie, Barbarian, Caveman and Samurai games open the class menu at turn 1 (some objects are pre-discovered; not traced which); 910 unreachable (provisional: the sortdiscoveries option validates discosort); 1083 impossible(). (0 new lines) |
| 103 | `pager.c` `mhidden_description` | **Done.** `mhidden_description-probed-pet-dog-masquerading-as-kitten`; `mhidden_description-probed-kitten-masquerading-as-dog (variation)` (7 new lines; passes). 234-242: wand of probing at a pet quick-mimicking after eating a mimic corpse |
| 104 | `pager.c` `lookat` | **Open.** 723-727 warning and remembered-invisible glyphs: farlooking a warning '1' (blind hero with a ring of warning beside an ettin zombie) is answered by do_screen_description() before lookat() and ran 0 lines (likely unreachable, provisional); 786-787 farlooking mapped stone while underwater off the Plane of Water; 799-800 a glyph that is no mon/obj/trap/cmap (open, not tried) |
| 105 | `pager.c` `add_cmap_descr` | **Done.** `add_cmap_descr-whatis-water-symbol-by-symbol` (7 new lines; passes). 1154-1161: / by symbol '}'; a Plane of Water variation (limitless water) was abandoned: the Wizard of Yendor and the Amulet wish made it fragile |
| 106 | `pickup.c` `query_category` | **Unreachable (provisional).** 1300-1302 debugpline0() branch when the single-object shortcut finds no match after counting one (provisional); 1373-1376 impossible() too many categories. (0 new lines) |
| 107 | `pickup.c` `carry_count` | **Open.** 1618 and 1648 need gold taken from a container while too burdened to lift it all (adjust_wt), 1632-1634 the gold clamp; 1673-1675 lint-suppression else (unreachable, provisional); not tried. (0 new lines) |
| 108 | `pickup.c` `out_container` | **Done in part.** 2763-2766 run (a sold bag's daggers taken out on a costly square); 2735-2736 impossible(); 2742 open (touch_artifact() refusing an intelligent cross-aligned artifact inside a container). Recipes: out_container-sold-bag-contents-taken-out-in-shop. (4 new lines) |
| 109 | `shk.c` `reject_purchase` | **Open.** 2433 (the used-up stack inside a container) and 2444-2449 (deaf or mute keeper): need buying a stack whose part was used up; not tried |
| 110 | `shk.c` `get_cost` | **Done in part.** `cad-deaf-demon-hero-candelabrum-and-dunce-cap-in-shop` (1 new lines; passes). 2948 run (dunce cap); 2935-2938 impossible(); 2954 Cha above 18 (a ring of adornment: the wished one was silver, which a demon form cannot handle; open); 2977 a priced item whose cost rounds to 0 (open) |
| 111 | `shk.c` `special_stock` | **Done in part.** `cad-deaf-demon-hero-candelabrum-and-dunce-cap-in-shop (variation)` (4 new lines; passes). 3135-3138 run (deaf hero, candle-shop keeper who is not Izchak); 3114-3116 the same with Izchak (a Minetown variant whose candle shop is Izchak's; open) |
| 112 | `shk.c` `doinvbill` | **Unreachable (provisional).** 4210-4213 a used-up-bill query outside a shop with mode 1 (callers check *u.ushops first; mode 0 returns at 4212 only when the keeper left: open), 4238-4240 impossible() (provisional) |
| 113 | `shk.c` `cad` | **Done.** `cad-demon-hero-takes-pick-from-sack-in-shop` (3 new lines; passes). 5923-5925 run (demon form); 5926-5929 impossible() default |
| 114 | `sounds.c` `cry_sound` | **Open.** cry_sound() names the sound of a hatching egg: 625 the default for an oviparous species with an unlisted MS_ value, 638-640 MS_CHIRP (crocodile eggs), 647-649 MS_GRUNT; needs such an egg to hatch in sight; read 618-650 only, not probed |
| 115 | `sp_lev.c` `get_trapname_bytype` | **Unreachable (provisional).** entries=0; only nhl_gettrap (nhlua.c 442, nh.gettrap) calls it and no dat/*.lua calls nh.gettrap (grep) |
| 116 | `sp_lev.c` `lspo_trap` | **Unreachable (provisional).** 4437-4443 launchfrom: no dat des.trap passes it (grep launchfrom); 4459 unknown trap type nhl_error |
| 117 | `sp_lev.c` `lspo_region` | **Unreachable (provisional).** 5610-5611 and 5633-5636 nhl_error; 5657 and 5695 impossible() |
| 118 | `steal.c` `remove_worn_item` | **Unreachable (provisional).** 244-246 impossible() for embedded scales; 262-263 the "should never happen" armor catchall; 284-285 a worn bit outside armor, amulet, ring, tool, weapon, ball and chain (provisional); read 240-286 |
| 119 | `steed.c` `put_saddle_on_mon` | **Open.** 145-148: a saddle passed for a monster that cannot be saddled or already wears one (impossible() at 146; 147-148 also return for a null saddle on a saddled monster, open); 154-155 mksobj() failure and 158 panic() (unreachable, provisional); read 140-159 only, not probed |
| 120 | `teleport.c` `rloco` | **Open.** 2109-2111 need a Rider corpse teleported (Rider corpses come only from the Astral Plane's Riders); 2121 not traced; 2171-2175 a costly object teleported out of or into a shop by the hero (not tried). (0 new lines) |
| 122 | `timeout.c` `burn_object` | **Open.** 1467 and 1649 a lit lamp or candle burning out while on the migrating list; 1659/1665 the candelabrum default case (candles added while lit); 1672-1674 impossible() (not tried) |
| 123 | `topten.c` `classmon` | **Unreachable (provisional).** 1365-1366 a role with mnum NON_PM (none); 1370-1375 an old-format 'E' role or impossible(): the record holds only entries this version wrote (provisional) |
| 124 | `trap.c` `mintrap` | **Open.** 3754-3760 a monster trapped in a pit under a boulder escaping (1 in 40 per turn, then 1 in 2); not set up |
| 125 | `trap.c` `selftouch` | **Unreachable (provisional).** 3902-3909 two-weapon combat with a wielded cockatrice corpse as the secondary weapon; the C comment calls it hypothetical (twoweapon refuses corpses) |
| 126 | `trap.c` `drown` | **Done in part.** `drown-teleport-spell-fails-in-sokoban-pool` (1 new lines; passes). 5135 run; 5138-5141 drowning while still mounted: a non-swimming pony led into a wished pool drowns first and the hero falls in unmounted (open); 5149 a fainted hero; 5182 a waterbody named plain 'water' (open) |
| 129 | `vision.c` `dig_point` | **Unreachable (provisional).** 980-986 column 0 changes; no dig or terrain change happens at x=0 (provisional) |
| 130 | `vision.c` `fill_point` | **Unreachable (provisional).** 1061-1067 column 0, as dig_point (provisional) |
| 137 | `cmd.c` `click_to_cmd` | **Unreachable (provisional).** entries=0; mouse clicks only |
| 140 | `display.c` `reset_glyphmap` | **Unreachable (provisional).** 3070-3076 need sysopt.accessibility (sysconf) |
| 143 | `do_name.c` `docall_xname` | **Unreachable (provisional).** 618 and 622-630: objtyp_is_callable() rejects weapon, towel, statue, tin, figurine, ball and glob types (no description), so docall() never formats them; a wished runed dagger offered nothing to call (provisional) |
| 151 | `end.c` `container_contents` | **Done in part.** `container_contents-identified-sack-inside-sack-at-death` (1 new lines; passes). 1647 run; 1611 a container with lknown unset when listed identified (a wished sack had it set; open); 1654-1656 Schroedinger's box; 1657-1658 dumplog only |
| 153 | `hack.c` `dopush` | **Open.** 222, 225, 234, 238, 242-243: pushing an unpaid shop boulder across the shop boundary (free spot, doorway via Passes_walls, out of the shop); not set up |
| 154 | `insight.c` `ustatusline` | **Open.** 3439 stunned self-probe: getdir()/use_stethoscope() call confdir(), which randomizes the direction whenever Stunned, so '.' never reaches ustatusline() (provisional unreachable); 3460-3462 concealed or disguised and 3471-3472 holding: every hiding, mimicking or sticky hero form lacks hands to zap or apply (open: a cursed-wand backfire into zapyourself() not checked); 3415 both food poisoning and illness (open) |
| 160 | `light.c` `whereis_mon` | **Open.** 412-417 a light-emitting monster on the mydogs list (a lit pet following the hero between levels when light sources are saved), not tried |
| 164 | `mkmaze.c` `mk_bubble` | **Unreachable (provisional).** 1894 bubble outside the water level bounds, 1896-1901 impossible()/panic() (provisional) |
| 165 | `mkobj.c` `free_omailcmd` | **Unreachable (provisional).** entries=0; mail command extras only (see new_omailcmd) |

## Status after the `coverage-targets-3` pass (15 November 2026, PT)

Branch `coverage-targets-3` (worktree `.cache/lead/wt-targets3`, head `fb529f7d8`), from `stack-b23` `759d2e432`. "New" means not run in `map-current/` (refreshed 08:00 PT with batches 18 and 20) and not in the targets-2 union (`targets2-tools/final-union.json`).

**Totals (measured).** 49 new coverage recipes, each with a recording, plus the fixed saddle recipe and its new variation (51 recipe files). All 51 recordings replay with PASS on `fb529f7d8`. A `probe.py` run over all 51, less the targets-2 union, runs **222 C gameplay lines** that map-current never ran, and 0 new Lua lines (union list: `.cache/lead/targets3-tools/union3.json`). Ledgers: `targets3-tools/ledger-{lead,a,b,c}.tsv`; per-fork notes: `targets3-tools/notes-{lead,a,b,c}.md`.

**Defect D5 (fixed).** `cmd.c` `dokeylist()` 2965-2980 lists each special key that is unbound or shares a movement or earlier special key as "[name]"; `keyBindingLines()` in `js/cmd.js` never printed that list. Fix `772e5c0b6`; evidence `recordings/cmd.c/dokeylist-count-prefix-bound-to-movement-key`, which fails on `stack-b23` (screen 3/4; log `targets3-tools/D5-dokeylist-on-stack-b23.log`) and passes after.

**Saddle recipe.** `recipes/apply.c/apply-saddle-knight-independent` now sets `playmode:debug` and uses number_pad directions; `-forced-mount` is its variation. Both pass; neither runs new lines.

**Coverage of the ranking.** 154 clusters were examined (lead 31, fork A 32, fork B 25, fork C 66), counted once the C was read and a verdict written. Of the 220 largest clusters in `rank3-initial.txt`, about 70 were never examined: fork A's from rank 130, fork B's from rank 90, and 13 of fork C's (listed in `notes-c.md`). In rank order, the last 20 examined clusters (ranks 149-220) ran 5 new lines.

**Unreachable verdicts below are provisional: each rests on one reading of the C.**

| Rank | Cluster | Status |
| ---: | --- | --- |
| 10 | `uhitm.c` `mhitm_ad_phys` | **Done in part.** `recipes/uhitm.c/mhitm_ad_phys-ape-blessed-gloves-claw-shade`, `-pet-grimtooth-poisons-lichen-under-conflict` (5 lines; passes). 3991-3994 ape vs shade, 4189-4190 Grimtooth poison; 4001 unreachable (AT_WEAP only with PHYS/CONF/DRLI/DRST; damageum skips AD_PHYS), 4175-4180 unreachable (artifact_hit never kills), 4137/4157/4066 open (monster weapon damage below 1 needs a weak base attack) |
| 13 | `hack.c` `still_chewing` | **Done.** `recipes/hack.c/still_chewing-rock-mole-shop-and-mines-walls` (7 lines; passes). 754-756 shop wall, 761 Mines filler; also shk.c cad 5920-5922 |
| 17 | `topten.c` `readentry` | **Open in part.** 253, 255-257, 260-273, 282 unreachable (provisional): the record holds only lines writeentry() wrote in this game version, with bounded fields; 294 and 296 open: a datetime before 1800 (yyyymmdd() maps tm_year < 70 to 20xx) plus a scored death in an earlier segment |
| 19 | `uhitm.c` `mhitm_ad_wrap` | **Open.** hero lines 3350-3368 need gn.notonhead (a long-worm tail target, tailmiss=!notonhead); python hero is too slow to survive, guardian naga hug never fires (spit breaks the two-hit chain); 3381 a wrapper vs an oilskin hero; 3421 a cancelled wrapper vs a monster; tried python, guardian naga, cancelled tame python |
| 26 | `uhitm.c` `hmon_hitmon_weapon_melee` | **Done in part.** `recipes/uhitm.c/hmon_hitmon_weapon_melee-blind-katana-shatters-unseen-weapon` (3 lines; passes). 998,1003-1004 blind shatter; 1021-1025 provisional unreachable (artifact_hit never kills a monster defender itself) |
| 31 | `do_name.c` `minimal_monnam` | **Open.** 1260-1270 null/invalid mon checks and 1273-1275 (ckloc TRUE only from steed.c place_monster impossible()) unreachable (provisional); 1281-1282 need a shapeshifter on the migrating list shown by #migratemons (its random-migrate option makes new monsters, so a chameleon must fall through a trap door): open |
| 34 | `hack.c` `in_rooms` | **Unreachable (provisional).** 3516-3518, 3555-3558: SHARED_PLUS is never assigned (grep -n SHARED_PLUS src/*.c finds only the case label); 3528/3530 a SHARED square in column 0 or past COLNO; 3535-3538, 3548 a SHARED wall on row 0 or row 20: no room wall lies there (provisional) |
| 55 | `dbridge.c` `do_entity` | **Open.** Castle drawbridge (^V menu j): monster on the portcullis when a wand of locking closes it (581, 588-593), a hallucinating hero watching one fall into the moat (744-745), a phasing hero on the bridge (709); walking to the bridge through the flipped Castle maze proved slow (^T is blocked on the Castle), not finished |
| 69 | `quest.c` `expulsion` | **Unreachable (provisional).** all in the seal branch; expulsion(TRUE) is never called (quest.c 336, 341, 353 pass FALSE) (provisional) |
| 77 | `botl.c` `opt_next_cond` | **Unreachable (provisional).** entries=0; only all_options_conds() for #saveoptions, whose config-file fopen fails in the recorder (see fork C all_options_autocomplete) (provisional) |
| 81 | `do.c` `u_collide_m` | **Unreachable (provisional).** 1417-1422 impossible(); 1439-1444 need mnexto() and rloc() both to fail on arrival (no free square on the level) (provisional) |
| 85 | `extralev.c` `roguecorr` | **Unreachable (provisional).** every unrun line is an impossible() report and its return (62, 68-70, 84, 104, 110-112, 126, 134); four Rogue-level generations ran 0 new lines (provisional) |
| 87 | `hack.c` `moverock_core` | **Open.** read only, not traced: 376, 428 (blind push), 539-542, 565, 573-574, 585 (a pushed shop boulder into a trap) |
| 88 | `mcastu.c` `mcast_spell` | **Unreachable (provisional).** impossible() reports and the default case (provisional) |
| 102 | `sounds.c` `soundlib_id_from_opt` | **Done.** `recipes/sounds.c/soundlib_id_from_opt-rc-nosound`, `-rc-unknown-library-falls-back` (16 lines; passes). rc soundlib:nosound and soundlib:fmod; also assign_soundlib 1799-1805 |
| 109 | `steed.c` `place_monster` | **Unreachable (provisional).** impossible() reports (provisional) |
| 147 | `uhitm.c` `gulpum` | **Done in part.** `recipes/uhitm.c/gulpum-ochre-jelly-engulfs-acid-resistant-blob` (3 lines; passes). 5123-5125 ochre jelly vs acid blob; 5086 unreachable (5047 breaks out for Slow_digestion first) (provisional); 5054/5066 open (a victim wearing life saving: an M2_MAGIC kobold shaman never took a dropped amulet in 30 turns); 5135 open (repeated dust-vortex engulfs until mblinded passes 127); 5005 open (unseen shapeshifter reverting when swallowed) |
| 148 | `vision.c` `vision_recalc` | **Unreachable (provisional).** 663-667 and 672-675 need u.xray_range or u.nv_range of 0 (they are only ever -1, 1 or 3: u_init.c 1016-1017, artifact.c 862-864); 612 a pit on row 0 (provisional) |
| 155 | `minion.c` `summon_minion` | **Open.** 214-217 impossible() (provisional); 239-240 and 245-247 not traced |
| 169 | `sounds.c` `beg` | **Open.** needs a pet confused from hunger (about 1,500 turns unfed) that the hero could see but cannot (dark square or blind): a blindfolded wait was interrupted every few turns (41 turns in 2,400 keys); 523 an inedible-diet pet never reaches beg (provisional) |
| 174 | `uhitm.c` `mhitm_ad_stun` | **Open.** 4396-4402 need a hero form with a melee AD_STUN attack (only the abbot kick; #polyself abbot makes a new man, it is a human form) - unreachable for the hero (provisional); 4413 a cancelled abbot kicking a monster (conflicted cancelled abbot fought only the hero in 25 turns); 4420 open |
| 175 | `worm.c` `cutworm` | **Open.** 382, 401-403 bullet-proofing/impossible() (provisional); 440-442 and 474 need a monster cutting a long worm's tail (mon_moving): a tame forced Angel never fought a created long worm in 80 turns |
| 176 | `worm.c` `place_worm_tail_randomly` | **Unreachable (provisional).** impossible() reports and their cleanup (746-748, 754-759) (provisional) |
| 185 | `do_name.c` `roguename` | **Unreachable (provisional).** needs the ROGUEOPTS environment variable (provisional) |
| 191 | `insight.c` `youhiding` | **Unreachable (provisional).** hero mimicry is only an object or gold (the C comment at 2029-2031 says so); 2066 the default (provisional) |
| 202 | `pager.c` `do_look` | **Unreachable (provisional).** 1885-1889 a mouse click position; 1697-1698 a canned command queue; 1961 not traced (provisional) |
| 203 | `pager.c` `docontact` | **Unreachable (provisional).** sysconf SUPPORT or WIZARDS lists (provisional) |
| 214 | `teleport.c` `domagicportal` | **Open.** 1454 a leashed pet more than one square away when stepping on a portal (the quest portal level); 1470 stepping on an elemental-plane portal without the Amulet (debug ^V to the planes hands over the Amulet first and then opens a wish prompt, so it must be dropped first: not finished); 1461 arrival by portal; 1451 a buried-ball trap on the portal square |
| 218 | `uhitm.c` `steal_it` | **Open.** 2191 panic(); the rest (hero nymph or leprechaun stealing: artifact, interrupted theft, gold) not traced |
| 219 | `uhitm.c` `mhitm_ad_fire` | **Open.** 2543-2546 a blind hero smelling a burning paper or straw golem; 2604-2607 not traced |
| 220 | `uhitm.c` `mhitm_ad_slee` | **Open.** 3512-3519 a sleep attack between monsters seen by the hero, not traced |
| 1 | `dokick.c` `really_kick_object` | **Done in part.** `recipes/dokick.c/really_kick_object-golem-xorn-wall-kicks` (549: a clay golem kicks a cockatrice corpse barefoot and becomes a stone golem; 619: a blind xorn inside a wall kicks a dagger embedded in the wall), `-gold-thump-and-underwater-dagger` (711-713: 400 coins that do not scatter; 583: an underwater kick at a dagger in a wished pool), `-shop-bag-gold-and-pick-axe` (783: a bag holding credited gold kicked inside a shop; 764: one gold piece kicked out of the shop door; 740: a pick-axe kicked in from outside is caught by the keeper, so no kicked object remains); all pass. Open: 634-639 (a costly object embedded in a shop wall), 745 (bhit() returns the keeper with the caught item still the kicked object; in the recording shkcatch() leaves none, so 740 runs), 778 (an unpaid floor item, such as one dropped on the keeper's post, kicked back onto a costly square). |
| 16 | `mon.c` `genus` | **Unreachable (provisional).** 513-528 is the default case for an MS_GUARDIAN monster outside the 13 quest guardians; the only other one, High-elf, is `#if 0` in `monsters.h` 3800-3810, and both callers (sounds.c 700, objnam.c 5219) pass only MS_GUARDIAN forms. |
| 17 | `shk.c` `buy_container` | **Open.** 2341-2344, 2375-2378 and 2383-2386 are impossible(). 2355-2357 need an unpaid item inside an unpaid container whose quantity is below its billed quantity; not set up. |
| 25 | `steal.c` `steal` | **Done in part.** `recipes/steal.c/steal-cloak-over-shirt-tourist` (444: the random pick is the worn shirt, so the cloak over it is taken) and `steal-unseen-chain-of-buried-ball` (385, 389-390: an empty-handed hero chained to a #wizbury ball loses the chain); both pass. Unreachable: 430-432 and 563-564 (impossible()). Open: 516 (armor stolen on a later turn of a multi-turn doff; in 15 tries the nymph always stole on the first turn, when olddelay equals oc_delay), 357, 420, 494, 583. |
| 28 | `apply.c` `use_whip` | **Done in part.** `recipes/apply.c/use_whip-from-pit-at-lichen` (3102; passes). Open: 3018 (a LAVAWALL square), 3144-3145 (a monster hidden by postmov() hideunder(); makemon() hides eels and snakes only during level creation, makemon.c 1322-1325), 3214-3229 (snatching a cockatrice corpse from a gloved monster with a skilled disarm). |
| 36 | `mhitm.c` `gazemm` | **Open.** 771-783 and 788: Medusa gazing at a reflecting monster that is invisible (776-783) or whose reflection hits a reflecting Medusa (771-774); needs Conflict near Medusa. Not set up. |
| 37 | `mkobj.c` `costly_alteration` | **Done in part.** `recipes/mkobj.c/costly_alteration-cancel-holy-and-unholy-water-in-shop` (790-791, 813: cancelling sold holy and unholy water on the shop floor; passes). Unreachable: 761-763 (impossible()). Open: 779 (get_obj_location() failure), 799-805 (an unpaid crysknife reverting, or an unpaid carried item uncursed), 822-823 (a costly floor item altered from a non-costly square; the square zapped from in the recipe counted as costly). |
| 44 | `shk.c` `remote_burglary` | **Open.** Needs pick_obj() of a costly-square item by a hero outside the shop (pickup.c 1938); only use_grapple() does that. An unskilled grapple (distu <= 4, apply.c 3686) from outside the door reaches only the keeper's post, which costly_spot() excludes; a Skilled flail user (range 5) could reach the squares beside it. |
| 45 | `shk.c` `addtobill` | **Done in part.** 3541 runs in `costly_alteration-cancel-holy-and-unholy-water-in-shop` (a no_charge bag holding credited gold picked back up). Unreachable (provisional): 3522-3524 (billable() returns FALSE for a no_charge object without contents, shk.c 3475-3479), 3559-3561 and 3596-3597 (ltmp is 0 only for a no_charge container, which returns at 3541 or has contents cost; get_cost() is never 0). Open: 3508-3511 (a full 200-entry bill; costly in keys). |
| 46 | `trap.c` `dofiretrap` | **Open.** 4245-4252: a fire trap fired under water; wizterrainwish() cannot put a trap on a pool ("Creation of a fire trap failed"), so only a trapped box lying in a pool opened by an underwater hero (a rare chest_trap() roll) reaches it. 4292-4295: uhpmax pushed below u.ulevel (XL 2 or more) by repeated fire traps. 4311: a blind hero on a fire trap that burns a floor scroll. A fire-trap wish on Dlvl 1 failed in one try; not recorded. |
| 47 | `trap.c` `untrap` | **Done in part.** `recipes/trap.c/untrap-door-traps-box-on-trap-and-map-edge` (12 lines: 5887-5889 #untrap off the map's west edge as a xorn; 5944-5945 q to the container-and-trap prompt; 6075-6081 a failed door disarm explodes the door; 6090 a confused check of an untrapped door; passes). Open: 6082 (the exploding door must be a shop door). |
| 50 | `ball.c` `drop_ball` | **Done.** `recipes/ball.c/drop_ball-thrown-ball-pulls-out-of-pit-web-and-lava` (899-910: a Punished hero throws the ball from a pit, a web and lava, with fire resistance; passes). |
| 58 | `dogmove.c` `droppables` | **Done in part.** `recipes/dogmove.c/droppables-tame-dwarf-keys` (108: a tame dwarf that picked up a key and a lock pick drops the lock pick; passes). Unreachable (provisional): 85-86 and 98, which need an artifact pick-axe, mattock or unicorn horn (artilist.h has none). Open: 74, 79, 84-88, 94, 115 (the dwarf never took the credit card in 200 turns), 121 (Master Key after another key). |
| 59 | `dothrow.c` `thitmonst` | **Open.** 2068-2070 impossible(). 2123-2129 need the invocation done. 2130-2131 an angry leader catching in a shop. 2149 a quest artifact thrown at a leader who cannot move. |
| 63 | `mhitm.c` `attk_protection` | **Open.** 1480-1488 need a non-touch attack that hits a petrifying defender; a kobold shaman casting at a cockatrice hero for 40 turns ran none. 1500-1502: a hug needs two earlier hits, which stone an ungloved attacker first. |
| 65 | `mon.c` `copy_mextra` | **Open.** 2600 unreachable (provisional): every caller checks mextra. 2609-2619 need the corpse of a vault guard or temple priest; the Minetown priest killed by a death ray (seed 5610001) left no corpse. 2645 not tried. |
| 67 | `pickup.c` `in_container` | **Done in part.** `recipes/pickup.c/in_container-unpaid-wand-blows-up-floor-bag-of-holding` (2666, 2675-2682; passes). Unreachable: 2565-2566 impossible(), 2689-2690 panic(). Open: 2605 (likely unreachable: setuwep(0) leaves uwep null), 2654 (a cancelled ice troll corpse put in an ice box). |
| 71 | `shk.c` `obfree` | **Unreachable (provisional)** for 1239-1245 and 1267-1273 (impossible() reports); 1231 not traced. |
| 73 | `trap.c` `erode_obj` | **Open.** 234-236 and 332-338 impossible(); 244 and 330 not tried. |
| 74 | `trap.c` `trapeffect_pit` | **Done in part.** `recipes/trap.c/trapeffect_pit-pit-viper-falls-in` (1899-1900) and `trapeffect_pit-named-steed-led-into-pit-and-web` (1847); both pass. Unreachable (provisional): 1882-1885, since domove() passes trapmove() a null desttrap (hack.c 2831), so the hero always climbs out before entering an adjacent pit. Open: 1855-1856 (dotrap() lets a clinger escape a known pit first, also via #sit), 1979-1982. |
| 76 | `ball.c` `move_bc` | **Open.** 470-480: the ball moving alone while blind and felt; not tried. |
| 82 | `dothrow.c` `toss_up` | **Open, attribution suspect.** Throwing a scroll, a large box and crystal plate mail upward ran 0 new lines. map-current counts 1333 (the harmless_missile branch) 23 times but 1335-1336 0, and has no DA entry for 1334, so these line numbers may not match the source text. 1368 (a shade hero) is unreachable per the C comment. |
| 89 | `mhitm.c` `mon_poly` | **Open.** 1162-1173: system shock (1 in 25, after resistance) from an AD_POLY hit on a cancelled non-shapeshifter; needs 30 or more hits. |
| 92 | `mkobj.c` `replace_object` | **Open.** 645-647 and 653-658 not tried; 675-677 panic(). |
| 93 | `mon.c` `vamprises` | **Open.** A vampire rising while stuck to the hero, or on a closed or trapped door. |
| 95 | `monmove.c` `postmov` | **Open in part.** Unreachable (provisional): 1579-1580, since that branch tests doormask == D_CLOSED, which excludes D_TRAPPED. Open: 1545-1547 (a monster with the Master Key), 1561-1562 (a key-carrying monster unlocking a trapped locked door; a tame dwarf holding a key was tried but not finished), 1515-1516, 1672, 1677. |
| 101 | `shk.c` `pay_for_damage` | **Open.** 5303 needs an invisible hero damaging a shop wall or door; the keeper-reaction lines were not tried. |
| 110 | `trap.c` `trapeffect_web` | **Done in part.** 2121 runs in `trapeffect_pit-named-steed-led-into-pit-and-web`. Open: 2175-2177 (the steed is not caught by the web), 2266-2272 (forcetrap on an untrapped webmaker). |
| 111 | `trap.c` `lava_effects` | **Open.** 6803-6805 recursion guard; 6951-6956 (surviving lava twice with no safe landing); 6976-6977. |
| 119 | `apply.c` `use_stethoscope` | **Open.** 328-329 probably unreachable (doapply() refuses handless forms first); 347-349 riding while engulfed by a whirly monster; 419-429 mimic disguises. |
| 125 | `dokick.c` `container_impact_dmg` | **Done in part.** `recipes/dokick.c/container_impact_dmg-shop-potion-and-mirror-in-kicked-box` (445, 477, 480-484; passes). Open: 478-479 (kicking from outside the shop), 450 (an egg the hero laid). |
| 126 | `dothrow.c` `hurtle_step` | **Open.** 820-821 (hurtling off the map edge): a xorn at map column 1 is inside rock, where levitation is blocked. 829-832, 788-791 and 968 not tried. |
| 6 | `mhitu.c` `wildmiss` | **Done in part.** `recipes/mhitu.c/wildmiss-invisible-hero-succubus` (216; passes). Unreachable: 188-191 impossible(), 231-233 the default of `rn2(3)`. Open: 252-256 (underwater misses): `set_apparxy()` picks only accessible squares the hero could see, and underwater (off the Plane of Water) the hero sees only adjacent water, which is not accessible, so the guess is always right; on the Plane of Water a recipe is possible but the Wizard and sea monsters made it chaotic. |
| 7 | `objnam.c` `safe_typename` | **Unreachable.** Every caller (ball.c 1065/1078, do_wear.c 1824/2424, mkobj.c 2315/2325/3242) formats an impossible() report. |
| 8 | `objnam.c` `safe_qbuf` | **Unreachable.** 5647-5653 impossible(); 5672-5681 need prefix, last resort and suffix over 127 characters, and no caller builds such a prefix; 5689-5690 need the `short_oname()` alternate result over the limit. |
| 136 | `objnam.c` `short_oname` | **Done.** `recipes/objnam.c/short_oname-called-and-named-bag-burden-prompt` (2052-2061, 10 lines; a 63-character called string and a 60-character name on a bag of holding, shortened together in the pickup_burden prompt; passes). |
| 12 | `eat.c` `consume_oeaten` | **Unreachable.** 3811-3826 are the impossible() branch for zero-nutrition food. |
| 14 | `explode.c` `scatter` | **Done in part.** `recipes/explode.c/scatter-land-mine-under-two-boulders` (787-789; a hill-giant hero sets off a land mine under two boulders against a wall; passes). Unreachable: 741-742 impossible(), 794 (a statue trap cannot share the land mine's square, and the rolling-boulder caller deletes its trap first). Open: 847-852 (a scatter past the map edge), 875 and 879 (a big hero hit by a scattered object, or the object destroyed on hitting), 940-942 (the hero hiding under the scattered pile). |
| 18 | `sit.c` `throne_sit_effect` | **Done.** `recipes/sit.c/throne_sit_effect-friday13-valley-throne` (107-109, 148-150, 175-178; Friday 13th Luck -1, wizard-mode effect choice, an eyeless gray ooze, and a throne in the nommap Valley; passes). Unreachable: 124 (brace after break), 167 (default label; `eyecount()` returns 0-2), 206-208 impossible(). |
| 21 | `dig.c` `dighole` | **Done in part.** `recipes/dig.c/dighole-ice-under-raised-drawbridge-floods` (966-968, 977-982, and hack.c `spot_checks` 4531-4533; a wished "ice" under the castle's raised drawbridge sets DB_ICE, then a digging zap down floods it; passes). Note: wishing "floor" there takes the pool branch and destroys the bridge, so use "ice". Unreachable: 902 (callers pass `isok()` coordinates). Open: 973-975 (no pool within one square of the span: freeze the moat beside it first; castle monsters made this fragile), 933 (a pick-axe dig on a lowered drawbridge). |
| 26 | `zap.c` `poly_obj` | **Done in part.** `recipes/zap.c/poly_obj-dipped-twoweapon-blades-and-mail` (1751-1753, 1936, 1941; dipping both two-weapon blades into polymorph, and zapping polymorph at a dropped mail scroll; passes). Open, random results needing a seed scan: 1762 (laid egg into egg), 1818-1820 (leashed leash into leash), 1842-1843 (into a magic marker), 1866 (book into polymorph book), 1959 (into a boulder on a pool), 1971 (container billing in a shop); 1717 needs a revived unicorn's horn. Dipping a mail scroll into polymorph printed "Nothing seems to happen" in one try. |
| 27 | `zap.c` `bhit` | **Done in part.** `recipes/zap.c/bhit-skipping-rock-passes-over-kraken` (3965, 3968-3969; skipping rocks over a submerged tame kraken) and `recipes/zap.c/bhit-probing-clears-remembered-unseen-monster` (4041-4043); both pass. Open: 3966-3967 (a swimmer the hero can see under a skipping rock; a seen jellyfish was killed by the rocks), 4109-4112 and 4116-4117 (a thrown heavy iron ball stopped by `test_move()`, or over a Sokoban pit). |
| 30 | `detect.c` `trapped_chest_at` | **Unreachable or open.** 145: every caller passes a trap glyph read with `glyph_at()` at the same spot. Open: 166-170 (trapped-chest glyph on the hero's square with the box in the steed's inventory), 172-176 (farlook a trap-detected spot where an unseen monster, such as a nymph that stole the box, carries a trapped box). |
| 38 | `mondata.c` `can_blnd` | **Done in part.** `recipes/mondata.c/can_blnd-swallowed-hero-bashes-with-cream-pie` (358; passes). Every eyeless engulfer returns earlier, so use a purple worm. Open: 373 (a raven-form hero clawing its engulfer; the raven was overloaded in one try, so drop the inventory first), 338, 365, 377-385. Unreachable: 354-355 (no caller passes a potion of blindness). |
| 40 | `objnam.c` `xname_flags` | **Unreachable or open.** Unreachable: 613, 751-752 impossible(), 945-948 panic(), 1016-1026 (obuf full; called and named strings are capped near 63 characters). Open: 674 (an amulet without dknown; a wish made while blind still sets dknown). |
| 41 | `objnam.c` `doname_base` | **Unreachable or open.** Unreachable: 1438-1441 impossible(), 1728-1747 overflow handling. Open: 1294 (a pname or unique object whose xname starts with "the"; an identified Orb of Detection did not reach it). |
| 48 | `wield.c` `wield_tool` | **Open.** Applying a pick-axe while two-weaponing ran no new line. Open: 690 (#rub a wielded lamp), 699-702 (rub or apply a worn item), 720-722 (a tiny form with hands applying a tool; drop the inventory first). Likely unreachable: 710, 736, 751. |
| 57 | `dig.c` `digcheck_fail_message` | **Unreachable.** The only caller, dig() 320, passes a failed result, so 262 and 291-295 cannot run; 265-267 and 288-290 need dig() continuing downward on the Air or Water plane, but `use_pick_axe2()` 1313 intercepts digging there and dig() stops on a level change. |
| 135 | `mthrowu.c` `hit_bars` | **Done in part.** `recipes/mthrowu.c/hit_bars-wielded-acid-potion-dissolves-bars` (1436-1438, 1443-1445; thrown potions pass through bars, so the potion is wielded and used to fight; passes). Open: 1439-1441 (bars the hero cannot see; a blindfolded bash shattered the potion without reaching hit_bars). |
| 49 | `zap.c` `zap_over_floor` | **Open.** A cold ray froze a wished pool and, after three zaps, a wished wall of lava in a room's interior, but the probe found no new line (5269-5270 not reached; not traced). Open: 5314-5316 (a hidden eel in freezing water; a ^G eel did not hide), 5364-5367 (bars melted in a shop), 5408 (a secret door revealed unseen on the Rogue level), 5483-5485 (a door destroyed while a monster picks at it). |
| 56 | `detect.c` `gold_detect` | **Open.** 352, 362, 395-400 and 462 need a steed carrying gold or a gold object; no saddleable monster picks up gold and golems cannot be saddled. 349 and 437 need a parked vault guard (`mx` 0); 409 needs stale gold memory with gold only under the hero. |
| 66 | `mthrowu.c` `ohitmon` | **Done in part.** `recipes/mthrowu.c/ohitmon-land-mine-scatters-silver-at-lemure` (419-420, 423-429, 432; a land mine scatters 20 silver daggers into an adjacent lemure; search count chosen from a 0-11 scan; passes). Open: 430 (an unseen silver-hater; 12 blindfolded variants gave no hit), 448 (a cockatrice egg hitting a stone-resistant monster). |
| 68 | `polyself.c` `polymon` | **Done in part.** `recipes/polyself.c/polymon-freed-from-cooled-rock-and-soothed-by-lava` (979, 987-989; fire resistance, sinking into wished lava, a cold zap down to be stuck in rock, then xorn and salamander forms; passes). Open: 778 (polymorphing while stuck mimicking gold), 925 (an unseen engulfer when turning unsolid), 957-962 (riding a cockatrice steed when losing stone resistance). |
| 75 | `zap.c` `polyuse` | **Done in part.** `recipes/zap.c/polyuse-golem-pile-with-ball-artifact-and-mail` (1514, 1516, 1519; a polypiled stack of 100 daggers makes an iron golem, and polyuse() skips the heavy iron ball, the Bell of Opening and a mail scroll; passes). Open: 1512 (a bypassed object in the pile), 1526-1531 (melding on a shop floor), 1534-1535 (a stack of LARGEST_INT or more). |
| 80 | `detect.c` `food_detect` | **Done in part.** `recipes/detect.c/food_detect-blessed-scroll-food-only-underfoot` (544-547; the Plane of Air has no food, and the dropped ration under the hero is the only food; passes). Open: 505 (food in a steed's or engulfer's inventory), 518-521 (a blessed read with only stale food memory; the Wizard interfered on Air), 565 (a parked vault guard), 586 (detection without a scroll, such as a crystal ball). |
| 84 | `eat.c` `floorfood` | **Done in part.** `recipes/eat.c/floorfood-tinning-kit-refuses-non-corpse` (3723-3725) and `recipes/eat.c/floorfood-xorn-quits-at-iron-bars-prompt` (3655); both pass. Unreachable: 3718-3720 impossible(). Open: 3624-3627 (a metallivore eating a bear trap while too burdened to carry it). |
| 116 | `zap.c` `create_polymon` | **Open.** Golems come only from a shuddering object (`do_osshock()` 1647-1653, 1/(Luck+45) per unit of that stack), and no leather or cloth item stacks, so 1592-1599 need many polypile zaps; 12 variants of one zap at 39 leather armors made no golem. 1559 needs bypassed objects on top of the pile. |
| 2 | `mkroom.c` `somexy` | **Open.** 725-740 need somexy() on a room with subrooms; fill_ordinary_room() fills subroomed parents (mklev.c 955-962 run 3251 times) yet 725 never ran: cause not traced; 713 needs an irregular room with no free square. |
| 3 | `save.c` `dosave0` | **Unreachable (provisional).** 89-93 hangup-save flags; 101 nothing worth saving or no SAVEF; 130-136 create_savefile() failure or fplog logging; 203-209 a missing level file (provisional) |
| 4 | `shknam.c` `shkinit` | **Unreachable (provisional).** 638-657 good_shopdoor() fails: mkshop() only picks rooms with exactly one door (provisional) |
| 5 | `cmd.c` `random_response` | **Unreachable (provisional).** Entries=0; only the debug fuzzer calls it (provisional) |
| 9 | `restore.c` `dorecover` | **Unreachable (provisional).** 813-823 restgamestate() failure on a bad save; 833/887 recursive dorecover; 911-915 impossible() (provisional) |
| 11 | `cmd.c` `yn_function` | **Unreachable (provisional).** 5490-5494 a query of QBUFSZ+ chars (callers size queries); 5514-5529 debug fuzzer only (provisional) |
| 13 | `end.c` `done` | **Done in part.** `recipes/end.c/done-lifesaved-choking-vomits`, `-choking-lembas-healer` (1089), `-genocide-own-race`, `-genocide-human-valkyrie` (1098); all pass. 1089 choking and 1098 genocide under life saving; 1026-1036 TRICKED, 1059-1061 fuzzer unreachable (provisional); 1067 open: needs STARVING/BURNING with an empty killer name, every caller sets one. |
| 20 | `cmd.c` `dokeylist` | **Done.** `recipes/cmd.c/dokeylist-count-prefix-bound-to-movement-key`, `-count-on-ctrl-c-numpad-phone-layout` (2901, 2966-2980 and spkey_name 3209-3220; both pass after defect D-C1 was fixed). BIND=^C:count with number_pad on (defect D-C1 fixed); also spkey_name 3209-3220 (rank 78) |
| 22 | `save.c` `savestateinlock` | **Unreachable (provisional).** 378-403 a missing or mismatched level-0 file, or create_levelfile() failure (provisional) |
| 23 | `save.c` `save_bc` | **Unreachable (provisional).** 705-719 need looseball/loosechain at save; dosave0() 98 done_object_cleanup() places a limbo chain (end.c 893-896) before save.c 166-167 test BALL_IN_MON, so they are null (probe of a punished, engulfed save ran 0 lines); savestateinlock 416 needs a level change while swallowed (provisional) |
| 24 | `sp_lev.c` `get_table_int_or_random` | **Unreachable (provisional).** 3418-3433 need a non-integer spe or quantity; no dat/*.lua passes one (grep '= *"random"' dat/*.lua) (provisional) |
| 29 | `cmd.c` `end_of_input` | **Unreachable (provisional).** Entries=0; called only on input EOF or hangup (provisional) |
| 32 | `getpos.c` `getpos` | **Open.** 842 needs a null goal (callers pass one); 875-878 a non-key queued command; 886 iflags.remember_getpos (no option sets it); 903-909 a mouse click (key 0); 1094 '~' on a known vibrating square: reachable only in Gehennom bottom (open) |
| 33 | `glyphs.c` `parse_id` | **Unreachable (provisional).** 838-844, 1109, 1113 glyph-id dump (debug file) and cache-fill failure paths (provisional) |
| 35 | `makemon.c` `unmakemon` | **Open.** Only caller wizard.c 677 nasty(): a substitute random spellcaster at difficulty cap, or an angel/demon cross substitute, after an arch-lich or Archon is chosen with genocided nasties; rare. |
| 39 | `o_init.c` `init_objects` | **Unreachable (provisional).** 159-161, 180 panics; 215-224 sanity_check-only impossible() (provisional) |
| 42 | `role.c` `role_init` | **Unreachable (provisional).** 1993-2020 need an invalid role/race/gender/alignment, but tty player selection resolves them first (rc Valkyrie male chaotic prompts for alignment); 2071-2077 every role has a lawful god (provisional) |
| 43 | `rumors.c` `init_CapMons` | **Unreachable (provisional).** 835 sanity re-init; 920-932 need explicitdebug("CapMons") (sysconf DEBUGFILES) (provisional) |
| 51 | `bones.c` `savebones` | **Unreachable (provisional).** 424-425, 602-609 file failures; 463-465 makemon failure for an arise type (end.c 339-341 already clears a genocided one); 488 statue failure (provisional) |
| 52 | `cmd.c` `u_have_seen_bounds_selection` | **Done.** `recipes/cmd.c/lookaround-guess-dark-room-from-perimeter` (1230-1241 and lookaround_known_room 1297-1300), `-cant-guess-dark-room-side-unseen` (1230-1238); both pass. Dark-room perimeter walks on Dlvl 20; also lookaround_known_room 1297-1300 (4 of the 14) |
| 53 | `cmd.c` `hangup` | **Unreachable (provisional).** Entries=0; SIGHUP handler (provisional) |
| 54 | `cmd.c` `readchar_core` | **Unreachable (provisional).** 5218-5219 fuzzer; 5222 readchar_queue (filled only by click/menu queue paths not reachable by keys); 5244-5247 EOF; 5263-5264 key 0 click event (provisional) |
| 60 | `dungeon.c` `init_dungeon_dungeons` | **Unreachable (provisional).** 1023-1031 need a dungeon-level 'chance' (dungeon.lua has only the bigrm level's); 1038, 1047 panics; 1104 num_dunlevs > MAXLEVEL (provisional) |
| 61 | `dungeon.c` `init_dungeons` | **Unreachable (provisional).** Panics and missing dungeon.lua (provisional) |
| 62 | `end.c` `wordcount` | **Unreachable (provisional).** Entries=0; only build_english_list() for sysconf WIZARDS (cfgfiles.c 806); also bel_copy1 (rank 127) (provisional) |
| 64 | `mklev.c` `makelevel` | **Unreachable (provisional).** 1261-1263 impossible(); 1272 a protofile dungeon level that is not special (tower's 3 levels are all special); 1348 SHOPTYPE env; 1423-1427 a level_enter Lua callback (tut-1.lua 337 is commented out); 1339-1340 a create_vault() whose second check_room() fails: rare, not targeted (provisional) |
| 70 | `questpgr.c` `convert_arg` | **Unreachable (provisional).** 293-295 %A, 305-307 %N, 317-322 %% and default: quest.lua uses these only in its header comment (provisional) |
| 72 | `timeout.c` `nh_timeout` | **Done in part.** `recipes/timeout.c/nh_timeout-acid-resistance-held-while-eating-acidic-corpse`, `-held-eating-acid-blob` (819-821 and eat.c 487); both pass. 819-821 (+eat.c 487) acid resistance held while eating; 708-709 need sickness with no cause (every make_sick caller names one); 718-719 a unique non-pname disease source (all AD_DISE/AD_PEST uniques are M2_PNAME); 749 blindness timeout ending while still blind from another source then not blind: unreachable; 886 prayer-granted breathing expiring in a gas cloud (open, needs a trapped prayer) (provisional) |
| 78 | `cmd.c` `spkey_name` | **Done.** Covered by the dokeylist recipes. |
| 79 | `cmd.c` `all_options_autocomplete` | **Unreachable (provisional).** Only #saveoptions writes it (cfgfiles.c 200), after fopen(configfile) succeeds; in the recorder the one game that confirmed the overwrite reached 194 but fopen failed (199 unrun) (provisional) |
| 83 | `dungeon.c` `recalc_mapseen` | **Unreachable (provisional).** 3099-3111 need a notreachable mapseen revisited: remdun_mapseen() runs only for expulsion(TRUE) (never called) and on entering the endgame or leaving the tutorial (do.c 1653-1661), neither revisitable; 3119 flags.forgot is never set (provisional) |
| 86 | `glyphs.c` `glyph_find_core` | **Unreachable (provisional).** 263-268 find_glyph is handled before the loop (242-243); 269-272, 277 parse_id() never returns success with find_nothing (provisional) |
| 91 | `mklev.c` `fill_ordinary_room` | **Unreachable (provisional).** 959-961, 1074-1076, 1163-1165 impossible(); 989 the rogue level skips room filling (makelevel 1308-1309 goto skip0); 998 depth 40+ with ordinary rooms (Gehennom filler levels are mazes) (provisional) |
| 97 | `questpgr.c` `find_quest_artifact` | **Unreachable (provisional).** Only caller quest.c 81 on_goal() asks for floor, minvent and buried chains, so 95 (invent) and 107-115 (migrating) never run; 101 needs a dead monster still on fmon during on_goal (provisional) |
| 98 | `region.c` `create_region` | **Unreachable (provisional).** 88, 98-107 need nrect > 0; every caller passes (NULL, 0) (region.c 960, 1010, 1297, 1325) except clone_region() under #if 0 (provisional) |
| 99 | `role.c` `build_plselection_prompt` | **Open.** 1592 buflen < QBUFSZ (the one caller, role.c 2247, passes QBUFSZ): unreachable; 1626-1635 need no post attributes with a field still ROLE_NONE; rc race:elf,align:lawful and role:Valkyrie,gender:male both ran 0 new lines. |
| 100 | `rumors.c` `getrumor` | **Unreachable (provisional).** 130, 142-144, 177-179 rumors file failures; 162-164 impossible truth value; 173 50 cookie rumors in a row: impossible() (provisional) |
| 103 | `sp_lev.c` `set_wall_property` | **Unreachable (provisional).** Entries=0; only the coordinate form of des.non_diggable/non_passwall (sp_lev.c 5880-5905) calls it, and every dat file passes a selection (provisional) |
| 104 | `sp_lev.c` `create_door` | **Unreachable (provisional).** 1720 secret is never -1 and 1723 wall never W_RANDOM (lspo_door maps "random" to W_ANY, sp_lev.c 4712-4716); 1740-1747 need mask -1 with secret set, but secret is set only for D_SECRET (4718); 1793, 1804 impossible() (provisional) |
| 105 | `sp_lev.c` `m_bad_boulder_spot` | **Unreachable (provisional).** Entries=0; sp_lev.c 2041-2042 run 13,082 times for Sokoban boulder mimics but m->x is never negative there, so the call is never made (provisional) |
| 106 | `sp_lev.c` `lspo_mineralize` | **Unreachable (provisional).** Entries=0; no dat/*.lua calls des.mineralize (provisional) |
| 107 | `sp_lev.c` `l_table_getset_feature_flag` | **Unreachable (provisional).** Entries=0; needs the table form of des.feature with flags; dat files use the positional form (provisional) |
| 108 | `sp_lev.c` `lspo_mazewalk` | **Unreachable (provisional).** 5806-5808 bad coordinate (Lua error); 5812-5813 typ omitted; 5816 dir "random"; 5820-5822 dir north; 5832-5833 bad direction: no dat file uses these forms (provisional, not grepped per line) |
| 118 | `allmain.c` `moveloop_core` | **Open.** 183 hangup; 254-256 a billion turns; 434 buried hero: unreachable; 314 teleportitis moving a hero whose leashed pet is then not adjacent (open, ~1/85 per turn wait); 396 and 443 show 0 in map-current although every turn passes them: counter attribution, not targeted. |
| 123 | `display.c` `display_monster` | **Unreachable (provisional).** 534-541 bad m_ap_type or M_AP_NOTHING with mon_mimic set; 562, 576, 583 closing braces (provisional) |
| 124 | `display.c` `back_to_glyph` | **Unreachable (provisional).** 2355 a known branch ladder (every branch connection is stairs or a portal); 2410-2423 impossible() (provisional) |
| 127 | `end.c` `bel_copy1` | **Unreachable (provisional).** Entries=0; only build_english_list() for sysconf WIZARDS (see rank 62) (provisional) |
| 129 | `light.c` `save_light_sources` | **Unreachable (provisional).** 438-439 panic; 445-447, 455-459 impossible() (provisional) |
| 132 | `mklev.c` `mktrap` | **Unreachable (provisional).** 2050-2059 invalid argument combination report; 2090 200 placement failures (provisional) |
| 133 | `mkmaze.c` `mazexy` | **Unreachable (provisional).** 1339-1350 need 100 random misses on a maze then the exhaustive scan or panic (provisional) |
| 137 | `region.c` `in_out_region` | **Unreachable (provisional).** 487/501/515 attach_2_u regions, 506/520 leave or enter messages, 493-494/508/522 region callbacks: no region sets any of them (provisional, not traced per callback) |
| 138 | `rumors.c` `rumor_check` | **Unreachable (provisional).** 210-212, 280-290 rumors file failures (provisional) |
| 149 | `cmd.c` `ecname_from_fn` | **Unreachable (provisional).** The wiz_* refusals (wizcmds.c 42-370) run only outside debug mode, but rhack() refuses WIZMODECMD commands first (provisional) |
| 156 | `mkmaze.c` `restore_waterlevel` | **Unreachable (provisional).** 1786-1796 impossible() when no bubbles are saved (provisional) |
| 160 | `o_init.c` `disco_append_typename` | **Unreachable (provisional).** 706-718 need a typename of BUFSZ or more, but tty getlin caps a #call name at COLNO characters (win/tty/getline.c 169); a 250-key name was cut to the line width and probe ran 0 new lines (provisional) |
| 163 | `questpgr.c` `convert_line` | **Open.** 336-339 a newline inside quest text and 384-386 a %xS modifier: none in quest.lua (unreachable, provisional); 399 a %t on a name without 'the': Healer assignquest (%nt Cyclops) needs XL 14 and alignment 20 (ALIGNLIM caps it at 10 near turn 1), or a 1-in-50 Monk/Priest/Rogue nemesis discourage line (open) |
| 164 | `region.c` `rest_regions` | **Unreachable (provisional).** 824-825 a saved region with no rectangles; 834-836, 844-847 saved enter/leave messages: no region has either (create_region() callers, rank 98) (provisional) |
| 165 | `save.c` `freedynamicdata` | **Unreachable (provisional).** 1143-1154 wc_font_* and wc_tile_file options, which tty rejects (provisional, not recorded) |
| 180 | `cmd.c` `enter_explore_mode` | **Unreachable (provisional).** 960-967 need authorize_explore_mode() to fail, which only a sysconf EXPLORERS list does (provisional) |
| 192 | `light.c` `maybe_write_ls` | **Unreachable (provisional).** 578-580, 588-592 impossible() (provisional) |
| 205 | `restore.c` `restmonchn` | **Open.** 453 a saved polearm target (apply a polearm at a monster, then save and restore); 440-443, 460-462 impossible() (provisional) |
| 206 | `restore.c` `restcemetery` | **Unreachable (provisional).** 1007-1016 run only when converting or unconverting a save file (provisional) |
| 207 | `rumors.c` `outoracle` | **Unreachable (provisional).** 676-677 need delphi FALSE (only caller rumors.c 755 passes TRUE); 650 needs every major oracle used (oracle_cnt 0) or a file failure; 659, 664, 690-692 file and count failures (provisional) |
| 208 | `rumors.c` `doconsult` | **Done.** `recipes/rumors.c/doconsult-declined-then-too-little-gold`, `-escape-then-49-gold` (721-722, 725-727); both pass. 721-722 declining with q or ESC, 725-727 too little gold; 707-708 null oracle (sounds.c 724 passes the monster) and 720 (the default label) unreachable (provisional) |
| 215 | `timeout.c` `begin_burn` | **Unreachable (provisional).** 1719 lighting a burnt-out non-magic lamp (callers check age); 1769-1770, 1794-1795 impossible(); 1782 start_timer() failure (provisional) |
| 216 | `timeout.c` `kind_name` | **Unreachable (provisional).** 1998-2000 TIMER_NONE, 2003-2004 TIMER_GLOBAL, 2007-2008 TIMER_MONSTER, 2010: no start_timer() call uses them (provisional) |

## Status after the `coverage-targets-2` pass (15 November 2026, PT)

Rechecked against `map-current/` (125,627 of 135,136 C lines run; refreshed
08:00 PT with batches 18 and 20). Recipes are on branch `coverage-targets-2`
(worktree `.cache/lead/wt-targets2`). "Done" means a committed recipe and a
passing recording run the lines; probe counts are `probe.py` measurements.

**Totals (measured).** 67 new recipes, each with a recording; all 67 replay with PASS on `3aa308bc9`. A `probe.py` run over all 67 (union of `new.json`) runs **356 C gameplay lines** that map-current never ran, and 0 new Lua lines (union list: `.cache/lead/targets2-tools/final-union.json`).

| Rank | Cluster | Status |
| ---: | --- | --- |
| 3 | `topten.c` `topten` | 833-839 and 863 now run (batch 20 `end20`). The 16 left are panic, file and lock failures and ENTRYMAX: unreachable. |
| 5 | `trap.c` `trapeffect_landmine` | **Unreachable.** Hero lines 2549-2562 now run. 2609-2623 need `m_in_air()`, but `mintrap()` 3803-3805 returns first for any flyer or floater (`check_in_air()`) unless FORCETRAP is set, and no FORCETRAP caller lands a monster on a live land mine (teleport trap muse.c 410, fire trap muse.c 3140, bear trap and web trap.c 6244, falling traps 6285, the pit after the blast 2642). The clinger arm of `m_in_air()` needs `mundetected`; the only clinging hiders are piercers (cwt 200-400), which fail `rn2(cwt+1) < 400` all but 1 time in 401, and a hidden piercer does not move onto a trap. |
| 13 | `hack.c` `still_chewing` | **Open, not worked.** 4 lines left (754-756, 761). |
| 3 | `topten.c` `outentry` | **Done in part.** Two normal-mode deaths after a djinni wish (same seed scan as rank 4): `recipes/topten.c/outentry-djinni-cockatrice-petrified` (1000-1001, eating a wished cockatrice corpse) and `recipes/topten.c/outentry-conflict-long-named-pet` (1065 and 1071, a dog with a 61-letter name kills the hero under conflict); both pass. Answer n, not q, to the disclosure questions: q sets `done_stopprint` and skips the list. Left: 982-984 and 1005-1028 (ascension and deaths on the Planes, normal mode), 998 (a drawbridge crush in normal mode), 979 (fake-Amulet escape), 1039 ("quit while already on Charon's boat", see `end.c` `really_done`), 971-972 (unreachable). |
| 2 | `apply.c` `fig_transform` | **Open (long wait).** Only carried figurines get a timer (`carry_obj_effects()` invent.c 1191-1193, `mkobj.c` 1354-1356 and 1808-1810), so the floor and monster cases 2458-2487 and 2503-2507 cannot run, and 2409-2411 and 2493-2496 are impossible(). The carried case still lacks 2435-2446 (invisible, mimic, hider and eel forms) and 2451-2452 (blind hero); each needs a wait of `rnd(9000)+200` turns, so a recording would be thousands of turns long. |
| 4 | `objnam.c` `readobjnam`, non-debug wishes | **Done.** Ten `recipes/objnam.c/readobjnam-djinni-wish-*` recipes (a gnomish Healer's smoky healing potion releases a wishing djinni; seeds from a port scan of 7310001-7317000 on Friday 13 August 2032, so Luck is -1) run 38 lines: 5004-5017, 5022, 5104-5117, 5182-5184, 5294 and 5375-5381. All ten recordings pass. Left: the switch defaults 4937-4965 and the directive lines 5168 and 5174 (unreachable). |
| 11 | `steal.c` `maybe_absorb_item` | **Done (fork C).** `recipes/steal.c/maybe_absorb_item-door-mimic-takes-lock-pick` and `-blind-door-mimic-unwielded-pick` (19 lines; a door mimic absorbs the lock pick applied to it, seen and blind; both pass). Left: 786 (an unpaid pick; needs a shop). Unreachable: 805-807 (the only caller, lock.c 575, always passes a carried pick). |
| 9 | `pager.c` `do_screen_description`, `checkfile` | **Done in part (fork C).** `recipes/pager.c/do_screen_description-symbol-overrides` (11 lines: 1417-1418, 1437-1439, 1538-1539, 1564-1565, 1572 and checkfile 975; passes). Unreachable: 1317-1318 (`found` is 0 there), 1383-1384 (the entry test already requires a statue or boulder symbol), 1566-1571 (drawing the pet override needs sysconf ACCESSIBILITY; any other square with that symbol loops forever in C), checkfile 863 (`do_look()` always passes a null monster). |
| 27 | `muse.c` `use_misc`, `use_defensive` | **Done in part (fork C).** `recipes/muse.c/use_misc-gain-level-into-genocided-form` (2438) and `-bullwhip-disarms-offhand` (2560); both pass. Unreachable in use_misc: the panics, 2411, 2474-2475, 2562, 2617, 2620-2625 (and 2540, 2580-2586 per batch 21). use_defensive open: 867, 1075-1078 and 1083-1084 need a monster carrying the real Amulet. |
| 30 | `do.c` `dodown`, `goto_level` | **Done in part (fork C).** `recipes/do.c/dodown-latent-levitation-ceases-in-bear-trap` (1172-1174) and `-held-back-by-cursed-leash` (1252-1254); both pass. dodown 1190 and goto_level 1556, 1566-1568 already run. Unreachable: goto_level 1736 (`expulsion(TRUE)` is never called; quest.c 336, 341, 353 pass FALSE). Open: goto_level 1553 (the mysterious force inside the Wizard's Tower; `tele_jump_ok()` blocks teleporting in). |
| 22 | `insight.c` `show_achievements` | **Done in part (fork C).** `recipes/insight.c/show_achievements-mines-prize-luckstone` (2320-2322; passes). The castle tune (2329-2332) already runs. Open: ascension (2280-2283, 2378-2381). Unreachable: 2392-2395 (default case) and the window lines. |
| 15 | `apply.c` `use_mirror` | **Done in part (fork C).** `recipes/apply.c/use_mirror-invisible-and-frozen-targets` (1176-1178, 1188; passes). Unreachable: 1044-1056 (needs a floating-eye hero, and #apply refuses a handless form), 1192-1193 (the beam skips such targets earlier). Open: 1134 (Medusa with reflection; Medusa picks nothing up). |
| 28 | `sounds.c` `domonnoise` | **Open (fork C).** 1215-1216 (Death's Sandman line, 1 in 30; 52 chats did not produce it); 862-863 and 1052 (a pet unfed for 1,000 turns). |
| 31 | `trap.c` `openholdingtrap` | **Done (fork A).** `recipes/trap.c/openholdingtrap-steed-in-bear-trap` (6175-6176; passes). D1 was fixed earlier (`openholdingtrap-buried-ball-released-no-article`). Left: 6197-6198 (an invisible monster in a bear trap), 6132-6134 (TT_INFLOOR); 6147-6151, 6169 and 6186 unreachable. |
| 6 | `trap.c` `help_monster_out` | **Done in part (fork A).** `recipes/trap.c/help_monster_out-key-overtaxed-sleeping-dingo` (5723, 5753-5755, 5767-5770; 5723 only through `#invoke` of the Master Key while Overtaxed, since #untrap refuses first at `could_untrap()` 5263) and `-ranger-own-pit-sleeping` (5763-5764); both pass. Open: 5740 (a non-stone golem hero grabbing a trapped cockatrice), 5783 (a monster too heavy only with its inventory). |
| 16 | `trap.c` `chest_trap` | **Done in part (fork A).** `recipes/trap.c/chest_trap-free-action-stiffen` (6469; passes). Open: 6360-6409 (the 1% explosion on a costly shop square), 6381 (Punished with the chain off the box square). |
| 19 | `worn.c` `mon_break_armor` | **Done in part (fork A).** `recipes/worn.c/mon_break_armor-tame-orc-shirt-fog-cloud` (1259-1260), `-blind-hero-hears-shirt-rip` (1225-1226), `-dragon-merges-with-scales` (1190); all pass. Unreachable: 1207-1210 (no artifact cloak); 1320-1333 probably (polymorphing the ridden pony dismounts the hero before 1319, by the recording's message order; the dismounting call was not traced). |
| 8 | `artifact.c` `artifact_hit` | **Done in part (fork A).** `recipes/artifact.c/artifact_hit-gnome-vorpal-headless-hero` (1626-1629; a gnome lord wields a dropped -7 Vorpal Blade against a freezing-sphere hero; passes). Unreachable: 1633-1635 (every amorphous form has M1_NOHEAD, and ghosts are not a polymorph form). Open: Tsurugi 1567-1569, 1578-1582, 1590-1593 (only a samurai player-monster may touch it), 1601, 1607-1608. |
| 14 | `mthrowu.c` `return_from_mtoss` | **Open (fork A).** 865-878 need an aklys thrown while not wielded (it does not merge and `select_rwep()` forces wielding); 945-957 need the thrower on water, lava or a hole. 936 unreachable (no aklys artifact). |
| 25 | `explode.c` `explode` 684-685 | **Open (fork A).** Needs a wand of lightning or striking broken beside a closed shop door; the `#wizloaddes minetn-6` layout did not match the des map on screen, so the door was not found. A known shop seed is the quicker route. |
| 23 | `zap.c` `bhitm` | **Done in part (fork A).** `recipes/zap.c/bhitm-healing-pestilence-turn-undead` (255, 470-471), `-opening-saddle-blind-telepathy` (428-429), `-polymorph-long-worm-tail` (269); all pass. Open: 453-454 (disguised mimics; not traced), 198 (a magic-resistant disguised mimic). |
| 21 | `zap.c` `revive` | **Open (fork A).** 989/991 need a KEEPTRAITS corpse of a guard, cleric or Angel; 1015-1017 a revived hider (a tame snake killed while hidden left no corpse in one try); 927-929 and 1053-1054 not tried. |
| 1 | `muse.c` `muse_unslime` | **Done in part (fork B).** `recipes/muse.c/muse_unslime-tame-slime-touches-oil-carrier` (21 lines: 3170-3171, 3183-3200 and `cures_sliming`; a wished cloak of invisibility keeps a gnomish wizard searching for items, it picks up two potions of oil, and a tame green slime touches it; passes). Unreachable: 3221-3222 (need `by_you`; a green-slime hero is always blind), 3132 (long worms do not use MUSE). Open: 3153-3159 (a confused monster reading a scroll of fire). |
| 10 | `shk.c` `stolen_container` | **Done (fork B).** `recipes/shk.c/stolen_container-engulfed-drop-nested-sack` (3732, 3737-3742, 3747 and `stolen_value` 3848-3850; passes after defect D3 was fixed). |
| 12 | `shk.c` `litter_scatter` | **Done in part (fork B).** `recipes/shk.c/litter_scatter-punished-unpaid-in-wall-gap` (4635-4653, 4683-4694; passes). Unreachable: 4674 (`litter_getpos()` always finds a spot inside). Open: 4698-4701 (a no_charge item in the gap). |
| 17 | `dogmove.c` `dog_eat` | **Done in part (fork B).** `recipes/dogmove.c/dog_eat-unpaid-iron-thrown-to-rust-monster` (265, 297-299, 335-340; passes). Open: 302-311 (a hungry rust monster, about 1,000 turns after taming). |
| 18 | `dokick.c` `ghitm` | **Done in part (fork B).** `recipes/dokick.c/ghitm-gold-to-robbed-and-angry-keeper` (329-336, 344) and `-gold-to-vault-guard` (353, 359-365); both pass. Open: 350-351 (a hostile temple priest). |
| 29 | `shk.c` `dopay`, `globby_bill_fixup` | **Done in part (fork B).** `recipes/shk.c/dopay-pay-whom-two-keepers` (1837-1839, 1848-1849) and `recipes/shk.c/globby_bill_fixup-loan-repaid-by-donated-glob` (6042-6043, 6046); both pass. dopay 1910-1911 already run. Open: dopay 1824-1826 (not tried), globby 6044-6045 (a loan smaller than the glob's price with a larger debt). |
| 30 | `teleport.c` `level_tele` 1328-1333 | Already run in map-current. |
| 20 | `vault.c` `gd_move` | **Open (fork B).** Unreachable: 1062 (a hostile guard returns at 924 or 928, and every place between 930 and 1059 that angers it returns at once). Open: 931 (the guard teleported without being angered), 902, 1021-1023, 1093, 1099-1105, 1147-1151, 1175-1181 (map-dependent). |
| 25 | `explode.c` `explode` 684-685 | **Done (fork B).** `recipes/explode.c/explode-broken-lightning-wand-splinters-shop-door` (passes after defect D4 was fixed). 684 runs only as part of the conditional expression; no explosion has AD_DISN. |
| 7 | `hack.c` `domove_swap_with_pet` | **Unreachable** for 2183-2221 (batch 20: a peaceful monster refuses a trapped square, hack.c 2154-2161). 2123 and 2148-2150 not tried. |
| 26 | `uhitm.c` `hmon_hitmon_weapon_melee` | D2 is fixed. Not worked: 998, 1003-1004 (blind hero), 1021-1023, 1025. |
| 32 | `pray.c` `pleased` | Not worked (needs 800+ turns at alignment 14). |
| 33 | Rare singles | Not worked: `mkshop` 175, `wall_angle` 3721 and 3735, `mv_bubble` 2053, `flip_level` 677. `checkfile` 863 is unreachable and 975 is done (rank 9). |
| 24 | `steed.c` `mount_steed` | 310-325 now run; the 9 left (207-209, 289-295) are the lines the notes call likely unreachable; open, not worked. |

Clusters from "Largest clusters not examined":

| Cluster | Status |
| --- | --- |
| `detect.c` `trap_detect` | **Done in part (fork D).** `recipes/detect.c/trap_detect-buried-box-trapped-door` (12 lines: 1042-1047, 1071-1076; passes). Open: 1050 (a parked vault guard), 1053-1058 (a monster carrying a trapped box). |
| `dokick.c` `kick_nondoor` | **Done in part (fork D).** `recipes/dokick.c/kick_nondoor-levitating-blind-features` (9 lines) and `-tree-bees-genocided` (1186-1187); both pass. Unreachable: 1154-1155 (`nfruit = 8 - rnl(7)` is at least 2). Open: 1058-1059 (a throne kicked on a dungeon's bottom level). |
| `dokick.c` `ship_object` | **Done in part (fork D).** `recipes/dokick.c/ship_object-candle-shop-hole` (14 lines: 1696-1712; passes). Open: 1724 (mirrors dropped over a hole broke at its edge), 1729 (an egg the hero laid). Likely unreachable: 1650, 1655, 1715. |
| `engrave.c` `engrave` | **Done in part (fork D).** `recipes/engrave.c/engrave-headstone-after-disturbing-grave` (1419; passes). Open: 1288-1290 (the hero moved mid-engraving); the rest are impossible() and the default case. |
| `priest.c` `priest_talk` | **Done in part (fork D).** `recipes/priest.c/priest_talk-selfless-generosity-repeat-donation` (704-705; passes). Unreachable: 651-653 (debug mode takes the base message), 606-611 (dead code). Open: 624 (draining the priest's 20-29 gold), 713-714 (over 5,000 turns). |
| `shk.c` `shopdig` | **Done in part (fork D).** `recipes/shk.c/shopdig-boxed-in-corner-pick-axe` (5083-5090; passes). Open: 5037, 5039, 5067, 5078 (a helpless, animal or limbless shopkeeper). 5028-5033 cannot run (batch 20). |
| `shk.c` `u_entered_shop` | **Done in part (fork D).** `recipes/shk.c/u_entered_shop-deaf-rider-at-door` (902-906; passes). Bones-only: 833-840. Likely unreachable: 759. |
| `dig.c` `dig` | **Done in part (fork D).** `recipes/dig.c/dig-fumbling-rider-welded-pick` (344-345; passes). Unreachable: 428-430 (`dig_check()` refuses an altar every turn, dig.c 220, 317). Open: 398, 490-492, 512-514, 526 (a diggable shop wall; Minetown's are not). Likely unreachable: 518, 559. |
| `dig.c` `adj_pit_checks` | **Done in part (fork D).** `recipes/dig.c/adj_pit_checks-secret-door-from-pit` (1784-1785; only a secret door reaches 1784, since 1776 clears `doormask` first; passes). Unreachable: 1771, 1773 (the caller checks `isok()`). Open: 1796-1798, 1813-1814, 1829. |
| `dig.c` `digactualhole` | **Done in part (fork D).** `recipes/dig.c/digactualhole-held-by-owlbear-broken-digging-wand` (807; passes). Unreachable: 709-710 (callers pass BY_YOU or BY_OBJECT), 665-668 impossible(), 815-817 (the bottom level always gets a PIT). Open: 658, 692, 763-765, 777, 813. |
| `trap.c` `launch_obj` | **Done in part (fork D).** `recipes/trap.c/launch_obj-rolling-boulder-crashes-through-locked-door` (3534-3541; passes). Unreachable: 3299-3301 (boulders never stack). Open: 3310-3311, 3347, 3385-3386, 3552-3554. |
| `vault.c` `invault` | **Done in part (fork D).** `recipes/vault.c/invault-guard-finds-hero-in-dug-corner` (370-372; passes). Open: the other corners (365, 373-377), 601-607, 395, 402-403, 496-497. |
| `zap.c` `stone_to_flesh_obj` | **Done in part (fork D).** `recipes/zap.c/stone_to_flesh_obj-sold-figurine-in-tool-shop` (2037-2040; passes). Unreachable: 2088-2093 (no mineral weapon; the crysknife is BONE), 2072-2073, 2056-2057, 2065-2068. |
| `mcastu.c` `castmu` | **Unreachable (fork D).** 253-266 need AT_MAGC AD_FIRE, which no monster has; 162-163 and 235-238 are impossible(). |
| `dogmove.c` `dog_move` | **Open in part (fork D).** Unreachable: 1005-1007 impossible(), 1140-1144, 1173-1180 (a pet's flags always include ALLOW_M, so `mfndpos()` never sets ALLOW_MDISP). Open: 1147, 1290, 1292, 1339-1350. |
| `mhitu.c` `doseduce` | **Open in part (fork D).** Unreachable: 2282, 2222, 2159. Open: 2264 (a tame seducer under Conflict never targeted the hero in 110 turns), 2269-2270, 2096, 2104, 2137. |
| `uhitm.c` `mhitm_ad_dgst` | **Open in part (fork D).** Unreachable: 4501, 4504 (AD_DGST is only AT_ENGL, handled by `gulpum()`/`gulpmu()`), 4521-4523. Open: 4525, 4539. |
| `mon.c` `minliquid_core` | **Open (fork D).** 1002-1005 (an iron golem about 60 turns in a pool), 1044-1047, 1105; 1054 and 1057 are comment-marked hypothetical. |
| `muse.c` `mon_consume_unstone` | **Open (fork D).** 2952-2953, 2974 (a hungry pet carrying a lizard or acidic corpse while being stoned). |
| `pickup.c` `query_objlist` | **Unreachable (fork D).** 1061-1062 and 1186-1209 need an engulfer with worn or wielded items (every engulfer is nohands); 1182-1184 is the fake hero; 1048 is guarded by callers. |
| `trap.c` `acid_damage` | **Open in part (fork D).** Unreachable: 4644-4646 (a monster never wields a scroll). Open: 4631, 4634 (a yellow dragon's acid ray from range). |
| `glyphs.c` `shuffle_customizations`, `pline.c` `execplinehandler`, `sp_lev.c` `lspo_corridor` | **Skipped (fork D).** Per-object glyph customizations, a sysconf MSGHANDLER, and `des.corridor` (no dat file calls it). |
| `invent.c` `invdisp_nothing`, `cinv_ansimpleoname` | **`invdisp_nothing` unreachable; `cinv_ansimpleoname` open.** `display_minventory()` and `display_cinventory()` are reached only from zap.c 632-634 and 2254-2255, which test for a non-empty inventory first. `cinv_ansimpleoname` is the `safe_qbuf()` fallback used when 'Contents of <container>:' would exceed QBUFSZ: probe a container with a long name. |
| `hack.c` `trapmove` | **Done in part (fork B).** `recipes/hack.c/trapmove-mounted-buried-ball` (1661-1663, 1667; passes). Unreachable: 1583 (`domove()` 2831 passes a null `desttrap`), 1559 and 1683-1688 (sanity checks). Open: 1613, 1622-1623, 1665-1666 (a steed in lava; every fire-resistant saddleable form flies). |
| `invent.c` `display_pickinv` | **Unreachable (fork B).** All 18 lines need a working perm_invent window, which the 24x80 tty is too small for (wintty.c 2953-2967); `OPTIONS=perm_invent` and `i` ran 0 new lines. |
| `invent.c` `doorganize_core` | **Done in part (fork B).** `recipes/invent.c/doorganize_core-split-named-stack-merges` (5238-5240, 5243-5245; passes). Open: 5124 (an item in the overflow slot `#`; a wish into a full inventory drops the item). |
| `teleport.c` `dotele` | **Done in part (fork B).** `recipes/teleport.c/dotele-vault-teleporter-jump-in` (1057-1064, 1147; passes). Open: 1156-1158 (a leashed pet that cannot be placed beside the hero), 1116 and 1136-1137. |
| `weapon.c` `enhance_weapon_skill` | **Open (fork B).** 1354, 1372-1376 need a skill at its cap with 80+ practice points (about 80 weapon hits). |
| `apply.c` `use_tinning_kit` | **Open in part (fork B).** Unreachable: 2192-2194, 2218-2220 (`floorfood()` filters partly eaten and zero-nutrition corpses, eat.c 3678 and 3722). Open: 2213-2214 (a Rider corpse that fails to revive). |
| `invent.c` `dounpaid` | **Done (fork B).** `recipes/invent.c/dounpaid-unpaid-item-in-wall-gap` (3688, 3762-3783, with traditional menus and `!fixinv`; passes). |
| `lock.c` `picklock`, `pick_lock` | **Done in part.** `recipes/lock.c/pick_lock-master-key-trapped-door-and-box` (7 lines: picklock 119-121 and 132-134, pick_lock 478; passes). Unreachable: pick_lock 384-390 and 406-407 (every caller, `doapply()` 4219, `doopen`, `#loot` and `#force`, refuses a handless form first), 416-418 impossible(), Open: 518-519 (autounlock with a key that fails `touch_artifact()`, such as the Master Key of Thievery, a self-willed quest artifact, carried by a cross-aligned non-Rogue; artifact.c 944-950), picklock 73-74 and 80-88 (the box or door changes while the occupation runs), 145 (a trapped shop door), pick_lock 589 (a key applied at a raised drawbridge). |
| `mkobj.c` `unsplitobj` | **Done in part.** `recipes/mkobj.c/unsplitobj-container-count-refused-lift` (4 lines: 583-585 and pickup.c `out_container` 2749; passes). Left: 580-582 (no caller unsplits a monster's inventory), 594, 598-602 and 613-618 (a split whose parent follows the child, or a call with the parent: no caller passes either). |
| `trap.c` `trapeffect_hole` | **Unreachable.** 2020-2024 and 2034-2036 are impossible() reports; 2048-2051 need FORCETRAP on a HOLE for a monster, but `openfallingtrap()` is called for a monster only with `trapdoor_only` TRUE (zap.c 398, detect.c 1781). |
| `trap.c` `trapeffect_anti_magic` | **Done in part.** `recipes/trap.c/trapeffect_anti_magic-carried-orb-of-detection` (2 lines: 2368 and 2370; passes). Left: the monster branch 2422-2442 (a magic-resistant monster wielding Magicbane, carrying a carried-MR artifact, passing walls, or killed by the field). Monsters do not pick up tools (`practical[]` and `magical[]` omit TOOL_CLASS), so only Magicbane (2422) is a practical route. |
| `trap.c` `immune_to_trap` | **Done in part.** `recipes/trap.c/immune_to_trap-hero-iron-golem-known-fire-scroll` (3 lines: 2881, 2914-2915; passes). Unreachable: its only caller is hack.c 2561 with the hero, so the monster lines 2832, 2854, 2873-2876 and 2924 cannot run; 2790-2792 and 2929-2931 are impossible(); `mon_has_amulet(&youmonst)` reads `youmonst.minvent`, which no code fills, so 2842 needs In_endgame (a seen teleport trap on a Plane; open). |
| `topten.c` `encode_extended_achievements` | **Done in part.** `recipes/topten.c/encode_extended_achievements-oracle-sokoban-prize` (6 lines: 535-540; passes). The xlogfile entry is written in debug mode too, once the farewell window is dismissed. Left: 532-534 (the Mines' End luckstone) and 562-564 (the castle tune), the same set-ups as `insight.c` `show_achievements`. |
| `zap.c` `bhito` | **Done in part.** `recipes/zap.c/bhito-undead-turning-eel-twitches-blind-healer-hears` (4 lines: 2354-2355, 2378-2379; passes). Unreachable: 2131 (no wand hits itself), 2179 and 2416-2417 impossible(), 2346 ("won't happen"), 2168-2170 (an object still flagged `bypass` while `context.bypasses` is clear, which `clear_bypasses()` prevents; a debug-only report). Open: 2216 (a hero hiding under a pile whose top object shudders; hiders have no hands to zap), 2243-2248 (probing a Schroedinger's box; no wish makes one). |
| `sp_lev.c` `flip_level` | **Done in part.** `recipes/sp_lev.c/flip_level-conjoined-pits-both-axes` (17 lines: 604-605, 613-614 and all of `flip_encoded_dir_bits()` 500-514; passes). Unreachable: 553 (`#wizfliplevel` passes only 1-3). Open: 562 (level extents reaching column 79), 582 and 910 (Punished with the ball outside a special level's flip area), 644 (a parked vault guard at <0,0>), 677-685 (a guard, priest or shopkeeper migrating away from its own level while the hero stays there). |
| `uhitm.c` `hmonas` | **Done in part.** `recipes/uhitm.c/hmonas-pony-kick-skipped-in-pit` (5560; passes). Unreachable: 5639-5641 (every attack type that reaches the verb switch has its own case; AT_WEAP always goes through `known_hitum()`), 5818-5819 impossible(). Open: 5724-5727 (hugging a shade with blessed outermost armor, or blessed gloves or silver rings for a choking hug), 5744, 5756 (a silver hug against a silver-hater), 5688 and 5752 (releasing a held monster). |
| `insight.c` `fmt_elapsed_time` | **Unreachable.** 338-356 format a non-zero elapsed real time, but the recorder's patched `getnow()` (`recorder-lua/src/calendar.c` 34-41) returns the session's fixed datetime, so `urealtime.start_timing` equals the current time and the elapsed time is always 0. |
| `trap.c` `try_disarm` | **Open in part.** 5472-5477 are unreachable: `untrap()` 5904-5907 already refuses when `can_reach_floor(FALSE)` fails, and the only case where `can_reach_floor(under_u)` differs (trapped in a pit) returns at 5954. Open: 5463-5469 (#untrap diagonally through a squeeze while carrying over 600 or in a big form), 5486 and 5489 (a tame or dying monster in a bear trap when disarming fails), 5506-5507 (a web spreading to a mounted hero). |
| `explode.c` `engulfer_explosion_msg` | **Unreachable.** 133-134, 139-144, 161-162 and 167-172 need an explosion of type AD_DRST, AD_ACID, or AD_DISN from something other than a wand. Wand breakage gives only wand types, the fire sources give AD_FIRE, and `mon_explodes()` 1035-1043 maps a monster's attack type. The exploding monsters carry only AD_PHYS, AD_FIRE, AD_COLD, AD_ELEC, AD_BLND, and AD_HALU (`grep -o 'ATTK(AT_EXPL, AD_[A-Z]*\|ATTK(AT_BOOM, AD_[A-Z]*' include/monsters.h`). |
| `teleport.c` `mlevel_tele_trap` | **Open.** 2024-2028: a monster stepping into a hole on the bottom level of its dungeon, for example the Sokoban entry level (`m ^V`, page 2, `soko4`); `^G` next to the holes there created no visible monster in two tries (the adjacent squares are holes, stairs or dark floor). 2057-2062 need a monster with the Amulet or the endgame; 2068 a forced level departure; 2015 an engulfer moving onto the trap; 2080-2082 impossible(). |
| `o_init.c` `undiscover_object` | **Unreachable.** Its only caller, `docall()` (do_name.c 669), runs when a type's name is cleared, and naming that type earlier went through do_name.c 672, `discover_object(otyp, FALSE, TRUE, TRUE)`, which sets `oc_encountered`; no code clears it, so the test at 500 is always false. |
| `attrib.c` `restore_attrib` | **Unreachable.** No caller (`grep -n 'restore_attrib(' src/*.c` finds only the definition at attrib.c 455, commented "(not used)"). |
| `topten.c` `readentry` | **Open, not worked** (20 lines; not assigned in this pass). |
| `worn.c` `wearslot` | **Open in part.** Its only caller is `poly_obj()` (zap.c 1929), for a worn item polymorphed in the hero's inventory; weapons in a weapon slot skip it. Unreachable: 322-325 (a weapon is always in a W_WEAPONS slot), 338-348 (no gem, ball, chain or other class is worn there). Open but rare: 316-318 (a worn shirt polymorphed into a shirt, about 1 in 100 armor results), 332 (a worn blindfold, towel or lenses polymorphed into a saddle). |
| `uhitm.c` `m_slips_free` | **Unreachable** (batch 20: worm-tail wrapping, 2065-2091). |
| `insight.c` `weapon_insight` | **Done** before this pass: 0 lines left in map-current. |
| `end.c` `really_done` | **Unreachable or open.** Lines are those of the patched `recorder-lua/src/end.c`. 1151 needs a hangup; 1210 and 1244 PANICKED; 1563 a sound library the build lacks; 1509 frees a name a fresh `mksobj()` never has; 1226-1229 need a quit with `u.uhp < 1`; 1289 needs an empty `formatkiller()`. Open: 1277 (two Schroedinger's boxes carried at the end, the first resolving to a live cat). |
| `timeout.c` `write_timer` | **Unreachable.** No `start_timer()` call uses TIMER_GLOBAL or TIMER_MONSTER (2511, 2532-2545; `grep -n 'start_timer(' src/*.c`), 2547-2549 is panic(), and 2519 needs `needs_fixup` set at save time, which only the write itself and a restore before `relink_timers()` set. |
| `light.c` `write_ls` | **Unreachable.** 651-654, 678-688 and 700-701 are impossible() reports; 692 is an empty block; 642 needs LSF_NEEDS_FIXUP at save time, set only during the write and between a restore and `relink_light_sources()`. |
| `mkobj.c` `insane_obj_bits` | **Unreachable.** `objlist_sanity()` 3125-3127 and 3231 call it only when an object still carries `in_use`, `bypass`, `nomerge` or `next_boulder` at a sanity check: an invariant report. |
| `role.c` `randgend` 876, `randalign` 939 | **Unreachable.** The fallback runs only when the role and race share no gender or alignment; every role/race pair the callers pass is validated and shares at least one. |

## Defects found

Both D1 and D2 have since been fixed on main: their recordings, `recordings/trap.c/openholdingtrap-buried-ball-anchor` and `recordings/uhitm.c/hmon_hitmon_weapon_melee-katana-shatters-weapon`, are committed and pass.

The `coverage-targets-2` pass found two more, both fixed:

- **D3, `do.c` `drop()` and `dropz()`.** Fixed in `4fc4ecf68` (fork B). Inside a shop, while engulfed, dropping an own sack that holds an unpaid item: C prints "You drop your bag into the dust vortex." and bills the hero; the port printed the full name and never charged. C's `drop()` (do.c 748) and `dropz()` (do.c 820) call `is_unpaid(obj)`, which counts a container's unpaid contents; `js/do.js` tested `obj.unpaid`. Both sites now call `is_unpaid()`; the other 5 of the 7 C callers were already right. Evidence: `recordings/shk.c/stolen_container-engulfed-drop-nested-sack`.

- **D4, `explode.c` `explode()` 681-686.** Fixed in `6fa7b880c` (fork B). A broken wand of lightning splinters a closed shop door; C's keeper says "How dare you destroy my door?", the port said "disintegrate". C chooses the `pay_for_damage()` verb from `adtyp`; `js/explode.js` 755-757 compared the raw explosion `type`. Single site (`grep -n "burn away" js/*.js`: the other, zap.js 6066, is correct). Evidence: `recordings/explode.c/explode-broken-lightning-wand-splinters-shop-door`.

Earlier text, kept for reference:

- **D1, `trap.c` `openholdingtrap()`.** The recipe is `recipes/trap.c/openholdingtrap-buried-ball-anchor.session.json`.
  The first mismatch is at segment 0, step 70, when a wand of opening is zapped at self. C prints "You and your pony
  are released from your anchor."; the port prints "released from a your anchor". The likely cause: for
  TT_BURIEDBALL, C sets `which = ""`, so no article is added, and the port adds one.
- **D2, `objnam.c` `Yobjnam2()` at `uhitm.c:997`.** The recipe is
  `recipes/uhitm.c/hmon_hitmon_weapon_melee-katana-shatters-weapon.session.json`. The first mismatch is at segment 0,
  step 211 (key `k`, top line). C prints "The soldier's wakizashi shatters from the force of your blow!"; the port
  prints "The wakizashi shatters ...". The likely cause: for an object in a monster's inventory, the port drops the
  owner's possessive. RNG matches throughout.

## Ranked reachable targets left

Estimated reachable lines are the unrun lines less those that the cluster's
notes below call unreachable. They are estimates from reading the C, not
measurements.

| Rank | Cluster | Est. reachable | Input outline |
| ---: | --- | ---: | --- |
| 1 | `muse.c` `muse_unslime` | ~50 | A monster slimed in view: a hostile green slime under Conflict (`#wizintrinsic`) next to a target, with the hero 3+ squares away. A wished fire trap next to the target covers the trap path. For the scroll, wand or horn paths, drop the item, `^G` a non-animal monster and `^T` away. |
| 2 | `apply.c` `fig_transform` | ~47 | A cursed figurine on the floor, carried by a monster, and carried by a blind hero. The transform timer is rnd(9000)+200 turns, so wait with a counted search (`n9000s`) on a cleared level. |
| 3 | `topten.c` `outentry` and `topten` | ~40 | Normal-mode deaths (debug mode skips the score list): crushed and petrified deaths, deaths on the Planes, a fake-Amulet escape, a 60+ character killer name. Use 11+ segments with different roles and the `scores` option for the record-list lines 833-839 and 863. |
| 4 | `objnam.c` `readobjnam`, non-debug wishes | ~30 | A wish outside debug mode: search seeds for a Dlvl 1 fountain water demon (quaff or dip) or a throne wish. Lines 5004-5018, 5022, 5105-5117, 5182-5184, 5294, 5375-5381. |
| 5 | `trap.c` `trapeffect_landmine` | 29 | Levitate (`#wizintrinsic`) over a wished, unseen land mine; `^G` a bat next to a land mine. |
| 6 | `trap.c` `help_monster_out` | ~28 | `#untrap` toward a trapped adjacent monster: while overloaded, a trapped cockatrice with bare hands, other refusals. |
| 7 | `hack.c` `domove_swap_with_pet` | ~27 | Swap places with a pet onto a known trap door, water or another trap, or into an unseen trap; a pet in a pit with a boulder. |
| 8 | `artifact.c` `artifact_hit`, remainder | ~26 | A monster wielding Tsurugi or the Vorpal Blade (drop it for an M2_COLLECT monster); Fire Brand wielded by a monster against a slimed hero; Tsurugi rolling 1 on a long-worm tail. |
| 9 | `pager.c` `do_screen_description` | ~25 | Symbol overrides in the rc (check `parsesymbols()` for the accepted form), `I` sharing a symbol, unexplored as the only match, an engraving shown with the boulder symbol. |
| 10 | `shk.c` `stolen_container` | 24 | Own and unpaid items in a shop sack, then kick it out of the shop, dig down under it, or burn it. Shop setup: seed 9100004, `^V2` (`drafts/B/shop-moves.py`). |
| 11 | `steal.c` `maybe_absorb_item` | 24 | Engulfed by a `^G` ochre jelly while wielding and wearing items, inside and outside a shop. |
| 12 | `shk.c` `litter_scatter` | 23 | Dig through a shop wall, pay, drop unpaid, no-charge and (Punished, by a cursed scroll of punishment) ball-and-chain items into the gap, and wait for the repair. |
| 13 | `hack.c` `still_chewing` | 23 | `#polyself` rock mole: chew through a door, a boulder, a shop wall. |
| 14 | `mthrowu.c` `return_from_mtoss` | ~21 | A monster throwing an aklys that returns or fails to return. |
| 15 | `apply.c` `use_mirror` | ~21 | Apply a mirror while engulfed or underwater, and at a nymph, a floating eye, an invisible or blind monster. |
| 16 | `trap.c` `chest_trap` | ~20 | Ring of free action and repeated `#loot` of wished trapped large boxes for 6469; the 1% explosion case inside a shop or while Punished for 6360-6409. |
| 17 | `dogmove.c` `dog_eat` | ~20 | A hungry rust-monster pet eating rustproof iron; a shop-owned corpse thrown at a tame carnivore in a shop. |
| 18 | `dokick.c` `ghitm`, remainder | ~17 | Gold thrown at a robbed or hostile shopkeeper, a hostile priest, a vault guard and a sergeant. |
| 19 | `worn.c` `mon_break_armor` | ~15 | Polymorph (`monpolycontrol`) a monster wearing a shirt or boots into a giant or a vortex; a dragon-scaled monster into that dragon. |
| 20 | `vault.c` `gd_move` | ≤33 | Not examined. Guard escort edge cases: a blocked or dug corridor, the hero teleporting out mid-escort, the guard killed or paid. |
| 21 | `zap.c` `revive`, remainder | ~12 | Unseen shop corpse (zap while blind), a revived hider, a corpse in a monster's container, a bones ghost corpse. |
| 22 | `insight.c` `show_achievements`, remainder | ~12 | The castle tune (play it at the drawbridge), the Mines prize, invocation and ascension in debug mode. |
| 23 | `zap.c` `bhitm`, remainder | ~11 | Drain life from a Knight with the Mirror, stone to flesh at a flesh golem, opening at a monster on a trap door, disguised mimics, healing at Pestilence. |
| 24 | `steed.c` `mount_steed` | ~11 | A non-Knight forcing #ride on an abused pony (tameness 1); a Knight underwater with magical breathing. |
| 25 | `explode.c` `explode`, remainder | ~8 | Break a wand of cold next to a shop door (seed 41103 Minetown deli, seen in a probe); a monster dying inside the blast. |
| 26 | `uhitm.c` `hmon_hitmon_weapon_melee` | ~8 | After D2 is fixed: a blind hero, artifact kills of headless targets, poisoned ammunition. |
| 27 | `muse.c` `use_defensive` and `use_misc` | ~14 | A monster with a wand of undead turning against a hero wielding a cockatrice corpse; a confused monster with a lizard corpse; a monster teleporting in Sokoban; a hostile bullwhip user against a two-weaponing or welded hero. |
| 28 | `sounds.c` `domonnoise`, remainder | ~7 | A hungry pet after 1,000+ turns with no food (ring of slow digestion); a trapped peaceful humanoid; Death's 1-in-30 line. |
| 29 | `shk.c` `dopay` and `globby_bill_fixup`, remainder | ~12 | Pay an angry keeper less than half the theft; "Pay whom?" with two keepers in view (Minetown); loan repayment before a glob merge. |
| 30 | `teleport.c` `level_tele`, `do.c` `goto_level`, `do.c` `dodown` | ~16 | `^V -1` inside a shop; the mysterious force (carry a wished Amulet, climb in Gehennom); a cursed leash with the pet unplaceable; blind levitation over Vlad's ladder. |
| 31 | `trap.c` `openholdingtrap`, remainder | ~6 | Zap opening at self with the steed in a web (seen in a probe); an invisible monster in a bear trap; TT_INFLOOR. |
| 32 | `pray.c` `pleased` | ~3 | Pat on head while blindfolded, after 800+ turns at alignment 14, with the prayer timeout forced to 0. |
| 33 | Rare singles | 6 | `mkshop` 175, `wall_angle` 3721 and 3735, `mv_bubble` 2053, `flip_level` 677 (migrating guard), `checkfile` 863 and 975. |

### Largest clusters not examined

Ranked by unrun lines among the 1,755 kept clusters this pass did not
examine (`clusters.txt` holds them all). "Sites" counts gapsort
unreachable call sites on its unrun lines.

| Rank | Cluster | Unrun | Run | Entries | c-function-map | Sites |
| ---: | --- | ---: | ---: | ---: | --- | ---: |
| 1 | `dogmove.c` `dog_move` | 21 | 242 | 31,593,349 |  |  |
| 2 | `dokick.c` `ship_object` | 21 | 76 | 160,242 |  |  |
| 3 | `glyphs.c` `shuffle_customizations` | 21 | 53 | 41,492 | otherName |  |
| 4 | `mon.c` `minliquid_core` | 21 | 99 | 314,448,221 |  |  |
| 5 | `pline.c` `execplinehandler` | 21 | 7 | 44,421,387 | noVisibleEffect |  |
| 6 | `shk.c` `u_entered_shop` | 21 | 129 | 14,392 |  |  |
| 7 | `uhitm.c` `mhitm_ad_dgst` | 21 | 33 | 90 |  |  |
| 8 | `vault.c` `invault` | 21 | 246 | 40,793,301 |  |  |
| 9 | `dig.c` `dig` | 20 | 220 | 48,514 |  |  |
| 10 | `dig.c` `adj_pit_checks` | 20 | 38 | 32 |  |  |
| 11 | `engrave.c` `engrave` | 20 | 147 | 273,086 |  | 4 |
| 12 | `insight.c` `weapon_insight` | 20 | 114 | 46,082 |  |  |
| 13 | `mcastu.c` `castmu` | 20 | 104 | 1,874,890 |  |  |
| 14 | `mhitu.c` `doseduce` | 20 | 257 | 4,256 |  | 1 |
| 15 | `muse.c` `mon_consume_unstone` | 20 | 38 | 28 |  |  |
| 16 | `sp_lev.c` `lspo_corridor` | 20 | 0 | 0 |  |  |
| 17 | `topten.c` `readentry` | 20 | 33 | 232,220 |  |  |
| 18 | `trap.c` `launch_obj` | 20 | 236 | 7,942 |  |  |
| 19 | `zap.c` `stone_to_flesh_obj` | 20 | 80 | 27,458 |  |  |
| 20 | `detect.c` `trap_detect` | 19 | 47 | 194 |  |  |
| 21 | `dig.c` `digactualhole` | 19 | 137 | 5,296 |  | 1 |
| 22 | `dokick.c` `kick_nondoor` | 19 | 240 | 22,691 |  |  |
| 23 | `pickup.c` `query_objlist` | 19 | 129 | 71,610 |  |  |
| 24 | `priest.c` `priest_talk` | 19 | 111 | 745 |  |  |
| 25 | `shk.c` `shopdig` | 19 | 56 | 141 |  |  |
| 26 | `trap.c` `acid_damage` | 19 | 12 | 1,344 |  |  |
| 27 | `uhitm.c` `m_slips_free` | 19 | 9 | 1,814 |  |  |
| 28 | `worn.c` `wearslot` | 19 | 47 | 179 |  |  |
| 29 | `apply.c` `use_tinning_kit` | 18 | 51 | 4,202 |  |  |
| 30 | `end.c` `really_done` | 18 | 284 | 16,166 |  |  |
| 31 | `hack.c` `trapmove` | 18 | 104 | 56,676 |  |  |
| 32 | `invent.c` `display_pickinv` | 18 | 234 | 628,507 |  |  |
| 33 | `invent.c` `doorganize_core` | 18 | 139 | 10,465 |  |  |
| 34 | `light.c` `write_ls` | 18 | 31 | 68,232 |  |  |
| 35 | `lock.c` `picklock` | 18 | 64 | 3,167 |  |  |
| 36 | `lock.c` `pick_lock` | 18 | 236 | 6,979 |  | 1 |
| 37 | `mkobj.c` `unsplitobj` | 18 | 29 | 53 |  |  |
| 38 | `mkobj.c` `insane_obj_bits` | 18 | 0 | 0 |  |  |
| 39 | `role.c` `randgend` | 18 | 0 | 0 |  |  |
| 40 | `role.c` `randalign` | 18 | 0 | 0 |  |  |
| 41 | `sp_lev.c` `flip_level` | 18 | 302 | 28,131 |  |  |
| 42 | `teleport.c` `dotele` | 18 | 75 | 16,651 |  |  |
| 43 | `timeout.c` `write_timer` | 18 | 21 | 620,720 | otherName |  |
| 44 | `topten.c` `encode_extended_achievements` | 18 | 69 | 16,062 | noVisibleEffect |  |
| 45 | `trap.c` `trapeffect_hole` | 18 | 31 | 13,731 |  |  |
| 46 | `trap.c` `trapeffect_anti_magic` | 18 | 76 | 14,660 |  |  |
| 47 | `trap.c` `immune_to_trap` | 18 | 100 | 32,025 |  |  |
| 48 | `uhitm.c` `hmonas` | 18 | 290 | 32,306 |  | 1 |
| 49 | `weapon.c` `enhance_weapon_skill` | 18 | 48 | 9,983 |  |  |
| 50 | `zap.c` `bhito` | 18 | 198 | 107,131 |  | 1 |

## Unreachable clusters, with reasons

The four sections below are the per-cluster notes for the 80 examined clusters. Each gives covered, reachable and unreachable lines, and cites the C lines.

### Fork A targets (display, status, level creation)

Line numbers are those of `recorder-lua/src` (identical to upstream for these
files). "Unrun" is the map-current count. A Lua-data argument means: every
Lua call site of the binding has run in map-current (the 111 unrun Lua lines
contain no such call), so a branch that depends only on the call's arguments
and that no shipped `dat/*.lua` file requests cannot run.

| # | Cluster | Unrun | Status |
| ---: | --- | ---: | --- |
| 1 | display.c show_glyph | 92 | Unreachable: 1906-1995 is the `!isok(x,y)` impossible() report and 1998-2001 the bad-glyph impossible(); both are invariant checks on callers. |
| 2 | sp_lev.c create_monster | 92 | Unreachable. 1941 panic on an unknown class; 2010-2014, 2021-2022, 2035-2036 impossible() on bad appear_as data. 2043-2059 (boulder-mimic retry) is dead code: line 1993 sets `m->x = x` to the placed position before the `m->x < 0` test at 2042 (probed: 12 #wizloaddes soko1-1/soko1-2 loads ran none of it). 2063-2119 needs `appear_as = "mon:..."`, which no dat file uses. 2134 `seentraps` is hard-coded 0 (3311). 2143-2159 need cancelled/revived/avenge/stunned/confused/invisible/blinded/paralyzed/fleeing options, which no dat file passes. 2170/2172 need m_lev + m_lev_adj outside 0..49; the only use is `m_lev_adj = 3` (minetn-1.lua:136). |
| 3 | mkroom.c cmap_to_type | 82 | Unreachable: furniture mappearances come only from set_mimic_sym() (makemon.c:2421-2496: doors, hwall/vwall, fountain, altar, stairs, grave, throne, sink), sp_lev `ter:` (staircase down, fountain) and dogmove.c:1443 (sink); all those cases run. No code assigns stone, corner/T walls, bars, tree, room, corridor, ladder, pool, ice, lava, drawbridge, air, cloud, water or lava-wall symbols. |
| 4 | mkroom.c mkshop | 54 | 105-154 need the SHOPTYPE environment variable (unreachable); 166-168 impossible(). 175 reachable but rare: an otherwise eligible one-door room whose door square has exactly one inside neighbour with one further room neighbour (invalid_shop_shape() 1092 has never returned TRUE). Outline: debug mode, ^V to DL3-8, many `#wizmakemap` until a 1-wide room with an end door is picked; 3 x 60 regenerations (seeds 91001-91003) found none. |
| 5 | display.c get_bkglyph_and_framecolor | 47 | Unreachable under tty: `iflags.use_background_glyph` is never set in src/ or win/tty (only flag.h declares it). |
| 6 | sp_lev.c search_door | 43 | Unreachable: only create_corridor() calls it, from lspo_corridor(); no dat file calls `des.corridor`. |
| 7 | sp_lev.c create_corridor | 43 | Unreachable: 2683-2725 run only for des.corridor() with a room index; no dat file calls it (random_corridors() takes the 2675 branch). |
| 8 | mkmaze.c makemaz | 35 | Unreachable. 1140-1156: the only dungeon with a protofile is Vlad's Tower ("tower"), and all three of its levels are listed special levels, so mklev.c:1269 takes `makemaz(slev->proto)`. 1165-1181 need SPLEVTYPE (environment). 1194-1195 impossible() on a missing level file. 1215-1217 need Invocation_lev() in the plain-maze path, but every non-special Gehennom level goes through `makemaz("hellfill")` (mklev.c:1273), which returns at 1189. |
| 9 | botl.c compare_blstats | 33 | Unreachable: panics at 1816-1827; the other unrun cases are the IPTR/LPTR/UINT/UPTR/ULONG/ULPTR and default types, and initblstats (botl.c:704-740) uses only INT, LONG, STR and MASK32. |
| 10 | sp_lev.c create_object | 30 | Unreachable with the shipped Lua: 2221 panic; 2225 needs class "$"; 2247-2249 buc "not-uncursed"; 2260 random montype; 2270 a novel name; 2277-2279 positive `eroded`; 2285 `recharged`; 2295 `tknown`: none appears in dat/. 2315 needs SP_OBJ_CONTENT with container_idx 0, but 3725-3726 set that flag only when container_idx is non-zero. 2331-2338 need a NULL container slot, set only at 2434 when a buried object is deallocated, which bury_an_obj() (dig.c:2019) does only for rocks and boulders; no dat file buries either. 2349, 2402, 2411 impossible(). |
| 11 | sp_lev.c lspo_feature | 30 | Unreachable: 4874-4881 and 4901-4923 are the table form `des.feature({type=...})`; dat/ uses only the string forms (29 fountain, 1 sink). 4894 impossible(). |
| 12 | sp_lev.c lspo_grave | 29 | Unreachable: no dat file calls `des.grave`. |
| 13 | botl.c percentage | 28 | Unreachable: 1989-1992 impossible(); 2012-2035 are UINT..ULPTR cases, which no status field uses (see 9). |
| 14 | display.c wall_angle | 28 | Mostly unreachable: 3590-3594, 3658-3662, 3745-3747, 3775-3778, 3783-3784 impossible(); 3601-3603 dead, since the only caller back_to_glyph() handles `arboreal_sdoor` itself (display.c:2305) before calling wall_angle(). 3548-3550 and 3563 are t_warn() reports of inconsistent seen vectors. Reachable but rare: 3721 (crosswall seen only from SV4) and 3735 (crosswall seen from SV5/SV6 plus SV1-3); outline: walk a Gehennom maze or the Wizard's Tower outskirts, viewing crosswall junctions from one octant only. |
| 15 | sp_lev.c lspo_map | 28 | Unreachable with the shipped Lua. 6108 needs a second des.map in a themeroom after a failed placement; each themeroom calls des.map once and mklev.c:414 resets the flag per attempt. 6134-6137, 6186-6190 Lua errors on bad map data. 6150-6162 and 6173-6178 need des.map inside a room's contents; 6229-6231 a themeroom map with halign/valign (themeroom maps take random x,y that always fit); 6237 a full-height map; 6240 a 1x1 map; 6283 an invalid map character. |
| 16 | botl.c s_to_anything | 26 | Unreachable: 1933 NULL buffer; 1942-1966 are types no status field has. MASK32 (1964-1965) would need a condition threshold, but parse_status_hl2() sends BL_CONDITION to parse_condition() (botl.c:2862) first. |
| 17 | sp_lev.c flip_vault_guard | 26 | **Covered**: `recipes/sp_lev.c/flip_vault_guard-vault-guard-wizfliplevel.session.json` (probe: 30 new C lines, flip_vault_guard 26 and flip_level 4; recording passes). The migrating-guard caller (sp_lev.c:677) is still unrun; outline: leave the level while a guard is mid-escort, return, then #wizfliplevel. |
| 18 | botl.c anything_to_s | 23 | Unreachable: 1892-1897 ULONG and MASK32 (the condition field always has valsetlist set, so 1586 skips it); 1904-1918 unused types; 1922-1923 default. |
| 19 | sp_lev.c lspo_wall_property | 24 | Unreachable: no dat file calls `des.wall_property`. |
| 20 | sp_lev.c nhl_abs_coord | 23 | Unreachable: no dat file calls `nh.abscoord`. |
| 21 | mkmaze.c mv_bubble | 22 | Mostly unreachable: 1981-1997 out-of-bounds plines, which the bounce logic at 2000-2010 prevents; 2045, 2055, 2068 and 2076 are closing braces after `break`; 2078-2080 impossible(). Reachable: 2053 elemental_clog() when mnearto() fails for a bubble's monster. Outline: debug mode, Plane of Water, crowd the bubbles with many created monsters so a bubble's occupant has no free square. |

#### Totals

- Covered by the new recipe: 26 lines of cluster 17 (and 4 in flip_level).
- Reachable, not done: 4 lines in these clusters (mkshop 175, wall_angle 3721 and 3735, mv_bubble 2053), all needing rare state; also the flip_level migrating-guard branch, outside this list.
- Unreachable: the other 808 of the 838 lines in these 21 clusters (the wall_angle t_warn lines counted as unreachable invariant reports).

### Fork B targets (assign-B.json, 16 clusters, 544 unrun lines)

Measured with `B-tools/probe.py` against map-current. The seven kept recipes
newly run **199 C gameplay lines** (union) and 0 Lua lines. All seven
recordings replay with PASS on `da8843836`.

Note for all clusters: map-current's coverage.lcov gives count 0 to
preprocessor-directive lines (for example objnam.c 5168 `#ifdef
MAIL_STRUCTURES` and 5174 `#endif`). No input runs those lines. Across all
1,862 clusters there are 40 such lines (`directive-lines.json`).

| Cluster | Unrun | Run now | Status |
| --- | ---: | ---: | --- |
| shk.c globby_bill_fixup | 58 | 52 | partly covered |
| objnam.c readobjnam | 53 | 3 | partly covered; rest are non-wizard or unreachable |
| shk.c dopay | 50 | 9 | partly covered |
| sounds.c base_soundname_to_filename | 43 | 0 | unreachable |
| invent.c getobj | 35 | 13 | partly covered |
| shk.c sellobj | 34 | 17 | partly covered (all reachable non-bones lines) |
| objnam.c makeplural | 32 | 22 | partly covered |
| rumors.c others_check | 31 | 0 | unreachable |
| pager.c checkfile | 31 | 0 | 2 reachable lines, not done; rest unreachable |
| shk.c shk_chat | 30 | 7 | partly covered; rest bones-only |
| sounds.c domonnoise | 29 | 18 | partly covered |
| pager.c do_screen_description | 25 | 0 | reachable, not done |
| objnam.c makesingular | 24 | 19 | covered (rest unreachable) |
| shk.c stolen_container | 24 | 0 | reachable, not done |
| shk.c litter_scatter | 23 | 0 | reachable, not done |
| hack.c findtravelpath | 22 | 22 | covered |

#### Covered or partly covered

- **hack.c findtravelpath (22/22)**: `recipes/hack.c/findtravelpath-travel-debug-crawl`.
  Uses the wizard-only `travel_debug` option with `runmode:crawl`; travels to
  `>` and twice to unreachable stone (TRAVP_GUESS).
- **objnam.c makeplural (22) and makesingular (19), plus readobjnam 4950/5062/5208 and badman (7)**:
  `recipes/objnam.c/makeplural-fruit-names`, 55 lines. The fruit name is
  changed through `O` `a` and two of each are wished for. Run 2 after each
  rename, because the fruit list keeps a renamed fruit only once a fruit
  object exists.
  - Still unrun in makeplural:
    - 2845/3045: a leading blank; every caller strips it, so unreachable.
    - 2847-2850 and 3047-3050: impossible() on an empty string.
    - 2863: plural of "his"/"its" (fruit "his" gave "2 his" here; not traced).
    - 2891: trailing blanks.
    - 2963-2965: "-sis" (fruit "thesis" printed "2 thesis"; not traced).
- **invent.c getobj (13)**: `recipes/invent.c/getobj-repeat-count-and-loadstone`.
  Covers the ^A repeat of a counted drop (CMDQ_INT), in_doagain readchar,
  "You don't have that object" and the cursed-loadstone count.
  - Still unrun:
    - 1792-1794: a queued '-' key; repeating `w-` queues no key.
    - 1812-1815: a second CMDQ_INT.
    - 1868-1870 and 1895-1897: impossible().
    - 2022-2026 and 2078: a zero or negative count. Neither the count path
      nor the menu path produced one.
    - 2066: in_doagain with a count above the stack.
- **sounds.c domonnoise (18)**: two recipes.
  - `domonnoise-vampire-forms-at-night` (15 lines; datetime 23:30). The hero
    wears a ring of protection from shape changers, which keeps vampires in V
    form; without it they are created as bats. It chats as a vampire, a wolf,
    a silver dragon and a titan.
  - `domonnoise-nymph-opposite-gender` (3 lines). A male hero chats with a
    peaceful water nymph woken by a tin whistle (a leather drum deafens the
    hero).
  - Left: see "Reachable, not done" and "Unreachable".
- **shk.c globby_bill_fixup (52), sellobj (9+), shk_chat (7), dopay (9)**:
  `recipes/shk.c/globby_bill_fixup-broke-general-store`, 82 lines.
  - Setup: seed 9100004, `^V2`; the hero lands inside a general store on
    Dlvl 2. She sells 10 diamonds, identified with `^I _`, so the
    shopkeeper's gold falls to 0.
  - Globs on adjacent squares coalesce, so they must be dropped at least 2
    squares apart. A wand-of-fire engraving gives a usage-fee debit that
    leaves the credit untouched (check_unpaid_usage).
  - Left: 6042-6046, loan repayment. To reach it, drop gold for credit, spend
    part of the credit, pick the gold up again (loan), then drop a glob onto a
    shop-owned glob. 5986 is impossible().
- **shk.c sellobj (17)**: `recipes/shk.c/sellobj-credit-answers-and-containers`.
  Same shop. Covers "and items inside" (4149), credit answers `a` and `q`
  during multi-drop (4052, 4061-4065), and container credit (4075, 4081).
  - Left:
    - 4000-4013: the shop was robbed but the keeper is not angry. Every
      pacifying path (make_happy_shk, the tamedog path) clears `robbed`; only
      a ghostly bones restore (restshk) keeps it. Bones-only.
    - 4041: needs offer > 0 and a full bill (BILLSZ = 200 entries).
    - 4190-4191: impossible().

#### Reachable, not done (input outlines)

- **shk.c stolen_container (24)**: stolen_value() on a container with
  contents. In the 9100004 shop, put own and unpaid items into a shop sack.
  Then kick the sack out through the door, or zap digging down so it falls,
  or burn it in lava. Any stolen_value() caller works.
- **shk.c litter_scatter (23)**: in the shop, zap a wand of digging at a
  wall. Pay for the damage. Drop, into the gap, an unpaid item, a
  no_charge item and (for 4635-4653) the ball or chain while Punished; a
  wished "heavy iron ball" does not punish, so read a cursed scroll of
  punishment. Leave and wait until the keeper repairs the wall.
- **pager.c do_screen_description (25)**: symbol overrides set in the rc.
  - `S_hero_override`/`S_pet_override` in a SYMBOLS= line did not change the
    display in one try (the hero still showed '@'). The options may need
    `OPTIONS=symset:` or a `SYMBOLS=` key that the parser accepts; check
    options.c parsesymbols().
  - 1417-1418: `I` must share a symbol with another feature.
  - 1437-1439: unexplored must be the only match for its symbol.
  - 1538-1539: venom put back when found == 1.
  - 1383-1384: farlook an engraving shown with the boulder/statue symbol.
- **pager.c checkfile 863 and 975**:
  - 863: needs `pm` set with !user_typed. `/` at a monster, then "More
    info? y", did not reach it in one try.
  - 975: an alternate name containing " (", such as an object named
    "x (y)" looked at with `/` `i`.
- **shk.c dopay 1910-1911**: rob the shop (pick up the unpaid diamonds and
  `^F` `^T<.` out), then pay the angry keeper with less than half the
  stolen amount. The keeper did not follow the hero in 20 turns, so walk back
  to the door and press `p` when he is adjacent.
- **shk.c dopay 1837-1839 and 1848-1849 ("Pay whom?")**: two shopkeepers must
  be seen, for example in Minetown, or while blind with telepathy (helm of
  telepathy and a blindfold). Pick an empty visible square (1837), or a
  resident keeper who is not adjacent (1848).
- **sounds.c domonnoise**:
  - 862-863 and 1052 (hungry tame cat or dwarf): wait more than 1000 turns
    with no food available. Pets here ate corpses; try a closet, or #wizkill
    the other monsters first. Wear a ring of slow digestion, or the hero
    faints and becomes Deaf.
  - 1043-1047: a trapped peaceful humanoid.
  - 1215-1216: Death's "Sandman" line (1 in 30 per chat).
- **objnam.c readobjnam non-wizard lines (about 30)**: 5004-5018, 5022,
  5105-5117, 5182-5184, 5294, 5375-5381. These need a wish outside debug
  mode. Seed search: quaff from or dip into a Dlvl 1 fountain (water demon
  1 in 30, and the demon grants a wish with probability
  1 - (80 + depth)/100), or sit on a throne.

#### Unreachable

- **sounds.c base_soundname_to_filename (43)**: its only callers are in
  `sound/windsound/windsound.c`, which is not in the build.
- **rumors.c others_check (31)**: every unrun line is an error path for a
  missing or malformed bundled data file (334-362, 368, 384, 406-407). Line
  322 needs `tmpwin == WIN_ERR`, which happens only when rumors_check() could
  not open the rumors file (rumors.c 214).
- **pager.c checkfile (29 of 31)**: these are data-file error paths:
  - 848-856: open failure, or an over-long buffer that getlin() prevents.
  - 998-1007, 1019, 1046, 1049, 1073-1075, 1086, 1089, 1123: seek or read
    errors.
  - 1099-1104: lines indented with spaces; data.base uses tabs.
  - 1126 and 1129.
- **objnam.c readobjnam** (24 of the lines still unrun):
  - Switch `default:` labels and cases the postparse helpers never return:
    4937, 4948, 4953-4954, 4959, 4961, 4963-4965. postparse2 returns only
    0-3 and postparse3 returns only 0, 2 or 6.
  - Directive lines: 5168, 5174.
- **sounds.c domonnoise**:
  - 818: vampmsg has two entries, so rn2(2) never selects a third.
  - 1117: needs SYSOPT_SEDUCE off, which is a sysconf setting, not an input.
- **shk.c shk_chat 5546-5562 and 5579-5585, and dopay 1870-1896**: these need
  `following`, `robbed` or `surcharge` set while the keeper is not angry.
  hot_pursuit() and rile_shk() make the keeper angry, and every pacifying
  path calls make_happy_shk(), which clears those fields. Only a ghostly
  bones restore (restshk) keeps them; that needs a second segment loading
  bones under a different player name. Debug mode forces the name "wizard",
  so the bones must come from a non-debug segment.
- **impossible() and debug-only guards**: dopay 1824-1826, 1852-1854 and
  1948; getobj 1868-1870 and 1895-1897; makeplural/makesingular null strings;
  globby 5986; sellobj 4190-4191.

### Fork C targets (assign-C.json, 22 clusters)

Line counts are unrun gameplay lines in map-current. "Probe" figures are from
`probe.py` (C+Lua coverage recorder) against map-current. Recipes are under
`.cache/lead/wt-covrecipes/recipes/`. Probes of every recipe ran 0 new Lua lines.

#### Covered (recipe recorded, replay passes)

| Cluster | Unrun | Recipe | Probe new lines | Left |
| --- | ---: | --- | ---: | --- |
| dokick.c ghitm | 42 | `dokick.c/ghitm-thrown-gold-mercenaries` + `zap.c/revive-shop-corpse-undead-turning` | 19 + 3 | shopkeeper branches 329-336 (robbed), 344 (hostile shk "Thanks, scum!"), hostile priest 351-352, guard 359-365, sergeant 373. Outline: Minetown (`^V ? > w`), rob a shop by picking up an item and `^T` out, then throw gold at the pursuing shopkeeper when lined up; vault guard: `^T` into a closed vault, wait for the guard, answer the name prompt, `t<n>$<dir>`; sergeant: `^G sergeant`, `t<n>$<dir>`. |
| zap.c revive | 31 | `zap.c/revive-shop-corpse-undead-turning` | 3 (1032, 1057-1058) | 1053-1054 (unseen shop corpse: zap while blind), 1015-1017 (revived hider still hidden: needs a corpse whose saved traits carry mundetected), 927-929 (corpse in a container carried by a monster), 1078-1087 (ghost of a bones corpse). 897-899, 1131-1136 impossible/panic. |
| artifact.c artifact_hit | 48 | `artifact.c/artifact_hit-vorpal-ghost-jabberwock`, `artifact.c/artifact_hit-tsurugi-engulfed` | 5 + 4 | 1498 (Fire Brand wielded by a monster hits a slimed hero), 1562 (Tsurugi natural 1 on a long-worm tail), 1567-1569/1578-1594/1607-1608/1626-1636 (monster wielding Tsurugi or Vorpal Blade: drop the artifact so an M2_COLLECT monster picks it up and wields it), 1601 (Vorpal natural 1 while engulfed: wield a -7 Vorpal Blade inside a high-HP engulfer). Unreachable: 1473-1475 (impossible), 1528-1535 (no artifact has an AD_MAGM attack; artilist.h). |
| explode.c explode | 25 | `explode.c/explode-owlbear-grab-broken-wand` | 2 (278, 625) | 683-685: break a wand of cold standing next to a shop door (seen working by probe in Minetown deli seed 41103: "The door freezes and shatters!", 1 line; not committed). 571-576 needs muse_unslime's scroll-of-fire self-kill. 373: monster dead inside the blast area. Unreachable: 236-238 (impossible), 338-348 (explosion types 6/7 and default: no explode() caller yields them; gapsort explode.c:69/110). |
| zap.c bhitm | 25 | `zap.c/bhitm-knight-quest-artifact-wands` | 7 (+1 worn.c clear_bypasses) | 526 (dbldam drain life: Knight with the Mirror casts drain life; needs Pw from potions of gain level and an uninterrupted read of a blessed spellbook), 500 (spell of stone to flesh at a flesh golem; there is no wand of stone to flesh, the wish gives polymorph), 400 (wand of opening at a monster on a trap door), 424/428 (saddle falls off out of sight), 453/198 (disguised mimics), 470 (healing zapped at Pestilence), 310 (vampshifter revert). 548-550 unreachable (gapsort: default case). |

#### Partly covered, recipe BLOCKED (defect)

| Cluster | Unrun | Recipe | Probe | Defect |
| --- | ---: | --- | ---: | --- |
| uhitm.c hmon_hitmon_weapon_melee | 25 | `uhitm.c/hmon_hitmon_weapon_melee-katana-shatters-weapon` (no recording) | 17 | seg 0 step 211, top line: C "The soldier's wakizashi shatters from the force of your blow!", JS "The wakizashi shatters ...". objnam.c Yobjnam2() for an object in a monster's inventory drops the owner's possessive. Remaining after the fix: 1003-1004 (blind hero), 1021-1031 (artifact kills or beheads headless target), 1062 (poisoned ammo). |

#### Reachable, not done (input outlines)

- **muse.c muse_unslime (55).** Needs a monster slimed while the hero can see it; the hero as a green slime is blind (no eyes), so use mhitm: a green slime monster under Conflict (`#wizintrinsic` page 3 `h`) adjacent to the target, hero 3+ squares away. Trap path 3125-3138: wish "fire trap" at a square next to the target (works; verified the trap branch runs, the unrun lines are its visible messages). Scroll of fire / wand / horn: let a non-animal monster pick the item up (drop it, `^G` the monster, `^T` the hero more than 5 squares away; a gnomish wizard picked up a dropped scroll of fire this way). Potion of oil: a likes_magic monster (gnomish wizard, kobold shaman) picks up potions. Attempts were defeated by the slime attacking the hero.
- **apply.c fig_transform (54).** Floor, monster-carried and blind-hero transforms. Needs a cursed figurine and rnd(9000)+200 turns of waiting; too long a recording for regression. 2409-2411, 2493-2496 impossible.
- **muse.c use_defensive (46).** Most unrun lines are `panic(MissingDefensiveItem)` / impossible / `stairway_at() == 0` returns (835, 840, 851, 860, 874, 919, 989, 1006, 1069, 1072, 1096, 1106, 1116, 1126, 1163, 1177, 1191, 1206, 1211-1217): unreachable. Reachable: 972-980 (monster with a wand of undead turning lined up with a hero wielding a cockatrice corpse in gloves; the monster must pick up the wand), 1210 (confused or stunned monster carrying a lizard corpse; monsters pick lizard corpses up via searches_for_item), 867 (monster zaps teleportation on a no-teleport level, e.g. Sokoban), 1075-1078 (monster with the Amulet in Gehennom), 1020 (scroll of create monster with no room), 1059/1155 (long worm using a trap: worms do not use MUSE, likely unreachable).
- **muse.c use_misc (28).** Panic lines 2401, 2444, 2484, 2490, 2501, 2510, 2547, 2620-2625 unreachable. Reachable: bullwhip branch 2560-2562 (hero two-weaponing), 2575-2577 (hero wielding a heavy iron ball), 2581-2586 (welded weapon), needing a hostile monster wielding a bullwhip; 2438 (monster drinks gain level and grows into a genocided form).
- **worn.c mon_break_armor (27).** 1222-1228 (shirt rips) and 1259-1260/1303-1304 need a monster wearing a shirt or boots, then a wand of polymorph with `monpolycontrol` (works: "Change X into what?") into a giant or a vortex. A tame hill orc did not pick up dropped armor in 120 turns. 1190: monster in dragon scales polymorphed into that dragon. 1320-1333: steed loses the saddle first (m_lose_armor dismounts), so only `!can_ride()` with a saddleable form reaches it, i.e. Underwater with a non-swimming steed; no route found. 1207-1210 unreachable (no artifact cloak).
- **dogmove.c dog_eat (25).** Rust monster pet and rustproof iron (302-311): the pet eats ACCFOOD only when hungry (hungrytime about 1000 turns after creation), so wait or starve it. Unpaid food (265, 297-299, 335-337, 340): throw a shop-owned corpse (DOGFOOD) at a tame carnivore in a shop; kill small monsters in the Minetown deli until one leaves a corpse, pick it up, `t` it at a `^G tame little dog`. Food rations are only ACCFOOD and are not caught. 321-330 impossible.
- **hack.c domove_swap_with_pet (28).** 2123 pet trapped in a pit with a boulder; 2148-2150 swap into a pet stuck in an unseen trap; 2183-2221 swapping a pet onto a trap that catches, moves or kills it (e.g. swap a tame kitten onto a known trap door or into water with `m` prefix). 2220 impossible.
- **trap.c help_monster_out (28).** #untrap a trapped adjacent monster: 5723 while overloaded, 5734-5748 a trapped cockatrice with bare hands (no gloves), 5751-5770 other refusals. Outline: wish "bear trap", `^G cockatrice` onto it via `^T`, `#untrap` toward it.
- **trap.c trapeffect_landmine (29).** 2549-2562 hero levitating or flying over an unseen land mine (`#wizintrinsic` levitating, wish "land mine" two squares away, walk over); 2609-2623 a flying monster over an unseen land mine (`^G` a bat next to a wished land mine).
- **steal.c maybe_absorb_item (24).** Entered once. 782-810: a monster (gelatinous cube or ochre jelly engulfing) absorbs a carried, worn or unpaid item; outline: wield or wear items, get engulfed by a `^G` ochre jelly, in and out of a shop.
- **hack.c still_chewing (23).** Hero polymorphed into a rock mole or xorn-type tunneler chewing through doors, boulders and shop walls (`#polyself rock mole`, then move into a door, a boulder, a shop wall).
- **mthrowu.c return_from_mtoss (22).** A monster's thrown aklys returning or failing to return (865-878, 945-960). `^G` a monster wielding an aklys that throws it (dwarf? hill orc with aklys); give one via pick-up. 936 unreachable (gapsort: no aklys artifact).
- **apply.c use_mirror (21).** 1044-1056 mirror applied while engulfed or underwater; 1118, 1134, 1176-1193 mirror at specific monsters (nymph, invisible, blind, reflection cases). Outline: wish a mirror, `^G` a nymph / a floating eye / a mind flayer, apply toward it; apply while engulfed by a fog cloud.

#### Unreachable

- **minion.c msummon (33).** Only mhitu.c:969 calls it with a monster, and only for is_demon() attackers; sit.c and wizard.c pass NULL (Wizard-of-Yendor branch). Lines 103-125 (lawful minion and Angel summoners), 154-160/166-167/170/187-188 (dtype Angel or S_ANGEL summons) need a non-demon summoner. 132 needs cnt 2 for a unique dtype, but cnt 2 is set only for is_ndemon() types, which are not unique.
- **mondata.c msummon_environ (23).** Called only from msummon() (minion.c:174), whose summons are demons or skeletons, so only the default "smoke" and water demon "vapor" cases run; 1466-1489 (steam, sparks, dust, flame, light) need elemental or angel summons from the unreachable Angel branch.
- **explode.c explosionmask (23).** gapsort verdicts (explode.c:69, 110): explode() only computes adtyps that explosionmask() already handles; the unrun 54, 60-70, 101-111 are the unhandled-type arms.

### Fork D clusters (assign-D.json)

Probe counts are C gameplay lines that map-current never ran, measured with
`probe.py` (coverage recorder). Every kept recording passed `frozen/ps_test_runner.mjs`
against the worktree. Line numbers are upstream `nethack-c/upstream/src`.

| Cluster | Unrun | Status |
| --- | ---: | --- |
| dungeon.c dumpit | 42 | Unreachable: returns at 99 unless `explicitdebug(__FILE__)`, which needs sysopt.debugfiles (sysconf DEBUGFILES is commented out; env DEBUGFILES is not a session input). |
| questpgr.c com_pager_core | 37 | Unreachable: 485 needs wizkit wishing (a WIZKIT file); 489-515 are nhl_init/load/table failures; 530-540 and 559-565 are impossible() for missing or malformed quest.lua entries. |
| do.c dodown | 36 | Partly covered: `recipes/do.c/dodown-piercer-drops-onto-trap` (2 lines: 1211, 1215). 1257-1287 are dead code: `trap` is non-null at 1256 only when no stairs are under the hero, and any seen hole there makes `uescaped_shaft()` true, so 1226-1228 returns first. Remaining reachable: 1252-1254 (cursed leash and a pet that `mnexto()` cannot place adjacent, e.g. hero on a downstair boxed in by boulders); 1172-1174 (levitation artifact with `float_down()` failing); 1190 (blind, levitating over a down ladder, e.g. Vlad's Tower). |
| topten.c outentry | 36 | Reachable, not done: needs normal-mode deaths (wizard and explore skip the score list at 725). 998-1001 are crushed (drawbridge) and petrified deaths; 1005-1028 are deaths on the Planes; 979 is escaping with a fake Amulet; 1065 is a killer name of 60+ characters with no space (kill by a monster named with #name). 971-972 (alignment '?') are unreachable. |
| bones.c getbones | 33 | Partly covered: `recipes/bones.c/getbones-genocided-species-defunct` (6 lines 720-725, plus restore.c restmonchn 2). The rest is unreachable: 656-660 are file-state checks, 664-667 are version validation, 684-703 are a corrupt bonesid, and 753-754 are an unlink failure. |
| insight.c attributes_enlightenment | 33 | Partly covered: `recipes/insight.c/attributes-enlightenment-monk-suit-lycanthrope-cling` (13 lines: 1745-1751 clinging in the endgame, 1775-1779 Monk suit penalty, 1847 lycanthrope with Unchanging). Unreachable: 1590 (only Grimtooth, Orcrist and Sting set warntype.obj, giving elves or orcs); 1598-1601 (polysense() sets polyd only to M2_HUMAN\|M2_ELF); 1780 (needs uhitinc ≥ 20, but two +5 rings give at most 10); 1807 (MC cannot exceed 3); 1961-1974 (DEBUGFILES "fruit"); 1990-1992 (impossible). |
| vault.c gd_move | 33 | Not examined. Outline: vault guard escort edge cases, such as a guard whose corridor is blocked or dug, a hero who teleports out mid-escort, or a guard killed or paid off. Use ^V and ^T to a level with a vault, then wait in the vault for the guard. |
| end.c build_english_list | 30 | Unreachable: only called from cfgfiles.c:806 for a sysconf WIZARDS list other than "*". The recorder's sysconf has WIZARDS=*. |
| insight.c show_achievements | 30 | Partly covered: `recipes/insight.c/show-achievements-blind-whole-game` (4 lines, 2289-2292). Unreachable: 2266-2267 and 2400-2402 (its only caller, show_conduct(), always sets en_win). Reachable, not done: 2329-2332 ACH_TUNE (debug ^V menu to the castle, whose overview shows the tune; travel next to the drawbridge; apply a wished wooden flute and play the tune; die and view conduct. This was tried and abandoned because the castle's soldiers interrupt travel); 2320-2322 mines prize (luckstone at Mines' End); 2356-2358, 2378-2381 and 2280-2283 (invocation and ascension). |
| restore.c getlev | 30 | Unreachable: 1090-1100 (trickery); 1119-1121 (doors always freed before getlev); 1245-1254 (bones between Medusa and the castle without down stairs; those filler mazes always have them); 1278-1285 (portal-branch dlevel 1 bones: the quest home, Ludios and Earth have no bones); 1294 (can_make_bones() refuses non-branch levels with portals). |
| restore.c restgamestate | 29 | Unreachable: 544-554 (uid mismatch); 611-612 and 632-647 (explore_error_flag needs EXPLORERS restricted, and sysconf has EXPLORERS=*); 663-669 (a dangling ball and chain: dosave0() calls done_object_cleanup(), which places a free uchain and uball back on the floor before save_bc() runs, so a save while engulfed and punished saves none. Tested: the restore read an empty list). |
| do_wear.c armoroff | 27 | Unreachable by object data: all shields and cloaks have oc_delay 0 and all boots and gloves have delay > 0 (1938-1941, 1954-1965, 1985-1990); 1997-2000 are impossible(). Rare: 1927 needs an item cursed during a multi-turn takeoff (A menu, then a curse-items spell). |
| pray.c pleased | 27 | Reachable, not done (expensive): 1198-1199 and 1320 need pat_on_head (no trouble, alignment ≥ 14, so ALIGNLIM needs more than 800 turns) while blindfolded (a blindfold is not TROUBLE_BLIND). Use wizard "Force the gods" to zero the prayer timeout, wield an uncursed weapon, and vary seeds for rn2((Luck+6)>>1) == 1 or 5. Unreachable: 1181-1190 (a cursed wielded weapon is always welded trouble and is fixed first); 1265-1268 (STR below max is TROUBLE_POISONED); 1351-1353 (impossible). 1372-1378 need 100,000 turns. |
| cmd.c getdir | 25 | Partly covered: `recipes/cmd.c/getdir-redo-queued-direction` (3 lines: getdir 3973-3974, do_repeat 1657; ^A repeating a kick). Unreachable: 3975-3978 (impossible); 3997-4008 (the fuzzer would never finish a session); 4081 and 4085-4089 (getpos impossible). |
| teleport.c level_tele | 25 | Unreachable or impractical: 1175-1184 and 1324 (fuzzer); 1187-1189, 1206-1207 and 1407-1409 need a non-wizard level teleport with teleport control (in Sokoban or Gehennom); 1412 cannot happen (positive quest requests are offset to ≥ qstart depth). Reachable, not done: 1328-1333, a wizard ^V to "-1" while standing inside a shop (u.ushops0): ^V menu to Minetown, travel onto a shop item ('_', then 'o' in getpos), then ^V -1, decline "Die?", and the game escapes. |
| topten.c topten | 23 | Reachable, not done: 833-839 and 863 need a record with 10+ higher entries. Use 11+ normal-mode segments, each a different role (PERSMAX 3 per uid and role), each quitting with fewer points than the last, with the `scores` option set so end_around applies. Unreachable: 653 (panic), 705, 716, 740, 749-752 and 822-826 (file and lock failures), 812-814 (ENTRYMAX 100). |
| cmd.c cmdname_from_func | 23 | Unreachable: every caller passes fullname=TRUE (3129-3154) and an extcmd function that exists (3124). |
| steed.c mount_steed | 23 | Reachable, not done: 310-316 (non-Knight: `^G tame saddled sleeping pony` west of the hero, ring of aggravate monster, bare-handed F hits halve tameness 10→5→2→1, then #ride and answer n to force). The pony moves once woken, so the hits need re-aiming from the screens; abandoned. 318-321: a Knight wearing an amulet of magical breathing, underwater in a wished pool next to the pony, tries #ride without force. Likely unreachable: 207-209 (already riding; #ride dismounts first); 289-295 (a saddled cockatrice is impossible: saddles fall off on polymorph); 323-325 (can_ride and can_saddle fail only in states rejected earlier). |
| trap.c openholdingtrap | 23 | Covered: `recipes/trap.c/openholdingtrap-unseen-monster-in-web` (5 lines: 6193-6196, 6199). BLOCKED: `recipes/trap.c/openholdingtrap-buried-ball-anchor` (6 lines: 6136-6139, 6173-6174; defect D1). Remaining reachable: 6176 (zap opening at self with the steed in a web: a Knight leads the pony into a wished web with "Really step into that web? y", then `zj.`; seen working in a probe); 6197-6198 (invisible monster in a bear trap); 6132-6134 (TT_INFLOOR). Unreachable: 6147-6151 (default case), 6169 and 6186. |
| trap.c chest_trap | 23 | Reachable, not done: 6469 (wear a ring of free action, wish several "trapped large box" and #loot them until the 3-5 case: "You momentarily stiffen"); 6360-6409 need the 1% explosion case inside a shop (or while punished, with the ball on the chest square for 6381). Unreachable: 6338-6341 and 6490-6492 (impossible). |
| do.c goto_level | 21 | Reachable, not done: 1556 and 1566-1568 (the mysterious force with diff 0: carry a wished Amulet of Yendor, ^V into mid-Gehennom, travel to '<' and climb repeatedly; chaotic hero for a 1/8 chance per climb); 1553 (the same inside the Wizard's Tower); 1736 (expelled from the quest, then re-entering the home). Unreachable: 1506-1508 (the ^V menu supplies the Amulet; a non-wizard cannot reach the endgame); 1587-1591 (no LVL_LEAVE callback is ever registered); 1599, 1696-1698 and 1707-1708 (file errors and impossible()). 1901 needs a dead monster in fmon when entering Ludios. |

#### Defects

- **D1 (trap.c openholdingtrap()).**
  - **Recipe:** `recipes/trap.c/openholdingtrap-buried-ball-anchor.session.json`. The first mismatch is at seg 0 step 70 (zero-based), when a wand of opening is zapped at self.
  - **C:** "You and your pony are released from your anchor."
  - **JS:** "...released from a your anchor."
  - **Likely cause:** C's TT_BURIEDBALL case sets `which = ""`, so no article is added at 6160-6165. The port adds "a ".

#### Probe caveat

The coverage recorder keeps running code after a session's last key, because the hangup save continues past a pending --More--. A probe whose last key leaves a --More-- open can report lines that no step reaches; one probe showed trapeffect_web 2175-2177 this way. End each recipe on a settled prompt.

## Lua: the 111 unrun lines

All 111 lines are unreachable from a valid game, so none is a target. A valid
game is what a session carries: seed, date and time, nethackrc options and
keys. Line numbers are those of `nethack-c/upstream/dat/`.

| File | Lines | Group | Why no valid game runs it |
| --- | ---: | --- | --- |
| `hellfill.lua` | 22 | `hellobjects()` 14–24, `hellmonsters()` 30–40, `helltraps()` 46–47 | Dead code. No Lua file and no C file calls these three functions. `grep -rn 'hellobjects\|hellmonsters\|helltraps' dat src` finds only their definitions at lines 13, 29 and 45. |
| `nhcore.lua` | 36 | `mk_dgl_extrainfo()` 61–103 | Dead code. Its only hook, `moveloop_turn = mk_dgl_extrainfo`, is commented out in the `nhcore` table (line 132). `l_nhcore_call(NHCORE_MOVELOOP_TURN)` (`allmain.c:269`) finds no function and clears `nhcore_call_available` (`nhlua.c:185-192`). |
| `nhcore.lua` | 1 | `nh_callback_rm()` 34, table missing | Needs `nh.callback(cb, fn, true)` before any `nh.callback(cb, fn)` for that event. The only remover, `tutorial_leave()` (`nhlib.lua:211-212`), follows `tutorial_enter()`, whose `nh_callback_set()` creates the table. `save_luadata()` and `restore_luadata()` (`nhlua.c:1328-1362`) carry the table across a save, as `{}` if empty. |
| `nhcore.lua` | 1 | `nh_callback_run()` 46, table missing | C calls it only while `nhcb_counts[i] > 0` (`allmain.c:558`, `cmd.c:467`, `do.c:1586`, `mklev.c:1422`). Only `nhl_callback()` raises a count, and it calls `nh_callback_set()`, which creates the table. The counts are not saved, so a restored game starts at 0. |
| `nhlib.lua` | 1 | `math.random` error 13 | Needs a call with no arguments or with three or more. Every `math.random(` call in `dat/` passes one or two. A search for empty calls and for calls with three arguments found none. |
| `nhlib.lua` | 2 | `nh_set_variables_string()` 148, `nh_get_variables_string()` 153 | Called only by `nhl_variable()` with a table argument (`nhlua.c:1253`, `1281`). No Lua file calls `nh.variable` (`grep -n 'nh.variable' dat/*.lua` is empty). |
| `nhlib.lua` | 5 | `table_stringify()` 164, 167–170 (string, number and nil values) | The only live caller is `get_variables_string()` on save. `nh_lua_variables` holds only the `_CB_*` tables of booleans that `nh_callback_set()` writes. Lines 162 and 166 (table and boolean) already run. |
| `nhlib.lua` | 1 | `pline()` 143 | Its only callers are the `themerms.lua` debug warnings, lines 938, 992, 999 and 1018 (below). |
| `themerms.lua` | 34 | `lookup_by_name()` 909–922; `themerooms_generate()` 933–951; `pre_themerooms_generate()` 989–1000; `themeroom_fill()` 1011–1021 | Every branch needs `nh.debug_themerm()` to return a name. `nhl_get_debug_themerm_name()` (`nhlua.c:993-1006`) reads the `THEMERM` and `THEMERMFILL` environment variables, in debug mode only. A session cannot set the environment, and the port reads none. Without a name, `lookup_by_name(nil)` returns at line 907. |
| `themerms.lua` | 8 | `is_eligible()` 896; `themerooms_generate()` 957, 975–976; `themeroom_fill()` 1027, 1033, 1045–1046 | Data-dependent defensive branches. No room or fill sets `maxdiff` (896). Every entry is a table (957, 1027). No fill sets `frequency` (1033). "default" (line 284) and "Ice room" (line 47) have no `mindiff` or `eligible`, so a room and a fill are always eligible (975–976, 1045–1046). |

`#wizloaddes` and `#wizloadlua` run any `dat/` file, but none of them calls
the dead functions, and a session cannot add a file.
