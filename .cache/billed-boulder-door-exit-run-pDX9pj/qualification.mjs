import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {NethackGame} from '../../js/jsmain.js';
import {GameDisplay} from '../../js/game_display.js';
import {game} from '../../js/gstate.js';
import {getRngLog} from '../../js/rng.js';
import {SHOPBASE, DOOR, ROOM, CORR, D_CLOSED, D_LOCKED, D_TRAPPED, ROOMOFFSET, DO_MOVE, MV_WALK, DIR_W, DIR_N, DIR_E, DIR_S, TELEDS_TELEPORT, OBJ_FLOOR, TOPLINE_NEED_MORE} from '../../js/const.js';
import {BOULDER} from '../../js/objects.js';
import {objectGenerationEnv} from '../../js/object_generation.js';
import {do_mkroom} from '../../js/mkroom.js';
import {fill_special_room} from '../../js/mklev.js';
import {shop_keeper, inside_shop, addtobill, find_objowner, costly_spot, onshopbill} from '../../js/shk.js';
import {rloc_to, teleds} from '../../js/teleport.js';
import {mksobj_at} from '../../js/obj.js';
import {test_move} from '../../js/hack.js';
import {set_move_cmd} from '../../js/cmd.js';
import {m_at} from '../../js/monst.js';
import {t_at} from '../../js/trap.js';
import {in_rooms} from '../../js/rooms.js';
import {isok} from '../../js/cmd_isok.js';

