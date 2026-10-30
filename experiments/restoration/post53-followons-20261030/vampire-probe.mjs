import {runSegment} from '../../../js/jsmain.js';
import {game} from '../../../js/gstate.js';
const setup='#wizgenesis\nhostile vampire\n';
for(const seed of [98732041,98732042])for(const length of [45,48,100]){
 let error=null,replay;
 try{replay=await runSegment({seed,datetime:'20451019123000',nethackrc:'OPTIONS=name:AttackProbe,role:Wizard,race:human,gender:female,align:neutral,playmode:debug,pettype:none,!legacy,!tutorial,!splash_screen,!autopickup,!acoustics\n',moves:(setup+'m.  '.repeat(18)).slice(0,length)});}catch(e){error=e.message;}
 console.log(JSON.stringify({seed,length,error,swallowed:game.u.uswallow,holder:game.u.ustuck?.data?.pmnames,screens:replay?.getScreens().length,rng:replay?.getRngLog().length,last:replay?.getScreens().at(-1)?.split('\n')[0]}));
}
