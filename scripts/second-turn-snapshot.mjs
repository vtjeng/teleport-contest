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
        gg: structuredClone(state.gg),
        hero: structuredClone(state.u),
        iflags: structuredClone(state.iflags),
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
