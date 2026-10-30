import {setup} from '../post53-followons-20261030/native-shop-setup.mjs';
import {game} from '../../../js/gstate.js';
import {hot_pursuit,shk_move} from '../../../js/shk.js';
import {newcham,accept_newcham_form} from '../../../js/mon.js';
import {PM_SNAKE,PM_WOOD_NYMPH} from '../../../js/monsters.js';
import {pluslvl} from '../../../js/exper.js';
import {rloc_to} from '../../../js/teleport.js';
import {do_improvisation} from '../../../js/music.js';
import {mksobj} from '../../../js/obj.js';
import {addinv} from '../../../js/invent.js';
import {WOODEN_FLUTE,WOODEN_HARP} from '../../../js/objects.js';
import {vision_recalc} from '../../../js/vision.js';
for(const [form,near] of [[null,true],[PM_SNAKE,true],[PM_WOOD_NYMPH,true],[PM_SNAKE,false]]) {
 const keeper=await setup(false),messages=[];
 const message=async s=>messages.push(s);
 for(let i=0;i<100;i++)game.nhDisplay.pushKey(32);
 while(game.u.ulevel<(near?26:20))await pluslvl(false,game,{message});
 hot_pursuit(keeper,game);
 const before={peaceful:keeper.mpeaceful,following:keeper.mextra.eshk.following};
 let changed=null;
 if(form!==null){if(!accept_newcham_form(keeper,form,game))throw Error('illegal form');changed=await newcham(keeper,game.mons[form],{state:game,message});}
 // Both positions remain inside the keeper's home shop. No offhome departure.
 await rloc_to(keeper,near?9:3,near?8:3,{state:game});
 vision_recalc(0);
 const instr=addinv(mksobj(form===PM_WOOD_NYMPH?WOODEN_HARP:WOODEN_FLUTE,false,false,{state:game}),{state:game});
 await do_improvisation(instr,game,{message});
 const after={level:game.u.ulevel,distance:(keeper.mx-game.u.ux)**2+(keeper.my-game.u.uy)**2,peaceful:keeper.mpeaceful,following:keeper.mextra.eshk.following,isshk:keeper.isshk,form:keeper.data.pmidx,customer:keeper.mextra.eshk.customer,player:game.plname};
 let refusal=null;
 if(after.peaceful&&near)try{await shk_move(keeper,game,{message});}catch(e){refusal=e.message;}
 console.log(JSON.stringify({form,near,changed,before,after,refusal,messages:messages.slice(-5)}));
}
