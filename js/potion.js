// potion.js -- what a potion's vapors do to the hero.
// C ref: src/potion.c potionbreathe().
//
// zap.c maybe_destroy_item() is the only ported caller: a potion in the hero's
// own pack that boils, explodes or shatters sends its vapors up at zap.c:5917.
// potion.c dodip() and peffects(), dothrow.c potionhit() and trap.c's shattered
// potions reach the same function and none of those is ported.

import {
    INVIS,
    SEE_INVIS,
} from './const.js';
import { trycall } from './do.js';
import { game } from './gstate.js';
import { discover_object } from './o_init.js';
import {
    POT_ACID,
    POT_BLINDNESS,
    POT_BOOZE,
    POT_CONFUSION,
    POT_ENLIGHTENMENT,
    POT_EXTRA_HEALING,
    POT_FRUIT_JUICE,
    POT_FULL_HEALING,
    POT_GAIN_ABILITY,
    POT_GAIN_ENERGY,
    POT_GAIN_LEVEL,
    POT_HALLUCINATION,
    POT_HEALING,
    POT_INVISIBILITY,
    POT_LEVITATION,
    POT_MONSTER_DETECTION,
    POT_OBJECT_DETECTION,
    POT_OIL,
    POT_PARALYSIS,
    POT_POLYMORPH,
    POT_RESTORE_ABILITY,
    POT_SEE_INVISIBLE,
    POT_SICKNESS,
    POT_SLEEPING,
    POT_SPEED,
    POT_WATER,
    TOWEL,
} from './objects.js';
import { heroIsBlind } from './startup_a11y.js';
import { ttyPline } from './tty_message.js';

// Thrown where potion.c reaches a vapor effect this port has not ported.
export class UnsupportedPotionError extends Error {
    constructor(branch) {
        super(`a potion's vapors require ${branch}`);
        this.name = 'UnsupportedPotionError';
        this.branch = branch;
    }
}

// C ref: youprop.h:198 Invis, "either source minus the block that cancels
// both". js/vision.js m_canseeu() spells the same three terms inline for its
// own local; this is the first copy any other module can call.
function Invis(state) {
    const property = state.u?.uprops?.[INVIS];
    return Boolean((property?.intrinsic || property?.extrinsic)
        && !property?.blocked);
}

