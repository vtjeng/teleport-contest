# Water-wall castmu: focused reachability investigation (unresolved)

Stable case ID: `monsters-castmu-waterwall-reachability`. This follows the unresolved
`castmu-waterwall-scout` in PR #57. It is manual/unbound, not a scanner suppression
or implementation-ready divergence. No gameplay changes.

C's wrong-target `castmu` message selects `empty water` for WATER; JS always says
`thin air`. The missing step is a supported full action that reaches `castmu`
with a wrong WATER target. This investigation rules out two particular routes;
it does not prove the branch universally unreachable.

Run from the stated base plus this evidence directory:

```sh
node --test diagnostics/divergence-evidence/monsters/castmu-waterwall-reachability/*.test.mjs
```

Requires Node and `cc`, plus initialized upstream submodule. All five tests pass;
none are registered in default CI. `case.json` pins revisions and source hashes.
The C oracle compiles exact upstream fragments with explicitly fixed fixture
predicates; it is not a full C recording or a captured C game-state snapshot.

## Results and controls

1. **Ordinary blinded lich selector.** Real `set_apparxy` rejects a WATER guess,
   consumes two more coordinate draws, and selects ROOM. The ROOM control accepts
   the first guess. Compiled upstream `set_apparxy` agrees. Both resulting JS
   spell calls correctly say thin air. This rules out this selector route only.
2. **Phasing monster -> polymorph trap -> lich.** The native full action adapter
   runs `dochug`, `m_move`, `postmov`, and the actual trap/newcham transition. A
   blinded xorn at (21,15) guesses WATER at (19,16), steps onto a polymorph trap
   at (20,15), and becomes a lich through wizard `monpolycontrol` input `lich`.
   It retains the remembered WATER square. But `distfleeck` recomputes proximity
   to the remembered target after movement: the target is adjacent. The moved
   monster returns before attacking. The compiled C post-movement gate also
   returns 0 for this geometry. Its distant-target control proceeds past the
   gate (which would use ranged magic, not the desired close `castmu` branch).
3. **Stationary control.** In that initialized JS state, change the guessed
   square to ROOM and execute the next native lich action. Ordinary targeting
   accepts it; the stationary full action emits `The lich strikes at thin air!`
   and `The lich casts a spell at thin air!`. Thus missing attack output in the
   trap turn is not a broken attack adapter.
4. **Deliberate diagnostic bypass.** `trap-probe.test.mjs` calls `postmov` then
   `mattacku` directly and obtains the suspect JS wording with a WATER target.
   This bypasses the demonstrated `dochug` guard and **is not a valid divergence
   witness**. Retained to explain why the tempting helper-level result was
   rejected. The first geometry (trap at 20,16) additionally failed the sight
   requirement and exhausted 40 PSI_BOLT selection attempts; moving it to
   (20,15) resolved sight but did not resolve the full-action guard.

Fixtures use native species/attack arrays and legal bounded random draws. The
map, timed blindness, and monster placement are initialized test state, not a
public-input replay. Wizard wall-of-water/trap wishes and `monpolycontrol` exist,
but no complete public-input setup was recorded here. No inventory effects are
part of these tests. The C oracle fixes no gold, no displacement/invisibility,
no engulfing, and ordinary lich geometry predicates; its scope is only those
conditions. The sight diagnostic and incomplete public setup are never counted
as negatives.

## Remaining uncertainty

The exact missing step is a nonphasing native caster retaining a wrong WATER
coordinate through a complete action's targeting and attack gates. Moving
adjacent during polymorph cannot supply that step: adjacency suppresses its
same-turn attack, and the next ordinary selector rejects WATER. Earlier
physical-hit/knockback reasoning also encounters `firstfoundyou && !foundyou`
skipping later attack slots.

Next experiment must first identify a source-supported *stationary* transition
that changes remembered-target terrain or preserves a phasing monster's target
before attack without another `set_apparxy`. No such route is currently known.
Do not create a synthetic attack-array or direct target mutation to force it.
The underlying wording claim remains unresolved; no universal filter is justified.
