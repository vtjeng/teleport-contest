// ball.js -- punishment ball and chain movement.
// C refs: ball.c ballrelease() (23-39), placebc_core() (120-145),
// unplacebc_core() (147-190), placebc()/unplacebc() (193-219),
// move_bc() (437-552), drag_ball() (560-830), and drag_down() (986-1031).
// These helpers are used by dothrow.c hurtle_step() while a jumping hero is
// punished. The pointers in drag_ball() are represented by `{ value }` cells.

import {
    A_STR,
    BC_BALL,
    BC_CHAIN,
    D_CLOSED,
    D_LOCKED,
    IS_DOOR,
    IS_OBSTRUCTED,
    OBJ_FREE,
    OBJ_FLOOR,
    POOL,
    SLT_ENCUMBER,
    HALF_PHDAM,
    Is_waterlevel,
    KILLED_BY_AN,
    NO_KILLER_PREFIX,
    is_hole,
    is_pit,
} from './const.js';
import { exercise } from './attrib.js';
import { canletgo, flooreffects } from './do.js';
import { game } from './gstate.js';
import {
    cls,
    glyph_at,
    map_object,
    newsym,
    remembered_glyph_from_presentation,
} from './display.js';
import { freeinv } from './invent.js';
import {
    carried,
    place_object,
    remove_object,
} from './obj.js';
import { maybe_unhide_at } from './mon.js';
import { m_at } from './monst.js';
import { dist2, distmin } from './hacklib.js';
import {
    losehp,
    near_capacity,
    nomul,
    spoteffects,
    weight_cap,
} from './hack.js';
import { Levitation, is_pool, t_at } from './trap.js';
import { find_mac } from './worn.js';
import { hmon } from './uhitm.js';
import { miss } from './zap.js';
import { otense, xnameFresh, yname } from './objnam.js';
import { encumber_msg } from './pickup.js';
import { rn2, rnd } from './rng.js';
import { heroIsBlind } from './startup_a11y.js';
import { setnotworn, setuqwep, setuswapwep, setuwep } from './worn.js';
import { welded } from './wield.js';
import { note_unported } from './unported.js';
import { ttyPline } from './tty_message.js';

const BCPOS_DIFFER = 0;
const BCPOS_CHAIN = 1;
const BCPOS_BALL = 2;

function pointerValue(pointer) {
    return pointer && typeof pointer === 'object' && 'value' in pointer
        ? pointer.value : pointer;
}

function setPointer(pointer, value) {
    if (pointer && typeof pointer === 'object' && 'value' in pointer)
        pointer.value = value;
}

function bcOrder(state) {
    const ball = state.uball;
    const chain = state.uchain;
    if (!ball || !chain || carried(ball)
        || ball.ox !== chain.ox || ball.oy !== chain.oy)
        return BCPOS_DIFFER;
    for (let object = state.level?.objects?.[ball.ox]?.[ball.oy] ?? null;
        object;
        object = object.nexthere) {
        if (object === chain) return BCPOS_CHAIN;
        if (object === ball) return BCPOS_BALL;
    }
    return BCPOS_DIFFER;
}

function blind(state) {
    return heroIsBlind(state);
}

function moveObject(object, x, y, state) {
    if (!object || object.where !== OBJ_FLOOR) return;
    remove_object(object, { state });
    maybe_unhide_at(object.ox, object.oy, state);
    newsym(object.ox, object.oy);
    place_object(object, x, y, { state });
    newsym(x, y);
}

function rememberedGlyph(glyph) {
    return remembered_glyph_from_presentation({ glyph });
}

