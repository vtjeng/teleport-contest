// Record a published validation group in the existing repair register. The
// register travels with the next ordinary commit, like the synthetic receipt.
import { execFileSync } from 'node:child_process';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const SHA = /^[a-f0-9]{40}$/u;
const ID = /^[a-z0-9][a-z0-9-]*$/u;
const names = ['Checkpoint', 'Lint', 'Dashboard'];

export function parseRepairMembers(value) {
  if (typeof value !== 'string' || !value) throw new Error('Expected repair members');
  const members = value.split(',').map(part => {
    const [id, sourceCommit, extra] = part.split(':');
    if (!ID.test(id ?? '') || !SHA.test(sourceCommit ?? '') || extra !== undefined)
      throw new Error('Expected repair-id:full-source-sha for each member');
    return { id, sourceCommit };
  });
  if (new Set(members.map(member => member.id)).size !== members.length
      || new Set(members.map(member => member.sourceCommit)).size !== members.length)
    throw new Error('Duplicate repair member or source commit');
  return members;
}

export function preparePublishedRepairs(root, { commit, baseline, members, publication,
  publicationRuns, checkpointRun, checkpointCompletedAt, git = args =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim() }) {
  if (!SHA.test(commit) || !SHA.test(baseline) || !Array.isArray(members) || !members.length
      || !publication?.passed || publication.commit !== commit)
    throw new Error('Repair group requires successful exact-SHA publication');
  // Accept only the same runs selected by the publication checker. No second
  // API query, and no synthetic success inferred from an old or partial run.
  const publicationByName = new Map(publication.workflows.map(workflow =>
    [workflow.workflow.split('/').at(-1), workflow]));
  const raw = [checkpointRun, ...['lint.yml', 'dashboard.yml'].map(name => {
    const selected = publicationByName.get(name);
    return publicationRuns?.find(run => run.id === selected?.id);
  })];
  if (raw.some(run => !run) || new Set(raw.map(run => run.id)).size !== names.length)
    throw new Error('Incomplete repair group run evidence');
  const runs = raw.map((run, index) => {
    const name = names[index], expectedBranch = name === 'Checkpoint'
      ? 'integration-checkpoint/' : 'main';
    if (run.head_sha !== commit || run.status !== 'completed' || run.conclusion !== 'success'
        || !Number.isSafeInteger(run.id) || run.id <= 0
        || !Number.isSafeInteger(run.run_attempt) || run.run_attempt <= 0
        || !(name === 'Checkpoint' ? ['push', 'workflow_dispatch'].includes(run.event)
          : run.event === 'push') || (name === 'Checkpoint'
          ? !run.head_branch?.startsWith(expectedBranch)
          : run.head_branch !== expectedBranch)
        || !Number.isFinite(Date.parse(run.created_at))
        || !Number.isFinite(Date.parse(run.updated_at))
        || Date.parse(run.updated_at) < Date.parse(run.created_at))
      throw new Error(`Invalid ${name} run for repair group`);
    if (name === 'Checkpoint' && (!Number.isFinite(Date.parse(checkpointCompletedAt))
        || Date.parse(run.updated_at) < Date.parse(checkpointCompletedAt)))
      throw new Error('Checkpoint completion differs from verified receipt');
    return { id: run.id, name, sha: commit, attempt: run.run_attempt,
      event: run.event, branch: run.head_branch, status: run.status,
      conclusion: run.conclusion, createdAt: run.created_at,
      completedAt: run.updated_at, url: run.html_url };
  });
  const path = join(root, 'trial-monitor/repairs.json');
  const original = readFileSync(path, 'utf8');
  const register = JSON.parse(original);
  if (register.version !== 1 || !Array.isArray(register.repairs))
    throw new Error('Invalid repair register');
  const committedAt = git(['show', '-s', '--format=%cI', commit]);
  if (!Number.isFinite(Date.parse(committedAt))) throw new Error('Invalid group commit time');
  const ids = new Set(), sources = new Set();
  for (const member of members) {
    if (!ID.test(member.id ?? '') || !SHA.test(member.sourceCommit ?? '')
        || ids.has(member.id) || sources.has(member.sourceCommit))
      throw new Error('Duplicate or invalid repair member');
    if (member.sourceCommit === baseline)
      throw new Error('Repair source commit must follow the accepted baseline');
    ids.add(member.id); sources.add(member.sourceCommit);
    git(['merge-base', '--is-ancestor', baseline, member.sourceCommit]);
    git(['merge-base', '--is-ancestor', member.sourceCommit, commit]);
    const matches = register.repairs.filter(repair => repair.id === member.id);
    if (matches.length !== 1 || !['single-worker', 'post-trial'].includes(matches[0].window)
        || !Array.isArray(matches[0].candidates))
      throw new Error(`Unknown or unsupported repair member: ${member.id}`);
    const sourceCommittedAt = git(['show', '-s', '--format=%cI', member.sourceCommit]);
    if (!Number.isFinite(Date.parse(sourceCommittedAt))) throw new Error('Invalid source commit time');
    const candidate = { sha: commit, committedAt, sourceCommit: member.sourceCommit,
      sourceCommittedAt, runs };
    const existing = matches[0].candidates.find(item => item.sha === commit);
    if (existing && !isDeepStrictEqual(existing, candidate))
      throw new Error(`Conflicting existing candidate for ${member.id}`);
    if (!existing) matches[0].candidates.push(candidate);
  }
  const completedAt = runs.map(run => run.completedAt).sort().at(-1);
  if (!Number.isFinite(Date.parse(register.asOf)) || register.asOf < completedAt)
    register.asOf = completedAt;
  const updated = JSON.stringify(register, null, 2) + '\n';
  return () => {
    if (readFileSync(path, 'utf8') !== original)
      throw new Error('Repair register changed during publication');
    if (updated === original) return { changed: false, members: members.length };
    writeFileSync(path + '.tmp', updated);
    renameSync(path + '.tmp', path);
    return { changed: true, members: members.length };
  };
}
