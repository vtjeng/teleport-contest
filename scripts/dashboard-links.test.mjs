import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {injectDashboardData} from './build-dashboard.mjs';

const template = readFileSync(new URL('./dashboard.template.html', import.meta.url), 'utf8');
const css = template.match(/<style>([\s\S]*?)<\/style>/)[1];
const palettes = [...css.matchAll(/:root[^{}]*\{([^{}]*)\}/g)]
    .map(match => Object.fromEntries([...match[1].matchAll(/(--[\w-]+):\s*(#[\da-f]{6})\s*;/gi)]
        .map(([, key, value]) => [key, value])))
    .filter(values => values['--surface-card']);
const rules = new Map();
for (const [, selectors, body] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const selector of selectors.split(',')) {
        const key = selector.trim();
        rules.set(key, (rules.get(key) ?? '') + '\n' + body);
    }
}
function luminance(hex) {
    const rgb = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
        .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a, b) {
    const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (values[0] + 0.05) / (values[1] + 0.05);
}

test('provenance link states contrast with the actual card backgrounds in all themes', () => {
    assert.equal(palettes.length, 3, 'light, automatic dark, explicit dark');
    assert.match(css, /:root:not\(\[data-theme="light"\]\)/);
    assert.match(css, /:root\[data-theme="dark"\]/);
    const backgrounds = [...rules.get('.stat').matchAll(/background:\s*([^;]+);/g)];
    assert.equal(backgrounds.at(-1)[1].trim(), 'var(--surface-card)');
    for (const palette of palettes) {
        for (const state of ['--score-link', '--score-link-visited', '--score-link-hover']) {
            assert.ok(palette[state], `${state} is explicit in every theme`);
            const ratio = contrast(palette[state], palette['--surface-card']);
            assert.ok(ratio >= 4.5, `${state} on ${palette['--surface-card']}: ${ratio.toFixed(2)}:1`);
        }
    }
});

test('provenance links retain underlines and readable visited, hover, and keyboard focus states', () => {
    assert.match(rules.get('.score-source a'), /color:\s*var\(--score-link\)/);
    assert.match(rules.get('.score-source a'), /text-decoration:\s*underline/);
    assert.match(rules.get('.score-source a:visited'), /color:\s*var\(--score-link-visited\)/);
    for (const state of ['hover', 'focus'])
        assert.match(rules.get(`.score-source a:${state}`), /color:\s*var\(--score-link-hover\)/);
    assert.match(rules.get('.score-source a:focus-visible'), /outline:\s*2px solid currentColor/);
    assert.match(rules.get('.score-source a:focus-visible'), /outline-offset:\s*3px/);
    assert.ok(css.indexOf('.score-source a:hover') > css.indexOf('.score-source a:visited'),
        'hover and focus take precedence over visited');
});

test('dashboard generation preserves the provenance styles and link markup', () => {
    const html = injectDashboardData(template, '{}', 'null', 'a'.repeat(40));
    assert.equal(html.match(/<style>([\s\S]*?)<\/style>/)[1], css);
    assert.match(html, /<div class="score-source"><a href="https:\/\/github.com\/vtjeng\/teleport-contest\/commit\//);
    assert.match(html, /CI evidence<\/a>/);
});
