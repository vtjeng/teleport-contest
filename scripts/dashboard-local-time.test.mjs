import { execFileSync } from 'node:child_process';
import test from 'node:test';

// Separate processes keep each runtime's default zone isolated, as in browsers.
function inZone(zone, assertions) {
    execFileSync(process.execPath, ['--input-type=module', '-e', `
        import assert from 'node:assert/strict';
        import {createDashboardTime} from './scripts/dashboard-local-time.mjs';
        import {createChartTimeRange} from './scripts/dashboard-time-range.mjs';
        const time = createDashboardTime();
        ${assertions}
    `], {cwd: new URL('../', import.meta.url), env: {...process.env, TZ: zone}, encoding:'utf8'});
}

for (const [zone, local] of [
    ['America/Los_Angeles', '2026-10-22T18:30:00'],
    ['Asia/Kathmandu', '2026-10-23T07:15:00'],
    ['Europe/Berlin', '2026-10-23T03:30:00'],
]) test(`browser zone ${zone} controls dates across UTC day boundaries`, () => {
    inZone(zone, `
        const instant = Date.parse('2026-10-23T01:30:00Z');
        assert.equal(time.zone, new Intl.DateTimeFormat('en', {timeZone:'${zone}'}).resolvedOptions().timeZone);
        assert.equal(time.input(instant), '${local}');
        assert.equal(time.parseInput('${local}'), instant);
        assert.equal(time.clock(instant), '${local.slice(11,16)}');
        assert.ok(time.stamp(instant).includes('GMT'));
        for (const value of [null, undefined, '', 'bad date', NaN, Infinity]) {
            assert.equal(time.stamp(value), 'unknown');
            assert.equal(time.input(value), '');
        }
        assert.ok(Number.isNaN(time.parseInput('2026-02-30T12:00')));
        assert.ok(Number.isNaN(time.parseInput('')));
        assert.ok(Number.isNaN(time.parseInput('2026-10-23T01:30:00Z')));
    `);
});

for (const [zone, gap, first, second, clock] of [
    ['America/Los_Angeles', '2026-03-08T02:30:00', '2026-11-01T08:30:00Z', '2026-11-01T09:30:00Z', '2026-11-01T01:30:00'],
    ['Europe/Berlin', '2026-03-29T02:30:00', '2026-10-25T00:30:00Z', '2026-10-25T01:30:00Z', '2026-10-25T02:30:00'],
]) test(`${zone} rejects DST gaps and preserves selected repeated-hour instants`, () => {
    inZone(zone, `
        const first = Date.parse('${first}'), second = Date.parse('${second}');
        assert.ok(Number.isNaN(time.parseInput('${gap}')));
        assert.equal(time.input(first), '${clock}');
        assert.equal(time.input(second), '${clock}');
        assert.notEqual(time.stamp(first), time.stamp(second), 'offset distinguishes repeated clocks');
        assert.equal(time.parseInput('${clock}'), first, 'new ambiguous time chooses first occurrence');
        assert.equal(time.parseInput('${clock}', second), second, 'unchanged field preserves second occurrence');
        const nodes = new Map();
        const doc = {getElementById(id) {
            if (!nodes.has(id)) nodes.set(id, {style:{}, listeners:{},
                addEventListener(type, fn) {this.listeners[type] = fn;}});
            return nodes.get(id);
        }};
        const range = createChartTimeRange({start:first-86400000,end:second,minimum:60000,duration:3600000,
            presetUnit:3600000,presets:['1'],prefix:'test',document:doc});
        const field = key => nodes.get('test'+key);
        field('Ending').value = 'fixed'; field('Ending').listeners.change();
        assert.equal(range.bounds().end, second, 'switching Now to Fixed does not jump an hour');
        assert.equal(range.bounds().end-range.bounds().start, 3600000, 'duration remains elapsed');
        field('EndingAt').value = '${gap}'; field('EndingAt').listeners.change();
        assert.equal(range.bounds().end, second, 'invalid input leaves the range intact');
        assert.match(field('RangeError').textContent, /skipped daylight-saving/);
    `);
});
