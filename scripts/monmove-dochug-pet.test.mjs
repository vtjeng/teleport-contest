import assert from 'node:assert/strict';
import test from 'node:test';

import {
    HALLUC,
    HALLUC_RES,
    MMOVE_DIED,
    MMOVE_DONE,
    MMOVE_MOVED,
    MMOVE_NOTHING,
} from '../js/const.js';
import { dochug } from '../js/monmove.js';
import { AT_CLAW } from '../js/monsters.js';

function makeMonster(overrides = {}) {
    return {
        data: {
            mflags2: 0,
            mflags3: 0,
        },
        mcanmove: true,
        mcansee: true,
        mconf: false,
        meating: 0,
        mflee: false,
        mfleetim: 0,
        mhp: 5,
        mhpmax: 5,
        minvis: false,
        mpeaceful: true,
        mstun: false,
        mx: 4,
        my: 4,
        ...overrides,
    };
}

function baseEnv(events) {
    return {
        state: {
            u: {
                uprops: {
                    [HALLUC]: {
                        intrinsic: 0,
                        extrinsic: 0,
                        blocked: 0,
                    },
                    [HALLUC_RES]: {
                        intrinsic: 0,
                        extrinsic: 0,
                        blocked: 0,
                    },
                },
            },
        },
        finishEating: () => events.push('finish-eating'),
        monFlee: () => events.push('monflee'),
        // dochug() calls m_move(), which owns the mintrap() and meating
        // prologue and the tame dog_move() dispatch. This double stands in
        // for m_move() so these cases keep asserting dochug()'s ordering
        // around it. m_move()'s own prologue is covered in monmove.test.mjs,
        // against the real mintrap(); `trappedPrologue` is this file's own
        // stand-in for monmove.c:1733-1742 and names no production seam.
        moveMonster: async (subject, moveEnv) => {
            if (await moveEnv.trappedPrologue(subject, moveEnv))
                return MMOVE_NOTHING;
            if (subject.meating) {
                --subject.meating;
                if (subject.meating <= 0) moveEnv.finishEating(subject);
                return MMOVE_DONE;
            }
            const oldX = subject.mx;
            const oldY = subject.my;
            moveEnv.setApparentHero(subject, moveEnv);
            const status = await moveEnv.movePet(subject, false, moveEnv);
            return moveEnv.postMonsterMove(
                subject, oldX, oldY, status, moveEnv,
            );
        },
        movePet: () => {
            events.push('move');
            return MMOVE_MOVED;
        },
        postMonsterMove(_monster, oldX, oldY, status) {
            events.push(`post:${oldX},${oldY}:${status}`);
            return status;
        },
        preflight: () => events.push('preflight'),
        // The merged dochug() runs C's pre-move item and weapon gates for
        // every monster, pets included. C's weapon gate additionally requires
        // (!mpeaceful || Conflict), so a peaceful pet never reaches it.
        usePreMoveItems: () => {
            events.push('items');
            return false;
        },
        attackHero: () => events.push('attack'),
        wakeMessage: () => events.push('wake-message'),
        monsterCanSeeHero: () => true,
        trappedPrologue: () => false,
        setApparentHero: () => events.push('apparxy'),
        wipeEngraving: () => events.push('wipe'),
    };
}

test('pet dochug sends an unchanged MMOVE_MOVED result through postmov',
    async () => {
    const events = [];
    const monster = makeMonster({
        mflee: true,
        // A nonzero timer bypasses the later one-in-25 courage draw.
        mfleetim: 5,
    });
    let rangeCall = 0;
    const env = {
        ...baseEnv(events),
        random: {
            rn2(bound) {
                events.push(`rn2(${bound})`);
                assert.equal(bound, 40);
                return 1; // The starting pet does not teleport.
            },
        },
        distanceAndFear: () => {
            events.push(`range-${++rangeCall}`);
            return { nearby: true, scared: false };
        },
        movePet: (subject) => {
            events.push('move');
            assert.deepEqual([subject.mx, subject.my], [4, 4]);
            return MMOVE_MOVED;
        },
        postMonsterMove(subject, oldX, oldY, status) {
            events.push(`post:${oldX},${oldY}:${status}`);
            assert.deepEqual([subject.mx, subject.my], [oldX, oldY]);
            return status;
        },
    };

    assert.equal(await dochug(monster, env), 0);
    assert.deepEqual(events, [
        'preflight',
        'wipe',
        'rn2(40)',
        'apparxy',
        'range-1',
        'items',
        'apparxy',
        'move',
        `post:4,4:${MMOVE_MOVED}`,
        'range-2',
    ]);
});

