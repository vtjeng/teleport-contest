import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { COLNO, CORR, HALLUC, W_ARMH, P_DAGGER, P_QUARTERSTAFF, P_SKILLED, P_BASIC, ROWNO, ROOM } from '../js/const.js';
import { drain_weapon_skill } from '../js/weapon.js';
import { monsterCommonName } from '../js/do_name.js';
import { cloneIsaacContext } from '../js/rng.js';
import { game, resetGame } from '../js/gstate.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { t_at } from '../js/trap.js';
import { Helmet_off } from '../js/do_wear.js';
import { mksobj } from '../js/obj.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import { HELM_OF_TELEPATHY } from '../js/objects.js';
import { hurtle_step } from '../js/dothrow.js';
import { vision_recalc } from '../js/vision.js';

const DATETIME = '20260930120000';

test('weapon forgetting shifts the advancement history and drains the skill record', async () => {
    const cSource = readFileSync(
        new URL('../nethack-c/upstream/src/weapon.c', import.meta.url), 'utf8',
    );
    assert.match(cSource,
        /drain_weapon_skill\(int n\)[\s\S]*?u\.skill_record\[i\] = u\.skill_record\[i \+ 1\];[\s\S]*?P_SKILL\(skill\)--;[\s\S]*?P_ADVANCE\(skill\) = prevadv \+ rn2\(curradv - prevadv\)/u);
    await runSegment({
        // Independent Wizard startup initializes the production skill owner.
        seed: 128070401, datetime: DATETIME,
        nethackrc: 'OPTIONS=name:SkillCopy,role:Wizard,race:human,gender:male,align:neutral\n'
            + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none\n',
        moves: '',
    });
    // Two recorded advances make deletion shift a surviving history entry.
    game.u.skills_advanced = 2;
    game.u.skill_record = [P_DAGGER, P_QUARTERSTAFF];
    game.u.weapon_skills[P_DAGGER].skill = P_SKILLED;
    // weapon.c's skilled -> basic drain clamps practice into [20, 80).
    game.u.weapon_skills[P_DAGGER].advance = 100;
    const draws = [];
    await drain_weapon_skill(1, game, {
        random: { rn2(bound) { draws.push(bound); return 0; } },
        message: async () => {},
    });
    assert.deepEqual(draws, [2, 60], 'history selection precedes practice loss');
    assert.equal(game.u.skills_advanced, 1); // One source history entry was removed.
    assert.equal(game.u.skill_record[0], P_QUARTERSTAFF);
    assert.equal(game.u.weapon_skills[P_DAGGER].skill, P_BASIC);
    assert.equal(game.u.weapon_skills[P_DAGGER].advance, 20); // Zero draw chooses the source lower bound.
});

// The level's monster list is fmon's linked list.
function tameMonster(state) {
    for (let monster = state.level.monlist; monster; monster = monster.nmon)
        if (monster.mtame) return monster;
    return null;
}

test('a hallucinated monster name draws from the display RNG', async () => {
    const cSource = readFileSync(
        new URL('../nethack-c/upstream/src/do_name.c', import.meta.url), 'utf8',
    );
    // x_monnam() names a hallucinated monster through rndmonnam(), which
    // draws from rnd.c's single display stream.
    assert.match(cSource,
        /rndmonnam\(char \*code\)[\s\S]*?name = rn2_on_display_rng\(SPECIAL_PM \+ BOGUSMONSIZE - LOW_PM\)/u);
    await runSegment({
        // Independent Wizard startup; its kitten is the named monster.
        seed: 30517729, datetime: DATETIME,
        nethackrc: 'OPTIONS=name:NameCopy,role:Wizard,race:human,gender:male,align:neutral\n'
            + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:cat\n',
        moves: '',
    });
    // Any nonzero timeout makes Hallucination active; 50 turns is arbitrary.
    game.u.uprops[HALLUC].intrinsic = 50;
    const kitten = tameMonster(game);
    assert.ok(kitten, 'startup places the kitten');
    const before = cloneIsaacContext(game.displayCtx);
    // trap.c trapeffect_sqky_board() names the monster with mon_nam() and no
    // display-random hook.
    monsterCommonName(kitten, game);
    assert.notDeepEqual(game.displayCtx, before,
        'the name advances the display stream');
});

function mapMemory(state) {
    return state.level.locations.map((column) => column.map((location) => ({
        seenv: location.seenv,
        waslit: location.waslit,
    })));
}

