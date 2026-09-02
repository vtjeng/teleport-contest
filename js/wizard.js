// The Wizard of Yendor's harassment, and the Amulet test the rest of the game
// shares with it.
// C ref: wizard.c mon_has_amulet().

import {
    BOLT_LIM,
    DEAF,
    GP_AVOID_MONPOS,
    GP_CHECKSCARY,
    NO_MM_FLAGS,
    STRAT_WAITFORU,
    helpless,
} from './const.js';
import { Amonnam } from './do_name.js';
import { In_W_tower } from './dungeon.js';
import { game } from './gstate.js';
import { set_malign } from './makemon.js';
import { PM_WIZARD_OF_YENDOR } from './monsters.js';
import { AMULET_OF_YENDOR } from './objects.js';
import { enexto_core } from './teleport.js';
import { messageAt, canSpotMonster } from './startup_a11y.js';
import { ttyNorep, ttyPline } from './tty_message.js';
import { vtense } from './objnam.js';

function heroIsDeaf(state) {
    const deafness = state.u?.uprops?.[DEAF];
    return Boolean(
        deafness?.intrinsic
        || deafness?.extrinsic
        || state.u?.uroleplay?.deaf,
    );
}

// C ref: wizard.c has_aggravatables() (472-491). "are there any monsters mon
// could aggravate?" A pure scan of fmon: no draws, no output, no state change.
// mcastu.c spell_would_be_useless() reads it for MCAST_AGGRAVATION.
export function has_aggravatables(mon, state = game) {
    const in_w_tower = In_W_tower(mon.mx, mon.my, state.u.uz, state);

    if (in_w_tower !== In_W_tower(state.u.ux, state.u.uy, state.u.uz, state))
        return false;

    for (let mtmp = state.level?.monlist; mtmp; mtmp = mtmp.nmon) {
        if (mtmp.mhp < 1) continue; /* DEADMONSTER() */
        if (in_w_tower !== In_W_tower(mtmp.mx, mtmp.my, state.u.uz, state))
            continue;
        if ((mtmp.mstrategy & STRAT_WAITFORU) !== 0 || helpless(mtmp))
            return true;
    }
    return false;
}

function creationEnv(state, rawEnv) {
    const env = { state };
    if (rawEnv.random) env.random = rawEnv.random;
    if (rawEnv.displayRandom) env.displayRandom = rawEnv.displayRandom;
    return env;
}

function wizardAppearanceMessage(monster, state, displayRandom) {
    if (!canSpotMonster(monster, state)) return null;
    const name = Amonnam(monster, { state, displayRandom });
    const distance = (monster.mx - state.u.ux) ** 2
        + (monster.my - state.u.uy) ** 2;
    const suffix = distance <= 2 ? ' next to you'
        : distance <= BOLT_LIM * BOLT_LIM ? ' close by' : '';
    return messageAt(
        `${name} suddenly ${vtense(name, 'appear')}${suffix}!`,
        monster.mx,
        monster.my,
        state,
    );
}

// C ref: wizard.c resurrect() (715-780), new-Wizard arm only. The generic
// runtime constructor currently admits only its verified call shapes and does
// not admit MM_NOWAIT or the Wizard species. Reuse its complete constructor by
// selecting the source coordinate first, then temporarily using its mklev
// lifecycle so the constructor can finish synchronously. No mklev-only Wizard
// branch is live; the flag only bypasses that constructor's runtime admission.
export async function resurrect(state = game, rawEnv = {}) {
    const createMonster = rawEnv.makemon;
    if (typeof createMonster !== 'function')
        throw new TypeError('resurrect requires a makemon operation');

    state.context ??= {};
    const wizardCount = state.context.no_of_wizards ?? 0;
    if (wizardCount) return null;

    const species = state.mons?.[PM_WIZARD_OF_YENDOR];
    if (!species)
        throw new Error('resurrect requires the Wizard monster record');

    const env = creationEnv(state, rawEnv);
    let coordinate = enexto_core(
        state.u.ux,
        state.u.uy,
        species,
        GP_CHECKSCARY | GP_AVOID_MONPOS,
        env,
    );
    if (!coordinate) {
        coordinate = enexto_core(
            state.u.ux,
            state.u.uy,
            species,
            GP_AVOID_MONPOS,
            env,
        );
    }
    if (!coordinate) return null;

    const wasInMklev = Boolean(state.in_mklev);
    let monster;
    try {
        state.in_mklev = true;
        // MM_NOWAIT's only makemon() effect here is suppressing the species'
        // WAITMASK strategy. The constructor's ordinary flags otherwise make
        // the same inventory and hit-point calls in the same order.
        monster = createMonster(
            species,
            coordinate.x,
            coordinate.y,
            NO_MM_FLAGS,
            env,
        );
    } finally {
        state.in_mklev = wasInMklev;
    }
    if (!monster) return null;

    // wizard.c:724-728 and makemon.c:1369-1373. These assignments are after
    // construction only because the shared constructor's admitted lifecycle
    // has no Wizard branch; none is read between the corresponding C points.
    state.context.no_of_wizards = wizardCount + 1;
    monster.iswiz = true;
    monster.mrevived = true;
    monster.mtame = 0;
    monster.mpeaceful = false;
    monster.mstrategy = 0; // MM_NOWAIT suppresses STRAT_WAITMASK setup.
    monster.mgenmklev = false;
    monster.mux = state.u.ux;
    monster.muy = state.u.uy;
    set_malign(monster, state);

    const redraw = rawEnv.redraw;
    if (typeof redraw === 'function')
        redraw(monster.mx, monster.my, state);

    const appearance = wizardAppearanceMessage(
        monster,
        state,
        rawEnv.displayRandom,
    );
    if (appearance) {
        const norepMessage = rawEnv.norepMessage ?? ttyNorep;
        await norepMessage(appearance, state, rawEnv);
    }

    // wizard.c:774-778. SetVoice() has no screen/state consumer in the port;
    // verbalize() is the ordinary quoted pline immediately after the voice.
    if (!heroIsDeaf(state)) {
        const message = rawEnv.message ?? ttyPline;
        await message('A voice booms out...', state, rawEnv);
        await message(
            '"So thou thought thou couldst kill me, fool."',
            state,
            rawEnv,
        );
    }
    return monster;
}

// C ref: wizard.c mon_has_amulet() (105-114). Pure; do.c goto_level() reaches
// it three times on the descent path, through apply.c next_to_u(), mondata.c
// levl_follower() and dog.c keepdogs().
//
// It walks the linked monster inventory and therefore also handles the
// Wizard's Amulet check once the resurrection path is active.
export function mon_has_amulet(monster) {
    for (let otmp = monster.minvent; otmp; otmp = otmp.nobj)
        if (otmp.otyp === AMULET_OF_YENDOR) return true;
    return false;
}