// C ref: ball.c placebc_core() (120-145), reached by placebc() after a level
// transition. The floor-effect checks are ordinary on the destination square;
// other landing effects remain owned by do.c flooreffects().
async function placebc_core(state, rawEnv = {}) {
    const ball = state.uball;
    const chain = state.uchain;
    if (!ball || !chain) {
        note_unported('pline.c impossible');
        return;
    }

    const redraw = rawEnv.redraw ?? newsym;
    const effectEnv = {
        ...rawEnv,
        state,
        unsupported: (reason) => note_unported(`do.c flooreffects: ${reason}`),
    };

    await flooreffects(chain, state.u.ux, state.u.uy, '', effectEnv);

    if (carried(ball)) {
        state.u.bc_order = BCPOS_DIFFER;
    } else {
        await flooreffects(ball, state.u.ux, state.u.uy, '', effectEnv);
        place_object(ball, state.u.ux, state.u.uy, { state });
        state.u.bc_order = BCPOS_CHAIN;
    }
    place_object(chain, state.u.ux, state.u.uy, { state });
    const glyph = state.level.at(state.u.ux, state.u.uy).glyph;
    state.u.bglyph = glyph;
    state.u.cglyph = glyph;
    redraw(state.u.ux, state.u.uy, state);
}

// C ref: ball.c placebc() (193-209). The restriction mechanism is only used
// by covet/lift callers outside this span, so a free chain is the live check.
export async function placebc(state = game, rawEnv = {}) {
    const chain = state.uchain;
    if (chain && chain.where !== OBJ_FREE) {
        note_unported('pline.c impossible');
        return;
    }
    const redraw = rawEnv.redraw
        ?? (rawEnv.planning ? () => {} : newsym);
    await placebc_core(state, { ...rawEnv, redraw });
}

// C ref: ball.c unplacebc_core() (147-190), used around level transit. Object
// extraction leaves the pointers attached to the hero while making both
// objects free, so savelev()/getlev() can carry them between levels.
function unplacebc_core(state) {
    const ball = state.uball;
    const chain = state.uchain;
    if (!ball || !chain) {
        note_unported('pline.c impossible');
        return;
    }
    if (state.u.uswallow) {
        if (Is_waterlevel(state.u.uz)) {
            if (!carried(ball) && ball.where === OBJ_FLOOR)
                remove_object(ball, { state });
            if (chain.where === OBJ_FLOOR)
                remove_object(chain, { state });
        }
        return;
    }

    if (!carried(ball) && ball.where === OBJ_FLOOR) {
        remove_object(ball, { state });
        if (heroIsBlind(state) && (state.u.bc_felt & BC_BALL))
            state.level.at(ball.ox, ball.oy).glyph = state.u.bglyph;
        maybe_unhide_at(ball.ox, ball.oy, state);
        newsym(ball.ox, ball.oy, state);
    }
    if (chain.where === OBJ_FLOOR)
        remove_object(chain, { state });
    if (heroIsBlind(state) && (state.u.bc_felt & BC_CHAIN))
        state.level.at(chain.ox, chain.oy).glyph = state.u.cglyph;
    maybe_unhide_at(chain.ox, chain.oy, state);
    newsym(chain.ox, chain.oy, state);
    state.u.bc_felt = 0;
}

// C ref: ball.c unplacebc() (212-219). The helper is intentionally a no-op
// for an already-free chain, which is the state between level save and load.
export function unplacebc(state = game) {
    unplacebc_core(state);
}

// C ref: ball.c ballrelease() (23-39). A carried, unwelded ball leaves the
// inventory without being placed on the floor and refreshes burden feedback.
export async function ballrelease(showmsg, state = game) {
    const ball = state.uball;
    if (!ball || !carried(ball) || welded(ball, state)) return;
    if (showmsg) await ttyPline('Startled, you drop the iron ball.', state);
    if (state.uwep === ball) setuwep(null, { state });
    if (state.uswapwep === ball) setuswapwep(null, { state });
    if (state.uquiver === ball) setuqwep(null, { state });
    freeinv(ball, { state });
    await encumber_msg(state);
}

async function litter(state) {
    const capacity = weight_cap(state);
    for (let obj = state.invent; obj;) {
        const next = obj.nobj;
        if (obj !== state.uball && rnd(capacity) <= (obj.owt ?? 0)
            && await canletgo(obj, '', state)) {
            await ttyPline(
                `You drop ${yname(obj, state)} and `
                    + `${obj.quan === 1 ? 'it' : 'they'} `
                    + `${otense(obj, 'fall')} down the stairs with you.`,
                state,
            );
            setnotworn(obj, { state });
            freeinv(obj, { state });
            // do.c hitfloor() is outside this span; dropping the object on
            // the destination floor would change its ownership incorrectly.
            note_unported('do.c hitfloor');
        }
        obj = next;
    }
}

