import assert from 'node:assert/strict';
import {runSegment} from '../../../js/jsmain.js';
import {game} from '../../../js/gstate.js';
import {GameMap} from '../../../js/game.js';
import {ROOM, TELEP_TRAP, MM_NOMSG} from '../../../js/const.js';
import {PM_GOBLIN,PM_SEWER_RAT,PM_FLOATING_EYE} from '../../../js/monsters.js';
import {makemon_runtime} from '../../../js/makemon_create.js';
import {maketrap} from '../../../js/trap.js';
import {m_at} from '../../../js/monst.js';
import {preflight_dotrap} from '../../../js/trap_effects.js';
import {tele_trap} from '../../../js/teleport.js';
import {vision_reset,vision_recalc} from '../../../js/vision.js';
import {clearTtyMessageWindow} from '../../../js/tty_message.js';
for(const kind of [PM_GOBLIN,PM_SEWER_RAT,PM_FLOATING_EYE,null])for(const crowded of [false,true]){
 await runSegment({seed:620417,datetime:'20320405060710',nethackrc:'OPTIONS=name:Occupancy,role:Healer,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!autopickup\n',moves:''});
 game.level=new GameMap();game.u.ux=5;game.u.uy=7;game.u.urooms=[];game.u.ushops=[];
 if(!crowded)for(let x=3;x<=17;x++)for(let y=3;y<=12;y++)Object.assign(game.level.at(x,y),{typ:ROOM,lit:true});
 for(const [x,y]of [[5,7],[12,7]])Object.assign(game.level.at(x,y),{typ:ROOM,lit:true});
 const trap=maketrap(5,7,TELEP_TRAP,{state:game});trap.once=false;trap.teledest={x:12,y:7};
 const monster=kind===null?null:await makemon_runtime(game.mons[kind],12,7,MM_NOMSG,{state:game});
 if(kind!==null){assert.ok(monster);assert.equal(m_at(12,7,game),monster);}
 vision_reset(game);vision_recalc(0);clearTtyMessageWindow(game);
 for(let i=0;i<16;i++)game.nhDisplay.pushKey(32);
 let refusal=null;try{preflight_dotrap(trap,game);}catch(e){refusal=e.message;}
 await tele_trap(trap,game);
 const moved=game.u.ux===12&&game.u.uy===7;
 assert.equal(moved,!monster||!crowded);
 if(monster&&!crowded){assert.equal(m_at(12,7,game),null);assert.equal(m_at(monster.mx,monster.my,game),monster);}
 if(monster&&crowded)assert.equal(m_at(12,7,game),monster);
 console.log(JSON.stringify({kind,crowded,refusal,hero:[game.u.ux,game.u.uy],monster:monster?[monster.mx,monster.my]:null}));
}
