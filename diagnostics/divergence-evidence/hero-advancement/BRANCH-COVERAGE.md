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
| newhp/newpw: MAXULEV diminishing gains and no increment-slot write | max-resource-caps:130 targets+2 controls now compare executed complete C bodies; P109 guard does not call these at30 | API now qualified in bounded matrix, but no permitted public trigger identified: wizard/newexplevel both stop before pluslvl; usual effect trigger excluded. Do not call this a public negative |
| more_experienced: XP changed/showexp redraw | I/X public records, G executed API observes botl directly | Existing run-leave-level matrix also has showexp pair; not a new discovery |
| more_experienced: XP unchanged/score-only; score change; beginner threshold and already false | G 96 targets + 2 controls; C/JS exact fields | Constructed score histories only; natural acquisition not established |
| more_experienced: no highlight rules / redraw already pending | G includes complete C exp_percent_changing with no rules and aborting unreachable dependencies | Qualified component; no terminal claim |
| more_experienced: highlight rules, changed percent, selected rule changes | xp-highlight: five full public records plus parsed runtime/selected-rule and C/JS color assertions | Rule-selection integration now qualified at50%, terminal100% and reset; C-internal redraw-gate isolation still requires a supported observer or expanded component oracle |
| more_experienced: signed-long wrap and JS exact-integer refusal | Known explicit unsupported numeric range in source/tests | No bounded ordinary public reachability; do not grind or label as newly discovered |
| newexplevel: below/at/above threshold, at most one gain and max-level guard | P109 exact API threshold matrix; I/X production low XP; X level30 award stays below threshold | Actual level30 threshold is oracle-only, not established by public award |
| pluslvl: incremental vs wizard message/RNG/resource ordering | I/X incremental; P106/A/E wizard; P109/L numeric projection | All public evidence is debug-assisted setup, not natural walking/drain history |
| pluslvl: overshoot cap vs no cap | P109 API and X public overshoot/revisit | Matching reached values, not arbitrary XP history proof |
| pluslvl: fresh ulevelmax vs recovered level | L restricted Welcome back API; wizard public resets ulevelmax | Natural recovery requires a permitted loss history; combat/drain effects excluded |
| pluslvl: first rank vs no new rank; achievement repeated; peak fallback | A traverses rank boundaries; R observes first/repeat event order in public chronicle | rank-gender now observes male/female ranks14/18 and repeat events; no direct C identifier-memory claim |
| pluslvl: HP/energy peaks rise vs existing higher peaks | Public full-resource transitions; P109/L restricted fields | Energy peak now has public message observation after loss (energy-peak-observer); exact C peak and HP peak still require a supported observer |
| losexp: debug nonfatal override; level>1; level1 XP reset | Public wizard loss; L API level1 reset, public command refuses that call | No new ordinary public level1 reset route qualified |
| losexp: HP min, prevent raising prior max, current below1/above max | P109/L constructed API states including level10/11/12/30 floor | depleted-hp executes natural damage and current-below-one floor; reduced maxima and upper-current clamp remain component-only |
| losexp: energy max/current floor and upper clamp; positive XP vs zero | P109/L API; public normal full-resource loss | depleted-energy now executes spent-current exact-zero and negative-current clamps; reduced energy maxima and upper clamp remain component-only |
| losexp: resistance/fatal/polymorph branches | None pursued | Excluded combat/drain, death and polymorph contexts; not candidate setup routes |
| adjabil: role then race; grants/revokes; empty gain/loss strings | A role/race traversals; E selected racial+role re-entry; silent Ranger views | Finite pairing/message evidence, not all state masks |
| adjabil: initial level1 FROMOUTSIDE, skill adjustment skipped at oldlevel0 | Public initialized characters; N only numeric init | Masks not directly instrumented in full engine; need supported state observation for stronger claim |
| adjabil: suppress feedback due to another intrinsic source | Source: no legal role/race pairing supplies the same above-level1 ability; comment reconciled to actual tables | Requires another intrinsic source; prohibited effects are not substitute setup. No failed reproduction claimed |
| adjabil: unaware/dreaming feedback and unchanged-level call | Not pursued | Unaware/status contexts and polymorph reinitialization excluded; ordinary wizard no-op returns before adjabil |
| postadjabil: initial skip, warning/see-invisible update vs other property | A public crossings and silent Ranger; no independent map-observer claim | Initial no-monster vs visible affected state not distinguished; supported noncombat visual setup would be required, without entering another audit's scope |
| adjabil: add skill slots / loss and spent-skill refunds | I Knight and A Monk public menus; S notification predicates | natural-practice and natural-spent-slot now execute earned practice, eligibility, spending and single-slot refund; S retains broader component predicates |
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

