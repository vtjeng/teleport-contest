#!/usr/bin/env node
// Independent C-first enlightenment entries. Seeds were chosen directly,
// except fountain's natural self-knowledge branch: predefined range
// 93371100..93371163 yielded its first case after 40 replays at 93371139.
// C established startup More keys, wished wand and Wizard Eyes slot o; Monk Eyes slot j.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {decodeScreen} from '../frozen/screen-decode.mjs';
import {validateCleanRecipe} from './diff-fresh.mjs';
import {runFreshMatrix,runMatrixCli} from './fresh-matrix.mjs';

const entries=[
    {name:'enlightenment-priestess-incubus',title:"Wizard the Priestess's attributes:",form:'female succubus',basic:true},
    {name:'enlightenment-priest-nymph',title:"Wizard the Priest's attributes:",form:'water nymph',basic:true},
    {name:'enlightenment-monk-trapper',title:"Wizard the Monk's attributes:",form:'female trapper',basic:true,hiding:true},
    {name:'enlightenment-wand-giant',title:"Wizard the Wizard's attributes:",basic:false,subsides:true},
    {name:'enlightenment-fountain',title:"Wizard the Wizard's attributes:",basic:false,subsides:true},
    {name:'enlightenment-artifact-giant',title:"Wizard the Wizard's attributes:",basic:false},
    {name:'enlightenment-quit-priestess',title:"Wizard the Priestess's attributes:",basic:true,form:'female succubus',final:true},
    {name:'enlightenment-quit-wizard',title:"Wizard the Wizard's attributes:",basic:true,final:true,friday:true},
    {name:'attributes-enlightenment-final-disclosure',title:"Wizard the Valkyrie's attributes:",basic:true,final:true},
    {name:'hiding-potion-enlightenment',title:"Wizard the Wizard's attributes:",basic:false,hiding:'floor'},
];
export function loadPolymorphEnlightenmentCases(){
    return entries.map(entry=>({...entry,recipe:validateCleanRecipe(JSON.parse(readFileSync(
        new URL(`../recipes/insight.c/${entry.name}.session.json`,import.meta.url))),entry.name)}));
}
export async function verifyPolymorphEnlightenmentSegment(segment){
    const entry=loadPolymorphEnlightenmentCases().find(({recipe})=>recipe.segments[0].seed===segment.seed);
    assert.ok(entry,'independent input identity');
    let boundary;
    const replay=await runSegment(segment,{onBoundary(error){boundary=error;}});
    assert.equal(boundary,undefined,'live enlightenment entry reaches its owner');
    const frames=replay.getScreens().map(screen=>decodeScreen(screen).map(row=>row.map(cell=>cell.ch).join('')).join('\n'));
    const titleFrame=frames.find(frame=>frame.includes(entry.title));
    assert.ok(titleFrame,`${entry.name} reaches its live title`);
    if(entry.basic){
        assert.ok(titleFrame.includes('Background:'));
        if(entry.form){
            assert.ok(titleFrame.includes(`${entry.final?'You were':'You are currently'} in ${entry.form} form.`));
            assert.ok(titleFrame.includes(`${entry.final?'You were':'You are'} actually `));
            assert.ok(!frames.some(frame=>frame.includes('experience point')),'polymorph XP is omitted');
        }
        const hp=entry.form?game.u.mh:game.u.uhp,maximum=entry.form?game.u.mhmax:game.u.uhpmax;
        const hpText=hp===maximum && maximum>1 ? `all ${maximum} hit points` : `${Math.max(0,hp)} out of ${maximum} hit point${maximum===1?'':'s'}`;
        assert.ok(frames.some(frame=>frame.includes(`${entry.final?'You had':'You have'} ${hpText}.`)),'monster HP is displayed');
        if(entry.form)assert.ok(frames.some(frame=>frame.includes(`${game.mons[game.u.umonnum].mlevel} hit dice`)),'current form hit dice');
        if(entry.final)assert.ok(frames.some(frame=>frame.includes('Final Characteristics:')),'final mode uses the text-window disclosure');
        if(entry.friday)assert.ok(frames.some(frame=>frame.includes('Bad things could have happened on Friday the 13th.')),'quit selects final alive');
    }else assert.ok(!titleFrame.includes('Background:'),'MAGIC-only entry omits BASIC sections');
    if(entry.hiding) assert.ok(frames.some(frame=>frame.includes(`You are hiding on the ${entry.hiding===true?'stairs':entry.hiding}.`)),'existing youhiding call remains wired');
    if(entry.subsides) assert.ok(frames.some(frame=>frame.includes('The feeling subsides.')),'caller resumes after menu dismissal');
}
export async function runPolymorphEnlightenmentMatrix(){
    return runFreshMatrix({entries:loadPolymorphEnlightenmentCases().map(({name,recipe})=>({label:name,recipe})),verifySegment:verifyPolymorphEnlightenmentSegment,summaryLabel:'POLYMORPH ENLIGHTENMENT',chunkLimit:1});
}
runMatrixCli(import.meta.url,runPolymorphEnlightenmentMatrix,'polymorph enlightenment');
