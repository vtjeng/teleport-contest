import {cOracle} from './c-oracle.mjs';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {game} from '../../../../js/gstate.js';
import {runSegment} from '../../../../js/jsmain.js';
import {newMonster, place_monster, m_at} from '../../../../js/monst.js';
import {accessible} from '../../../../js/monmove.js';
import {cansee} from '../../../../js/vision.js';
import {mattackm} from '../../../../js/mhitm.js';
import {NON_PM, PM_HILL_ORC, PM_FLOATING_EYE} from '../../../../js/monsters.js';
import {W_AMUL} from '../../../../js/const.js';
import {AMULET_OF_REFLECTION} from '../../../../js/objects.js';
import {mksobj} from '../../../../js/obj.js';
import {add_to_minv} from '../../../../js/invent.js';
import {christen_monst} from '../../../../js/do_name.js';
import {mon_wield_item} from '../../../../js/weapon.js';
import {m_dowear} from '../../../../js/worn.js';
import {map_invisible} from '../../../../js/display.js';
const DATETIME = '20261028120000';
const RC = [
    'OPTIONS=name:Lich,role:Valkyrie,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none',
    '',
].join('\n');

async function hero(seed = 7710048) {
    await runSegment({ seed, datetime: DATETIME, nethackrc: RC, moves: '' });
    return game;
}

let nextFixtureId = 500;

// A monster shaped the way makemon() leaves one, placed on a chosen square.
function fixture(pmidx, x, y, overrides = {}) {
    const species = game.mons[pmidx];
    const mon = newMonster({
        cham: NON_PM,
        data: species,
        m_id: ++nextFixtureId,
        m_lev: species.mlevel,
        mcanmove: 1,
        mcansee: 1,
        mhp: 1,
        mhpmax: 1,
        mx: x,
        my: y,
        ...overrides,
    });
    place_monster(mon, x, y, game);
    mon.mhp = overrides.mhp ?? 8;
    mon.mhpmax = overrides.mhpmax ?? mon.mhp;
    mon.nmon = game.level.monlist;
    game.level.monlist = mon;
    return mon;
}

// Two free squares the hero can see, `gap` apart along the row they share.
// mhitm.c mattackm():362-364 makes gv.vis from cansee() and canspotmon(), and
// every message below it is behind that flag, so a fixture on an unlit square
// would be testing noises() instead.
function battlefield(gap = 1) {
    const free = (x, y) => accessible(x, y, game) && !m_at(x, y, game)
        && cansee(x, y, game);
    for (let dy = 0; dy <= 4; ++dy) {
        for (const y of [game.u.uy + dy, game.u.uy - dy]) {
            for (let dx = -10; dx <= 10; ++dx) {
                const ax = game.u.ux + dx;
                if (!free(ax, y) || !free(ax + gap, y)
                    || !free(ax + gap, y + 1)) continue;
                return { ax, dx: ax + gap, y };
            }
        }
    }
    throw new Error('no clear pair of visible squares near the hero');
}

// A random source that records the bound of every call and answers from a
// scripted list, so a test can put a specific roll where it wants one.
function scripted(rolls = [], fallback = 1) {
    const bounds = [];
    const queue = [...rolls];
    const take = (label) => {
        bounds.push(label);
        return queue.length ? queue.shift() : fallback;
    };
    return {
        bounds,
        lines: [],
        random: {
            d: (n, x) => Math.max(n, take(`d(${n},${x})`)),
            rn1: (x, from) => take(`rn1(${x},${from})`) + from,
            rnl: (b) => take(`rnl(${b})`),
            rn2: (b) => take(`rn2(${b})`),
            rnd: (b) => take(`rnd(${b})`),
            rne: (b) => take(`rne(${b})`),
            rnz: (b) => take(`rnz(${b})`),
        },
    };
}

function attackEnv(rolls = [], fallback = 1) {
    const recorder = scripted(rolls, fallback);
    const redraws = [];
    const marks = [];
    return {
        bounds: recorder.bounds,
        lines: recorder.lines,
        random: recorder.random,
        redraws,
        marks,
        state: game,
        message: async (text) => { recorder.lines.push(text); },
        // The live binding, as js/unported_monster_actions.js supplies it,
        // with the squares recorded so a test can tell a mark from a repaint.
        markInvisible: (x, y) => { marks.push([x, y]); map_invisible(x, y); },
        redraw: (x, y) => { redraws.push([x, y]); },
        unsupported: (reason) => { throw new Error(reason); },
    };
}

// Aim gb.bhitpos at the defender, as dogmove.c dog_move():1149-1150 does
// before every call.
function aim(defender) {
    game.gb ??= {};
    game.gb.bhitpos = { x: defender.mx, y: defender.my };
    game.gn ??= {};
    game.gn.notonhead = false;
}


test('C call-site retains percent escaping before its variadic reflection message',()=>{
 const c=readFileSync(new URL('../../../../nethack-c/upstream/src/mhitm.c',import.meta.url),'utf8');
 assert.ok(c.includes('strNsubst(buf, "%", "%%", 0)'));
 const js=readFileSync(new URL('../../../../js/mhitm.js',import.meta.url),'utf8');
 assert.ok(js.includes(".replaceAll('%', '%%')"));
});
for (const reflecting of [true, false]) {
 test(`floating eye percent name, reflection=${reflecting}`, async () => {
  await hero(7710060);
  const {ax,dx,y}=battlefield(1);
  const attacker=fixture(PM_HILL_ORC,ax,y,{mhp:8,mhpmax:8});
  const eye=fixture(PM_FLOATING_EYE,dx,y,{mhp:8,mhpmax:8});
  christen_monst(eye,'Eye%s%',{state:game});
  if(reflecting){
   const amulet=mksobj(AMULET_OF_REFLECTION,false,false,{state:game});
   add_to_minv(attacker,amulet,{state:game});
   m_dowear(attacker,true,{state:game});
   assert.equal(amulet.owornmask,W_AMUL);
  }
  aim(eye);
  const env=attackEnv([1,1,1,1,1,1,1]);
  env.wieldMonsterItemAgainstMonster = mon => mon_wield_item(mon,env);
  const result=await mattackm(attacker,eye,env);
  console.log(JSON.stringify({reflecting,result,lines:env.lines,bounds:env.bounds,mcanmove:attacker.mcanmove,mfrozen:attacker.mfrozen}));
  assert.equal(Boolean(attacker.mcanmove),reflecting);
  assert.equal(result,1);
  assert.equal(eye.mhp,7);
  assert.deepEqual(env.lines,["The hill orc hits Eye%s%.",reflecting
    ? cOracle('Eye%s%') : "The hill orc is frozen by Eye%s%'s gaze!"]);
  assert.deepEqual(env.bounds,['rnd(20)','d(1,6)','rn2(3)','rn2(6)',
    'd(3,70)','rn2(3)','rn2(4)',...(reflecting?['rn2(19)']:[])]);
  assert.equal(attacker.mfrozen,reflecting?0:3);
 });
}
