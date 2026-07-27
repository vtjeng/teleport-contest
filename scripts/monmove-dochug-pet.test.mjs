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
import { dochug_fresh_pet } from '../js/monmove.js';

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
        movePet: () => {
            events.push('move');
            return MMOVE_MOVED;
        },
        postMonsterMove(_monster, oldX, oldY, status) {
            events.push(`post:${oldX},${oldY}:${status}`);
            return status;
        },
        preflightPet: () => events.push('preflight'),
        resolveTrappedMonster: () => false,
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

    assert.equal(await dochug_fresh_pet(monster, env), 0);
    assert.deepEqual(events, [
        'preflight',
        'wipe',
        'rn2(40)',
        'apparxy',
        'range-1',
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

        assert.equal(await dochug_fresh_pet(monster, env), 0);
        assert.equal(monster.meating, 0);
        assert.deepEqual(events, [
            'preflight',
            'wipe',
            'apparxy',
            'range-1',
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
        resolveTrappedMonster: () => {
            events.push('trap');
            return true;
        },
    };

    assert.equal(await dochug_fresh_pet(monster, env), 0);
    assert.deepEqual(events, [
        'preflight',
        'wipe',
        'apparxy',
        'range-1',
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

        assert.equal(await dochug_fresh_pet(monster, env), 1);
        assert.deepEqual(events, [
            'preflight',
            'wipe',
            'apparxy',
            'range',
            'apparxy',
            'move',
            'post-died',
        ]);
    });

test('pet dochug does not recalculate range when movement is not selected',
    async () => {
        const events = [];
        const monster = makeMonster({ mpeaceful: false });
        const env = {
            ...baseEnv(events),
            random: {
                rn2: (bound) => assert.fail(`unexpected rn2(${bound})`),
            },
            distanceAndFear: () => {
                events.push('range');
                return { nearby: true, scared: false };
            },
            movePet: () => assert.fail('movement is not selected'),
            postMonsterMove: () => assert.fail('movement is not selected'),
        };

        assert.equal(await dochug_fresh_pet(monster, env), 0);
        assert.deepEqual(events, [
            'preflight',
            'wipe',
            'apparxy',
            'range',
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

    assert.equal(await dochug_fresh_pet(makeMonster(), env), 0);
    assert.deepEqual(events, [
        'preflight',
        'wipe',
        'apparxy',
        'range',
        'apparxy',
        'range',
        'redraw:4,4',
    ]);
});