test('pet dochug finishes eating without entering dog_move or postmov',
    async () => {
        const events = [];
        const monster = makeMonster({
            meating: 1, // The final eating turn reaches finish_meating().
        });
        let rangeCall = 0;
        const env = {
            ...baseEnv(events),
            random: {
                rn2: (bound) => assert.fail(`unexpected rn2(${bound})`),
            },
            distanceAndFear: () => {
                events.push(`range-${++rangeCall}`);
                return { nearby: true, scared: false };
            },
            movePet: () => assert.fail('eating bypasses dog_move'),
            postMonsterMove: () => assert.fail('eating bypasses postmov'),
        };

        assert.equal(await dochug(monster, env), 0);
        assert.equal(monster.meating, 0);
        assert.deepEqual(events, [
            'preflight',
            'wipe',
            'apparxy',
            'range-1',
            'items',
            'finish-eating',
            'range-2',
        ]);
    });

test('pet dochug returns a still-trapped result without entering postmov',
    async () => {
    const events = [];
    const monster = makeMonster();
    let rangeCall = 0;
    const env = {
        ...baseEnv(events),
        random: {
            rn2: (bound) => assert.fail(`unexpected rn2(${bound})`),
        },
        distanceAndFear: () => {
            events.push(`range-${++rangeCall}`);
            return { nearby: true, scared: false };
        },
        movePet: () => assert.fail('a still-trapped pet cannot move'),
        postMonsterMove: () => assert.fail('a trapped pet bypasses postmov'),
        trappedPrologue: () => {
            events.push('trap');
            return true;
        },
    };

    assert.equal(await dochug(monster, env), 0);
    assert.deepEqual(events, [
        'preflight',
        'wipe',
        'apparxy',
        'range-1',
        'items',
        'trap',
        'range-2',
    ]);
});

test('pet dochug skips the second range check after postmov kills the pet',
    async () => {
        const events = [];
        const monster = makeMonster();
        const env = {
            ...baseEnv(events),
            random: {
                rn2: (bound) => assert.fail(`unexpected rn2(${bound})`),
            },
            distanceAndFear: () => {
                events.push('range');
                return { nearby: true, scared: false };
            },
            postMonsterMove: () => {
                events.push('post-died');
                return MMOVE_DIED;
            },
        };

        assert.equal(await dochug(monster, env), 1);
        assert.deepEqual(events, [
            'preflight',
            'wipe',
            'apparxy',
            'range',
            'items',
            'apparxy',
            'move',
            'post-died',
        ]);
    });

test('pet dochug does not recalculate range when movement is not selected',
    async () => {
        const events = [];
        const monster = makeMonster({
            data: {
                mattk: [{ aatyp: AT_CLAW }],
                mflags2: 0,
                mflags3: 0,
            },
            mpeaceful: false,
        });
        const env = {
            ...baseEnv(events),
            random: {
                rn2: (bound) => assert.fail(`unexpected rn2(${bound})`),
            },
            distanceAndFear: () => {
                events.push('range');
                // nearby implies inrange in distfleeck(), and C's gate also
                // reads noattacks(mdat), which makeMonster()'s attackless
                // species satisfies; give the pet a melee attack instead.
                return { inrange: true, nearby: true, scared: false };
            },
            movePet: () => assert.fail('movement is not selected'),
            postMonsterMove: () => assert.fail('movement is not selected'),
        };

        assert.equal(await dochug(monster, env), 0);
        // Clearing mpeaceful to suppress movement also opens C's phase-four
        // attack gate, which a genuine peaceful pet never reaches.
        assert.deepEqual(events, [
            'preflight',
            'wipe',
            'apparxy',
            'range',
            'items',
            'attack',
        ]);
    });

test('pet dochug redraws a no-action pet during hallucination', async () => {
    const events = [];
    const env = baseEnv(events);
    env.state.u.uprops[HALLUC].intrinsic = 1;
    env.distanceAndFear = () => {
        events.push('range');
        return { nearby: true, scared: false };
    };
    env.random = {
        rn2: (bound) => assert.fail(`unexpected rn2(${bound})`),
    };
    env.movePet = () => MMOVE_NOTHING;
    env.postMonsterMove = (_monster, _oldX, _oldY, status) => status;
    env.redraw = (x, y) => events.push(`redraw:${x},${y}`);

    assert.equal(await dochug(makeMonster(), env), 0);
    assert.deepEqual(events, [
        'preflight',
        'wipe',
        'apparxy',
        'range',
        'items',
        'apparxy',
        'range',
        'redraw:4,4',
    ]);
});
