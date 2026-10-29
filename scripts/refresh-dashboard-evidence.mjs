#!/usr/bin/env node
// One explicit public-source refresh. Resolves moving refs once, reads only
// allowlisted metadata at immutable SHAs, never executes an evidence runner.
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildEvidence } from './dashboard-evidence.mjs';
const REPO = 'vtjeng/teleport-contest';
const URL = `https://github.com/${REPO}.git`;
const SHA = /^[a-f0-9]{40}$/u;
const prefixPattern = /^diagnostics\/divergence-evidence\/(levels|monsters)\/$/u;
const clone = value => JSON.parse(JSON.stringify(value));
const completionName = /\/(?:[^/]*final-receipt[^/]*|accepted-routing|completion(?:-[^/]*)?)\.json$/u;
const execAsync = promisify(execFile);

function allowed(source, path) {
  return path.startsWith(source.allowedDirectory) && !path.split('/').includes('..')
    && !(source.excludedPathFragments ?? []).some(fragment => path.includes(fragment));
}
function checkSource(source) {
  if (!prefixPattern.test(source.allowedDirectory ?? '')
      || !Array.isArray(source.excludedPathFragments ?? [])
      || (source.excludedPathFragments ?? []).some(value => typeof value !== 'string' || !value)
      || !(Number.isSafeInteger(source.pr) && source.pr > 0
        || typeof source.branch === 'string' && source.branch && SHA.test(source.base ?? '')))
    throw new Error('Invalid public source configuration');
}
function validateCase(value, path) {
  if (value.schemaVersion !== 1) return false; // new legacy formats remain explicitly unadapted
  if (!value.caseId || path.split('/').at(-2) !== value.caseId
      || !['candidate','explained_negative','unresolved','invalid_setup'].includes(value.status)
      || !['scanner','manual'].includes(value.origin?.kind)
      || !Array.isArray(value.origin.keys)
      || !(value.rootCause === null || typeof value.rootCause === 'string')
      || !SHA.test(value.provenance?.jsSha ?? '') || !SHA.test(value.provenance?.cGitlink ?? ''))
    throw new Error(`Malformed versioned case metadata: ${path}`);
  if (value.origin.kind === 'manual' && (value.origin.keys.length || value.origin.projection || value.origin.decisions))
    throw new Error(`Manual case claims scanner bindings: ${path}`);
  if (value.origin.kind === 'scanner' && (!value.origin.keys.length || !value.origin.projection))
    throw new Error(`Scanner case lacks binding: ${path}`);
  return true;
}