At this earlier checkpoint, natural depleted/practice/shared-turn and at-threshold
level30 histories were separate setup gaps, and recorder build attestation was unavailable.
Later resolutions below supersede the energy and build gaps. No
additional authority is requested, no action was denied/pending, and no gameplay
edit is proposed from these matching results. Elapsed time is not active compute.


## Follow-on resolution

The previously named public highlight and female/later-rank frontiers were
executed before returning this checkpoint; see xp-highlight and rank-gender.
MAXULEV throttling is now executed component evidence, still not public-trigger
coverage. All match with declared limits. Prior long-highlight threshold fix
49626a567 remains acknowledged; no duplicate bug claim.

No new discrepancy hypothesis survives these bounded comparisons. C-internal
redraw requester identity remains unobserved: the smallest useful next capability
is an existing supported read-only state/branch receipt at the more_experienced
boundary, or qualifying the full highlight dependency closure as a C component.
Neither has been established here. Do not infer the internal branch from final
color alone, or add competing gameplay/tooling changes. Natural histories,
provenance and excluded contexts retain their earlier dispositions. This is a
qualification boundary for the identified paths, not global exhaustion.


Further dependency qualification succeeded: highlight-gate-20261029 now compiles
all six unchanged functions needed by the numerical XP selection/redraw path,
using actual C status headers.112 target states+4 controls match. This resolves
the component-oracle prerequisite named above for the declared numeric presets;
full-game C call-site observation remains uninstrumented. No source-only
suspicions or new causes. The selected branch inventory now has executed public
or qualified component evidence for these fronts; natural history/lifecycle and
full-binary provenance limits remain, without claiming global exhaustion.


The high-level nonzero percentage floor now has public evidence in
xp-percent-floor-20261029: level10 5120→5122, four hidden/visible companions,
parsed1% rule selection and exact C totals. Existing activation resolved the
build-tool prerequisite, and a new isolated supported binary has recorded build
origin and matching controls. Earlier binary provenance is unchanged. No new
semantic cause, no natural-history or full-state-observer claim.

## Depleted energy follow-on (source-built recorder)

Five new public recipes match (50 distinct public recipes total). Failed casts establish natural spent energy; wizard gain/loss applies saved increments and reaches exact-zero and below-zero current-energy clamps. See depleted-energy-20261029. This supersedes the earlier blanket spent-energy setup gap, but does not cover depleted HP, reduced maxima, natural skill practice or natural level transitions. C internal peak preservation remains indirectly observed only; a public insufficient-energy message is the next candidate observer. Zero new semantic causes.

### Historical energy capacity observer

Three further public recipes match (53 distinct total): initial full7/7 rejected cast says yet; after level1→2→1 full7/7 says anymore; depleted12/19 has no suffix. This observes retained C peak at least15, not its exact memory value; JS peak19 is separately asserted. See energy-peak-observer-20261029. Full-state C trace, depleted HP, reduced-max histories and natural practice remain unavailable within existing qualified interfaces.

## Current scope decision after public energy observers

The identified energy-history and public peak-message prerequisites are resolved within their stated bounds. No new advancement discrepancy is ready for Main. The remaining inventory is not a reason to add role/race permutations.

