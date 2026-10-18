import { NethackGame } from '../../js/jsmain.js';
import { game } from '../../js/gstate.js';
import { getRngLog } from '../../js/rng.js';
import { GameDisplay } from '../../js/game_display.js';
import { TOPLINE_NEED_MORE } from '../../js/tty_message.js';
import { PM_WIZARD_OF_YENDOR } from '../../js/monsters.js';
import { MM_NOMSG, ROOMOFFSET } from '../../js/const.js';
import { AMULET_OF_YENDOR } from '../../js/objects.js';
import { makemon_runtime } from '../../js/makemon_create.js';
import { keepdogs } from '../../js/dog.js';
import { m_at } from '../../js/monst.js';
import { levl_follower } from '../../js/mondata.js';
import { isok } from '../../js/cmd_isok.js';

const task = 'keepdogs-initialized-wizard-default-qualification-20261018';
const base = '41833ac39bde296803966c7eaa8408f4f613548d';
const input = Object.freeze({
    seed: 671903,
    datetime: '20261018120000',
    nethackrc: 'OPTIONS=name:AccessibleWizard,role:Wizard,race:human,gender:male,align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,!autopickup\n',
    moves: '',
});
const lossless = (value) => JSON.parse(JSON.stringify(value, (_key, item) =>
    typeof item === 'bigint' ? { $bigint: item.toString() } : item));
