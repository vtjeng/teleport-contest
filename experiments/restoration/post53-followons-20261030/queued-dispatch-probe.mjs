import assert from 'node:assert/strict';
import {runSegment} from '../../../js/jsmain.js';
import {game} from '../../../js/gstate.js';
import {cmdq_add_ec,cmdq_peek,rhack} from '../../../js/cmd.js';
import {extcmdlist} from '../../../js/extcmdlist_data.js';
import {CQ_CANNED} from '../../../js/const.js';
for(const handler of ['doclicklook','donull']){
 await runSegment({seed:620417,datetime:'20320405060710',nethackrc:'OPTIONS=name:Dispatch,role:Healer,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen\n',moves:''});
 const row=extcmdlist.find(e=>e.ef_funct===handler);assert.ok(row);
 const initial=game.moves;
 cmdq_add_ec(CQ_CANNED,row,game);
 let error=null;try{await rhack(0,game);}catch(e){error=e.message;}
 console.log(JSON.stringify({handler,row:row.ef_txt,error,queueEmpty:cmdq_peek(CQ_CANNED,game)===null,moves:game.moves,initial,coordinate:game.clicklook_cc??null}));
}