const fixedInput = {seed:2026101801, datetime:'20261018120000', nethackrc:'OPTIONS=name:ShopFireFixture,role:Archeologist,race:human,gender:male,align:lawful\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,!autopickup\n', moves:''};
const taskDir = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(taskDir, 'receipt.json');
const beforeTargetFile = resolve(taskDir, 'before-target.json');
const afterTargetFile = resolve(taskDir, 'after-target.json');
mkdirSync(taskDir, {recursive: true});
const receipt = {schema:'billed-boulder-door-exit-qualification/v1', phase:'pre-start', fixedInput, expectedC:{path:'hack.c:dopush', condition:'unpaid boulder moved from shop-owned door square to a non-costly square outside the original owner shop; stolen_value removes bill and applies peaceful keeper accounting'}, result:'incomplete', targetInvocationCount:0, acknowledgements:[], errors:[]};
const jsonSafe = (value, seen = new WeakSet()) => {
 if (typeof value === 'bigint') return {type:'BigInt',value:String(value)};
 if (value instanceof Set) return {type:'Set',values:[...value].map(item=>jsonSafe(item,seen))};
 if (Array.isArray(value)) return value.map(item=>jsonSafe(item,seen));
 if (value && typeof value === 'object') { if (seen.has(value)) return '[Circular]'; seen.add(value); const out={}; for(const [k,v] of Object.entries(value)) out[k]=jsonSafe(v,seen); seen.delete(value); return out; }
 return value;
};
const writeSnapshot = (path, value) => writeFileSync(path, JSON.stringify(jsonSafe(value),null,2)+'\n');
const hash = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const objChain = (head) => {const a=[]; let p=head; let guard=0; while(p && guard++<1000){a.push(p);p=p.nexthere;} return a;};
const safe = (fn) => {try{return fn();}catch(e){return {error:String(e?.message??e)};}};
const display = new GameDisplay(null); const nh = new NethackGame(fixedInput); nh._pendingDisplay=display;
const previousOnEmptyQueue=display.onEmptyQueue;
display.onEmptyQueue=()=>{const screen=display.serialize(); if(!screen.includes('--More--') || display.toplin!==TOPLINE_NEED_MORE || receipt.acknowledgements.length>=16){receipt.unexpectedInput={toplin:display.toplin,screen,topMessage:display.topMessage??null,waitEpoch:display.waitEpoch,inputQueueLength:display.inputQueueLength}; throw new Error('unexpected input boundary');} receipt.acknowledgements.push({screen,toplin:display.toplin,topMessage:display.topMessage??null,waitEpoch:display.waitEpoch,inputQueueLength:display.inputQueueLength}); return 32;};
let state=null, phase='start';
try {
 receipt.started=await nh.start(); state=game; receipt.phase='canonical generated shop'; phase=receipt.phase;
 if(!receipt.started) throw Error('NethackGame.start returned false');
 do_mkroom(SHOPBASE,state);
 const room=state.level.rooms.find(r=>r && r.rtype>=SHOPBASE);
 if(!room) throw Error('first generated shop missing');
 await fill_special_room(room,{state});
 const roomIndex=state.level.rooms.indexOf(room), roomno=roomIndex+ROOMOFFSET;
 const keeper=shop_keeper(roomno,state); if(!keeper?.mextra?.eshk) throw Error('canonical shop keeper/ESHK missing');
 const eshk=keeper.mextra.eshk, home={x:eshk.shk.x,y:eshk.shk.y};
 if(room.doorct!==1) throw Error(`first shop door count ${room.doorct} != 1`);
 const door={...state.level.doors[room.fdoor]}; if(!door || !isok(door.x,door.y)) throw Error('first generated shop door missing/invalid');
 const delta={x:door.x-home.x,y:door.y-home.y};
 if(Math.abs(delta.x)+Math.abs(delta.y)!==1) throw Error('keeper actual home is not cardinally adjacent to first door');
 const exterior={x:door.x+delta.x,y:door.y+delta.y}; if(!isok(exterior.x,exterior.y)) throw Error('fixed exterior square out of bounds');
 const doorCell=state.level.at(door.x,door.y), outCell=state.level.at(exterior.x,exterior.y), homeCell=state.level.at(home.x,home.y);
 const roomContainsDoor=in_rooms(door.x,door.y,SHOPBASE,state), roomContainsExterior=in_rooms(exterior.x,exterior.y,SHOPBASE,state);
 if(doorCell.typ!==DOOR || (doorCell.doormask&(D_CLOSED|D_LOCKED|D_TRAPPED))) throw Error('fixed first door is not open, unlocked, and untrapped');
 if(![ROOM,CORR].includes(outCell.typ) || ![ROOM,CORR].includes(homeCell.typ)) throw Error('fixed home/door-exterior geometry is not ordinary floor');
 if(!roomContainsDoor.includes(roomno) || roomContainsExterior.includes(roomno) || costly_spot(exterior.x,exterior.y,state)) throw Error('original owner/destination shop exclusion invalid');
 if(inside_shop(home.x,home.y,state)!==roomno) throw Error('actual keeper home is not strictly inside generated shop');
 if(m_at(door.x,door.y,state)||m_at(exterior.x,exterior.y,state)||t_at(door.x,door.y,state)||t_at(exterior.x,exterior.y,state)) throw Error('door or destination actor/trap collision');
 const keeperTarget={x:room.lx+1,y:room.ly+1}, keeperCell=state.level.at(keeperTarget.x,keeperTarget.y);
 if(!isok(keeperTarget.x,keeperTarget.y)||![ROOM,CORR].includes(keeperCell.typ)||inside_shop(keeperTarget.x,keeperTarget.y,state)!==roomno||keeperCell.edge||keeperTarget.x===door.x&&keeperTarget.y===door.y||m_at(keeperTarget.x,keeperTarget.y,state)||t_at(keeperTarget.x,keeperTarget.y,state)) throw Error('fixed canonical keeper relocation cell invalid');
 receipt.room={index:roomIndex,roomno,rtype:room.rtype,bounds:{lx:room.lx,hx:room.hx,ly:room.ly,hy:room.hy},doorct:room.doorct,fdoor:room.fdoor,door,doorType:doorCell.typ,doorMask:doorCell.doormask??null,home,exterior,roomContainsDoor,roomContainsExterior,keeperTarget,keeper:{id:keeper.m_id??keeper.id??null,peaceful:keeper.mpeaceful,alive:keeper.mhp>0,inhishop:eshk.eshk_inshop??eshk.inshop??null,shoproom:eshk.shoproom??null,homeFromESHK:{x:eshk.shk.x,y:eshk.shk.y}},initialHero:{x:state.u.ux,y:state.u.uy},rngDrawsBefore: getRngLog().length};
 await rloc_to(keeper,keeperTarget.x,keeperTarget.y);
 if(keeper.mx!==keeperTarget.x||keeper.my!==keeperTarget.y||keeper.mhp<=0||!keeper.mpeaceful||keeper.mextra?.eshk!==eshk) throw Error('keeper canonical relocation failed or changed peaceful/resident state');
 await teleds(home.x,home.y,TELEDS_TELEPORT,state);
 if(state.u.ux!==home.x||state.u.uy!==home.y||inside_shop(state.u.ux,state.u.uy,state)!==roomno||!in_rooms(state.u.ux,state.u.uy,SHOPBASE,state).includes(roomno)) throw Error('hero canonical teleport did not preserve shop membership');
 if(m_at(home.x,home.y,state) || t_at(home.x,home.y,state)) throw Error('fixed home occupied/trapped after hero placement');
 const preObjects=objChain(state.level.objects?.[door.x]?.[door.y]);
 if(preObjects.some(o=>o.otyp===BOULDER)) throw Error('fixed door already has a boulder');
 receipt.phase='canonical billed boulder at fixed door'; phase=receipt.phase;
 const boulder=mksobj_at(BOULDER,door.x,door.y,true,false,objectGenerationEnv({state}));
 if(!boulder || boulder.ox!==door.x||boulder.oy!==door.y) throw Error('canonical floor boulder placement failed');
 await addtobill(boulder,false,false,true,state);
 const bill=eshk.bill_p??eshk.bill??[]; const billRows=()=>bill.slice(0,eshk.billct??0).map(r=>({bo_id:r.bo_id,bquan:r.bquan,price:r.price}));
 const preOwner=find_objowner(boulder,door.x,door.y,state);
 const billRow=billRows().find(r=>r.bo_id===boulder.o_id);
 if(!billRow || !boulder.unpaid || !onshopbill(boulder,keeper,true) || !preOwner) throw Error('canonical addtobill did not produce bill/unpaid/onshopbill/original owner');
 if(!keeper.mpeaceful || (eshk.credit??0)!==0 || (eshk.debit??0)!==0 || (eshk.robbed??0)!==0) throw Error('canonical starting account is not peaceful and zero-balance');
 const findSquare=(x,y)=>objChain(state.level.objects?.[x]?.[y]).map(o=>({id:o.o_id,otyp:o.otyp,ox:o.ox,oy:o.oy,where:o.where,unpaid:!!o.unpaid,onshopbill:onshopbill(o,keeper,true),quan:o.quan,no_charge:o.no_charge??0}));
 receipt.beforeMove={hero:{x:state.u.ux,y:state.u.uy,ushops:state.u.ushops,urooms:state.u.urooms},keeper:{id:keeper.m_id??keeper.id??null,x:keeper.mx,y:keeper.my,peaceful:keeper.mpeaceful,mhp:keeper.mhp,following:keeper.following??null,customer:eshk.customer??null,surcharge:eshk.surcharge??null,inhishop:eshk.eshk_inshop??eshk.inshop??null},boulder:{id:boulder.o_id,otyp:boulder.otyp,x:boulder.ox,y:boulder.oy,where:boulder.where,quan:boulder.quan,unpaid:!!boulder.unpaid,no_charge:boulder.no_charge??0,onshopbill:onshopbill(boulder,keeper,true)},billRows:billRows(),billct:eshk.billct,credit:eshk.credit??0,debit:eshk.debit??0,robbed:eshk.robbed??0,owner:{id:preOwner.m_id??preOwner.id??null,shoproom:preOwner.mextra?.eshk?.shoproom??null},doorObjects:findSquare(door.x,door.y),exteriorObjects:findSquare(exterior.x,exterior.y),doorTerrain:{typ:doorCell.typ,mask:doorCell.doormask??null},exteriorTerrain:{typ:outCell.typ,roomno:outCell.roomno,edge:!!outCell.edge},rngLogLength:getRngLog().length,screen:display.serialize(),topMessage:display.topMessage??null,toplin:display.toplin,waitEpoch:display.waitEpoch,inputQueueLength:display.inputQueueLength};
 const dir=delta.x===1?DIR_E:delta.x===-1?DIR_W:delta.y===1?DIR_S:DIR_N;
 set_move_cmd(dir,MV_WALK,state);
 receipt.phase='single actual test_move DO_MOVE'; phase=receipt.phase;
 receipt.targetInvocationCount=0; receipt.targetStatus='armed-before-call'; writeSnapshot(beforeTargetFile,receipt);
 receipt.targetInvocationCount=1; receipt.targetStatus='call-start-recorded'; writeSnapshot(beforeTargetFile,receipt);
 let targetFailure=null;
 try { receipt.testMoveReturned=await test_move(home.x,home.y,delta.x,delta.y,DO_MOVE,state); receipt.targetCall='fulfilled'; }
 catch(e) { targetFailure=e; receipt.targetCall='rejected'; receipt.targetError=String(e?.message??e); }
 try { writeSnapshot(afterTargetFile,{schema:receipt.schema,phase:receipt.phase,targetInvocationCount:receipt.targetInvocationCount,targetCall:receipt.targetCall,targetError:receipt.targetError??null,testMoveReturned:receipt.testMoveReturned??null,boulder:{id:boulder.o_id,otyp:boulder.otyp,x:boulder.ox,y:boulder.oy,where:boulder.where,unpaid:!!boulder.unpaid},keeperId:keeper.m_id??keeper.id??null,billRows:(eshk.bill_p??eshk.bill??[]).slice(0,eshk.billct??0).map(r=>({bo_id:r.bo_id,bquan:r.bquan,price:r.price})),hero:{x:state.u.ux,y:state.u.uy},billct:eshk.billct,credit:eshk.credit??0,debit:eshk.debit??0,robbed:eshk.robbed??0}); } catch(e) { receipt.afterTargetPrefixError=String(e?.message??e); }
 if(targetFailure) throw targetFailure;
 const moved=(boulder.ox===exterior.x&&boulder.oy===exterior.y);
 const afterOwner=find_objowner(boulder,door.x,door.y,state);
 const targetQualified=moved && receipt.testMoveReturned===true && boulder.o_id===receipt.beforeMove.boulder.id && boulder.otyp===BOULDER && boulder.where===OBJ_FLOOR && afterOwner && (afterOwner.m_id??afterOwner.id??null)===(preOwner.m_id??preOwner.id??null) && boulder.unpaid && onshopbill(boulder,keeper,true) && billRows().some(r=>r.bo_id===boulder.o_id) && (eshk.debit??0)===(receipt.beforeMove.debit??0);
 receipt.afterMove={hero:{x:state.u.ux,y:state.u.uy,ushops:state.u.ushops,urooms:state.u.urooms},boulder:{id:boulder.o_id,otyp:boulder.otyp,x:boulder.ox,y:boulder.oy,where:boulder.where,quan:boulder.quan,unpaid:!!boulder.unpaid,no_charge:boulder.no_charge??0,onshopbill:onshopbill(boulder,keeper,true)},billRows:billRows(),billct:eshk.billct,credit:eshk.credit??0,debit:eshk.debit??0,robbed:eshk.robbed??0,keeper:{id:keeper.m_id??keeper.id??null,x:keeper.mx,y:keeper.my,peaceful:keeper.mpeaceful,mhp:keeper.mhp,following:keeper.following??null,customer:eshk.customer??null,surcharge:eshk.surcharge??null,inhishop:eshk.eshk_inshop??eshk.inshop??null},ownerAtOriginal:find_objowner(boulder,door.x,door.y,state)?.m_id??find_objowner(boulder,door.x,door.y,state)?.id??null,doorObjects:findSquare(door.x,door.y),exteriorObjects:findSquare(exterior.x,exterior.y),screen:display.serialize(),topMessage:display.topMessage??null,toplin:display.toplin,waitEpoch:display.waitEpoch,inputQueueLength:display.inputQueueLength,rngLogLength:getRngLog().length};
 receipt.result=targetQualified?'target-reached-current-js-retains-billed-unpaid-object': 'target-not-reached-or-qualification-incomplete';
 receipt.target={movedToFixedExterior:moved,testMoveReturned:receipt.testMoveReturned,sameBoulderId:boulder.o_id===receipt.beforeMove.boulder.id,whereFloor:boulder.where===OBJ_FLOOR,ownerPreserved:!!afterOwner&&(afterOwner.m_id??afterOwner.id??null)===(preOwner.m_id??preOwner.id??null),billRowRetained:billRows().some(r=>r.bo_id===boulder.o_id),jsRetainsBill:!!boulder.unpaid&&onshopbill(boulder,keeper,true),debitUnchanged:(eshk.debit??0)===(receipt.beforeMove.debit??0),originalOwnerShoproom:preOwner.mextra?.eshk?.shoproom??null,destinationExcludedFromOwnerShop:!in_rooms(exterior.x,exterior.y,SHOPBASE,state).includes(preOwner.mextra?.eshk?.shoproom),immediateDebit:eshk.debit??0,note:'No hero move/domove/u_left_shop was executed; this receipt describes only test_move DO_MOVE. Later departure may settle the account.'};
} catch(e){receipt.result='terminal-setup-or-execution-miss';receipt.phase=phase;receipt.errors.push({message:String(e?.message??e),stack:e?.stack??null});}
finally {display.onEmptyQueue=previousOnEmptyQueue;receipt.finallyRestoredInputHandler=display.onEmptyQueue===previousOnEmptyQueue; try{receipt.finalCapture=jsonSafe({screen:display.serialize(),topMessage:display.topMessage??null,toplin:display.toplin,waitEpoch:display.waitEpoch,inputQueueLength:display.inputQueueLength,rngLog:getRngLog().slice(),rngLogLength:getRngLog().length,unported:state?.unported??[],messageTail:(display.messages??[]).slice(-80)});}catch(e){receipt.captureError=String(e?.message??e);} }
try { receipt.captureBytes=JSON.stringify(jsonSafe(receipt)); receipt.captureSha256=createHash('sha256').update(receipt.captureBytes).digest('hex'); writeSnapshot(outFile,receipt); } catch(e) { receipt.finalWriteError=String(e?.message??e); try { writeSnapshot(outFile,{schema:receipt.schema,result:receipt.result,phase:receipt.phase,errors:jsonSafe(receipt.errors),finalWriteError:receipt.finalWriteError,targetInvocationCount:receipt.targetInvocationCount,targetStatus:receipt.targetStatus??null,targetCall:receipt.targetCall??null}); } catch { /* retain the earlier durable prefix if final output is unavailable */ } }
if(receipt.result!=='target-reached-current-js-retains-billed-unpaid-object') process.exitCode=2;
