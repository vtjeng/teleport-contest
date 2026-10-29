# Ordinary advancement branch reconciliation

Review base JS `029dbe6ffb8fbf04dc6d1b3dd16153b7054363f1`, C gitlink
`16ff59115315917b93185d026aeefea06db9b0f4`; checked 2026-10-29 UTC.
Scope is ordinary hero level advancement in exper.js and its attrib.js
prerequisites. This is a source-guided inventory, not instrumented branch coverage
or a claim to audit every function in attrib.js. No failed-turn artifact used.

Evidence shorthand: P106=boundaries; P109=threshold-clamps; I=integration;
A=ability-traversals; N=attribute-boundaries; S=skill-notification;
L=loss-floor-recovery; X=xp-integration; E=elf-ranger-reentry;
G=score-gates; R=rank-chronicle. P106/P109 live on their earlier draft branches;
others are directories in this PR. JS-only test coverage is not a C oracle.

| C/JS symbol and branch family | Executed evidence and observable limit | Remaining disposition / smallest prerequisite |
| --- | --- | --- |
| newuexp: below 1; below 10; below 20; high formula | P109 exact threshold projections, including newuexp(0); I/X public low thresholds | Higher public thresholds need a permitted exact XP history; oracle already qualified |
| enermod: four multipliers/default | N, all human roles with low/high RNG and integer WIS | More intermediate draws are fixture expansion, no discrepancy inferred |
| newpw/newhp: initialization vs low/high xlev; initial random terms | N executed full bodies plus A public initialization and traversals | Initial alignment skip at moves>0 is reinitialization/polymorph context and excluded |
| newhp: CON bands, positive floor, stored increments | N numeric matrix; P106/I/A public transitions | Equipment/temporary modifiers excluded or separate prerequisite; ACURR adapter is explicit |
| newpw: WIS division, positive floor, stored increments | N and public transitions | No extrapolation to arbitrary modified attributes |
| newhp/newpw: MAXULEV diminishing gains and no increment-slot write | Existing JS test only; P109 newexplevel guard does not call these at 30 | API oracle feasible, but no permitted public trigger identified: wizard/newexplevel both stop before pluslvl; usual effect trigger excluded. Do not call this a public negative |
| more_experienced: XP changed/showexp redraw | I/X public records, G executed API observes botl directly | Existing run-leave-level matrix also has showexp pair; not a new discovery |
| more_experienced: XP unchanged/score-only; score change; beginner threshold and already false | G 96 targets + 2 controls; C/JS exact fields | Constructed score histories only; natural acquisition not established |
| more_experienced: no highlight rules / redraw already pending | G includes complete C exp_percent_changing with no rules and aborting unreachable dependencies | Qualified component; no terminal claim |
| more_experienced: highlight rules, changed percent, selected rule changes | Existing JS level-arrival tests; no dedicated C receipt in this audit | **Reachable candidate**: supported STATUSHILITES config plus below-threshold Tourist sightseeing; first qualify actual parsed rule and old/new color, then compare. No new bug asserted |
| more_experienced: signed-long wrap and JS exact-integer refusal | Known explicit unsupported numeric range in source/tests | No bounded ordinary public reachability; do not grind or label as newly discovered |
| newexplevel: below/at/above threshold, at most one gain and max-level guard | P109 exact API threshold matrix; I/X production low XP; X level30 award stays below threshold | Actual level30 threshold is oracle-only, not established by public award |
| pluslvl: incremental vs wizard message/RNG/resource ordering | I/X incremental; P106/A/E wizard; P109/L numeric projection | All public evidence is debug-assisted setup, not natural walking/drain history |
| pluslvl: overshoot cap vs no cap | P109 API and X public overshoot/revisit | Matching reached values, not arbitrary XP history proof |
| pluslvl: fresh ulevelmax vs recovered level | L restricted Welcome back API; wizard public resets ulevelmax | Natural recovery requires a permitted loss history; combat/drain effects excluded |
| pluslvl: first rank vs no new rank; achievement repeated; peak fallback | A traverses rank boundaries; R observes first/repeat event order in public chronicle | **Reachable** female rank encoding and later-rank chronicle variants remain unexecuted by this observer; not blocked or exhausted |
| pluslvl: HP/energy peaks rise vs existing higher peaks | Public full-resource transitions; P109/L restricted fields | Full-runtime peak-preservation histories require permitted depleted/max-reduced setup; no arbitrary state setter established |
| losexp: debug nonfatal override; level>1; level1 XP reset | Public wizard loss; L API level1 reset, public command refuses that call | No new ordinary public level1 reset route qualified |
| losexp: HP min, prevent raising prior max, current below1/above max | P109/L constructed API states including level10/11/12/30 floor | Natural reduced max/current history is setup-blocked, not a negative |
| losexp: energy max/current floor and upper clamp; positive XP vs zero | P109/L API; public normal full-resource loss | Exact depleted histories remain setup-blocked |
| losexp: resistance/fatal/polymorph branches | None pursued | Excluded combat/drain, death and polymorph contexts; not candidate setup routes |
| adjabil: role then race; grants/revokes; empty gain/loss strings | A role/race traversals; E selected racial+role re-entry; silent Ranger views | Finite pairing/message evidence, not all state masks |
| adjabil: initial level1 FROMOUTSIDE, skill adjustment skipped at oldlevel0 | Public initialized characters; N only numeric init | Masks not directly instrumented in full engine; need supported state observation for stronger claim |
| adjabil: suppress feedback due to another intrinsic source | Source: no legal role/race pairing supplies the same above-level1 ability; comment reconciled to actual tables | Requires another intrinsic source; prohibited effects are not substitute setup. No failed reproduction claimed |
| adjabil: unaware/dreaming feedback and unchanged-level call | Not pursued | Unaware/status contexts and polymorph reinitialization excluded; ordinary wizard no-op returns before adjabil |
| postadjabil: initial skip, warning/see-invisible update vs other property | A public crossings and silent Ranger; no independent map-observer claim | Initial no-monster vs visible affected state not distinguished; supported noncombat visual setup would be required, without entering another audit's scope |
| adjabil: add skill slots / loss and spent-skill refunds | I Knight and A Monk public menus; S notification predicates | Natural practice acquisition unqualified; S does not substitute for it |
| minuhpmax/setuhpmax: ordinary min/max, same/new max, peak/current clamp | P109/L projections; public gain/loss | Polymorph arm excluded; exact natural state construction missing |
| attrib helpers outside advancement (exercise, poison, luck, alignment change, object/form attribution) | Not audited here | Outside delegated advancement scope or explicit exclusions; no source-only suspicion list |
| experience(monster) and rndexp(effect/form callers) | Not audited | Excluded combat/object-effect/polymorph routes |

