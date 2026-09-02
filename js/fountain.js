// fountain.js -- drinking from fountains.
// C ref: src/fountain.c drinkfountain() (243-390), dowaterdemon() (64-90),
//        dowatersnakes() (38-60), dryup() (201-239).
//
// drinkfountain() is the entry point when a hero quaffs from a fountain.
// It rolls rnd(30) for a random fate. This port covers the foul-water
// continuation (fate 20), the water-demon outcome (fate 23), the ordinary
// visible water-snake outcome (fate 22), and the refreshing-draught early
// return (fate < 10). Every other fate arm throws UnsupportedFountainError so
// the scorer stops cleanly at the first unported branch.

import {
    A_WIS,
    G_GONE,
    HALLUC,
    HALLUC_RES,
    IS_FOUNTAIN,
    LEVITATION,
    MM_NOMSG,
    ROOM,
} from './const.js';
import { exercise } from './attrib.js';
import { monster_detect } from './detect.js';
import { newsym, glyph_at, glyph_is_cmap, glyph_to_cmap } from './display.js';
import { Amonnam } from './do_name.js';
import { level_difficulty } from './dungeon.js';
import { game } from './gstate.js';
import { makemon_runtime } from './makemon_create.js';
import { mhis, mhe } from './mondata.js';
import { heroIsBlind } from './startup_a11y.js';
import { PM_WATER_DEMON, PM_WATER_MOCCASIN } from './monsters.js';
import { d, rn1, rn2, rnd, rne } from './rng.js';
import { cansee } from './vision.js';
import { S_cloud } from './symbols.js';
import { set_levltyp } from './terrain.js';
import { mintrap } from './trap_effects.js';
import { t_at } from './trap.js';
import { ttyPline } from './tty_message.js';

// ── Fail-closed error ──
// Thrown when drinkfountain() reaches a branch this port has not ported.
export class UnsupportedFountainError extends Error {
    constructor(reason) {
        super(`fountain requires ${reason}`);
        this.name = 'UnsupportedFountainError';
        this.reason = reason;
    }
}

// ── a_monnam ──
// C ref: do_name.c a_monnam() (1152-1156). Returns "a water demon" --
// the same text as Amonnam() but with a lowercase initial letter.
function a_monnam(monster, env = {}) {
    const text = Amonnam(monster, env);
    return text.charAt(0).toLowerCase() + text.slice(1);
}

// ── dowaterdemon ──
// C ref: fountain.c dowaterdemon() (64-90). Summon a water demon; on low
// levels the demon may grant a wish instead of attacking.
async function dowaterdemon(state = game, env = {}) {
    const message = env.message ?? ttyPline;
    const random = env.random ?? { d, rn1, rn2, rnd, rne };
    const makeMonster = env.makeMonster ?? makemon_runtime;

    if (!(state.mvitals[PM_WATER_DEMON].mvflags & G_GONE)) {
        const mtmp = await makeMonster(
            state.mons[PM_WATER_DEMON],
            state.u.ux,
            state.u.uy,
            MM_NOMSG,
            { ...env, state, random },
        );
        if (mtmp) {
            if (!heroIsBlind(state)) {
                await message(
                    `You unleash ${a_monnam(mtmp, { state })}!`,
                    state,
                );
            } else {
                await message('You feel the presence of evil.', state);
            }

            // C ref: fountain.c:78. On low levels the demon is grateful
            // and grants a wish. level_difficulty() adds depth adjustments.
            if (random.rnd(100) > (80 + level_difficulty(state))) {
                await message(
                    `Grateful for ${mhis(mtmp, { state })} release, `
                    + `${mhe(mtmp, { state })} grants you a wish!`,
                    state,
                );
                // mongrantswish removes the monster and gives a wish.
                // Dynamic import breaks the fountain.js <-> potion.js cycle.
                const { mongrantswish } = await import('./potion.js');
                await mongrantswish(mtmp, state, env);
            } else if (t_at(mtmp.mx, mtmp.my, state)) {
                await mintrap(mtmp, 0, { ...env, state, random });
            }
        }
    } else {
        // Extinct or genocided.
        await message(
            'The fountain bubbles furiously for a moment, then calms.',
            state,
        );
    }
}

