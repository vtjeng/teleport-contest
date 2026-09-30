import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const C_TRAP = readFileSync(
    new URL('../nethack-c/upstream/src/trap.c', import.meta.url), 'utf8',
);
const C_DO = readFileSync(
    new URL('../nethack-c/upstream/src/do.c', import.meta.url), 'utf8',
);
const C_HACK = readFileSync(
    new URL('../nethack-c/upstream/src/hack.c', import.meta.url), 'utf8',
);
const C_PICKUP = readFileSync(
    new URL('../nethack-c/upstream/src/pickup.c', import.meta.url), 'utf8',
);
const JS_TRAP = readFileSync(new URL('../js/trap.js', import.meta.url), 'utf8');
const JS_DO = readFileSync(new URL('../js/do.js', import.meta.url), 'utf8');
const JS_HACK = readFileSync(new URL('../js/hack.js', import.meta.url), 'utf8');
const JS_PICKUP = readFileSync(
    new URL('../js/pickup.js', import.meta.url), 'utf8',
);

function cFunction(source, declaration, endMarker) {
    const start = source.indexOf(declaration);
    assert.notEqual(start, -1, `missing C declaration: ${declaration}`);
    const end = source.indexOf(endMarker, start);
    assert.notEqual(end, -1, `missing C function boundary: ${endMarker}`);
    return source.slice(start, end);
}

test('chest_trap flushes its trigger message before the Luck roll', () => {
    const cChestTrap = cFunction(
        C_TRAP,
        'chest_trap(\n    struct obj *obj,',
        '\nstruct trap *\nt_at(',
    );
    const jsStart = JS_TRAP.indexOf('export async function chest_trap(');
    assert.notEqual(jsStart, -1);
    const jsChestTrap = JS_TRAP.slice(jsStart);

    const cMessage = cChestTrap.indexOf(
        'You(disarm ? "set it off!" : "trigger a trap!");',
    );
    const cFlush = cChestTrap.indexOf(
        'display_nhwindow(WIN_MESSAGE, FALSE);', cMessage,
    );
    const cLuck = cChestTrap.indexOf(
        'if (Luck > -13 && rn2(13 + Luck) > 7)', cMessage,
    );
    assert.ok(cMessage >= 0 && cMessage < cFlush && cFlush < cLuck);

    const jsMessage = jsChestTrap.indexOf('await ttyPline(');
    const jsFlush = jsChestTrap.indexOf(
        'await displayPendingTtyMessageWindow(state);', jsMessage,
    );
    const jsLuck = jsChestTrap.indexOf(
        'if (Luck > -13 && rn2(13 + Luck) > 7)', jsMessage,
    );
    assert.ok(jsMessage >= 0 && jsMessage < jsFlush && jsFlush < jsLuck);
});

test('electric chest resistance animates before its resistance message', () => {
    const cChestTrap = cFunction(
        C_TRAP,
        'chest_trap(\n    struct obj *obj,',
        '\nstruct trap *\nt_at(',
    );
    const cBranchStart = cChestTrap.indexOf('case 8:');
    const cBranchEnd = cChestTrap.indexOf('} /* case 6 */', cBranchStart);
    const cBranch = cChestTrap.slice(cBranchStart, cBranchEnd);
    const cCharge = cBranch.indexOf('You("are jolted by a surge of electricity!");');
    const cResistance = cBranch.indexOf('if (Shock_resistance)', cCharge);
    const cShield = cBranch.indexOf('shieldeff(u.ux, u.uy);', cResistance);
    const cUnaffected = cBranch.indexOf('You("don\'t seem to be affected.");', cShield);
    const cPerception = cBranch.indexOf('monstseesu(M_SEEN_ELEC);', cUnaffected);
    const cDestroy = cBranch.indexOf(
        'destroy_items(&gy.youmonst, AD_ELEC, orig_dmg);', cPerception,
    );
    assert.ok(cCharge >= 0 && cCharge < cResistance
        && cResistance < cShield && cShield < cUnaffected
        && cUnaffected < cPerception && cPerception < cDestroy);

    const jsStart = JS_TRAP.indexOf('export async function chest_trap(');
    const jsChestTrap = JS_TRAP.slice(jsStart);
    const jsBranchStart = jsChestTrap.indexOf('case 8: case 7: case 6:');
    const jsBranchEnd = jsChestTrap.indexOf('\n        case 5: case 4: case 3:', jsBranchStart);
    const jsBranch = jsChestTrap.slice(jsBranchStart, jsBranchEnd);
    const jsCharge = jsBranch.indexOf("await ttyPline('You are jolted by a surge of electricity!', state);");
    const jsResistance = jsBranch.indexOf('if (Shock_resistance(state))', jsCharge);
    const jsShield = jsBranch.indexOf('await shieldeff(u.ux, u.uy, state);', jsResistance);
    const jsUnaffected = jsBranch.indexOf('await ttyPline("You don\'t seem to be affected.", state);', jsShield);
    const jsPerception = jsBranch.indexOf('monstseesu(M_SEEN_ELEC, state);', jsUnaffected);
    const jsDestroy = jsBranch.indexOf(
        'await destroy_items(state.youmonst, AD_ELEC, orig_dmg, {', jsPerception,
    );
    const jsRandom = jsBranch.indexOf(
        'random: { d, rn1, rn2, rnd, rne, rnl },', jsDestroy,
    );
    assert.ok(jsCharge >= 0 && jsCharge < jsResistance
        && jsResistance < jsShield && jsShield < jsUnaffected
        && jsUnaffected < jsPerception && jsPerception < jsDestroy
        && jsDestroy < jsRandom);
});