| Remaining frontier | Smallest missing prerequisite | Disposition |
| --- | --- | --- |
| Reduced maximum crossing a loss floor | A qualified nonfatal public maximum-reduction setup without excluded effects | Current depletion and below-one clamp are now qualified by depleted-hp; reduced maximum remains component-only |
| Natural Welcome back and level recovery | A permitted natural level-loss source preserving ulevelmax | Known drain/object routes excluded; wizard resets history |
| Natural practiced-skill ordering | Resolved for healthy ordinary cure-sickness casts and one spent slot | natural-practice/natural-spent-slot provide public point counts, eligibility and refund evidence; broader multi-skill ordering not claimed |
| Initial intrinsic masks and exact peak/slot internals | Existing supported read-only full-state observation | Not provided by recorder's terminal/RNG interface; no instrumentation authorized |
| Level30 true XP threshold and MAXULEV effects | Reachable permitted high-XP award or level-cap trigger | Qualified component only; no unbounded grinding or excluded effects |
| postadjabil map refresh under warning/see-invisible | Supported noncombat visible-state setup and cross-audit scope agreement | Not qualified; monster/level investigations remain with their owners |

This is bounded exhaustion of the currently qualified advancement setup/observer routes, not an assertion that every permitted gameplay path or every source of bugs is exhausted. A new supported prerequisite can reopen these rows. No installs, engine instrumentation, gameplay edits or denied actions occurred in this follow-on.

## Depleted HP prerequisite resolved in a bounded public setup

Four new public recipes match (57 distinct total). One wall kick gives a2-point deficit preserved across gain/loss; four kicks leave5/20 and loss clamps5−8 to1/12. C wound-branch draws prove no wounded legs; ordinary HP regeneration is retained in the exact state sequence. See depleted-hp-20261029. This supersedes the prior generic depleted-HP setup gap and current-below-one clamp gap. Reduced maxima, higher-level minimum-max and upper-current clamps remain component-only; natural level-loss/recovery and practiced-skill histories remain unqualified. Zero new semantic causes.

## Natural practice prerequisite qualified

Three further public recipes match (60 distinct total). Healthy ordinary cure-sickness casts earn18 then21 practice across the20-point eligibility threshold. Wizard loss to1 removes free slots; gain to2 restores one and re-emits general eligibility. See natural-practice-20261029. This supersedes the blanket natural-practice setup gap; naturally earned-and-spent slot refunds are the next reachable integration frontier. Forced wizcast is not a practice setup because it skips use_skill. No status expiry, active ailment, object-effect emulation or combat route used. Zero new semantic causes.

## Naturally spent slot refund and public numeric observation

Four further public recipes match (64 distinct total). Normal enhance menus, with practice bypass declined, expose21 earned points and slots19→18→0→1. Healing advances to Basic, is refunded on loss, and returns as Unskilled21/20 eligible after regain. See natural-spent-slot-20261029. The refund-only first page omits the healing row; later regain observes it, while JS verifies the intermediate state. This closes the previously named naturally earned-and-spent single-slot frontier and strengthens exact C practice observation through supported menus. Multiple-skill refund order remains outside this bounded witness; natural level recovery and altered-max resource histories remain unqualified. No new causes.

## Two earned advancements and remaining refund prerequisite

Eight further public recipes match (72 distinct total). Natural healing practice78/81 brackets80; C menus observe two spent tiers refund Skilled→Basic→Unskilled while retaining81 points, then2 free slots after regain. See natural-multi-advancement-20261029. This qualifies same-skill reverse-tier refund, not cross-skill order or a multi-slot refund remainder.

The next concrete remainder-refund route needs Priest Expert healing. Supported startup supplies cure sickness, but a bounded JS qualification reaches only45 practice with435 nutrition after15 casts. A permitted sufficient-nutrition history is missing; no C Expert comparison or failure-as-negative claim. Known food effects/forced state are not used. Natural level recovery, altered maxima and exact internal-state gaps remain separate. No new causes or denied actions.
