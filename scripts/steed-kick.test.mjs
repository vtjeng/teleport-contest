import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {newMonster} from '../js/monst.js';
import {PM_PONY} from '../js/monsters.js';
import {kick_steed} from '../js/steed.js';
import {clearTtyMessageWindow} from '../js/tty_message.js';
import {enableRngLog, getRngLog, initRng} from '../js/rng.js';

const c=readFileSync(new URL('../nethack-c/upstream/src/steed.c',import.meta.url),'utf8');
const source=c.slice(c.indexOf('kick_steed(void)'),c.indexOf('staticfn boolean\nlanding_spot'));
const js=readFileSync(new URL('../js/steed.js',import.meta.url),'utf8');
const body=js.slice(js.indexOf('export async function kick_steed'),js.indexOf('// C ref: steed.c landing_spot'));

test('kick_steed follows C helpless, tameness, resistance and gallop order',()=>{
    assert.match(source,/helpless\(u\.usteed\)[\s\S]*mcanmove \|\| u\.usteed->mfrozen\) && !rn2\(2\)/u);
    assert.match(source,/mtame--[\s\S]*m_unleash[\s\S]*rnd\(MAXULEV \/ 2 \+ 5\)[\s\S]*newsym[\s\S]*dismount_steed\(DISMOUNT_THROWN\)[\s\S]*ugallop \+= rn1\(20, 30\)/u);
    assert.match(body,/--steed\.mtame[\s\S]*note_unported\('apply.c m_unleash'\)[\s\S]*rnd\(MAXULEV \/ 2 \+ 5\)[\s\S]*newsym[\s\S]*note_unported\('steed.c dismount_steed'\)[\s\S]*ugallop \+= rn1\(20, 30\)/u);
    const apply=readFileSync(new URL('../js/apply.js',import.meta.url),'utf8');
    assert.match(apply,/You whip \$\{mon_nam\(u\.usteed, state\)\}![\s\S]*await kick_steed\(state\);/u);
    assert.doesNotMatch(apply,/note_unported\('steed.c kick_steed'\)/u);
});

async function steedState(fields,seed=4) {
    // Independent startup supplies real property/name/display owners. The
    // focused fixtures then pin C's helpless-state boundaries without a recorder.
    await runSegment({seed:1462931,datetime:'20910617121314',
        nethackrc:'OPTIONS=name:SteedState,role:Knight,race:human,gender:male,align:lawful\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none\n',moves:''});
    const steed=newMonster({data:game.mons[PM_PONY],mnum:PM_PONY,
        mx:game.u.ux,my:game.u.uy,mcanmove:1,msleeping:0,mfrozen:0,mtame:10,...fields});
    game.u.usteed=steed;
    game.u.ugallop=0;
    clearTtyMessageWindow(game);
    // Seed4's first rn2(2) is0; seed1's is1. These cover both source outcomes.
    initRng(seed);enableRngLog();
    return steed;
}
for(const frozen of [1,2,3]) {
    test(`kick reduces frozen duration ${frozen} at the C two-turn boundary`,async()=>{
        const steed=await steedState({mcanmove:0,mfrozen:frozen});
        await kick_steed(game);
        assert.deepEqual(getRngLog(),['rn2(2)=0']);
        assert.equal(steed.mfrozen,frozen>2?frozen-2:0);
        assert.equal(steed.mcanmove,frozen>2?0:1);
        assert.equal(steed.mtame,10,'helpless branch returns before tameness loss');
        assert.equal(game.u.ugallop,0);
        assert.match(game._ttyToplines,frozen>2?/stirs\.$/u:/rouses itself!$/u);
    });
}
test('sleeping mobile steed wakes without decrementing tameness',async()=>{
    const steed=await steedState({msleeping:1});
    await kick_steed(game);
    assert.equal(steed.msleeping,0);
    assert.equal(steed.mtame,10);
    assert.deepEqual(getRngLog(),['rn2(2)=0']);
    assert.match(game._ttyToplines,/rouses itself!$/u);
});
test('helpless random refusal preserves state; permanent immobility skips RNG',async()=>{
    for(const [fields,expected] of [[{msleeping:1},['rn2(2)=1']],
        [{mcanmove:0,mfrozen:0},[]]]) {
        const steed=await steedState(fields,1);
        const before={msleeping:steed.msleeping,mcanmove:steed.mcanmove,mfrozen:steed.mfrozen};
        await kick_steed(game);
        assert.deepEqual(getRngLog(),expected);
        for(const [key,value] of Object.entries(before))assert.equal(steed[key],value);
        assert.match(game._ttyToplines,/does not respond\.$/u);
    }
});
test('tameness zero skips resistance RNG and preserves named discarded gaps',async()=>{
    const steed=await steedState({mtame:1,mleashed:1});
    game.unported=new Set();
    await kick_steed(game);
    assert.equal(steed.mtame,0);
    assert.deepEqual(getRngLog(),[]);
    assert.ok(game.unported.has('apply.c m_unleash'));
    assert.ok(game.unported.has('steed.c dismount_steed'));
});
test('level20 guarantees galloping but still consumes resistance then range RNG',async()=>{
    const steed=await steedState({mtame:10});
    game.u.ulevel=20; // C rnd(MAXULEV/2+5) has maximum20.
    await kick_steed(game);
    assert.equal(steed.mtame,9);
    assert.match(getRngLog()[0],/^rnd\(20\)=/u);
    assert.match(getRngLog()[1],/^rn2\(20\)=/u);
    assert.equal(getRngLog().length,2);
    assert.ok(game.u.ugallop>=30&&game.u.ugallop<=49,'source rn1 bounds');
    assert.match(game._ttyToplines,/gallops!$/u);
});
test('missing steed returns without output, state changes or RNG',async()=>{
    await steedState({});game.u.usteed=null;
    const before=game._ttyToplines;
    await kick_steed(game);
    assert.deepEqual(getRngLog(),[]);
    assert.equal(game._ttyToplines,before);
});