test('loot, disarm, and tip preserve their discarded-result chest_trap calls', () => {
    assert.match(C_PICKUP, /\(void\) chest_trap\(obj, HAND, FALSE\);/u);
    assert.match(C_TRAP, /\(void\) chest_trap\(box, FINGER, TRUE\);/u);
    assert.match(C_PICKUP, /\(void\) chest_trap\(box, HAND, FALSE\);/u);

    assert.match(JS_PICKUP, /await chest_trap\(obj, HAND, false, state\);/u);
    assert.match(JS_TRAP, /await chest_trap\(box, FINGER, true, state\);/u);
    assert.match(JS_PICKUP, /await chest_trap\(box, HAND, false, state\);/u);
});

test('climb_pit keeps the complete source branch and caller order', () => {
    const cClimbPit = cFunction(
        C_TRAP,
        'climb_pit(void)',
        '\nstaticfn void\ndofiretrap',
    );
    const jsStart = JS_TRAP.indexOf('export async function climb_pit(');
    assert.notEqual(jsStart, -1, 'js/trap.js exports the trap.c function');
    const jsEnd = JS_TRAP.indexOf('\n}\n', jsStart) + 3;
    const jsClimbPit = JS_TRAP.slice(jsStart, jsEnd);

    // These source positions pin the branch sequence, including the boulder
    // draw before the check, timer decrement before the easy-escape helper,
    // and the quiet continuation at the end of the source function.
    const cOrder = [
        'if (!u.utrap || u.utraptype != TT_PIT)',
        'pitname = trapname(PIT, FALSE);',
        'if (Passes_walls)',
        'else if (!rn2(2) && sobj_at(BOULDER, u.ux, u.uy))',
        'else if ((Flying || is_clinger(gy.youmonst.data)) && !Sokoban)',
        'else if (!(--u.utrap) || m_easy_escape_pit(&gy.youmonst))',
        'else if (u.dz || flags.verbose)',
    ].map((source) => cClimbPit.indexOf(source));
    const jsOrder = [
        'if (!u.utrap || u.utraptype !== TT_PIT)',
        'trapname(PIT, false, state)',
        'if (Passes_walls(state))',
        'else if (!rn2(2) && sobj_at(BOULDER, u.ux, u.uy, state))',
        'else if ((Flying(state) || is_clinger(state.youmonst.data))',
        '&& !In_sokoban(u.uz))',
        'else if (!(--u.utrap) || m_easy_escape_pit(state.youmonst, state))',
        'else if (u.dz || state.flags?.verbose)',
    ].map((source) => jsClimbPit.indexOf(source));
    assert.ok(cOrder.every((position) => position >= 0));
    assert.ok(jsOrder.every((position) => position >= 0));
    assert.deepEqual(cOrder, [...cOrder].sort((a, b) => a - b));
    assert.deepEqual(jsOrder, [...jsOrder].sort((a, b) => a - b));

    // Both active C caller contracts are pinned as well: doup spends a turn,
    // while trapmove preserves the adjacent-visible-pit exception and spends
    // any other TT_PIT movement attempt in place.
    const cDoup = cFunction(
        C_DO,
        'doup(void)',
        '\n/* check that we can write out the current level */',
    );
    assert.match(cDoup, /if \(u\.utrap && u\.utraptype == TT_PIT\)\s*\{\s*climb_pit\(\);\s*return ECMD_TIME;/u);
    assert.match(JS_DO, /if \(u\.utrap && u\.utraptype === TT_PIT\)\s*\{\s*await climb_pit\(state\);\s*return ECMD_TIME;/u);

    const cTrapmove = cFunction(
        C_HACK,
        'trapmove(\n    coordxy x, coordxy y,',
        '\nboolean\nu_rooted(void)',
    );
    const cPitArm = cTrapmove.slice(
        cTrapmove.indexOf('case TT_PIT:'), cTrapmove.indexOf('case TT_WEB:'),
    );
    assert.match(cPitArm, /if \(desttrap && desttrap->tseen\s*&& is_pit\(desttrap->ttyp\)\)\s*return TRUE;/u);
    assert.match(cPitArm, /climb_pit\(\);/u);
    assert.match(JS_HACK, /if \(desttrap && desttrap\.tseen && is_pit\(desttrap\.ttyp\)\)\s*return true;/u);
    assert.match(JS_HACK, /if \(u\.utraptype === TT_PIT\)\s*\{[\s\S]*?await climb_pit\(state\);\s*return false;/u);
});
