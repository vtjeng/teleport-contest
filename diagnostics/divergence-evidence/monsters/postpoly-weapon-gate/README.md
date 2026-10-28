# Post-polymorph movement admits an extra ranged attack

**Confirmed, scoped production-API parity issue.** Stable case ID
`monsters-postpoly-weapon-gate`. Manual/unbound. No public-input C recording is
claimed, and this is distinct from the unresolved water-wall wording case.

C `dochug` captures `mdat = mtmp->data` before movement. After a real polymorph
trap changes the monster, the moved-monster gate uses the *old* `mdat` for
`attacktype(mdat, AT_WEAP)`. JS instead uses `monster.data`, the new species.
A non-weapon-using xorn that becomes an ogre therefore gets a same-turn ranged
attack in JS that C's gate excludes.

## Runnable handoff

Base: `1c4be74beb32edbfc897de805f218e180f8c6002` plus this directory. Requires
Node, `cc`, and the initialized C upstream submodule.

```sh
# Exact C gate/catalog oracle and JS target/control characterize the current gap.
EXPECT_CURRENT_GAP=1 node --test diagnostics/divergence-evidence/monsters/postpoly-weapon-gate/*.test.mjs

# Regression expectation: target fails now (HP 15 versus C-required 16);
# weapon-using control and C oracle pass. After repair all should pass.
node --test diagnostics/divergence-evidence/monsters/postpoly-weapon-gate/*.test.mjs
```

These tests are outside default CI. Main can start with the moved-monster
`shootsAfterMoving` gate in `js/monmove.js:2744-2748`. This PR changes no gameplay.

## Supported API setup and observations

The initialized hero is at (18,15). An ordinary ogre at (22,15) receives one
plain, unwielded dagger through `mksobj` and `mpickobj`. For the target, real
`newcham` changes it to a xorn and the test verifies the same dagger remains in
inventory, with no weapon wielded. This establishes inventory retention through
the production polymorph API instead of fabricating an armed xorn's attack array.
The control omits that earlier polymorph, leaving the ordinary ogre.

The next action runs the actual `runDirectMonsterAction` adapter (`dochug`,
`m_move`, `postmov`, `mintrap`, `newcham`, and combat providers), with
`context.mon_moving` true. A real polymorph trap at (21,15) changes the target back
to an ogre via supported wizard `monpolycontrol` input. The control enters the
same trap and selects its existing ogre form. Both remain three squares from the
hero and correctly target the hero's actual square. No target, species, movement,
attack, or trap operation is overridden during the action. Output/redraw hooks
and valid bounded random outcomes make the fixture deterministic.

- **C target:** compiled exact post-movement gate returns before attack. Native
  old XORN has no AT_WEAP; new OGRE has AT_WEAP but no distance-attack type; the
  only inventory item is a plain dagger, not a `find_offensive` wand/potion. The
  hero must remain at 16 HP and dagger must remain in monster inventory at this
  phase boundary.
- **JS target:** proceeds into the real ranged-attack chain, throws the dagger,
  and prints `You are hit by a dagger.` Hero HP becomes 15 and the dagger lands
  on the floor.
- **C control:** old/new OGRE passes the compiled gate. **JS control:** performs
  the ranged attack and also reaches 15 HP. The oracle proves C control attack
  eligibility, not a full C damage simulation.

The oracle compiles the actual C monster attack catalog (`monsters.h` and
`monattk.h`) and the exact moved-monster gate from `monmove.c`. It checks that
`mdat` has only its initial assignment in `dochug`. Its explicit fixture stubs
are: no offensive wand/potion, no engulfing, and not adjacent to the target.
It does not reimplement polymorph, missile flight, or the whole C action loop.
The HP/inventory expectation for the C target follows from the gate's early
return, not from simulated C projectile damage.

This qualifies the supported initialized API contract. A complete public-input
setup that assembles these circumstances has not been recorded. The initial
ordinary ogre/created dagger and prior `newcham` are explicit fixture construction;
no claim is made that this exact state is produced by the seed alone.

## Scope and unsuccessful candidates

The initial empty-inventory xorn attempt entered the extra JS attack chain but
showed no useful combat effect, so it was not promoted as a divergence witness.
A wood-nymph attempt used the trap via `find_misc` before ordinary movement and
ended its turn; that is a different route and not a negative proof. The final
case uses a higher-difficulty native xorn and actual post-movement trap handling.
A temporary wrong module import and an oracle regex matching `==` were corrected
before clean-base verification.

The broader use of pre-movement species traits, other polymorph forms, and
public-input exposure remain unenumerated follow-ups. No universal polymorph
or combat-equivalence claim is made. Existing Archon, wraith-growth, and
water-wall wording hypotheses remain separate and unresolved.
