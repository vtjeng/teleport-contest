import assert from 'node:assert/strict';
// This bounded parser accepts only the pinned literal role/race initializer
// shapes. It does not execute C or substitute JS data for reference inputs.
function uncomment(source){return source.replace(/"(?:\\.|[^"\\])*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,t=>t.startsWith('"')?t:' ');}
function fields(text){let depth=0,quoted=false,escaped=false,start=0;const out=[];for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}if(c==='"'){quoted=true;continue;}if('{(['.includes(c))depth++;if('})]'.includes(c))depth--;if(c===','&&depth===0){out.push(text.slice(start,i).trim());start=i+1;}}out.push(text.slice(start).trim());return out.filter(Boolean);}
function array(source,name){const clean=uncomment(source),match=clean.match(new RegExp(`const struct (?:Role|Race) ${name}\\[[^\\]]*\\]\\s*=\\s*\\{`));assert.ok(match,name);const start=match.index+match[0].length;let depth=1,quote=false,escape=false,end=start;for(;end<clean.length;end++){const c=clean[end];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quote=false;continue;}if(c==='"'){quote=true;continue;}if(c==='{')depth++;if(c==='}'&&!--depth)break;}
return fields(clean.slice(start,end)).filter(t=>t.startsWith('{')).map(t=>fields(t.slice(1,-1)));}
function six(text){if(!/^\{[\d,\s-]+\}$/.test(text))return null;const n=text.slice(1,-1).split(',').map(Number);return n.length===6?n:null;}
export function parseProgression(source){
 const roles=array(source,'roles').map(f=>{const indices=f.flatMap((v,i)=>six(v)?[i]:[]);assert.equal(indices.length,4);const hp=indices.at(-2),en=indices.at(-1);assert.equal(en,hp+1);return{filecode:JSON.parse(f[5]),symbol:f[8],allow:f[indices[0]-1],hpadv:six(f[hp]),enadv:six(f[en]),xlev:Number(f[en+1]),initrecord:Number(f[en+2])};});
 const races=array(source,'races').filter(f=>f[0]!=='0').map(f=>{const indices=f.flatMap((v,i)=>six(v)?[i]:[]);const hp=indices.at(-2),en=indices.at(-1);assert.equal(en,hp+1);const max=fields(f[hp-1].slice(1,-1));return{filecode:JSON.parse(f[3]),allow:f[8],hpadv:six(f[hp]),enadv:six(f[en]),conmax:Number(max[4]),wismax:Number(max[2])};});
 assert.equal(roles.length,13);assert.equal(races.length,5);for(const r of roles)assert.ok(Number.isInteger(r.xlev)&&Number.isInteger(r.initrecord));for(const r of races)assert.ok(r.conmax>=3&&r.wismax>=3);
 return{roles,races};
}