function maybeHalfPhysical(damage, state) {
    const property = state.u.uprops?.[HALF_PHDAM];
    return property?.intrinsic || property?.extrinsic
        ? Math.trunc((damage + 1) / 2) : damage;
}

// C ref: ball.c drag_down() (986-1031). This runs while a punished hero
// descends a stairway; the selected holdout reaches the collision arm.
export async function drag_down(state = game) {
    const ball = state.uball;
    if (!ball) return;
    let forward = false;
    let dragchance = 3;
    if (carried(ball))
        forward = state.uwep === ball || !state.uwep || !rn2(3);

    if (carried(ball) && !welded(ball, state))
        await ttyPline('You lose your grip on the iron ball.', state);

    await cls();
    if (forward) {
        if (rn2(6)) {
            await ttyPline('The iron ball drags you downstairs!', state);
            await losehp(
                maybeHalfPhysical(rnd(6), state),
                'dragged downstairs by an iron ball',
                NO_KILLER_PREFIX,
                state,
            );
            if (state.program_state?.gameover) return;
            await litter(state);
        }
    } else {
        if (rn2(2)) {
            await ttyPline('The iron ball smacks into you!', state);
            await losehp(
                maybeHalfPhysical(rnd(20), state),
                'iron ball collision',
                KILLED_BY_AN,
                state,
            );
            if (state.program_state?.gameover) return;
            await exercise(A_STR, false, state, { rn2 }, {
                encumberMessage: encumber_msg,
            });
            dragchance -= 2;
        }
        if (dragchance >= rnd(6)) {
            await ttyPline('The iron ball drags you downstairs!', state);
            await losehp(
                maybeHalfPhysical(rnd(3), state),
                'dragged downstairs by an iron ball',
                NO_KILLER_PREFIX,
                state,
            );
            if (state.program_state?.gameover) return;
            await exercise(A_STR, false, state, { rn2 }, {
                encumberMessage: encumber_msg,
            });
            await litter(state);
        }
    }
}

