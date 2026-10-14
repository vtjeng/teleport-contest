import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { PIT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_COCKATRICE } from '../js/monsters.js';
import { CORPSE } from '../js/objects.js';
import { trapeffect_selector } from '../js/trap_effects.js';

const C_TRAP = readFileSync(
    new URL('../nethack-c/upstream/src/trap.c', import.meta.url), 'utf8',
);
const JS_EFFECTS = readFileSync(
    new URL('../js/trap_effects.js', import.meta.url), 'utf8',
);

test('ordinary pit damage awaits the C selftouch caller afterward', async () => {
    const cStart = C_TRAP.indexOf('staticfn int\ntrapeffect_pit(');
    const cEnd = C_TRAP.indexOf('\nstaticfn int\ntrapeffect_telep_trap(', cStart);
    assert.ok(cStart >= 0 && cEnd > cStart);
    const c = C_TRAP.slice(cStart, cEnd);
    assert.match(c,
        /losehp\(Maybe_Half_Phys\(rnd\(adj_pit \? 3 : 6\)\),[\s\S]*?\n\s*if \(Punished\b[\s\S]*?selftouch\("Falling, you"\);/u);
    assert.match(JS_EFFECTS,
        /await losehp\([\s\S]*?if \(Punished\(state\) &&[\s\S]*?await selftouch\('Falling, you', state, env\);/u);

    // This independent Wizard start leaves the hero non-resistant; the
    // cockatrice corpse makes trapeffect_pit()'s ordinary fall branch reach
    // selftouch after its nonlethal rnd(6) pit damage.
    await runSegment({
        seed: 9135701,
        datetime: '20340719081123',
        nethackrc: 'OPTIONS=name:PitTouch,role:Wizard,race:human,gender:male,'
            + 'align:neutral,!legacy,!tutorial,!splash_screen,pettype:none',
        moves: '',
    });
    game.level.traps = [];
    // Space dismisses the fall/selftouch lines so the planned stoning reaches
    // its explicit planning boundary instead of waiting for a real player.
    game.nhDisplay.onEmptyQueue = () => ' '.charCodeAt(0);
    const corpse = {
        otyp: CORPSE,
        corpsenm: PM_COCKATRICE,
    };
    game.uwep = corpse;
    const trap = {
        tx: game.u.ux,
        ty: game.u.uy,
        ttyp: PIT,
        tseen: false,
        madeby_u: false,
        once: false,
    };
    const bounds = [];
    const draw = (name, bound, value = 1) => {
        bounds.push(`${name}(${bound})`);
        return value;
    };
    const env = {
        state: game,
        planning: true,
        random: {
            rn1: (bound, from) => {
                bounds.push(`rn1(${bound},${from})`);
                return from;
            },
            rn2: (bound) => draw('rn2', bound, 1),
            rnd: (bound) => draw('rnd', bound, 1),
        },
        message: async () => {},
        redraw: () => {},
        unsupported: (reason) => { throw new Error(reason); },
    };

    await assert.rejects(
        trapeffect_selector(game.youmonst, trap, 0, env),
        (error) => {
            assert.equal(error.name, 'HeroDeathPlanningError', error.stack);
            // selftouch() passes an(corpsePmname) to instapetrify().
            assert.equal(error.killerName, 'a cockatrice corpse');
            return true;
        },
    );
    assert.ok(bounds.includes('rnd(6)'), 'the C ordinary-pit damage roll ran first');
});
