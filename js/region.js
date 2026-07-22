// Visible level regions used by gas clouds.
// C ref: region.c create_region(), add_rect_to_reg(), add_region(),
// inside_region(), visible_region_at(), and create_gas_cloud_selection().

import { COLNO, ROWNO } from './const.js';
import { game } from './gstate.js';
import { S_cloud, S_poisoncloud } from './symbols.js';

export function create_region(rectangles = []) {
    const region = {
        bounding_box: { lx: COLNO, ly: ROWNO, hx: 0, hy: 0 },
        rects: [],
        ttl: -1,
        attach_2_u: false,
        attach_2_m: 0,
        enter_msg: null,
        leave_msg: null,
        expire_f: null,
        enter_f: null,
        can_enter_f: null,
        leave_f: null,
        can_leave_f: null,
        inside_f: null,
        hero_inside: false,
        heros_fault: false,
        monsters: [],
        arg: 0,
        visible: false,
        glyph: S_cloud,
    };
    for (const rectangle of rectangles) add_rect_to_reg(region, rectangle);
    return region;
}

export function add_rect_to_reg(region, rectangle) {
    if (!region?.bounding_box || !Array.isArray(region.rects))
        throw new TypeError('add_rect_to_reg requires a region');
    const rect = {
        lx: Math.trunc(rectangle.lx),
        ly: Math.trunc(rectangle.ly),
        hx: Math.trunc(rectangle.hx),
        hy: Math.trunc(rectangle.hy),
    };
    region.rects.push(rect);
    const bounds = region.bounding_box;
    if (rect.lx < bounds.lx) bounds.lx = rect.lx;
    if (rect.ly < bounds.ly) bounds.ly = rect.ly;
    if (rect.hx > bounds.hx) bounds.hx = rect.hx;
    if (rect.hy > bounds.hy) bounds.hy = rect.hy;
    return region;
}

export function inside_region(region, x, y) {
    if (!region) return false;
    const bounds = region.bounding_box;
    if (!bounds || x < bounds.lx || x > bounds.hx
        || y < bounds.ly || y > bounds.hy) {
        return false;
    }
    return region.rects.some((rect) => x >= rect.lx && x <= rect.hx
        && y >= rect.ly && y <= rect.hy);
}

export function add_region(region, state = game) {
    if (!state.level)
        throw new Error('add_region requires an initialized level');
    state.level.regions ??= [];
    state.level.regions.push(region);

    // region.c scans the bounding box x-major when activating a region and
    // records every resident monster once. Long-worm duplication is outside
    // the initial-level slice because the coordinate grid stores one head.
    const bounds = region.bounding_box;
    for (let x = bounds.lx; x <= bounds.hx; ++x) {
        for (let y = bounds.ly; y <= bounds.hy; ++y) {
            if (!inside_region(region, x, y)) continue;
            const monster = state.level.monsters?.[x]?.[y];
            if (monster && !region.monsters.includes(monster.m_id))
                region.monsters.push(monster.m_id);
        }
    }
    region.hero_inside = inside_region(
        region,
        state.u?.ux ?? -1,
        state.u?.uy ?? -1,
    );
    return region;
}

// C ref: region.c update_monster_region(). Relocation updates each active
// region's cached monster-id membership after the coordinate grid changes.
export function update_monster_region(monster, state = game) {
    if (!monster || typeof monster !== 'object') {
        throw new TypeError('update_monster_region requires a monster');
    }
    for (const region of state.level?.regions ?? []) {
        const index = region.monsters.indexOf(monster.m_id);
        if (inside_region(region, monster.mx, monster.my)) {
            if (index < 0) region.monsters.push(monster.m_id);
        } else if (index >= 0) {
            // region.c remove_mon_from_reg() fills the removed slot with the
            // former tail rather than preserving array order.
            region.monsters[index] = region.monsters.at(-1);
            region.monsters.pop();
        }
    }
    return monster;
}

export function visible_region_at(x, y, state = game) {
    for (const region of state.level?.regions ?? []) {
        if (!region.visible || region.ttl === -2) continue;
        if (inside_region(region, x, y)) return region;
    }
    return null;
}

export function create_gas_cloud_selection(selection, damage = 0, rawEnv = {}) {
    if (!selection || typeof selection.bounds !== 'function'
        || typeof selection.get !== 'function') {
        throw new TypeError('create_gas_cloud_selection requires a selection');
    }
    const state = rawEnv.state ?? game;
    const cloud = create_region();
    const bounds = selection.bounds();
    for (let x = bounds.lx; x <= bounds.hx; ++x) {
        for (let y = bounds.ly; y <= bounds.hy; ++y) {
            if (!selection.get(x, y)) continue;
            add_rect_to_reg(cloud, { lx: x, ly: y, hx: x, hy: y });
        }
    }
    cloud.inside_f = 'inside_gas_cloud';
    cloud.expire_f = 'expire_gas_cloud';
    cloud.arg = Math.trunc(damage);
    cloud.visible = true;
    cloud.glyph = damage ? S_poisoncloud : S_cloud;
    return add_region(cloud, state);
}
