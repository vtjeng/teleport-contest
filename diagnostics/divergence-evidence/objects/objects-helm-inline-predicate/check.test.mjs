import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {helm_simple_name} from '../../../../js/objnam.js';
import {objects_globals_init,FEDORA,DWARVISH_IRON_HELM,ELVEN_LEATHER_HELM,HELMET,HELM_OF_BRILLIANCE} from '../../../../js/objects.js';
const root=new URL('../../../../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
test('inlined helm predicate matches actual C functions/macros over class/category/material domain',()=>{
 const cls=read('nethack-c/upstream/include/objclass.h'),obj=read('nethack-c/upstream/include/obj.h');
 // A definition consists of its first line and any continuation lines.
 const extract=(source,name)=>{const lines=source.split('\n'),start=lines.findIndex(l=>l.startsWith('#define '+name+'('));assert.ok(start>=0);let end=start;while(lines[end].endsWith('\\'))end++;return lines.slice(start,end+1).join('\n');};
 const enums=['obj_material_types','obj_armor_types','objclass_classes'].map(name=>cls.match(new RegExp('enum '+name+' \\{[\\s\\S]*?\\n\\};'))[0]).join('\n');
 const hard=read('nethack-c/upstream/src/do_wear.c').match(/hard_helmet\(struct obj \*obj\)\n\{[\s\S]*?\n\}/)[0];
 const simple=read('nethack-c/upstream/src/objnam.c').match(/helm_simple_name\(struct obj \*helmet\)\n\{[\s\S]*?\n\}/)[0];
 const dir=mkdtempSync(join(tmpdir(),'objects-helm-oracle-'));
 try{
  const code=`#include <stdio.h>\n#define TRUE 1\n#define FALSE 0\n${enums}\nstruct obj { int otyp,oclass; }; struct objclass { int oc_armcat,oc_material; } objects[1];\n${extract(obj,'is_helmet')}\n${extract(cls,'is_metallic')}\n${extract(cls,'is_crackable')}\nint ${hard}\nconst char *${simple}\nint main(void){struct obj o={0,0};for(int c=0;c<MAXOCLASSES;c++)for(int a=ARM_SUIT;a<=ARM_SHIRT;a++)for(int m=NO_MATERIAL;m<=MINERAL;m++){o.oclass=c;objects[0].oc_armcat=a;objects[0].oc_material=m;puts(helm_simple_name(&o));}puts(helm_simple_name(NULL));}\n`;
  writeFileSync(join(dir,'oracle.c'),code);execFileSync(process.env.CC||'clang',['-std=c99','-O0','-I',fileURLToPath(new URL('nethack-c/upstream/include',root)),join(dir,'oracle.c'),'-o',join(dir,'oracle')]);
  const rows=execFileSync(join(dir,'oracle'),{encoding:'utf8'}).trim().split('\n');assert.equal(rows.length,2773);let row=0;
  for(let c=0;c<18;c++)for(let a=0;a<7;a++)for(let m=0;m<22;m++)assert.equal(helm_simple_name({otyp:0,oclass:c},{objects:[{oc_armcat:a,oc_material:m}]}),rows[row++],`class=${c},category=${a},material=${m}`);
  assert.equal(helm_simple_name(null),rows[row]);
 }finally{rmSync(dir,{recursive:true,force:true});}
 const state={};objects_globals_init(state);
 for(const [otyp,expected] of [[FEDORA,'hat'],[ELVEN_LEATHER_HELM,'hat'],[DWARVISH_IRON_HELM,'helm'],[HELMET,'helm'],[HELM_OF_BRILLIANCE,'helm']])assert.equal(helm_simple_name({otyp,oclass:state.objects[otyp].oc_class},state),expected);
});
