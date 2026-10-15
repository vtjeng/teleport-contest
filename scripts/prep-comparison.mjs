// Bind a Prep comparison to the committed inputs actually copied into its scorer.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {lstatSync, readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';

export function verifyComparisonWorkspace(root, workspace, revision) {
    const git = (...args) => execFileSync('git', ['-C', root, ...args], {encoding: 'utf8'}).trimEnd();
    const commit = git('rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`);
    const expected = new Map(git('ls-tree', '-rz', commit, '--', 'js', 'frozen', 'package.json')
        .split('\0').filter(Boolean).map(line => {
            const [header, path] = line.split('\t'), [mode, type, hash] = header.split(' ');
            if (!['100644', '100755'].includes(mode) || type !== 'blob')
                throw new Error(`comparison input must be a committed regular file: ${path}`);
            return [path, hash];
        }));
    // createScoringWorkspace overlays these three official files before replay.
    for (const name of ['isaac64.js', 'terminal.js', 'storage.js']) {
        const hash = expected.get(`frozen/${name}`);
        if (!hash) throw new Error(`comparison needs official frozen/${name}`);
        expected.set(`js/${name}`, hash);
    }
    const actual = [];
    const visit = path => {
        const stat = lstatSync(join(workspace, path));
        if (stat.isDirectory()) {
            for (const name of readdirSync(join(workspace, path))) visit(`${path}/${name}`);
        } else {
            if (!stat.isFile()) throw new Error(`comparison workspace needs regular files: ${path}`);
            actual.push(path);
        }
    };
    for (const path of ['js', 'frozen', 'package.json']) visit(path);
    if (!isDeepStrictEqual(actual.sort(), [...expected.keys()].sort()))
        throw new Error('comparison workspace files differ from the comparison commit');
    for (const path of actual) {
        const bytes = readFileSync(join(workspace, path));
        // This repository uses Git's SHA-1 blob identity, including the blob header.
        const hash = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
        if (hash !== expected.get(path))
            throw new Error(`comparison workspace differs from the comparison commit: ${path}`);
    }
    return commit;
}
