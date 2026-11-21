// corpus-list.mjs -- List the committed recipes to re-record on macOS.
//
// Usage: node experiments/host-parity/corpus-list.mjs <out-dir> <chunk> <chunks>
//
// Writes <out-dir>/lists/<source-file>.txt, one recipe path per line, for
// every recipe under recipes/ that has a recording at the same path under
// recordings/, is not already recorded on macOS (the regex recipes in
// regex-oracle/recipes.txt and the options-menu rebind recipes that
// .github/workflows/macos-recorder.yml records on main), and whose index in
// the sorted list is <chunk> modulo <chunks>.
import fs from 'node:fs';
import path from 'node:path';
const [out, chunk, chunks] = process.argv.slice(2);
const skip = new Set(fs.readFileSync('experiments/host-parity/regex-oracle/recipes.txt', 'utf8').split('\n').filter(Boolean));
for (const f of fs.readdirSync('recipes/cmd.c')) if (/bind.*-live\.session\.json$/.test(f)) skip.add(`recipes/cmd.c/${f}`);
skip.add('recipes/cmd.c/toggle-bound-param-menu.session.json');
skip.add('recipes/cmd.c/bind-toggle-empty-param-reports-and-lists-null.session.json');
const all = [];
for (const dir of fs.readdirSync('recipes').sort()) {
  if (!fs.statSync(`recipes/${dir}`).isDirectory()) continue;
  for (const f of fs.readdirSync(`recipes/${dir}`).sort()) {
    const p = `recipes/${dir}/${f}`;
    if (f.endsWith('.session.json') && !skip.has(p) && fs.existsSync(`recordings/${dir}/${f}`)) all.push([dir, p]);
  }
}
fs.mkdirSync(path.join(out, 'lists'), { recursive: true });
const byDir = new Map();
all.forEach(([dir, p], i) => { if (i % Number(chunks) === Number(chunk)) byDir.set(dir, [...(byDir.get(dir) ?? []), p]); });
for (const [dir, list] of byDir) fs.writeFileSync(path.join(out, 'lists', `${dir}.txt`), list.join('\n') + '\n');
console.log(`chunk ${chunk} of ${chunks}: ${[...byDir.values()].reduce((a, l) => a + l.length, 0)} of ${all.length} recipes in ${byDir.size} directories (${skip.size} skipped as already recorded on macOS)`);
