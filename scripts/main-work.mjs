#!/usr/bin/env node
// Cooperative ownership of the entire WL Main boundary, including manual
// tooling validation/publication. This lock is shared by every worktree.
// No PID/timeout automatically steals an existing lease.
import {execFileSync} from 'node:child_process';
import {closeSync, existsSync, fsyncSync, openSync, readFileSync, unlinkSync, writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const mainWorkLock = root => join(execFileSync('git',
    ['rev-parse','--path-format=absolute','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim(),'main-work.lock');
const read = file => JSON.parse(readFileSync(file));
function acquire(root, reason, mode, open = openSync) {
    const path = mainWorkLock(root), fd=open(path,'wx',0o600);
    const lease={kind:'main-work',mode,token:randomUUID(),pid:process.pid,owner:'Work lead',reason,startedAt:new Date().toISOString()};
    try {
        writeFileSync(fd,JSON.stringify(lease));fsyncSync(fd);
    } catch(error) {unlinkSync(path);throw error;} finally {closeSync(fd);}
    return {path,...lease};
}
export function releaseMainWork(root,token) {
    const path=mainWorkLock(root),lease=read(path);
    if(lease.kind!=='main-work'||lease.token!==token) throw new Error('Main-work lease token differs; inspect owner');
    unlinkSync(path);
}
export function withMainWork(root, action, {open = openSync} = {}) {
    const path=mainWorkLock(root),previous=process.env.TELEPORT_MAIN_WORK_TOKEN;
    if(existsSync(path)) {
        const lease=read(path);
        if(lease.kind==='main-work' && lease.token===previous) return action();
        throw new Error('Main boundary already owned; defer until its owner releases the shared lock');
    }
    const lease=acquire(root,'Supported Work lead operation','command',open);
    process.env.TELEPORT_MAIN_WORK_TOKEN=lease.token;
    try {return action();} finally {
        if(previous===undefined) delete process.env.TELEPORT_MAIN_WORK_TOKEN;
        else process.env.TELEPORT_MAIN_WORK_TOKEN=previous;
        releaseMainWork(root,lease.token);
    }
}
export function requireMainWorkAccess(root) {
    const path=mainWorkLock(root);
    if(!existsSync(path)) return;
    const lease=read(path);
    if(lease.kind!=='main-work' || lease.token!==process.env.TELEPORT_MAIN_WORK_TOKEN)
        throw new Error('Main publication owned; defer integration/admission until its shared lease is released');
}
const USAGE='node scripts/main-work.mjs hold --reason <public-reason> | release --token <token>\nHold across manual review/integration/tooling checkpoint/publication. Use returned token as TELEPORT_MAIN_WORK_TOKEN for supported child commands. Push remains the exact ordinary standalone git command. Release only after all owned commands finish and accepted Main/CI are reconciled. Never remove another live lease.';
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
    try {
        const [command,flag,value,...rest]=process.argv.slice(2);
        if(rest.length||!value)throw new Error(USAGE);
        if(command==='hold'&&flag==='--reason') console.log(JSON.stringify(acquire(process.cwd(),value,'manual')));
        else if(command==='release'&&flag==='--token') {releaseMainWork(process.cwd(),value);console.log('Main-work lease released');}
        else throw new Error(USAGE);
    } catch(error){console.error(error.message);process.exitCode=1;}
}
