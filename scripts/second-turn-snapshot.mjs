import { getRngLog } from '../js/rng.js';

function linkedObjects(head, link) {
    const objects = [];
    for (let object = head; object; object = object[link]) {
        const copy = {
            ...object,
            cobj: linkedObjects(object.cobj, 'nobj'),
            v: object.v?.o_id
                ? { objectId: object.v.o_id }
                : (object.v?.m_id ? { monsterId: object.v.m_id } : null),
        };
        delete copy[link];
        objects.push(structuredClone(copy));
    }
    return objects;
}

function monsterListSnapshot(state) {
    const monsters = [];
    for (let monster = state.level.monlist;
        monster;
        monster = monster.nmon) {
        const copy = {
            ...monster,
            data: monster.data?.pmidx ?? null,
            minvent: linkedObjects(monster.minvent, 'nobj'),
        };
        delete copy.nmon;
        monsters.push(structuredClone(copy));
    }
    return monsters;
}

// timeout.c keeps one queue whose nodes carry a monster or object reference in
// `arg`; light.c keeps one list whose nodes carry the same in `id`. Serialize
// both by identifier so a leaked node is visible without cloning live monster
// objects through them.
function timerListSnapshot(state) {
    const timers = [];
    for (let timer = state.gt?.timer_base; timer; timer = timer.next) {
        timers.push({
            func_index: timer.func_index ?? null,
            kind: timer.kind ?? null,
            timeout: timer.timeout ?? null,
            timer_id: timer.timer_id ?? null,
            arg: timer.arg?.m_id ?? timer.arg?.o_id ?? timer.arg ?? null,
        });
    }
    return timers;
}

function lightSourceSnapshot(state) {
    const sources = [];
    for (let source = state.gl?.light_base; source; source = source.next) {
        sources.push({
            x: source.x ?? null,
            y: source.y ?? null,
            range: source.range ?? null,
            type: source.type ?? null,
            flags: source.flags ?? null,
            id: source.id?.m_id ?? source.id?.o_id ?? source.id ?? null,
        });
    }
    return sources;
}

// allmain.c's go.occupation is a function pointer, and structuredClone()
// throws on a function. A snapshot still has to tell one installed occupation
// from another and from none, so each function gets a stable identifier the
// first time it is seen and two snapshots compare those instead.
const occupationIds = new WeakMap();
let occupationsSeen = 0;
function occupationState(go) {
    if (!go) return go ?? null;
    const { occupation } = go;
    if (typeof occupation !== 'function') return structuredClone(go);
    if (!occupationIds.has(occupation)) {
        occupationIds.set(occupation, `occupation#${++occupationsSeen}`);
    }
    return structuredClone({
        ...go,
        occupation: occupationIds.get(occupation),
    });
}

function rngContext(context) {
    return {
        a: context.a,
        b: context.b,
        c: context.c,
        m: [...context.m],
        n: context.n,
        r: [...context.r],
    };
}

// Complete state and retained-output snapshot for retrying a rejected action
// inside the simple second-command boundary.
export function completeSecondTurnSnapshot(state, replay) {
    return {
        command: {
            cmdKey: state.cmdKey,
            commandCount: state.commandCount,
            commandDispatchCount: state._commandDispatchCount,
            domoveAttempting: state.domoveAttempting,
            lastCommandCount: state.lastCommandCount,
            multi: state.multi,
        },
        context: structuredClone(state.context),
        commandOutput: {
            didNothingFlag: state.did_nothing_flag,
            disp: structuredClone(state.disp),
        },
        display: {
            cursor: [
                state.nhDisplay.cursorCol,
                state.nhDisplay.cursorRow,
                state.nhDisplay.cursorVisible,
            ],
            grid: structuredClone(state.nhDisplay.grid),
            messages: [...state.nhDisplay.messages],
            pending: state._pending_message,
            topMessage: state.nhDisplay.topMessage,
            toplin: state.nhDisplay.toplin,
            toplines: state.nhDisplay.toplines,
            ttyToplines: state._ttyToplines,
            glyphNotices: structuredClone(
                state._glyphUpdateNotices ?? null,
            ),
            glyphNoticeFrameTracker: structuredClone(
                state._glyphNoticeFrameTracker ?? null,
            ),
            emittingGlyphNotices:
                state._emittingGlyphUpdateNotices ?? false,
        },
        flags: structuredClone(state.flags),
        gg: structuredClone(state.gg),
        go: occupationState(state.go),
        gw: structuredClone(state.gw),
        hero: structuredClone(state.u),
        iflags: structuredClone(state.iflags),
        // Every global the planning clone isolates belongs here; a stop that
        // leaks one of them into the live game is not retryable, and the
        // snapshot is what the stop tests compare.
        lightSources: lightSourceSnapshot(state),
        monsterVitals: structuredClone(state.mvitals ?? null),
        input: {
            queue: [...(state.nhDisplay.terminal._inputQueue ?? [])],
            waitEpoch: state.nhDisplay.waitEpoch,
            waiting: state.nhDisplay.isWaitingForInput,
        },
        monsters: monsterListSnapshot(state),
        output: {
            animations: structuredClone(
                replay.getAnimationFramesByStep(),
            ),
            cursors: structuredClone(replay.getCursors()),
            lastRngIndex: replay._lastRngIdx,
            pendingAnimations: structuredClone(
                replay._pendingAnimFrames,
            ),
            rngSlices: structuredClone(replay.getRngSlices()),
            screens: [...replay.getScreens()],
        },
        rng: {
            coreContext: rngContext(state.coreCtx),
            displayContext: rngContext(state.displayCtx),
            log: [...getRngLog()],
        },
        programState: structuredClone(state.program_state),
        scheduler: {
            purgeMonsters: state.iflags?.purge_monsters ?? null,
            somebodyCanMove: state.somebody_can_move ?? null,
            visionFullRecalc: state.vision_full_recalc ?? null,
        },
        timers: {
            nextId: state.svt?.timer_id ?? null,
            queue: timerListSnapshot(state),
        },
        track: structuredClone(state.track),
        turn: {
            heroSeq: state.hero_seq ?? null,
            monstermoves: state.monstermoves,
            moves: state.moves,
        },
        world: {
            buriedObjects: linkedObjects(
                state.level.buriedobjlist,
                'nobj',
            ),
            flags: structuredClone(state.level.flags),
            headEngraving: structuredClone(state.head_engr),
            heroInventory: linkedObjects(state.invent, 'nobj'),
            locations: structuredClone(state.level.locations),
            monsterGrid: state.level.monsters.map(
                (column) => column.map(
                    (monster) => monster?.m_id ?? 0,
                ),
            ),
            objectGrid: state.level.objects.map(
                (column) => column.map(
                    (object) => object?.o_id ?? 0,
                ),
            ),
            objects: linkedObjects(state.level.objlist, 'nobj'),
            regions: structuredClone(state.level.regions),
            traps: structuredClone(state.level.traps),
            vision: state.viz_array.map((row) => [...row]),
        },
    };
}
