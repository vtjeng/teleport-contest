import {encodeEvidence} from '../hosted-evidence.mjs';

export function evidenceApi(run, files, kind = 'checkpoint', onRead = () => {}) {
    const repository = run.repository.full_name;
    const job = kind === 'checkpoint' ? 'Combined checkpoint result' : 'Save complete admission evidence';
    return path => {
        onRead(path);
        if (path.includes('/actions/runs/') && !path.includes('/jobs')) return JSON.stringify(run);
        if (path.includes('/jobs')) return JSON.stringify({jobs: [{name: job, head_sha: run.head_sha,
            run_id: run.id, run_attempt: run.run_attempt, status: 'completed', conclusion: 'success',
            check_run_url: `https://api.github.com/repos/${repository}/check-runs/800`} ]});
        const {manifest, annotations} = encodeEvidence(typeof files === 'function' ? files() : files,
            run, repository, kind);
        if (path.includes('/annotations')) {
            const page = Number(new URL(`https://api.github.com/${path}`).searchParams.get('page'));
            return JSON.stringify(annotations.slice((page - 1) * 100, page * 100));
        }
        if (path.endsWith('/check-runs/800')) return JSON.stringify({id: 800, name: job,
            head_sha: run.head_sha, status: 'completed', conclusion: 'success',
            check_suite: {id: run.check_suite_id}, app: {id: 15368, slug: 'github-actions'},
            output: {summary: JSON.stringify(manifest)}});
        throw new Error(`unexpected fixture API request: ${path}`);
    };
}