// C ref: youprop.h:152 See_invisible. Unlike Invis it has no blocked term.
function See_invisible(state) {
    const property = state.u?.uprops?.[SEE_INVIS];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

// C ref: youprop.h:405 Half_gas_damage, "wrap it round your head to ward off
// noxious fumes [we require it to be damp or wet]". It is the one property
// here with no u.uprops slot: a worn towel with charges left, and nothing else.
function Half_gas_damage(state) {
    return Boolean(state.ublindf && state.ublindf.otyp === TOWEL
        && state.ublindf.spe > 0);
}

// C ref: potion.c potionbreathe() (1931-2118), "vapors are inhaled or get in
// your eyes".
//
// The switch runs over `Half_gas_damage ? TOWEL : obj->otyp`, so a hero wearing
// a wet towel takes the TOWEL arm whatever the potion is. Of its eighteen case
// labels only POT_INVISIBILITY (2033-2040) is ported; every other one stops by
// name before changing state, drawing, or printing.
//
// Nine potion types carry no case label at all and fall straight out of the
// switch to the naming tail. C's commented-out block at 2096-2105 names seven
// of them; POT_SEE_INVISIBLE and POT_ENLIGHTENMENT are absent from that comment
// but reach the same nothing, because the switch has no `default:`. Both are
// listed below, so this port falls through exactly where C does and refuses
// only where C has a body.
//
// `obj` stays in the caller's inventory: C sets in_use so that a wielded potion
// of unholy water cannot be dropped out from under maybe_destroy_item(), and
// restores it here. There is no obfree() -- zap.c:5919's comment says that is
// the caller's job.
export async function potionbreathe(obj, state = game, env = {}) {
    let kn = 0;
    const already_in_use = obj.in_use;

    /* potion of unholy water might be wielded; prevent
       you_were() -> drop_weapon() from dropping it so that it
       remains in inventory where our caller expects it to be */
    obj.in_use = true;

    /* wearing a wet towel protects both eyes and breathing, even when
       the breath effect might be beneficial; we still pass down to the
       naming opportunity in case potion was thrown at hero by a monster */
    switch (Half_gas_damage(state) ? TOWEL : obj.otyp) {
    case TOWEL:
        throw new UnsupportedPotionError(
            'the wet towel that wards off a potion\'s vapors',
        );
    case POT_RESTORE_ABILITY:
    case POT_GAIN_ABILITY:
        throw new UnsupportedPotionError(
            'the ability vapors that sting the eyes or raise an attribute',
        );
    case POT_FULL_HEALING:
    case POT_EXTRA_HEALING:
    case POT_HEALING:
        throw new UnsupportedPotionError(
            'the healing vapors, over make_blinded() and make_deaf()',
        );
    case POT_SICKNESS:
        throw new UnsupportedPotionError('the sickness vapors that cost 5 HP');
    case POT_HALLUCINATION:
        throw new UnsupportedPotionError('the momentary vision');
    case POT_CONFUSION:
    case POT_BOOZE:
        throw new UnsupportedPotionError(
            'the dizzying vapors, over make_confused()',
        );
    case POT_INVISIBILITY:
        if (!heroIsBlind(state) && !Invis(state)) {
            kn++;
            await ttyPline(
                `For an instant you ${See_invisible(state)
                    ? 'could see right through yourself'
                    : "couldn't see yourself"}!`,
                state,
            );
        }
        break;
    case POT_PARALYSIS:
        throw new UnsupportedPotionError(
            'the paralysing vapors, over nomul() and Free_action',
        );
    case POT_SLEEPING:
        throw new UnsupportedPotionError(
            'the sleeping vapors, over nomul() and monstseesu()',
        );
    case POT_SPEED:
        throw new UnsupportedPotionError(
            'the speed vapors, over incr_itimeout(&HFast)',
        );
    case POT_BLINDNESS:
        throw new UnsupportedPotionError(
            'the blinding vapors, over make_blinded()',
        );
    case POT_WATER:
        throw new UnsupportedPotionError(
            'the water vapors, over split_mon() and you_were()',
        );
    case POT_ACID:
    case POT_POLYMORPH:
        throw new UnsupportedPotionError(
            'the acid or polymorph vapors, over exercise(A_CON, FALSE)',
        );
    /*
     * C's own comment lists the first seven of these as the types whose
     * vapors deliberately do nothing. POT_SEE_INVISIBLE and POT_ENLIGHTENMENT
     * are not in that comment and have no case label either, so they reach the
     * same nothing.
     */
    case POT_GAIN_LEVEL:
    case POT_GAIN_ENERGY:
    case POT_LEVITATION:
    case POT_FRUIT_JUICE:
    case POT_MONSTER_DETECTION:
    case POT_OBJECT_DETECTION:
    case POT_OIL:
    case POT_SEE_INVISIBLE:
    case POT_ENLIGHTENMENT:
        break;
    default:
        throw new UnsupportedPotionError(
            `potionbreathe() for object type ${obj.otyp}`,
        );
    }

    if (!already_in_use)
        obj.in_use = false;
    /* note: no obfree() -- that's our caller's responsibility */
    if (obj.dknown) {
        // hack.h:1530 makeknown(x) is discover_object(x, TRUE, TRUE, TRUE).
        // `kn` counts the arms whose message told the hero what the potion
        // was; every other arm offers the naming prompt instead.
        if (kn) discover_object(obj.otyp, true, true, true, state, env);
        else trycall(obj, state);
    }
}