export async function refreshEvidence(config, previous, io) {
  if (config.version !== 1 || previous.version !== 1) throw new Error('Unsupported snapshot format');
  const next = clone(config), attemptedAt = io.now();
  if (!Number.isFinite(Date.parse(attemptedAt))) throw new Error('Invalid refresh observation time');
  const statuses = new Map(); let failed = false;
  for (const input of next.inventories) {
    if (!input.refresh?.sources?.length) continue;
    const resolved = [], skipped = [], old = config.inventories.find(item => item.id === input.id);
    try {
      for (const source of input.refresh.sources) {
        checkSource(source);
        const remote = await io.resolveSource(source);
        if (!SHA.test(remote.head ?? '') || !SHA.test(remote.base ?? '')
            || (source.deniedHeads ?? []).some(prefix => remote.head.startsWith(prefix)))
          throw new Error('Invalid or excluded published source head');
        // prepare fetches only the exact publicly resolved commits, never local
        // analyst branches or unpublished commit IDs supplied by a case.
        await io.prepare(remote);
        resolved.push({ pr: source.pr ?? null, branch: source.branch ?? remote.branch ?? null,
          head: remote.head, base: remote.base, sourceCommittedAt:io.commitTime?.(remote.head) ?? null, allowedDirectory: source.allowedDirectory, excludedPathFragments:source.excludedPathFragments ?? [] });
        const paths = io.listFiles(remote, source.allowedDirectory);
        if (!Array.isArray(paths) || paths.length > 3000) throw new Error('Source listing exceeds bounded refresh');
        const eligible = paths.filter(path => allowed(source,path));
        const existing = input.cases.filter(item => item.pr === source.pr && source.pr != null
          || item.refreshSource === (source.branch ?? null) && source.branch != null);
        const casePaths = [...new Set([...eligible.filter(path => /^[^\n]+\/[^/]+\/case\.json$/u.test(path)),
          ...existing.map(item => item.path)])].sort();
        if (casePaths.length > 200) throw new Error('Too many case metadata records');
        for (const path of casePaths) {
          if (!allowed(source,path)) throw new Error('Existing case moved outside allowed scope');
          const value = JSON.parse(io.read(remote.head,path));
          const known = existing.find(item => item.path === path);
          if (!validateCase(value,path) && !known) {
            skipped.push({ path, ref: remote.head, reason: 'Unsupported/unversioned metadata; no disposition imported' }); continue;
          }
          const other = input.cases.find(item => item.path === path && !existing.includes(item));
          if (other) { // Shared path across sources: accept only byte-identical metadata.
            if (io.read(other.ref,path).toString() !== io.read(remote.head,path).toString())
              throw new Error(`Conflicting case revisions across sources: ${path}`);
            continue;
          }
          const entry = { ref: remote.head, pr: source.pr ?? null, path,
            allowedDirectory: source.allowedDirectory, excludedPathFragments:source.excludedPathFragments ?? [], refreshSource: source.branch ?? null };
          if (known) Object.assign(known,entry); else input.cases.push(entry);
        }
        const priorCompletions = [...(input.completion ? [input.completion] : []), ...(input.completions ?? [])];
        const ownedCompletion = item => item.pr === source.pr && source.pr != null
          || item.pr == null && source.inventory;
        input.completions = priorCompletions.filter(item => !ownedCompletion(item));
        delete input.completion;
        const completionPaths = [...new Set([...eligible.filter(path => completionName.test(path)),
          ...priorCompletions.filter(ownedCompletion).map(item => item.path)])].sort();
        for (const path of completionPaths) input.completions.push({ ref: remote.head, path, pr: source.pr ?? null,
          allowedDirectory: source.allowedDirectory, excludedPathFragments:source.excludedPathFragments ?? [] });
        if (source.inventory) {
          if (!allowed(source,input.path) || input.keysPath && !allowed(source,input.keysPath))
            throw new Error('Inventory outside allowed source');
          input.ref = remote.head;
        }
      }
      input.skippedMetadata = skipped;
      const fixed = [...input.cases, ...(input.completions ?? [])].filter(item =>
        !input.refresh.sources.some(source => source.pr != null && source.pr === item.pr));
      for (const ref of new Set(fixed.map(item => item.ref))) await io.preparePinned?.(ref);
      // Validate every dependency at the selected source SHA. Scoped references
      // cannot escape into other shards; no source scripts are imported/executed.
      buildEvidence({version:1,inventories:[input],audits:[]},io.read);
      statuses.set(input.id,{ state: JSON.stringify(old.cases) === JSON.stringify(input.cases)
          && old.ref === input.ref && JSON.stringify(old.completions) === JSON.stringify(input.completions)
          ? 'unchanged' : 'updated', attemptedAt, lastSuccessAt:io.now(), resolved });
    } catch (error) {
      failed = true;
      statuses.set(input.id,{ state:'last-known', attemptedAt,
        lastSuccessAt:old.refreshStatus?.lastSuccessAt ?? null, resolved,
        error:error.cause?.code ? `${error.message} (${error.cause.code})` : error.message });
    }
  }
  let rebuilt;
  if (!failed) {
    try {
      // Static audits and deliberately fixed supporting cases keep their pins;
      // a fresh checkout may not yet contain these public commit objects.
      const fixed = [...next.audits, ...next.inventories.flatMap(input =>
        input.cases.filter(item => !input.refresh?.sources?.some(source => source.pr === item.pr)))];
      for (const ref of new Set(fixed.map(item => item.ref))) await io.preparePinned?.(ref);
      for (const input of next.inventories) if (statuses.has(input.id)) input.refreshStatus=statuses.get(input.id);
      rebuilt=buildEvidence(next,io.read);
    } catch (error) {
      failed=true;
      for (const input of next.inventories) statuses.set(input.id,{state:'last-known',attemptedAt,
        lastSuccessAt:config.inventories.find(item=>item.id===input.id).refreshStatus?.lastSuccessAt ?? null,
        resolved:statuses.get(input.id)?.resolved ?? [],error:`Fixed pinned metadata unavailable: ${error.message}`});
    }
  }
  if (failed) {
    // The refresh is transactional across configured inventories. Preserve all
    // old counts and pins if any source fails, including on an empty git cache.
    const retainedConfig=clone(config), retainedEvidence=clone(previous);
    for (const input of retainedConfig.inventories) {
      const attempt=statuses.get(input.id); if (!attempt) continue;
      input.refreshStatus=attempt.state==='last-known' ? attempt : { ...attempt,state:'not-applied',
        lastSuccessAt:input.refreshStatus?.lastSuccessAt ?? null,
        error:'Another configured source failed; previous snapshot retained' };
      const cohort=retainedEvidence.cohorts.find(item=>item.id===input.id);
      if (cohort) cohort.refresh=clone(input.refreshStatus);
    }
    return { passed:false,config:retainedConfig,evidence:retainedEvidence };
  }
  return { passed:true,config:next,evidence:rebuilt };
}

