import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { OBJ_FLOOR, ONAME_WISH, ROOM } from '../js/const.js';
import { oname } from '../js/do_name.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { add_to_minv } from '../js/invent.js';
import { mksobj } from '../js/obj.js';
import { newMonster, place_monster } from '../js/monst.js';
import { AD_SSEX, PM_GOBLIN, PM_WOOD_NYMPH } from '../js/monsters.js';
import { AMULET_OF_ESP } from '../js/objects.js';
import { ART_EYE_OF_THE_AETHIOPICA } from '../js/artifacts.js';
import { mhitm_ad_ssex } from '../js/uhitm.js';

const cSource = readFileSync('nethack-c/upstream/src/uhitm.c', 'utf8');
const jsSource = readFileSync('js/uhitm.js', 'utf8');

function functionBody(source, signature) {
    const start = source.indexOf(signature);
    assert.notEqual(start, -1, `missing source signature: ${signature}`);
    const end = source.indexOf('\n}\n', start);
    assert.notEqual(end, -1, `missing function end: ${signature}`);
    return source.slice(start, end + 3);
}

test('uhitm.c stolen-item helpers preserve the source return and death ordering', () => {
    const cTheftPetrifies = functionBody(
        cSource,
        'theft_petrifies(struct obj *otmp)',
    );
    const jsTheftPetrifies = functionBody(
        jsSource,
        'async function theft_petrifies(',
    );

    assert.match(cTheftPetrifies, /uarmg[\s\S]*?touch_petrifies[\s\S]*?Stone_resistance/);
    assert.match(cTheftPetrifies, /instapetrify\(corpse_xname[\s\S]*?return TRUE;/);
    assert.match(jsTheftPetrifies, /state\.uarmg[\s\S]*?touch_petrifies[\s\S]*?heroStoneResistance/);
    assert.match(jsTheftPetrifies, /await instapetrify\([\s\S]*?return true;/);
});

test('uhitm.c steal_it keeps monster gold outside the stolen-object selection', () => {
    const cStealIt = functionBody(cSource, 'steal_it(struct monst *mdef');
    const jsStealIt = functionBody(jsSource, 'async function steal_it(');
    const cSteps = [
        cStealIt.indexOf('findgold(mdef->minvent)'),
        cStealIt.indexOf('obj_extract_self(gold)'),
        cStealIt.indexOf('hold_another_object('),
        cStealIt.indexOf('theft_petrifies(otmp)'),
        cStealIt.lastIndexOf('mpickobj(mdef, gold)'),
    ];
    const jsSteps = [
        jsStealIt.indexOf('findgold(mdef.minvent)'),
        jsStealIt.indexOf('obj_extract_self(gold, env)'),
        jsStealIt.indexOf('hold_another_object('),
        jsStealIt.indexOf('theft_petrifies(otmp, state, env)'),
        jsStealIt.lastIndexOf('mpickobj(mdef, gold, env)'),
    ];

    assert.ok(cSteps.every((index) => index >= 0));
    assert.ok(jsSteps.every((index) => index >= 0));
    assert.deepEqual(cSteps, [...cSteps].sort((a, b) => a - b));
    assert.deepEqual(jsSteps, [...jsSteps].sort((a, b) => a - b));
    assert.match(
        jsStealIt,
        /encumberMessage:[\s\S]*?encumber_msg\(currentState, \{ message \}\)/,
    );
});

test('mhitm_ad_sedu wires the hero attack arm to steal_it', () => {
    const cSedu = functionBody(cSource, 'mhitm_ad_sedu(');
    const jsSedu = functionBody(jsSource, 'async function mhitm_ad_sedu(');

    assert.match(cSedu, /if \(magr == &gy\.youmonst\)[\s\S]*?steal_it\(mdef, mattk\);[\s\S]*?mhm->damage = 0;/);
    assert.match(jsSedu, /if \(magr === state\.youmonst\)[\s\S]*?await steal_it\(mdef, mattk, state,[\s\S]*?mhm\.damage = 0;/);
    assert.doesNotMatch(jsSedu, /note_unported\(['"]uhitm\.c steal_it/);
});

test('a stolen untouchable artifact returns to the floor after pickup refusal',
    async () => {
        await runSegment({
            seed: 6100423,
            datetime: '20300415091725',
            nethackrc: 'OPTIONS=name:ArtifactThief,role:Knight,race:human,'
                + 'gender:female,align:lawful,!legacy,!tutorial,'
                + '!splash_screen,pettype:none,!acoustics',
            moves: '',
        });
        const state = game;
        const x = state.u.ux;
        const y = state.u.uy;
        state.u.uhp = state.u.uhpmax = 100;
        state.u.mh = state.u.mhmax = 100;
        state.u.umonnum = PM_WOOD_NYMPH;
        state.youmonst.data = state.mons[PM_WOOD_NYMPH];
        const monster = newMonster({
            data: state.mons[PM_GOBLIN], m_id: 990036,
            mhp: 20, mhpmax: 20,
        });
        monster.nmon = state.level.monlist;
        state.level.monlist = monster;
        state.level.at(x + 1, y).typ = ROOM;
        place_monster(monster, x + 1, y, state);
        const eye = mksobj(AMULET_OF_ESP, true, false, { state });
        oname(eye, 'The Eye of the Aethiopica', ONAME_WISH, { state });
        assert.equal(eye.oartifact, ART_EYE_OF_THE_AETHIOPICA);
        add_to_minv(monster, eye, { state });
        state.unported?.delete('do.c dropy');
        for (let i = 0; i < 24; i++) state.nhDisplay.pushKey(32);

        await mhitm_ad_ssex(
            state.youmonst, { adtyp: AD_SSEX }, monster,
            { damage: 1, done: false, hitflags: 0 }, state,
            { message: async () => {} },
        );

        assert.equal(monster.minvent, null,
            'the polymorphed hero steals the monster inventory');
        assert.equal(eye.where, OBJ_FLOOR,
            'C dropy returns an artifact rejected by touch_artifact');
        assert.equal(state.level.objects[x][y], eye);
        assert.equal(state.unported?.has('do.c dropy'), false);
    });