// C ref: ball.c move_bc() (437-552). Move the attached objects before or
// after the hero's movement, preserving blind glyph memory and floor order.
export function move_bc(before, control, ballx, bally, chainx, chainy, state = game) {
    const ball = state.uball;
    const chain = state.uchain;
    if (!ball || !chain) return;

    if (blind(state)) {
        if (!before) {
            if ((control & BC_CHAIN) && (control & BC_BALL)) {
                if (state.u.bc_felt & BC_BALL)
                    state.level.at(ball.ox, ball.oy).remembered_glyph
                        = rememberedGlyph(state.u.bglyph);
                if (state.u.bc_felt & BC_CHAIN)
                    state.level.at(chain.ox, chain.oy).remembered_glyph
                        = rememberedGlyph(state.u.cglyph);
                state.u.bc_felt = 0;
                state.u.bglyph = glyph_at(ballx, bally, state);
                state.u.cglyph = glyph_at(chainx, chainy, state);
                moveObject(ball, ballx, bally, state);
                moveObject(chain, chainx, chainy, state);
            } else if (control & BC_BALL) {
                if (state.u.bc_felt & BC_BALL) {
                    if (state.u.bc_order === BCPOS_DIFFER) {
                        state.level.at(ball.ox, ball.oy).remembered_glyph
                            = rememberedGlyph(state.u.bglyph);
                    } else if (state.u.bc_order === BCPOS_BALL) {
                        if (state.u.bc_felt & BC_CHAIN) map_object(chain, false, state);
                        else state.level.at(ball.ox, ball.oy).remembered_glyph
                            = rememberedGlyph(state.u.bglyph);
                    }
                    state.u.bc_felt &= ~BC_BALL;
                }
                state.u.bglyph = ballx !== chainx || bally !== chainy
                    ? glyph_at(ballx, bally, state) : state.u.cglyph;
                moveObject(ball, ballx, bally, state);
            } else if (control & BC_CHAIN) {
                if (state.u.bc_felt & BC_CHAIN) {
                    if (state.u.bc_order === BCPOS_DIFFER) {
                        state.level.at(chain.ox, chain.oy).remembered_glyph
                            = rememberedGlyph(state.u.cglyph);
                    } else if (state.u.bc_order === BCPOS_CHAIN) {
                        if (state.u.bc_felt & BC_BALL) map_object(ball, false, state);
                        else state.level.at(chain.ox, chain.oy).remembered_glyph
                            = rememberedGlyph(state.u.cglyph);
                    }
                    state.u.bc_felt &= ~BC_CHAIN;
                }
                state.u.cglyph = ballx !== chainx || bally !== chainy
                    ? glyph_at(chainx, chainy, state) : state.u.bglyph;
                moveObject(chain, chainx, chainy, state);
            }
            state.u.bc_order = bcOrder(state);
        }
        return;
    }

    if (before) {
        if (!control) state.u.bc_order = bcOrder(state);
        if (chain.where === OBJ_FLOOR) {
            remove_object(chain, { state });
            maybe_unhide_at(chain.ox, chain.oy, state);
            newsym(chain.ox, chain.oy);
        }
        if (!carried(ball) && ball.where === OBJ_FLOOR) {
            remove_object(ball, { state });
            maybe_unhide_at(ball.ox, ball.oy, state);
            newsym(ball.ox, ball.oy);
        }
        return;
    }

    const onFloor = !carried(ball) && ball.where === OBJ_FREE;
    if ((control & BC_CHAIN) || (!control && state.u.bc_order === BCPOS_CHAIN)) {
        if (onFloor) place_object(ball, ballx, bally, { state });
        place_object(chain, chainx, chainy, { state });
    } else {
        place_object(chain, chainx, chainy, { state });
        if (onFloor) place_object(ball, ballx, bally, { state });
    }
    newsym(chainx, chainy);
    if (onFloor) newsym(ballx, bally);
}

function chainRock(x, y, state) {
    const location = state.level.at(x, y);
    return IS_OBSTRUCTED(location.typ)
        || (IS_DOOR(location.typ)
            && Boolean((location.doormask ?? location.flags ?? 0)
                & (D_CLOSED | D_LOCKED)));
}

