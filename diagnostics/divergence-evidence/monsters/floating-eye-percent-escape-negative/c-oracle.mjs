// Execute the pinned C formatting helpers, not a JavaScript transcription.
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=new URL('../../../../',import.meta.url);
const source=readFileSync(new URL('nethack-c/upstream/src/hacklib.c',root),'utf8');
const suffix=source.slice(source.indexOf('char *\ns_suffix('),source.indexOf('/* construct a gerund'));
const end=source.indexOf('/* search for a word in a space-separated list',source.indexOf('int\nstrNsubst('));
const actualSubst=source.slice(source.indexOf('int\nstrNsubst('),end);
export function cOracle(name){
 const dir=mkdtempSync(join(tmpdir(),'eye-reflection-oracle-'));
 try{
  const c=`#include <stdio.h>\n#include <string.h>\n#include <strings.h>\n#define BUFSZ 256\n#define Strcpy strcpy\n#define Strcat strcat\n#define strcmpi strcasecmp\n#define eos(s) ((s)+strlen(s))\n${suffix}\n${actualSubst}\nint main(int argc,char **argv){char buf[BUFSZ]; if(argc!=2)return 2; Strcpy(buf,s_suffix(argv[1])); strNsubst(buf,"%","%%",0); Strcat(buf," gaze is reflected by %s %s."); printf(buf,"the hill orc's","amulet"); putchar('\\n'); return 0;}\n`;
  writeFileSync(join(dir,'oracle.c'),c);
  execFileSync(process.env.CC??'cc',['-std=c99','-Wall','-Wextra',join(dir,'oracle.c'),'-o',join(dir,'oracle')]);
  return execFileSync(join(dir,'oracle'),[name],{encoding:'utf8'}).trimEnd();
 }finally{rmSync(dir,{recursive:true,force:true});}
}
