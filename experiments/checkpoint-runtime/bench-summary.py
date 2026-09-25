"""Summarize the paired checkpoint benchmark: per-stage wall and CPU seconds
for each run, the baseline run-to-run spread, and candidate/baseline ratios.
Usage: bench-summary.py <bench-dir> <base-sha> <cand-sha>"""
import collections, glob, json, os, sys

bench, base, cand = sys.argv[1:4]
runs = collections.defaultdict(lambda: collections.defaultdict(lambda: [0.0, 0.0]))
passed = {}
for path in glob.glob(os.path.join(bench, '*.json')):
    commit, part, i = os.path.basename(path)[:-5].rsplit('-', 2)
    d = json.load(open(path))
    passed[(commit, i, part)] = d['allPassed']
    for c in d['checks']:
        label = c['label']
        if label.startswith(('generated data', 'static sources', 'duplicate', 'constants', 'end-of-input')):
            label = 'other checks'
        cell = runs[(commit, i)][label]
        cell[0] += c['ms'] / 1000
        cell[1] += c.get('cpuS', float('nan'))

rounds = sorted({i for (_, i) in runs})
order = ['full test suite', 'recordings corpus', 'development score', 'session scan', 'review gate', 'other checks']

def stat(commit, label, k):
    return [runs[(commit, i)][label][k] if label in runs[(commit, i)] else 0.0 for i in rounds]

for k, name in ((0, 'wall seconds'), (1, 'own CPU-seconds')):
    print(f'## {name}')
    print('| Stage | Before, each run | After, each run | Before mean | After mean | After/before |')
    print('| --- | --- | --- | ---: | ---: | ---: |')
    tb, tc = [0.0] * len(rounds), [0.0] * len(rounds)
    for label in order:
        b, c = stat(base, label, k), stat(cand, label, k)
        tb = [x + y for x, y in zip(tb, b)]; tc = [x + y for x, y in zip(tc, c)]
        bm, cm = sum(b) / len(b), sum(c) / len(c)
        ratio = f'{cm / bm:.2f}' if bm else 'new'
        print(f"| {label} | {', '.join(f'{x:.1f}' for x in b)} | {', '.join(f'{x:.1f}' for x in c)} | {bm:.1f} | {cm:.1f} | {ratio} |")
    bm, cm = sum(tb) / len(tb), sum(tc) / len(tc)
    print(f"| total | {', '.join(f'{x:.1f}' for x in tb)} | {', '.join(f'{x:.1f}' for x in tc)} | {bm:.1f} | {cm:.1f} | {cm / bm:.2f} |")
    print(f'baseline spread: {max(tb) - min(tb):.1f} = {(max(tb) - min(tb)) / bm * 100:.1f}% of its mean\n')
print('all checks passed:', all(passed.values()), f'({len(passed)} half-runs)')
