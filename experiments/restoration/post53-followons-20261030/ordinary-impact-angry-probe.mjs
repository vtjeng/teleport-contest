import assert from 'node:assert/strict';
import {setup} from './native-shop-setup.mjs';
import {game} from '../../../js/gstate.js';
import {GOLD_PIECE, DAGGER} from '../../../js/objects.js';
import {ROOM, OBJ_MIGRATING} from '../../../js/const.js';
import {mksobj, place_object} from '../../../js/obj.js';
import {setmangry} from '../../../js/mon.js';
import {impact_drop} from '../../../js/dokick.js';
import {obj_extract_self} from '../../../js/invent.js';
import {objectGenerationEnv} from '../../../js/object_generation.js';
import {vision_reset, vision_recalc} from '../../../js/vision.js';
for (const type of [GOLD_PIECE, DAGGER]) for (const outside of [true,false]) for(const angry of [false,true]) {
 const keeper=await setup(false);
 const y=8;
 const x=10;
 for(let stock=game.level.objects[x]?.[y];stock;stock=game.level.objects[x]?.[y]){
  assert.equal(Boolean(stock.globby),false);
  obj_extract_self(stock,objectGenerationEnv({state:game}));place_object(stock,12,9,{state:game});
 }
 game.u.ux=x;game.u.uy=y;
 game.stairs={sx:x,sy:y,up:false,isladder:false,tolev:{dnum:0,dlevel:2},next:null};
 if(outside){
  for(let xx=14;xx<=16;xx++)Object.assign(game.level.at(xx,y),{typ:ROOM,lit:true});
  game.u.ux=15;game.u.uy=y;game.u.urooms=[];game.u.ushops=[];
 }
 vision_reset(game);vision_recalc(0);
 const obj=mksobj(type,false,false,{state:game});
 if(type===GOLD_PIECE)obj.quan=9;
 place_object(obj,x,y,{state:game});
 if(angry)await setmangry(keeper,false,{state:game,message:async()=>{}});
 const before={robbed:keeper.mextra.eshk.robbed,debit:keeper.mextra.eshk.debit,following:keeper.mextra.eshk.following};
 const messages=[],bounds=[];
 await impact_drop(null,x,y,0,{state:game,random:{rn2:n=>{bounds.push(n);return 0;}},message:async text=>messages.push(text)});
 assert.equal(obj.where,OBJ_MIGRATING);
 assert.equal(game.gm.migrating_objs,obj);
 const after={robbed:keeper.mextra.eshk.robbed,debit:keeper.mextra.eshk.debit,following:keeper.mextra.eshk.following,peaceful:keeper.mpeaceful,customer:keeper.mextra.eshk.customer};
 assert.ok(outside||angry?after.robbed>before.robbed:after.debit>before.debit);
 console.log(JSON.stringify({type,outside,angry,before,after,bounds,messages,expectedFollowing:outside||angry,missing:(outside||angry)&&!after.following}));
}
