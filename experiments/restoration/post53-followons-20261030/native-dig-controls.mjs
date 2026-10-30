import assert from 'node:assert/strict';
import {setup} from './native-shop-setup.mjs';
import {game} from '../../../js/gstate.js';
import {mksobj} from '../../../js/obj.js';
import {addinv} from '../../../js/invent.js';
import {PICK_AXE} from '../../../js/objects.js';
import {setuwep} from '../../../js/wield.js';
import {use_pick_axe2,dig,is_digging} from '../../../js/dig.js';
import {shk_move} from '../../../js/shk.js';
import {clearTtyMessageWindow} from '../../../js/tty_message.js';
for(const late of [false,true])for(const planning of [false,true])for(const adapter of [false,true]){
const keeper=await setup(false);
clearTtyMessageWindow(game);
for(let i=0;i<100;i++)game.nhDisplay.pushKey(32);
const pick=addinv(mksobj(PICK_AXE,false,false,{state:game}),{state:game});
await setuwep(pick,{state:game});
game.u.dx=0;game.u.dy=0;game.u.dz=1;
const env={state:game,message:async()=>{}};
await use_pick_axe2(pick,game,env);
assert.equal(is_digging(game),true);
assert.equal(game.context.digging.effort,0);
const history=[];
for(let i=0;i<35;i++){
 const result=await dig(game,env);
 const effort=game.context.digging.effort;
 history.push({result,effort,active:is_digging(game)});
 if(effort>=(late?130:1)&&effort<=250){
  const before=[keeper.mx,keeper.my];
  const expectedTime=Math.trunc((250-effort)/20);
  const moved=await shk_move(keeper,game,{planning,...(adapter?{holeTime:()=>expectedTime}:{})});
  console.log(JSON.stringify({late,planning,adapter,history,expectedTime,before,after:[keeper.mx,keeper.my],moved}));
  break;
 }
 if(!result)await use_pick_axe2(pick,game,env);
 if(i===34)throw Error('bounded native digging progression did not reach 100');
}

}