test('hurtle recalculations update map memory and one hurtle step moves the hero', async () => {
    const cSource = readFileSync(
        new URL('../nethack-c/upstream/src/dothrow.c', import.meta.url),
        'utf8',
    );
    const cStart = cSource.indexOf(
        'hurtle_step(genericptr_t arg, coordxy x, coordxy y)',
    );
    const cEnd = cSource.indexOf('\n/* used by mhurtle_step()', cStart);
    assert.ok(cStart >= 0 && cEnd > cStart,
        'the complete C hurtle_step source is available');
    assert.match(cSource.slice(cStart, cEnd),
        /u_on_newpos\(x, y\);[\s\S]*?newsym\(ox, oy\);[\s\S]*?vision_recalc\(1\);/u);

    // This fixed startup seed initializes the same map and vision owners that
    // a hero-defender replay uses. Each half of the test starts from it.
    const start = async () => {
        resetGame();
        await runSegment({
            seed: 2026093001,
            datetime: DATETIME,
            nethackrc: 'OPTIONS=name:VisionCopy,role:Valkyrie,race:human,'
                + 'gender:female,align:lawful\n'
                + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none\n',
            moves: '',
        });
    };

    await start();
    const startMemory = mapMemory(game);
    const roomCells = [];
    for (let x = 1; x < COLNO - 1; ++x) {
        for (let y = 1; y < ROWNO - 1; ++y) {
            const typ = game.level.at(x, y)?.typ;
            if (typ === ROOM || typ === CORR)
                roomCells.push({ x, y });
        }
    }
    const distanceFromStart = ({ x, y }) => (
        (x - game.u.ux) ** 2 + (y - game.u.uy) ** 2
    );
    roomCells.sort((left, right) => (
        distanceFromStart(right) - distanceFromStart(left)
    ));
    const destinations = [roomCells[0], roomCells.at(-1)];
    assert.ok(destinations[0] && destinations[1]
        && (destinations[0].x !== destinations[1].x
            || destinations[0].y !== destinations[1].y),
    'the initialized level supplies two distinct floor destinations');
    for (const destination of destinations) {
        // Each destination is selected from this fixed initialized map so the
        // two calls exercise successive swaps of the buffer pair.
        game.u.ux = destination.x;
        game.u.uy = destination.y;
        vision_recalc(1, { state: game, redraw: () => {} });
    }
    const memoryChanged = game.level.locations.some(
        (column, x) => column.some((location, y) => (
            location.seenv !== startMemory[x][y].seenv
            || location.waslit !== startMemory[x][y].waslit
        )),
    );
    assert.ok(memoryChanged,
        'successive recalculations update seenv or waslit cells');

    await start();
    const movement = [
        { x: game.u.ux + 1, y: game.u.uy },
        { x: game.u.ux - 1, y: game.u.uy },
        { x: game.u.ux, y: game.u.uy + 1 },
        { x: game.u.ux, y: game.u.uy - 1 },
    ].find(({ x, y }) => (
        (game.level.at(x, y)?.typ === ROOM
            || game.level.at(x, y)?.typ === CORR)
        && !game.level.monsters?.[x]?.[y]
        && !t_at(x, y, game)
    ));
    assert.ok(movement,
        'the initialized starting square has an adjacent unoccupied floor step');
    const stepRandom = {
        d: () => 1,
        rn1: () => 1,
        rn2: () => 1,
        rnd: () => 1,
        rne: () => 1,
        rnl: () => 1,
    };
    const step = { state: game, range: 1, random: stepRandom };
    assert.equal(await hurtle_step(step, movement.x, movement.y), true);
    assert.deepEqual([game.u.ux, game.u.uy],
        [movement.x, movement.y], 'the callback moves the hero');
    assert.equal(step.range, 0, 'the source callback consumes one range square');
});

// steal.c remove_worn_item() reaches do_wear.c Helmet_off(), whose helm of
// telepathy arm calls see_monsters(). Helmet_off() forwards the caller's
// redraw seam to that call.
test('a helm of telepathy removal repaints through the caller seam', async () => {
    await runSegment({
        // An independent Valkyrie startup gives a live level and hero.
        seed: 128070403, datetime: DATETIME,
        nethackrc: 'OPTIONS=name:Unhelmed,role:Valkyrie,race:human,gender:female,align:neutral\n'
            + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none\n',
        moves: '',
    });
    const helm = mksobj(HELM_OF_TELEPATHY, false, false,
        objectGenerationEnv({ state: game }));
    helm.owornmask = W_ARMH;
    game.uarmh = helm;
    let repaints = 0;
    await Helmet_off(game, { redraw: () => { repaints += 1; } });
    assert.equal(game.uarmh, null);
    assert.ok(repaints > 0, 'see_monsters() repainted through the seam');
});