export function publicGitIO(root, fetchPublic=globalThis.fetch) {
  const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});
  return {
    now:()=>new Date().toISOString(),
    async resolveSource(source) {
      const path=source.pr ? `pulls/${source.pr}` : `commits/${encodeURIComponent(source.branch)}`;
      const response=await fetchPublic(`https://api.github.com/repos/${REPO}/${path}`,{
        headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(20000),redirect:'error'});
      if(!response.ok) throw new Error(`Public source unavailable: HTTP ${response.status}`);
      const value=await response.json();
      if(source.pr && (value.head?.repo?.full_name!==REPO || value.base?.repo?.full_name!==REPO))
        throw new Error('Source PR repository differs from configured public destination');
      return source.pr ? {head:value.head.sha,base:value.base.sha,branch:value.head.ref}
        : {head:value.sha,base:source.base,branch:source.branch};
    },
    async prepare(remote) {
      await execAsync('git',['fetch','--no-tags','--',URL,remote.head,remote.base],
        {cwd:root,timeout:120000,maxBuffer:1024*1024,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
    },
    async preparePinned(ref) {
      if(!SHA.test(ref ?? '')) throw new Error('Invalid configured immutable reference');
      try { git(['cat-file','-e',`${ref}^{commit}`]); }
      catch { await execAsync('git',['fetch','--no-tags','--',URL,ref],
        {cwd:root,timeout:120000,maxBuffer:1024*1024,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}}); }
    },
    commitTime:ref=>git(['show','-s','--format=%cI',ref]).trim(),
    listFiles:(remote,prefix)=>git(['diff','--diff-filter=AM','--name-only',`${remote.base}...${remote.head}`,'--',prefix]).trim().split('\n').filter(Boolean),
    read:(ref,path)=>git(['show',`${ref}:${path}`]),
  };
}

if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  if(process.argv.length!==2) throw new Error('Usage: node scripts/refresh-dashboard-evidence.mjs');
  const configPath='trial-monitor/evidence-sources.json', evidencePath='trial-monitor/evidence.json';
  const originals=[configPath,evidencePath].map(path=>readFileSync(path,'utf8'));
  const result=await refreshEvidence(JSON.parse(originals[0]),JSON.parse(originals[1]),publicGitIO(process.cwd()));
  if([configPath,evidencePath].some((path,i)=>readFileSync(path,'utf8')!==originals[i])) throw new Error('Snapshot changed during refresh');
  // Stage both deterministic files before replacing either. A crash between the
  // renames is detected by the ordinary offline --check before publication.
  for(const [path,value] of [[configPath,result.config],[evidencePath,result.evidence]]) writeFileSync(path+'.tmp',JSON.stringify(value,null,2)+'\n');
  renameSync(configPath+'.tmp',configPath);renameSync(evidencePath+'.tmp',evidencePath);
  console.log(JSON.stringify({passed:result.passed,sources:result.config.inventories.map(input=>({id:input.id,...input.refreshStatus}))},null,2));
  if(!result.passed) process.exitCode=1;
}
