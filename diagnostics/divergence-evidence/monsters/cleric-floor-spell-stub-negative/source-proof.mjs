import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AD_PHYS,AD_MAGM,AD_FIRE,AD_ELEC,AD_ACID} from '../../../../js/monsters.js';
const read=p=>readFileSync(p,'utf8');
const body=(s,signature)=>{const a=s.indexOf(signature);assert(a>=0);const b=s.indexOf('\n}',a);assert(b>a);return s.slice(a,b+2);};
const zap=body(read('js/zap.js'),'export async function mon_spell_hits_spot(');
assert.equal((zap.match(/note_unported\(/g)||[]).length,1);
assert.doesNotMatch(zap,/\badtyp\s*=(?!=)/);
assert.match(zap,/if \(adtyp >= AD_MAGM && adtyp <= AD_ACID\) \{[\s\S]*\} else \{\s*note_unported\('zap\.c impossible'\);\s*\}/);
const czap=body(read('nethack-c/upstream/src/zap.c'),'\nmon_spell_hits_spot(');
assert.match(czap,/if \(adtyp >= AD_MAGM && adtyp <= AD_ACID\)/);
const js=read('js/mcastu.js'),c=read('nethack-c/upstream/src/mcastu.c');
for(const [name,typ] of [['mcast_fire_pillar','AD_FIRE'],['mcast_lightning','AD_ELEC']]){
 const jb=body(js,`async function ${name}(`),cb=body(c,`\n${name}(`);
 assert.equal((jb.match(/mon_spell_hits_spot\(/g)||[]).length,1);
 assert.match(jb,new RegExp(`mon_spell_hits_spot\\(\\s*mtmp, ${typ},`));
 assert.match(cb,new RegExp(`mon_spell_hits_spot\\(mtmp, ${typ},`));
}
const constants={AD_PHYS,AD_MAGM,AD_FIRE,AD_ELEC,AD_ACID};
const header=read('nethack-c/upstream/include/monattk.h');
for(const [name,value] of Object.entries(constants))assert.match(header,new RegExp(`#define ${name} ${value}\\s`));
const accepted=t=>t>=AD_MAGM&&t<=AD_ACID;
assert(accepted(AD_FIRE));assert(accepted(AD_ELEC));assert(!accepted(AD_PHYS));
console.log(JSON.stringify({scope:'two literal cleric arguments cannot reach unsupported-type marker',constants,outOfRangeControl:'AD_PHYS; discriminator only, not a gameplay fixture'}));