// C ref: ball.c drag_ball() (560-830). The return value tells the caller to
// place the moved objects after the hero moves; false means the hero was
// pulled back or the movement was refused.
export async function drag_ball(
    x,
    y,
    bcControl,
    ballx,
    bally,
    chainx,
    chainy,
    causeDelay,
    allowDrag,
    state = game,
) {
    const ball = state.uball;
    const chain = state.uchain;
    if (!ball || !chain) return false;
    setPointer(ballx, ball.ox);
    setPointer(bally, ball.oy);
    setPointer(chainx, chain.ox);
    setPointer(chainy, chain.oy);
    setPointer(bcControl, 0);
    setPointer(causeDelay, false);

    if (dist2(x, y, chain.ox, chain.oy) <= 2) {
        move_bc(1, pointerValue(bcControl), pointerValue(ballx), pointerValue(bally),
            pointerValue(chainx), pointerValue(chainy), state);
        return true;
    }

    if (carried(ball) || distmin(x, y, ball.ox, ball.oy) <= 2) {
        const oldChainX = chain.ox;
        const oldChainY = chain.oy;
        setPointer(bcControl, BC_CHAIN);
        move_bc(1, pointerValue(bcControl), pointerValue(ballx), pointerValue(bally),
            pointerValue(chainx), pointerValue(chainy), state);
        if (carried(ball)) {
            if (distmin(x, y, chain.ox, chain.oy) > 1) {
                setPointer(chainx, state.u.ux);
                setPointer(chainy, state.u.uy);
            }
            return true;
        }

        const chainInMiddle = (cx, cy) =>
            distmin(x, y, cx, cy) <= 1
            && distmin(cx, cy, ball.ox, ball.oy) <= 1;
        const isChainRock = (cx, cy) => chainRock(cx, cy, state);
        const alreadyInRock = chainRock(state.u.ux, state.u.uy, state)
            || isChainRock(pointerValue(chainx), pointerValue(chainy))
            || isChainRock(ball.ox, ball.oy);
        const skipToDrag = () => {
            setPointer(chainx, oldChainX);
            setPointer(chainy, oldChainY);
            move_bc(0, pointerValue(bcControl), pointerValue(ballx), pointerValue(bally),
                pointerValue(chainx), pointerValue(chainy), state);
            return dragBallTail(
                x, y, bcControl, ballx, bally, chainx, chainy,
                causeDelay, state,
            );
        };

        switch (dist2(x, y, ball.ox, ball.oy)) {
        case 8:
            setPointer(chainx, Math.trunc((ball.ox + x) / 2));
            setPointer(chainy, Math.trunc((ball.oy + y) / 2));
            if (isChainRock(pointerValue(chainx), pointerValue(chainy))
                && !alreadyInRock) return skipToDrag();
            break;
        case 5: {
            let tempx;
            let tempy;
            let tempx2;
            let tempy2;
            if (Math.abs(x - ball.ox) === 1) {
                tempx = x;
                tempx2 = ball.ox;
                tempy = tempy2 = Math.trunc((ball.oy + y) / 2);
            } else {
                tempx = tempx2 = Math.trunc((ball.ox + x) / 2);
                tempy = y;
                tempy2 = ball.oy;
            }
            if (isChainRock(tempx, tempy) && !isChainRock(tempx2, tempy2)
                && !alreadyInRock) {
                if (allowDrag
                    && ((dist2(state.u.ux, state.u.uy, ball.ox, ball.oy) === 5
                        && dist2(x, y, tempx, tempy) === 1)
                    || (dist2(state.u.ux, state.u.uy, ball.ox, ball.oy) === 4
                        && dist2(x, y, tempx, tempy) === 2)))
                    return skipToDrag();
                setPointer(chainx, tempx2);
                setPointer(chainy, tempy2);
            } else if (!isChainRock(tempx, tempy)
                && isChainRock(tempx2, tempy2) && !alreadyInRock) {
                if (allowDrag
                    && ((dist2(state.u.ux, state.u.uy, ball.ox, ball.oy) === 5
                        && dist2(x, y, tempx2, tempy2) === 1)
                    || (dist2(state.u.ux, state.u.uy, ball.ox, ball.oy) === 4
                        && dist2(x, y, tempx2, tempy2) === 2)))
                    return skipToDrag();
                setPointer(chainx, tempx);
                setPointer(chainy, tempy);
            } else if (isChainRock(tempx, tempy) && isChainRock(tempx2, tempy2)
                && !alreadyInRock) {
                return skipToDrag();
            } else {
                const d1 = dist2(tempx, tempy, chain.ox, chain.oy);
                const d2 = dist2(tempx2, tempy2, chain.ox, chain.oy);
                if (d1 < d2 || (d1 === d2 && rn2(2))) {
                    setPointer(chainx, tempx);
                    setPointer(chainy, tempy);
                } else {
                    setPointer(chainx, tempx2);
                    setPointer(chainy, tempy2);
                }
            }
            break;
        }
        case 4:
            if (chainInMiddle(chain.ox, chain.oy)) break;
            setPointer(chainx, Math.trunc((x + ball.ox) / 2));
            setPointer(chainy, Math.trunc((y + ball.oy) / 2));
            if (isChainRock(pointerValue(chainx), pointerValue(chainy))
                && !alreadyInRock) return skipToDrag();
            break;
        case 2:
            if (dist2(x, y, ball.ox, ball.oy) === 2
                && dist2(x, y, chain.ox, chain.oy) === 4) {
                if (chain.oy === y) setPointer(chainx, ball.ox);
                else setPointer(chainy, ball.oy);
                if (isChainRock(pointerValue(chainx), pointerValue(chainy))
                    && !alreadyInRock) return skipToDrag();
                break;
            }
            // falls through
        case 1:
        case 0:
            if (chainInMiddle(chain.ox, chain.oy)) break;
            if (chainInMiddle(state.u.ux, state.u.uy)) {
                setPointer(chainx, state.u.ux);
                setPointer(chainy, state.u.uy);
            } else {
                setPointer(chainx, x);
                setPointer(chainy, y);
            }
            break;
        default:
            break;
        }
        return true;
    }

    return dragBallTail(
        x, y, bcControl, ballx, bally, chainx, chainy, causeDelay, state,
    );
}

