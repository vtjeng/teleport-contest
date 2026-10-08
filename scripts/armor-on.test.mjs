import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {_doWearInternals} from '../js/do_wear.js';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {getRngLog} from '../js/rng.js';
import {BLINDED,HALLUC_RES,OBJ_INVENT,TIMEOUT,W_ARM} from '../js/const.js';
import {ARMOR_CLASS,GOLD_DRAGON_SCALE_MAIL,GOLD_DRAGON_SCALES} from '../js/objects.js';
import {begin_burn} from '../js/timeout.js';

const {Armor_on}= _doWearInternals;
// Independent Caveman character exercises the allmain.c:73 startup suit
// callback; the empty input then leaves a real initialized light/timer state.
const INPUT={seed:1473005,datetime:'20920718141516',moves:'',
    nethackrc:'OPTIONS=name:GoldArmor,role:Caveman,race:human,gender:male,align:neutral,playmode:debug\nOPTIONS=!legacy,!tutorial,!splash_screen,!verbose,!tips,!acoustics,!autopickup,!debug_mongen,pettype:none\n'};
async function setup(otyp,extra={}){
    await runSegment(INPUT,{onBoundary:error=>{throw error;}});
    const obj={otyp,oclass:ARMOR_CLASS,where:OBJ_INVENT,owornmask:W_ARM,
        quan:1,known:false,dknown:true,spe:0,age:0,lamplit:false,
        blessed:false,cursed:false,...extra};
    game.uarm=obj;game.invent=obj;
    game.program_state.in_moveloop=1; // The C dressing callback runs inside moveloop.
    return obj;
}
// light.c:881–911 gives mail one more radius than scales; its description
// switch:916–928 maps 4/3/2/1 to radiantly/brilliantly/brightly/dimly.
for(const [otyp,kind,bonus] of [[GOLD_DRAGON_SCALE_MAIL,'gold dragon scale mail',1],
    [GOLD_DRAGON_SCALES,'set of gold dragon scales',0]]){
    for(const [buc,base,description] of [['blessed',3,bonus?'radiantly':'brilliantly'],
        ['uncursed',2,bonus?'brilliantly':'brightly'],['cursed',1,bonus?'brightly':'dimly']]){
        test(`Armor_on lights ${buc} ${kind} after knowledge and dragon effects`,async()=>{
            const obj=await setup(otyp,{blessed:buc==='blessed',cursed:buc==='cursed'});
            const events=[];
            const env={hooks:{updateInventory:()=>events.push({known:obj.known,lit:obj.lamplit,resistance:game.u.uprops[HALLUC_RES].extrinsic&W_ARM})},
                message:async text=>{assert.ok(game.gl.light_base?.id===obj,
                    'begin_burn registered its light before pline');events.push(text);}};
            const timers=game.gt.timer_base;
            const rng=getRngLog().length;
            assert.equal(await Armor_on(game,env),0);
            assert.equal(obj.known,true);assert.equal(obj.lamplit,true);
            assert.equal(obj.age,0,'artifact light uses no fuel');
            assert.equal(game.gt.timer_base,timers,'gold armor uses no burn timer');
            assert.equal(game.gl.light_base.id,obj);
            assert.equal(game.gl.light_base.range,base+bonus);
            assert.deepEqual(events,[{known:true,lit:false,resistance:0},{known:true,lit:true,resistance:W_ARM},
                `Your ${kind} begins to shine ${description}!`]);
            assert.equal(getRngLog().length,rng,'the source light tail makes no RNG call');
        });
    }
}

test('Armor_on lights blind armor without a shine message',async()=>{
    const obj=await setup(GOLD_DRAGON_SCALE_MAIL);
    game.u.uprops[BLINDED].intrinsic=TIMEOUT; // Nonzero C Blind timeout.
    const messages=[];
    assert.equal(await Armor_on(game,{message:async text=>messages.push(text)}),0);
    assert.equal(obj.lamplit,true);assert.deepEqual(messages,[]);
});

test('Armor_on skips an already lit known suit without duplicate light or feedback',async()=>{
    const obj=await setup(GOLD_DRAGON_SCALES,{known:true});
    begin_burn(obj,false,{state:game}); // Existing owner establishes the lit source.
    const source=game.gl.light_base;const events=[];
    assert.equal(await Armor_on(game,{hooks:{updateInventory:()=>events.push('inventory')},
        message:async text=>events.push(text)}),0);
    assert.equal(game.gl.light_base,source);assert.deepEqual(events,[]);
});

test('Armor_on handles the source null slot and silent planning environment',async()=>{
    await setup(GOLD_DRAGON_SCALE_MAIL);game.uarm=null;
    assert.equal(await Armor_on(game),0); // C do_wear.c:889–890 defensive return.
    const obj=await setup(GOLD_DRAGON_SCALE_MAIL);
    const tty=game._ttyToplines;
    assert.equal(await Armor_on(game,{planning:true}),0);
    assert.equal(obj.lamplit,true);assert.equal(game._ttyToplines,tty);
});

test('Armor_on and wearing admission preserve the full C callback order',()=>{
    const c=readFileSync(new URL('../nethack-c/upstream/src/do_wear.c',import.meta.url),'utf8');
    const js=readFileSync(new URL('../js/do_wear.js',import.meta.url),'utf8');
    const cb=c.slice(c.indexOf('Armor_on(void)\n{'),c.indexOf('\nint\nArmor_off(void)'));
    assert.match(cb,/uarm->known = 1;[\s\S]*update_inventory\(\);[\s\S]*dragon_armor_handling\(uarm, TRUE, TRUE\);[\s\S]*begin_burn\(uarm, FALSE\);[\s\S]*if \(!Blind\)/u);
    const jb=js.slice(js.indexOf('async function Armor_on('),js.indexOf('// C ref: do_wear.c Armor_off'));
    assert.doesNotMatch(jb,/UnsupportedWearError/u);
    let offset=0;for(const marker of ['state.uarm.known = true','update_inventory','await dragon_armor_handling','begin_burn','heroIsBlind','Yname2','otense','arti_light_description']){
        const next=jb.indexOf(marker,offset);assert.ok(next>=offset,marker);offset=next+marker.length;
    }
    assert.doesNotMatch(js,/Armor_on\(\) for otyp/u,'gold suit reaches the production callback selector');
});