## Source hypotheses and outcomes

G tested a concrete gate-placement hypothesis: score-only changes must still clear
beginner while leaving XP and redraw unchanged. C and JS both place this update
after the XP branch; executed controls and threshold matrix match. This was a
qualification hypothesis, not a claimed source discrepancy.

R tested repeated-rank handling: an already-recorded rank must not emit a second
achievement; the fallback uses ulevelpeak to say regained. Both source paths agree,
and the public chronicle control/target now confirms the resulting ordering.
Wizard's reset of ulevelmax prevents conflating this with natural Welcome back.

No new confirmed divergence or unresolved comparison in G/R. Earlier Wizard
level-generation RNG mismatch remains separately unresolved; do not retry it or
expand any excluded Levels investigation. Existing repairs and JS tests are
acknowledged, not counted as fresh causes. Fixture counts are not semantic causes.

## Next scope decision

This reconciliation does **not** establish bounded exhaustion: highlighted XP
integration and female/later rank chronicle branches have plausible existing
public interfaces. Highlighting is the next distinct behavior to qualify. It needs
an actual parsed percentage rule with a known pre/post selection; a source-only
prediction or passing unrelated screen is insufficient. Reuse no failing setup
unchanged. If supported parsing/observation cannot establish that prerequisite,
record the exact missing capability before switching to another branch.

Natural depleted/practice/shared-turn and at-threshold level30 histories remain
separate setup gaps. Full-recorder build attestation remains unavailable. No
additional authority is requested, no action was denied/pending, and no gameplay
edit is proposed from these matching results. Elapsed time is not active compute.