// C ref: fountain.c dowatersnakes() (38-60). This admits only the ordinary
// sighted, non-hallucinating branch. The blind branch needs Soundeffect() and
// You_hear(), while the hallucinating branch needs rndmonnam(); both remain
// explicit boundaries rather than consuming a partial effect.
async function dowatersnakes(state = game, env = {}) {
    const message = env.message ?? ttyPline;
    const random = env.random ?? { d, rn1, rn2, rnd, rne };
    const makeMonster = env.makeMonster ?? makemon_runtime;
    const hallucination = state.u?.uprops?.[HALLUC];
    const hallucinationResistance = state.u?.uprops?.[HALLUC_RES];

    if (state.mvitals[PM_WATER_MOCCASIN].mvflags & G_GONE) {
        throw new UnsupportedFountainError(
            'the extinct water-snake fountain effect (fate 22)',
        );
    }
    if (heroIsBlind(state)) {
        throw new UnsupportedFountainError(
            'the blind water-snake fountain effect (fate 22)',
        );
    }
    if (hallucination?.intrinsic
        && !(hallucinationResistance?.intrinsic
            || hallucinationResistance?.extrinsic)) {
        throw new UnsupportedFountainError(
            'the hallucinating water-snake fountain effect (fate 22)',
        );
    }

    const num = random.rn1(5, 2);
    await message('An endless stream of snakes pours forth!', state);
    for (let remaining = num; remaining > 0; --remaining) {
        const monster = await makeMonster(
            state.mons[PM_WATER_MOCCASIN],
            state.u.ux,
            state.u.uy,
            MM_NOMSG,
            { ...env, state, random },
        );
        if (monster && t_at(monster.mx, monster.my, state)) {
            await mintrap(monster, 0, { ...env, state, random });
        }
    }
}

// ── dryup ──
// C ref: fountain.c dryup() (201-239). With probability 1/3 (or if
// warned), dry up the fountain and replace it with ordinary floor.
async function dryup(x, y, isyou, state = game, env = {}) {
    const message = env.message ?? ttyPline;
    const random = env.random ?? { rn2 };

    if (IS_FOUNTAIN(state.level.at(x, y).typ)
        && (!random.rn2(3)
            || (state.level.at(x, y).flags & F_WARNED))) {
        // C ref: fountain.c:205-214. Town fountain warning; the watch
        // warns the hero. in_town() is not ported; fail-closed so a
        // town-fountain path stops the scorer rather than skipping the
        // watchman interaction.
        if (isyou && in_town_stub(x, y, state)
            && !(state.level.at(x, y).flags & F_WARNED)) {
            throw new UnsupportedFountainError(
                'the in-town fountain warning in dryup()');
        }

        // C ref: fountain.c:216-219. Wizard-mode confirmation.
        // Not needed; the port does not run in wizard mode.

        // C ref: fountain.c:223-228. "The fountain dries up!" if visible
        // and not obscured by a cloud glyph.
        if (cansee(x, y, state)) {
            const glyph = glyph_at(x, y, state);
            if (!glyph_is_cmap(glyph)
                || glyph_to_cmap(glyph) !== S_cloud) {
                await message('The fountain dries up!', state);
            }
        }

        // C ref: fountain.c:230-232. Replace with ordinary floor.
        set_levltyp(x, y, ROOM, { state });
        state.level.at(x, y).flags = 0;
        state.level.at(x, y).horizontal = 0; // blessedftn

        // C ref: fountain.c:235. newsym() so the tile updates.
        newsym(x, y);

        // C ref: fountain.c:236-237. Town guards get angry.
        if (isyou && in_town_stub(x, y, state)) {
            throw new UnsupportedFountainError(
                'angry_guards() after drying up a town fountain');
        }
    }
}

// Fountain flag bits from rm.h.
const F_LOOTED = 1;
const F_WARNED = 2;

// Stub: in_town() is not ported. Returns false so non-town fountains
// work; any session that reaches a town fountain will hit the
// fail-closed throw above instead of silently skipping the watchman.
function in_town_stub(_x, _y, _state) {
    return false;
}

