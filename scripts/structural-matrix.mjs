#!/usr/bin/env node
// Expand a bounded, ordered matrix of public recorder inputs from existing
// recipe generators. No state injection, installation or fresh C run here.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PROJECT_ROOT } from './c-functions.mjs';
import { hash } from './structural-signals.mjs';
import { mutateRecipe, validatePlan } from './run-structural-pipeline.mjs';

export const GENERATORS = {
    attributes: { module: 'scripts/run-attributes-command.mjs', loader: 'loadAttributesRecipe' },
    'pray-decline': { module: 'scripts/run-pray-command.mjs', loader: 'loadPrayDeclineRecipe' },
    fire: { module: 'scripts/run-fire-command.mjs', loader: 'loadFireCommandRecipe' },
};
const digest = recipe => hash(JSON.stringify(recipe));
export function expandFamily(config, generated, provenance) {
    if (!Array.isArray(config.rows) || !config.rows.length || new Set(config.rows).size !== config.rows.length)
        throw new Error('rows must list distinct generator segment indices');
    const axes = config.axes ?? {};
    if (Object.keys(axes).some(k => !['seed', 'options', 'commands'].includes(k))) throw new Error('unsupported matrix axis');
    const seeds = axes.seed ?? [null], options = axes.options ?? [{ id: 'original', append: '' }],
        commands = axes.commands ?? [{ id: 'original', changes: [] }];
    for (const list of [seeds, options, commands]) if (!Array.isArray(list) || !list.length) throw new Error('axes must be nonempty arrays');
    if (seeds.some(s => s !== null && (!Number.isSafeInteger(s) || s < 0))) throw new Error('seed must be nonnegative integer or null to preserve generator');
    if (new Set(seeds).size !== seeds.length) throw new Error('duplicate seeds');
    for (const list of [options, commands]) {
        if (list.some(x => !/^[a-z0-9][a-z0-9-]*$/u.test(x.id)) || new Set(list.map(x => x.id)).size !== list.length)
            throw new Error('axis labels must be distinct lowercase IDs');
    }
    const size = config.rows.length * seeds.length * options.length * commands.length;
    if (size > 9) throw new Error('matrix family exceeds 9 probes; split into explicitly bounded batches');
    const variants = [], seen = new Set();
    for (const row of config.rows) for (const seed of seeds) for (const option of options) for (const command of commands) {
        if (!Number.isInteger(row) || !generated.segments[row]) throw new Error('generator row absent');
        let recipe = { version: 5, segments: [structuredClone(generated.segments[row])] };
        if (seed !== null) recipe.segments[0].seed = seed;
        if (typeof option.append !== 'string') throw new Error('options axis needs an append string containing nethackrc lines');
        if (!Array.isArray(command.changes) || command.changes.some(c => c.field !== 'moves'))
            throw new Error('commands axis may mutate only moves');
        recipe = mutateRecipe(recipe, [{ field: 'nethackrc', append: option.append }, ...command.changes]);
        const recipeSha256 = digest(recipe);
        if (seen.has(recipeSha256)) throw new Error('matrix axes produced duplicate input recipes');
        seen.add(recipeSha256);
        variants.push({ id: `row-${row}-seed-${seed ?? 'original'}-${option.id}-${command.id}`, recipe,
            expectC: command.expectC ?? config.expectC,
            scenario: { generator: provenance, row, seed: recipe.segments[0].seed, option: option.id,
                command: command.id, recipeSha256 } });
    }
    const [base, ...rest] = variants;
    return { id: config.id, signals: config.signals, source: config.source, knownAtBaseline: config.knownAtBaseline,
        recipe: base.recipe, expectC: base.expectC, scenario: base.scenario, variants: rest,
        reductions: config.reductions ?? [], controls: config.controls ?? [] };
}

export async function expandMatrix(spec, { root = PROJECT_ROOT, load = null } = {}) {
    if (spec.version !== 1 || !Array.isArray(spec.families) || !spec.families.length || spec.families.length > 8)
        throw new Error('matrix requires version 1 and 1..8 families');
    const reserve = spec.reserveFollowupRuns ?? 4;
    if (!Number.isInteger(spec.maxRuns) || spec.maxRuns < 1 || spec.maxRuns > 32
        || !Number.isInteger(reserve) || reserve < 1 || reserve >= spec.maxRuns)
        throw new Error('matrix requires integer maxRuns 1..32 and positive reserveFollowupRuns below maxRuns');
    const families = [];
    for (const config of spec.families) {
        const generator = GENERATORS[config.generator];
        if (!generator) throw new Error('generator not allowlisted');
        const path = resolve(root, generator.module), before = hash(readFileSync(path));
        const generated = load ? await load(config.generator) : (await import(pathToFileURL(path)))[generator.loader]();
        if (before !== hash(readFileSync(path))) throw new Error('generator changed during expansion');
        families.push(expandFamily(config, generated, { ...generator, sha256: before }));
    }
    const probes = families.reduce((n, f) => n + 1 + f.variants.length, 0);
    if (probes > spec.maxRuns - reserve) throw new Error('probe matrix leaves insufficient declared follow-up budget');
    return validatePlan({ version: 1, maxRuns: spec.maxRuns, maxPromotions: spec.maxPromotions ?? 4,
        files: spec.files, audit: spec.audit, families, matrix: { specSha256: hash(JSON.stringify(spec)), probes,
            reserveFollowupRuns: spec.reserveFollowupRuns ?? 4, ordering: 'family, row, seed, options, commands in declaration order',
            limitations: 'Agent chooses feasible rows, independent axes, target messages and reductions. No automatic role/level/state synthesis.' } });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [input, output] = process.argv.slice(2);
    if (!input || !output) throw new Error('usage: node scripts/structural-matrix.mjs matrix.json NEW-plan.json');
    const plan = await expandMatrix(JSON.parse(readFileSync(input, 'utf8')));
    writeFileSync(output, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ output, probes: plan.matrix.probes, maxRuns: plan.maxRuns }));
}
