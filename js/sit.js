// C ref: src/sit.c. Only dosit() (398-565), the #sit command, is ported here;
// rndcurse(), attrcurse() and take_gold() keep sit.c company in C but have no
// caller this port reaches.
//
// dosit() is one guard chain followed by a wide else-if chain over the square
// the hero stands on. Three arms of it run: the object pile at 437-465, the
// staircase at 535-536, and the final else at 561-563. Every other arm throws
// UnsupportedSitError at its own condition, so the segment stops before the
// arm prints or changes anything.

import {
    DEAF,
    DRAWBRIDGE_DOWN,
    ECMD_OK,
    ECMD_TIME,
    FOUNTAIN,
    IS_ALTAR,
    IS_GRAVE,
    IS_SINK,
    IS_THRONE,
    Is_waterlevel,
    LADDER,
    LEVITATION,
    STAIRS,
    TT_LAVA,
    Upolyd,
} from './const.js';
import { capitalizedMonsterName, monsterCommonName } from './do_name.js';
import { surface } from './dungeon.js';
import { can_reach_floor } from './engrave.js';
import { game } from './gstate.js';
import { money_cnt, useupf } from './invent.js';
import {
    amorphous,
    eggs_in_water,
    humanoid,
    is_hider,
    lays_eggs,
    slithy,
    sticks,
} from './mondata.js';
import { PM_GREMLIN, PM_TRAPPER, S_DRAGON } from './monsters.js';
import { isBox, objectType, remove_object } from './obj.js';
import { the, xnameFresh } from './objnam.js';
import { CLOTH, COIN_CLASS, CORPSE, CREAM_PIE, TOWEL } from './objects.js';
import { is_ice } from './terrain.js';
import {
    is_lava,
    is_pool,
    t_at,
    uescaped_shaft,
    uteetering_at_seen_pit,
} from './trap.js';
import { ttyPline } from './tty_message.js';

// A branch of sit.c this port has not translated. js/cmd.js
// failClosedCommandRefusals() lists it, so the segment keeps every frame the
// command already matched instead of failing hard.
export class UnsupportedSitError extends Error {
    constructor(what) {
        super(`sitting reached an unported branch: ${what}`);
        this.name = 'UnsupportedSitError';
    }
}

// youprop.h:240 Levitation, which subtracts a blocking term.
function Levitation(state) {
    const value = state.u?.uprops?.[LEVITATION];
    return Boolean(value?.intrinsic || value?.extrinsic) && !value?.blocked;
}

// youprop.h:279 `#define Underwater (u.uinwater)`, the whole macro.
function Underwater(state) {
    return Boolean(state.u?.uinwater);
}

// youprop.h:125 Deaf, which adds the permanent-deafness roleplay option to the
// intrinsic and the extrinsic.
function Deaf(state) {
    const value = state.u?.uprops?.[DEAF];
    return Boolean(value?.intrinsic || value?.extrinsic)
        || Boolean(state.u?.uroleplay?.deaf);
}

// C ref: sit.c:402 `static const char sit_message[] = "sit on the %s."`, which
// six terrain arms share and which only the STAIRS one reaches here.
function sit_message(what) {
    return `You sit on the ${what}.`;
}