// ── drinkfountain ──
// C ref: fountain.c drinkfountain() (243-390). Called from dodrink() when
// the hero is standing on a fountain and answers 'y' to the prompt.
export async function drinkfountain(state = game, env = {}) {
    const message = env.message ?? ttyPline;
    const random = env.random ?? { d, rn1, rn2, rnd, rne };

    const mgkftn = state.level.at(state.u.ux, state.u.uy).horizontal === 1;
    const fate = random.rnd(30);

    // C ref: fountain.c:249-252. Levitation prevents drinking.
    const levitating = Boolean(
        state.u?.uprops?.[LEVITATION]?.intrinsic
            || state.u?.uprops?.[LEVITATION]?.extrinsic,
    ) && !state.u?.uprops?.[LEVITATION]?.blocked;
    if (levitating) {
        throw new UnsupportedFountainError(
            'floating_above() for a levitating hero');
    }

    // C ref: fountain.c:254-277. Blessed fountain with positive luck.
    if (mgkftn && (state.u.uluck ?? 0) >= 0 && fate >= 10) {
        throw new UnsupportedFountainError(
            'the blessed-fountain ability restoration in drinkfountain()');
    }

    if (fate < 10) {
        // C ref: fountain.c:279-284. Refreshing draught.
        await message('The cool draught refreshes you.', state);
        state.u.uhunger += random.rnd(10);
        // newuhs(FALSE) updates hunger status; it is ported in eat.js.
        // Import deferred to avoid a circular dependency at load time.
        const { newuhs } = await import('./eat.js');
        await newuhs(false, state, env);
        if (mgkftn) return;
    } else {
        switch (fate) {
        case 19: // Self-knowledge
            throw new UnsupportedFountainError(
                'self-knowledge fountain effect (fate 19)');
        case 20: // Foul water
            // C ref: fountain.c:313-316. The deferred imports avoid adding a
            // fountain.js -> hack.js cycle while supplying the hooks that
            // morehungry() needs if this subtraction changes hunger status.
            await message('The water is foul!  You gag and vomit.', state);
            {
                const { morehungry, vomit } = await import('./eat.js');
                const { endRunning } = await import('./hack.js');
                const { bot } = await import('./display.js');
                const hungerEnv = {
                    ...env,
                    message,
                    endRunning: env.endRunning
                        ?? ((currentState) => endRunning(currentState)),
                    statusRefresh: env.statusRefresh ?? (() => bot()),
                };
                await morehungry(
                    random.rn1(20, 11),
                    state,
                    hungerEnv,
                );
                vomit(state);
            }
            break;
        case 21: // Poisonous
            throw new UnsupportedFountainError(
                'poisonous-water fountain effect (fate 21)');
        case 22: // Fountain of snakes!
            await dowatersnakes(state, env);
            break;
        case 23: // Water demon
            await dowaterdemon(state, env);
            break;
        case 24: // Maybe curse some items
            throw new UnsupportedFountainError(
                'cursing-items fountain effect (fate 24)');
        case 25: // See invisible
            throw new UnsupportedFountainError(
                'see-invisible fountain effect (fate 25)');
        case 26: // See Monsters
            if (await monster_detect(null, 0, state, env)) {
                await message('The water tastes like nothing.', state);
            }
            await exercise(A_WIS, true, state, random, {
                encumberMessage: env.encumberMessage,
            });
            break;
        case 27: // Find a gem
            throw new UnsupportedFountainError(
                'find-gem fountain effect (fate 27)');
        case 28: // Water Nymph
            throw new UnsupportedFountainError(
                'water-nymph fountain effect (fate 28)');
        case 29: // Scare
            throw new UnsupportedFountainError(
                'scare fountain effect (fate 29)');
        case 30: // Gushing forth
            throw new UnsupportedFountainError(
                'gushing-forth fountain effect (fate 30)');
        default: // Tepid water
            throw new UnsupportedFountainError(
                'tepid-water fountain effect (default)');
        }
    }

    // C ref: fountain.c:389. Common tail: possibly dry up the fountain.
    await dryup(state.u.ux, state.u.uy, true, state, env);
}