async function dragBallTail(
    x,
    y,
    bcControl,
    ballx,
    bally,
    chainx,
    chainy,
    causeDelay,
    state,
) {
    const ball = state.uball;
    const chain = state.uchain;
    if (near_capacity(state) > SLT_ENCUMBER
        && dist2(x, y, state.u.ux, state.u.uy) <= 2) {
        await ttyPline(
            `You cannot ${state.invent ? 'carry all that and also ' : ''}drag the heavy iron ball.`,
            state,
        );
        nomul(0, state);
        return false;
    }

    const chainTrap = t_at(chain.ox, chain.oy, state);
    const chainInWater = is_pool(chain.ox, chain.oy, state)
        && (state.level.at(chain.ox, chain.oy).typ === POOL
            || !is_pool(ball.ox, ball.oy, state)
            || state.level.at(ball.ox, ball.oy).typ === POOL);
    if (chainInWater || (chainTrap && (is_pit(chainTrap.ttyp)
        || is_hole(chainTrap.ttyp)))) {
        if (Levitation(state)) {
            await ttyPline('You feel a tug from the iron ball.', state);
            if (chainTrap) chainTrap.tseen = true;
        } else {
            await ttyPline('You are jerked back by the iron ball!', state);
            const victim = m_at(chain.ox, chain.oy, state);
            if (victim) {
                const dieroll = rnd(20);
                const { omon_adj } = await import('./dothrow.js');
                const tmp = -2 + (state.u.uluck ?? 0)
                    + (state.u.moreluck ?? 0)
                    + find_mac(victim, state)
                    + omon_adj(victim, ball, true, { state });
                if (tmp >= dieroll)
                    await hmon(victim, ball, 4 /* HMON_DRAGGED */, dieroll, state);
                else await miss(xnameFresh(ball, state), victim, state);
            }
            if (!m_at(chain.ox, chain.oy, state)) {
                state.u.ux = chain.ox;
                state.u.uy = chain.oy;
                newsym(state.u.ux0, state.u.uy0);
            }
            nomul(0, state);
            setPointer(bcControl, BC_BALL);
            move_bc(1, pointerValue(bcControl), pointerValue(ballx), pointerValue(bally),
                pointerValue(chainx), pointerValue(chainy), state);
            setPointer(ballx, chain.ox);
            setPointer(bally, chain.oy);
            move_bc(0, pointerValue(bcControl), pointerValue(ballx), pointerValue(bally),
                pointerValue(chainx), pointerValue(chainy), state);
            await spoteffects(true, state);
            return false;
        }
    }

    setPointer(bcControl, BC_BALL | BC_CHAIN);
    move_bc(1, pointerValue(bcControl), pointerValue(ballx), pointerValue(bally),
        pointerValue(chainx), pointerValue(chainy), state);
    if (dist2(x, y, state.u.ux, state.u.uy) > 2) {
        setPointer(ballx, x);
        setPointer(bally, y);
        setPointer(chainx, x);
        setPointer(chainy, y);
    } else {
        let newChainX = state.u.ux;
        let newChainY = state.u.uy;
        if (dist2(x, y, chain.ox, chain.oy) === 4
            && !chainRock(newChainX, newChainY, state)) {
            newChainX = Math.trunc((x + chain.ox) / 2);
            newChainY = Math.trunc((y + chain.oy) / 2);
            if (chainRock(newChainX, newChainY, state)) {
                newChainX = state.u.ux;
                newChainY = state.u.uy;
            }
        }
        setPointer(ballx, chain.ox);
        setPointer(bally, chain.oy);
        setPointer(chainx, newChainX);
        setPointer(chainy, newChainY);
    }
    setPointer(causeDelay, true);
    return true;
}
