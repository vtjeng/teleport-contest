import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BASICENLIGHTENMENT, MAGICENLIGHTENMENT, ENL_GAMEINPROGRESS,
    ENL_GAMEOVERALIVE, ENL_GAMEOVERDEAD, NON_PM } from '../js/const.js';
import { game } from '../js/gstate.js';
import { enlightenment } from '../js/insight.js';
import { runSegment } from '../js/jsmain.js';
import { PM_HILL_GIANT, PM_WATER_NYMPH, PM_VAMPIRE,
    PM_FOG_CLOUD } from '../js/monsters.js';

async function polymorphed(form = PM_HILL_GIANT, savedFemale = true) {
    // Directly chosen seed and Priest role distinguish saved Priestess title
    // from current form gender; no challenge input is used.
    await runSegment({seed:93371001, datetime:'20790317130911',
        nethackrc:'OPTIONS=name:Background,role:Priest,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen\n',moves:''});
    game.u.umonnum = form;
    game.youmonst.data = game.mons[form];
    game.youmonst.cham = NON_PM;
    game.u.mfemale = savedFemale;
    game.flags.female = false;
    return game;
}
const basic = (state, final = ENL_GAMEINPROGRESS) => enlightenment(BASICENLIGHTENMENT, final, state);

test('source pins original gender, form-first background and final snapshot order', () => {
    const c=readFileSync(new URL('../nethack-c/upstream/src/insight.c',import.meta.url),'utf8');
    const family=c.slice(c.indexOf('\nenlightenment('),c.indexOf('\n/* characteristics:'));
    assert.match(family,/\(Upolyd \? u\.mfemale : flags\.female\)/u);
    assert.ok(family.indexOf('if (Upolyd) {\n        char anbuf') < family.indexOf('/* report role;'));
    assert.match(family,/altphrasing \? just_an\(anbuf, tmpbuf\) : "in "/u);
    assert.match(family,/final \? iflags\.at_midnight : midnight\(\)/u);
    assert.match(family,/final == ENL_GAMEOVERALIVE\) \? "could have happened"/u);
    assert.match(family,/if \(!Upolyd\) \{\s*int ulvl/u);
});

test('saved original gender selects title and rank while current gender describes the form',async () => {
    const state=await polymorphed();
    const lines=await basic(state);
    assert.equal(lines[0],"Background the Priestess's attributes:");
    const heading=lines.indexOf('Background:');
    assert.equal(lines[heading+1],' You are currently in male hill giant form.');
    assert.equal(lines[heading+2],' You are actually an Aspirant, a level 1 human Priestess.');
    assert.ok(!lines.some((line) => line.includes('experience point')),'polymorphed background suppresses human experience');
});

test('intrinsic gender and neuter species omit redundant current gender',async () => {
    const state=await polymorphed(PM_WATER_NYMPH,false);
    state.flags.female=true; // Female-only form does not say female twice.
    let lines=await basic(state);
    assert.equal(lines[0],"Background the Priest's attributes:");
    assert.ok(lines.includes(' You are currently in water nymph form.'));
    state.u.umonnum=PM_FOG_CLOUD; // Neuter form also suppresses gender adjective.
    state.youmonst.data=state.mons[PM_FOG_CLOUD];
    lines=await basic(state);
    assert.ok(lines.includes(' You are currently in fog cloud form.'));
});

test('vampire shifted form uses article and original vampire name in source order',async () => {
    const state=await polymorphed(PM_FOG_CLOUD);
    state.youmonst.cham=PM_VAMPIRE; // monst.h vampshifted, not ordinary polymorph.
    assert.ok((await basic(state)).includes(' You are currently a vampire in fog cloud form.'));
});

test('final alive mode uses saved time and Friday tense without currently',async () => {
    const state=await polymorphed();
    state.iflags.at_midnight=true; // Final disclosure snapshot differs from 13:09 clock.
    state.iflags.at_night=false;
    state.flags.friday13=true;
    const lines=await basic(state,ENL_GAMEOVERALIVE);
    assert.ok(lines.includes(' You were in male hill giant form.'));
    assert.ok(lines.includes(' It was the midnight hour.'));
    assert.ok(lines.includes(' Bad things could have happened on Friday the 13th.'));
    assert.ok((await basic(state,ENL_GAMEOVERDEAD)).includes(' Bad things happened on Friday the 13th.'));
});

test('MAGIC-only title also reads saved gender without adding background',async () => {
    const state=await polymorphed();
    const lines=await enlightenment(MAGICENLIGHTENMENT,ENL_GAMEINPROGRESS,state);
    assert.equal(lines[0],"Background the Priestess's attributes:");
    assert.ok(!lines.includes('Background:'));
});

test('basics uses monster HP and species hit dice before armor class',async () => {
    const state=await polymorphed();
    state.u.mh=17; // Distinct monster HP makes the human HP substitution visible.
    state.u.mhmax=23;
    const lines=await basic(state);
    const heading=lines.indexOf('Basics:');
    assert.equal(lines[heading+1],' You have 17 out of 23 hit points.');
    assert.ok(lines.includes(` You have ${state.mons[PM_HILL_GIANT].mlevel} hit dice.`));
    assert.ok(lines.findIndex(line=>line.includes('hit dice')) < lines.findIndex(line=>line.startsWith(' Your armor class')));
});

test('basic hit-dice singular and half-die text is source-pinned',async () => {
    const c=readFileSync(new URL('../nethack-c/upstream/src/insight.c',import.meta.url),'utf8');
    const body=c.slice(c.indexOf('\nbasics_enlightenment('),c.indexOf('\n/* characteristics:'));
    assert.match(body,/case 0:[\s\S]*"0 hit dice \(actually 1\/2\)"/u);
    assert.match(body,/case 1:[\s\S]*"1 hit die"/u);
    const state=await polymorphed();
    // Source table mlevel controls HD: these fixtures isolate the two rare
    // display arms without asserting a fake species as production evidence.
    for(const [mlevel,description] of [[0,'0 hit dice (actually 1/2)'],[1,'1 hit die']]) {
        const original=state.mons[PM_HILL_GIANT];
        state.mons[PM_HILL_GIANT]={...original,mlevel};
        try {assert.ok((await basic(state)).includes(` You have ${description}.`));}
        finally {state.mons[PM_HILL_GIANT]=original;}
    }
});

test('big-room description follows the blocked Blind macro',async () => {
    const {BLINDED}=await import('../js/const.js');
    const state=await polymorphed();
    state.bigroom_level={...state.u.uz}; // Is_bigroom source level identity.
    state.u.uprops[BLINDED].intrinsic=1;
    state.u.uprops[BLINDED].blocked=0;
    assert.ok(!(await basic(state)).some(line=>line.includes('a very big room')));
    state.u.uprops[BLINDED].blocked=1; // Artifact lenses restore sight despite HBlinded.
    assert.ok((await basic(state)).some(line=>line.includes('a very big room')));
});

test('reference build excludes the dump-only caller and optional score paragraph',() => {
    const config=readFileSync(new URL('../nethack-c/upstream/include/config.h',import.meta.url),'utf8');
    assert.match(config,/\/\* #define DUMPLOG \*\//u);
    assert.match(config,/\/\* #define SCORE_ON_BOTL \*\//u);
    const end=readFileSync(new URL('../nethack-c/upstream/src/end.c',import.meta.url),'utf8');
    const dump=end.slice(end.indexOf('\ndump_everything('),end.indexOf('\nstaticfn void\ndisclose('));
    assert.match(dump,/#ifdef DUMPLOG[\s\S]*enlightenment\(/u);
});