const ids = (head) => {
    const found = [], seen = new Set();
    for (let p = head; p && !seen.has(p); p = p.nmon) {
        seen.add(p);
        found.push(Number(p.m_id ?? 0));
    }
    return found;
};
function copyTrace(monster) {
    return (monster?.mtrack ?? []).slice(0, 3).map((entry) => ({
        x: Number(entry?.x ?? 0), y: Number(entry?.y ?? 0),
    }));
}
function inventory(monster) {
    const entries = [], seen = new Set();
    for (let obj = monster?.minvent; obj && !seen.has(obj); obj = obj.nobj) {
        seen.add(obj);
        entries.push({ id: Number(obj.o_id ?? 0), otyp: Number(obj.otyp ?? 0),
            quan: Number(obj.quan ?? 0), where: Number(obj.where ?? -1),
            no_charge: Boolean(obj.no_charge), unpaid: Boolean(obj.unpaid) });
    }
    return entries;
}
function monsterReceipt(monster, state) {
    return {
        id: Number(monster?.m_id ?? 0), species: Number(monster?.data?.pmidx ?? -1),
        iswiz: Boolean(monster?.iswiz), isshk: Boolean(monster?.isshk),
        ispriest: Boolean(monster?.ispriest), isgd: Boolean(monster?.isgd),
        x: Number(monster?.mx ?? 0), y: Number(monster?.my ?? 0),
        hp: Number(monster?.mhp ?? 0), alive: monster?.mhp > 0,
        levelListIds: ids(state.level.monlist), migratingIds: ids(state.gm?.migrating_mons),
        dogListIds: ids(state.gm?.mydogs), currentLevel: lossless({ ...state.u.uz }),
        mtrack: copyTrace(monster), mstate: Number(monster?.mstate ?? 0),
        mflags: Number(monster?.mflags ?? 0), mstrategy: Number(monster?.mstrategy ?? 0),
        mtrapped: Boolean(monster?.mtrapped), mleashed: Boolean(monster?.mleashed),
        wormno: Number(monster?.wormno ?? 0), stuck: monster === state.u.ustuck,
        steed: monster === state.u.usteed,
        appearance: Number(monster?.m_ap_type ?? 0), peaceful: Boolean(monster?.mpeaceful),
        inventory: inventory(monster), follows: Boolean(levl_follower(monster, state)),
        onMap: m_at(monster.mx, monster.my, state) === monster,
    };
}
function ttyReceipt(state, display) {
    return {
        topline: display?.toplin ?? null, topMessage: display?.topMessage ?? null,
        serialized: display?.serialize?.() ?? null,
        isWaitingForInput: Boolean(display?.isWaitingForInput),
        inputQueueLength: display?.inputQueueLength ?? null,
        waitEpoch: display?.waitEpoch ?? null,
        pendingMessage: state?._pending_message ?? null,
        inputState: state?.program_state?.input_state ?? null,
        readcharQueue: lossless(state?.readchar_queue ?? null),
    };
}
function actorSummary(state) {
    return ids(state.level.monlist).map((id) => {
        let mon = state.level.monlist;
        while (mon && Number(mon.m_id) !== id) mon = mon.nmon;
        return { id, species: Number(mon?.data?.pmidx ?? -1), iswiz: Boolean(mon?.iswiz),
            isshk: Boolean(mon?.isshk), ispriest: Boolean(mon?.ispriest), isgd: Boolean(mon?.isgd),
            x: Number(mon?.mx ?? 0), y: Number(mon?.my ?? 0), alive: mon?.mhp > 0 };
    });
}
const capture = { promptAcks: [], prompts: [], phases: [] };
let display = null, previousEmptyHandler = null, harness = null, state = null;
let gameStartInvocations = 0, makemonInvocations = 0, keepdogsInvocations = 0;
let phase = 'preconstruction', stop = null, error = null, targetReached = false;
let wizard = null, initial = null, final = null;
function promptSnapshot() { return ttyReceipt(state, display); }
function onEmptyQueue() {
    const snapshot = promptSnapshot();
    const renderedMore = display?.toplin === TOPLINE_NEED_MORE
        && String(display?.serialize?.() ?? '').includes('--More--');
    capture.prompts.push({ renderedMore, snapshot });
    if (!renderedMore) throw new Error('unknown-input: empty queue without an actual rendered More prompt');
    if (capture.promptAcks.length >= 16) throw new Error('input-cap: exceeded 16 rendered More acknowledgements');
    capture.promptAcks.push({ kind: 'rendered-More-space', byte: 32, snapshot });
    return 32;
}
try {
    // Install the synchronous fail-closed handler before game construction/output.
    phase = 'install-rendered-More-handler';
    display = new GameDisplay(null);
    previousEmptyHandler = display.onEmptyQueue;
    display.onEmptyQueue = onEmptyQueue;
    phase = 'construct-canonical-NethackGame';
    harness = new NethackGame({ seed: input.seed, datetime: input.datetime,
        nethackrc: input.nethackrc });
    harness._pendingDisplay = display;
    phase = 'canonical-NethackGame-start';
    gameStartInvocations = 1;
    const started = await harness.start();
    state = game;
    if (!started || !state.level || typeof state.level.at !== 'function') {
        stop = 'canonical NethackGame.start did not produce an initialized active level';
        throw new Error(stop);
    }
    const initializedShape = { contextIdentPositive: Number.isInteger(state.context?.ident) && state.context.ident > 0,
        youmonst: Boolean(state.youmonst), uprops: Boolean(state.u?.uprops), flags: Boolean(state.flags),
        wizardTemplate: Boolean(state.mons?.[PM_WIZARD_OF_YENDOR]) };
    capture.phases.push({ phase: 'initialized-source-default-game',
        hero: { x: state.u?.ux, y: state.u?.uy, level: lossless(state.u?.uz),
            role: state.flags?.initrole ?? state.u?.urole ?? null,
            name: state.plname, hasAmulet: Boolean(state.u?.uhave?.amulet),
            inventory: (state.invent ? ids(state.invent) : []) },
        level: { width: state.level?.width ?? null, height: state.level?.height ?? null,
            wizardTowers: [state.wiz1_level, state.wiz2_level, state.wiz3_level],
            mapPresent: Boolean(state.level?.at), listIds: ids(state.level.monlist),
            actors: actorSummary(state) },
        stateShape: { contextIdent: state.context?.ident ?? null, contextIdentPositive: Number.isInteger(state.context?.ident) && state.context.ident > 0,
            youmonstPresent: Boolean(state.youmonst), youmonstSpecies: state.youmonst?.data?.pmidx ?? null,
            upropsPresent: Boolean(state.u?.uprops), flagsPresent: Boolean(state.flags),
            monstersCatalogPresent: Boolean(state.mons?.[PM_WIZARD_OF_YENDOR]),
            wizardSpeciesIndex: PM_WIZARD_OF_YENDOR, canonicalWizardTemplateIndex: state.mons?.[PM_WIZARD_OF_YENDOR]?.pmidx ?? null },
        tty: ttyReceipt(state, display), rng: harness.getRngLog().slice() });

    if (!Object.values(initializedShape).every(Boolean)) {
        stop = `NethackGame.start did not establish the canonical source state shape: ${JSON.stringify(initializedShape)}`;
        throw new Error(stop);
    }
    phase = 'fixed-initialized-hero-plus-four-tile';
    const heroX = state.u.ux, heroY = state.u.uy;
    const targetX = heroX + 4, targetY = heroY;
    const level = { ...state.u.uz };
    const targetPremise = {
        sourceIsok: isok(targetX, targetY),
        occupied: m_at(targetX, targetY, state) !== null,
        target: { x: targetX, y: targetY },
        hero: { x: heroX, y: heroY },
        distanceSquared: (targetX - heroX) ** 2 + (targetY - heroY) ** 2,
        heroHasAmulet: Boolean(state.u.uhave?.amulet),
        towerLevel: [state.wiz1_level, state.wiz2_level, state.wiz3_level]
            .some((loc) => loc?.dnum === level.dnum && loc?.dlevel === level.dlevel),
        amuletType: AMULET_OF_YENDOR,
        speciesAvailable: Boolean(state.mons?.[PM_WIZARD_OF_YENDOR]),
    };
    capture.targetPremise = targetPremise;
    if (!targetPremise.sourceIsok || targetPremise.occupied || targetPremise.towerLevel
        || targetPremise.heroHasAmulet || !targetPremise.speciesAvailable) {
        stop = 'single predetermined initialized hero.x+4 tile or source premises invalid; terminal setup miss';
        throw new Error(stop);
    }

    phase = 'one-canonical-explicit-coordinate-Wizard-creation';
    const species = state.mons[PM_WIZARD_OF_YENDOR];
    makemonInvocations = 1;
    wizard = await makemon_runtime(species, targetX, targetY, MM_NOMSG, { state });
    if (!wizard) {
        stop = 'canonical makemon_runtime returned no Wizard at the fixed tile; terminal miss';
        throw new Error(stop);
    }
    const wizardInventory = inventory(wizard);
    const dx = wizard.mx - heroX, dy = wizard.my - heroY;
    const contract = {
        canonicalSpecies: wizard.data === species && wizard.data?.pmidx === PM_WIZARD_OF_YENDOR,
        isWizard: wizard.iswiz === true, wizardCount: Number(state.context?.no_of_wizards ?? 0),
        heroNoAmulet: !state.u.uhave?.amulet,
        wizardNoAmulet: !wizardInventory.some((obj) => obj.otyp === AMULET_OF_YENDOR),
        distanceSquared: dx * dx + dy * dy, distant: dx * dx + dy * dy >= 3,
        ordinaryNonWizardTower: ![state.wiz1_level, state.wiz2_level, state.wiz3_level]
            .some((loc) => loc?.dnum === state.u.uz.dnum && loc?.dlevel === state.u.uz.dlevel),
        noWorm: !wizard.wormno, notLeashed: !wizard.mleashed,
        notShopkeeper: !wizard.isshk, notStuck: wizard !== state.u.ustuck,
        notSteed: wizard !== state.u.usteed, undisguised: !wizard.m_ap_type,
        alive: wizard.mhp > 0,
        listMember: ids(state.level.monlist).includes(Number(wizard.m_id)),
        onMap: m_at(wizard.mx, wizard.my, state) === wizard,
        exactPredeterminedCoords: wizard.mx === targetX && wizard.my === targetY,
    };
    if (Object.values(contract).some((value) => value === false)) {
        stop = `canonical Wizard source contract failed; terminal miss: ${JSON.stringify(contract)}`;
        throw new Error(stop);
    }
    initial = monsterReceipt(wizard, state);
    capture.phases.push({ phase: 'canonical-Wizard-created-at-fixed-tile',
        targetId: initial.id, initial, contract, hero: { x: heroX, y: heroY, level },
        targetPremise, actorsBeforeKeepdogs: actorSummary(state),
        fullRng: harness.getRngLog().slice(), tty: ttyReceipt(state, display) });

    phase = 'actual-exported-keepdogs-call';
    targetReached = true;
    keepdogsInvocations = 1;
    await keepdogs(false, { state });
    final = monsterReceipt(wizard, state);
    const actorIdsAfter = ids(state.level.monlist);
    const evidence = {
        markerPresentAfter: state.unported instanceof Set
            && state.unported.has('dog.c migrate_to_level'),
        markerPresentBefore: capture.phases[0].unported?.includes?.('dog.c migrate_to_level') ?? false,
        targetedOriginalId: initial.id, targetedIdAfter: final.id,
        sameTargetObject: wizard.m_id === initial.id,
        targetStillOnLevelList: actorIdsAfter.includes(initial.id),
        targetStillAtOriginalMapCell: m_at(initial.x, initial.y, state) === wizard,
        targetCoordinatesUnchanged: wizard.mx === initial.x && wizard.my === initial.y,
        targetStillAlive: wizard.mhp > 0,
        targetStillWizard: wizard.iswiz === true && wizard.data === species,
        targetNoMigrationEntry: !ids(state.gm?.migrating_mons).includes(initial.id),
        targetNotInDogList: !ids(state.gm?.mydogs).includes(initial.id),
        otherActorIdsBefore: capture.phases.at(-1).actorsBeforeKeepdogs.map(x => x.id).filter(id => id !== initial.id),
        otherActorIdsAfter: actorIdsAfter.filter(id => id !== initial.id),
        otherActorListsMayChange: true,
    };
    capture.target = { evidence, initial, final };
    capture.phases.push({ phase: 'actual-target-keepdogs-complete', targetId: initial.id,
        final, evidence, unported: [...(state.unported ?? [])], actorsAfter: actorSummary(state),
        fullRng: harness.getRngLog().slice(), tty: ttyReceipt(state, display) });
    if (!evidence.markerPresentAfter || !evidence.sameTargetObject || !evidence.targetStillOnLevelList
        || !evidence.targetStillAtOriginalMapCell || !evidence.targetCoordinatesUnchanged
        || !evidence.targetNoMigrationEntry || !evidence.targetStillAlive || !evidence.targetStillWizard) {
        stop = `actual target observation incomplete; terminal: ${JSON.stringify(evidence)}`;
        throw new Error(stop);
    }
    stop = 'actual initialized canonical Wizard received keepdogs; target-specific retained-state evidence captured; stop';
} catch (caught) {
    error = { name: caught?.name ?? 'Error', message: String(caught?.message ?? caught),
        phase, stack: String(caught?.stack ?? '') };
    if (!stop) stop = `terminal first setup/provider/input miss: ${error.message}`;
} finally {
    if (display) display.onEmptyQueue = previousEmptyHandler;
    capture.finally = { phase: 'finally-terminal-capture', handlerRestored: Boolean(display
        && display.onEmptyQueue === previousEmptyHandler), targetReached,
        target: wizard && state ? monsterReceipt(wizard, state) : null,
        tty: state ? ttyReceipt(state, display) : null,
        rng: harness?.getRngLog?.() ?? getRngLog() ?? [],
        acknowledgementCount: capture.promptAcks.length };
}
console.log(JSON.stringify(lossless({ task, base, input, command: ['node',
    '.cache/keepdogs-initialized-wizard-default-qualification-20261018/attempt.mjs'],
    gameStartInvocations, makemonInvocations, keepdogsInvocations, targetReached,
    phases: capture.phases, targetPremise: capture.targetPremise, target: capture.target,
    prompts: capture.prompts, promptAcks: capture.promptAcks, finally: capture.finally,
    stop, error }), null, 2));