// C ref: sit.c dosit() (399-565), the whole function. Its return value is
// rhack()'s: ECMD_OK from the three guards that refuse to sit, ECMD_TIME from
// everything below them.
export async function dosit(state = game) {
    const u = state.u;
    const species = state.youmonst?.data;
    // 403-404. Both reads happen before any guard runs, so a guard that
    // returns early has still paid for them; `typ` in particular is the square
    // the hero was on, not one a later arm might move her to.
    const trap = t_at(u.ux, u.uy, state);
    const typ = state.level?.at(u.ux, u.uy)?.typ;

    if (u.usteed) {
        const steed = monsterCommonName(u.usteed, state);
        await ttyPline(`You are already sitting on ${steed}.`, state);
        return ECMD_OK;
    }
    // 410-412. This write happens before every arm below, including the two
    // that return ECMD_OK without sitting, so a hider who cannot reach the
    // floor still comes down off the ceiling.
    if (u.uundetected && is_hider(species) && u.umonnum !== PM_TRAPPER)
        u.uundetected = 0; /* "no longer on the ceiling" */

    if (!can_reach_floor(false, state)) {
        if (u.uswallow) {
            // Reachable only while engulfed, and no ported path engulfs the
            // hero; scripts/sit.test.mjs pins the line from source instead.
            await ttyPline('There are no seats in here!', state);
        } else if (Levitation(state)) {
            await ttyPline('You tumble in place.', state);
        } else {
            // can_reach_floor(FALSE) has three remaining ways to answer FALSE:
            // a holder with an AT_HUGS attack, a rider below P_BASIC riding
            // skill, and a ceiling hider. The steed guard above already
            // returned for the second, and the hider write above cleared
            // u.uundetected for the third, so only the first can print this.
            await ttyPline('You are sitting on air.', state);
        }
        return ECMD_OK;
    } else if (u.ustuck && !sticks(species)) {
        /* "holding monster is next to hero rather than beneath, but
           hero is in no condition to actually sit at has/her own spot" */
        if (humanoid(u.ustuck.data)) {
            // mhis() is you.h:324 `genders[pronoun_gender(mtmp, PRONOUN_HALLU)]
            // .his`, and neither the gendered pronoun table nor
            // pronoun_gender() is ported.
            throw new UnsupportedSitError(
                "dosit()'s humanoid holder, which needs mhis()",
            );
        }
        await ttyPline(
            `${capitalizedMonsterName(u.ustuck, state)} has no lap.`, state,
        );
        return ECMD_OK;
    } else if (is_pool(u.ux, u.uy, state) && !Underwater(state)) {
        /* water walking */
        throw new UnsupportedSitError(
            "dosit()'s water-walking jump to in_water",
        );
    } else if (Upolyd(u) && u.umonnum === PM_GREMLIN
               && (state.level?.at(u.ux, u.uy)?.typ === FOUNTAIN
                   || is_pool(u.ux, u.uy, state))) {
        throw new UnsupportedSitError(
            "dosit()'s gremlin jump to in_water",
        );
    }

    // C's OBJ_AT(u.ux, u.uy), read off the per-square pile chain so that a
    // supplied state rather than the module global answers for it.
    const pile = state.level?.objects?.[u.ux]?.[u.uy] ?? null;
    if (pile
        /* "ensure we're not standing on the precipice" */
        && !(uteetering_at_seen_pit(trap, state)
             || uescaped_shaft(trap, state))) {
        const obj = pile;

        if (species?.mlet === S_DRAGON && obj.oclass === COIN_CLASS) {
            await ttyPline(
                `You coil up around your ${
                    (obj.quan + money_cnt(state.invent) < u.ulevel * 1000)
                        ? 'meager ' : ''
                }hoard.`,
                state,
            );
        } else if (obj.otyp === TOWEL) {
            await ttyPline(
                "It's probably not a good time for a picnic...", state,
            );
        } else {
            // xname() observes the object, so it must be called once, in the
            // branch that runs: C evaluates `the(xname(obj))` as the single
            // argument of whichever You() line it reached.
            if (slithy(species)) {
                await ttyPline(
                    `You coil up around ${the(xnameFresh(obj, state))}.`,
                    state,
                );
            } else {
                await ttyPline(
                    `You sit on ${the(xnameFresh(obj, state))}.`, state,
                );
            }
            if (obj.otyp === CORPSE && amorphous(state.mons[obj.corpsenm])) {
                await ttyPline("It's squishy...", state);
            } else if (obj.otyp === CREAM_PIE) {
                if (!Deaf(state)) {
                    // Soundeffect(se_squelch, 30) is a tty-sound hook that
                    // writes nothing to the screen and draws no random number.
                    await ttyPline('Squelch!', state);
                }
                // useupf() -> delobj() -> delobj_core() reaches mkobj.c
                // obj_extract_self() for an object on the floor, which
                // mkobj.c remove_object() owns. A cream pie carries no
                // timer, light source, worn mask or shop bill, so obfree()
                // needs no hook of its own.
                useupf(obj, obj.quan, {
                    state,
                    hooks: { extractExternalObject: remove_object },
                });
            } else if (!(isBox(obj)
                         || objectType(obj, state).oc_material === CLOTH)) {
                await ttyPline("It's not very comfortable...", state);
            }
        }
    } else if (trap !== null || (u.utrap && u.utraptype >= TT_LAVA)) {
        // 466-504. The bear trap, spiked and plain pit, web, lava, infloor and
        // buried-ball arms all change u.utrap and three of them call losehp();
        // the else half calls dotrap(trap, VIASITTING), a whole second
        // command's worth of trap.c.
        throw new UnsupportedSitError("dosit()'s trap arm");
    } else if ((Underwater(state) || Is_waterlevel(u.uz))
               && !eggs_in_water(species)) {
        throw new UnsupportedSitError("dosit()'s underwater arm");
    } else if (is_pool(u.ux, u.uy, state) && !eggs_in_water(species)) {
        throw new UnsupportedSitError("dosit()'s in_water arm");
    } else if (IS_SINK(typ)) {
        throw new UnsupportedSitError("dosit()'s sink arm");
    } else if (IS_ALTAR(typ)) {
        // altar_wrath() is unported.
        throw new UnsupportedSitError("dosit()'s altar arm");
    } else if (IS_GRAVE(typ)) {
        throw new UnsupportedSitError("dosit()'s grave arm");
    } else if (typ === STAIRS) {
        await ttyPline(sit_message('stairs'), state);
    } else if (typ === LADDER) {
        throw new UnsupportedSitError("dosit()'s ladder arm");
    } else if (is_lava(u.ux, u.uy, state)) {
        // burn_away_slime() and losehp() are what this arm owns.
        throw new UnsupportedSitError("dosit()'s lava arm");
    } else if (is_ice(u.ux, u.uy, state)) {
        throw new UnsupportedSitError("dosit()'s ice arm");
    } else if (typ === DRAWBRIDGE_DOWN) {
        throw new UnsupportedSitError("dosit()'s drawbridge arm");
    } else if (IS_THRONE(typ)) {
        // throne_sit_effect() is unported.
        throw new UnsupportedSitError("dosit()'s throne arm");
    } else if (lays_eggs(species)) {
        // lay_an_egg() is unported.
        throw new UnsupportedSitError("dosit()'s egg-laying arm");
    } else {
        await ttyPline(
            `Having fun sitting on the ${surface(u.ux, u.uy, state)}?`, state,
        );
    }
    return ECMD_TIME;
}
