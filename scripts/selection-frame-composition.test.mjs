import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {newgame_pre_mklev} from '../js/allmain.js';
import {game, resetGame} from '../js/gstate.js';
import {mklev} from '../js/mklev.js';
import {monst_globals_init} from '../js/monsters.js';
import {objects_globals_init} from '../js/objects.js';
import {timeout_globals_init} from '../js/timeout.js';
import {light_globals_init} from '../js/light.js';
import {initRng} from '../js/rng.js';
import {str2align, str2gend, str2race, str2role} from '../js/roles.js';
import {selection_area, selection_negate, selection_map_frame, ThemeroomSelection} from '../js/themerooms.js';
import {selection_match} from '../js/bigrm.js';
import {l_selection_or, l_selection_sub, l_selection_setpoint} from '../js/nhlsel.js';
import {HWALL, CORR} from '../js/const.js';

const expected = JSON.parse(readFileSync(new URL('./test-fixtures/recovery-selection-frames/expected.json', import.meta.url)));
// Exact C operator bodies executed through the disclosed adapters in fixtures.
// These initialized JS API prefixes stop after observation, before level
// finalization. They do not claim a full C constructor or gameplay recording.
class Observed extends Error {}
async function withDescriptor(body) {
    resetGame();
    objects_globals_init(game); monst_globals_init(game);
    timeout_globals_init(game); light_globals_init(game); initRng(0x5eed);
    game.fixedDatetime = '20400314015926'; game.recorderIsDst = false;
    game.moves = 0; game.plname = 'SelectionFrameControl';
    game.flags = {initrole:str2role('Tourist'), initrace:str2race('human'),
        initgend:str2gend('female'), initalign:str2align('neutral'), female:true, bones:false};
    game.iflags = {}; game.u = {uroleplay:{}}; game.context = {move:0};
    await newgame_pre_mklev(game);
    let completed = false;
    try {
        await mklev({specialLevelLoader:async des => {
            await body(des);
            throw new Observed();
        }});
    } catch (error) {
        if (!(error instanceof Observed)) throw error;
        completed = true;
    }
    assert.equal(completed,true,'observed supported descriptor prefix');
}
function painted(type) {
    const points = [];
    for (let x = 1; x < 80; x++) for (let y = 0; y < 21; y++)
        if (game.level.at(x,y).typ === type) points.push([x,y]);
    return points;
}
for (const [op, fn] of [['or',l_selection_or], ['sub',l_selection_sub]]) {
    for (const kinds of ['ra','ar','rr','aa']) {
        test(`selection ${op} ${kinds} denotes the same physical cell`, async () => {
            await withDescriptor(des => {
                des.level_init({style:'solidfill',fg:' ',lit:0});
                des.terrain(10,10,'.');
                const build = kind => kind === 'r' ? selection_area(10,10,10,10) : selection_match('.',game);
                const a = build(kinds[0]), b = build(kinds[1]);
                assert.equal(a.numpoints(),1); assert.equal(b.numpoints(),1);
                for (const operand of [a,b]) {
                    des.terrain(operand,'-');
                    assert.deepEqual(painted(HWALL),[[11,10]],'independent operand consumption');
                    des.terrain(operand,'.');
                }
                des.terrain(fn(a,b),'-');
                assert.deepEqual(painted(HWALL),expected.composition[op]);
            });
        });
    }
}
for (const row of expected.negation) {
    test(`selection ${row.operation} at ${row.origin} has C iterator footprint`, async () => {
        await withDescriptor(des => {
            const [x,y] = row.origin;
            des.level_init({style:'solidfill',fg:'.',lit:0});
            des.map({x,y,map:'...\n...\n...'});
            const operand = selection_area(0,0,0,0);
            des.terrain(operand,'-');
            assert.deepEqual(painted(HWALL),[[x,y]],'constructor consumed before target');
            const result = row.operation === 'empty' ? selection_negate()
                : row.operation === 'single' ? operand : operand.negate();
            des.terrain(result,'#');
            const actual = [];
            for (let yy=0; yy<21; yy++) {
                let line = '';
                for (let xx=1; xx<80; xx++) line += game.level.at(xx,yy).typ === CORR ? '#' : '.';
                actual.push(line);
            }
            assert.deepEqual(actual,row.rows);
        });
    });
}

// Preserved native recorder outputs from the four descriptor lifetime recipes.
// Reference captured before this fix; no new C run is claimed.
const lifetime = JSON.parse(readFileSync(new URL('./test-fixtures/recovery-selection-lifetime/expected.json', import.meta.url)));
for (const row of lifetime) {
    test(`selection lifetime ${row.name} retains its construction location`, async () => {
        await withDescriptor(des => {
            des.level_init({style:'solidfill',fg:' ',lit:0});
            des.map({x:10,y:6,map:'.x'});
            const a = selection_area(0,0,0,0);
            des.map({x:row.x,y:row.y,map:'#x'});
            const b = selection_match('#',game);
            des.terrain((row.op === 'or' ? l_selection_or : l_selection_sub)(a,b),'-');
            assert.deepEqual(painted(HWALL),row.expected);
        });
    });
}

test('saved relative selections and their copies paint at creation origin after a map change', async () => {
    await withDescriptor(des => {
        des.level_init({style:'solidfill',fg:' ',lit:0});
        des.map({x:10,y:6,map:'.x'});
        const a = selection_area(0,0,0,0);
        const copies = [a,a.clone(),a.percentage(100,() => 0)];
        des.map({x:20,y:8,map:'#x'});
        for (const copy of copies) {
            des.terrain(copy,'-');
            assert.deepEqual(painted(HWALL),[[10,6]]);
            des.terrain(copy,'.');
        }
        // Two relative selections with different saved frames must also mix
        // as map coordinates, even though both retain the same boolean marker.
        const b = selection_area(0,0,0,0);
        des.terrain(l_selection_or(a,b),'-');
        assert.deepEqual(painted(HWALL),[[10,6],[20,8]]);
    });
});

test('stored origins are copied and numeric values survive frame conversion', () => {
    const origin = {xstart:10,ystart:6};
    const a = new ThemeroomSelection(null,false,origin);
    a.set(0,0,0b1010);
    origin.xstart = 20;
    const copy = a.clone();
    const absolute = selection_map_frame(copy);
    assert.equal(absolute.points[6*80+10]-1,0b1010);
    assert.equal(absolute.get(20,6),false);
    assert.equal(copy.origin.xstart,10);
});

test('setpoint on a saved selection admits a map point before its old frame', async () => {
    await withDescriptor(des => {
        des.level_init({style:'solidfill',fg:' ',lit:0});
        des.map({x:20,y:8,map:'.x'});
        const saved = selection_area(0,0,0,0);
        des.map({x:10,y:6,map:'#x'});
        l_selection_setpoint([saved,0,0],{
            frame:{xstart:10,ystart:6,xsize:2,ysize:1},
            coder:{croom:null},state:game,
        });
        des.terrain(saved,'-');
        assert.deepEqual(painted(HWALL),[[10,6],[20,8]]);
    });
});
