// svd.dungeons[], decl.h struct instance_globals_saved_d's dungeon table,
// as C indexes it. The table itself is state.dungeons, which dungeon.c
// init_dungeons() (js/dungeon.js) fills. This file imports only gstate.js,
// so const.js may import it without closing a cycle.

import { game } from './gstate.js';

// svd.dungeons[dnum]: every read of the dungeon table goes through here
// (scripts/dungeon-index.test.mjs fails on any other index of it). For dnum
// 0 and up it is the array element, undefined before init_dungeons() fills
// it. For dnum -1 it is the view below.
export function dungeon_at(dnum, state = game) {
    if (dnum === -1) return dungeon_before_table(state);
    return state.dungeons?.[dnum];
}

// svd.dungeons[-1]. maketrap() gives every trap a dst of {-1, -1}, and only
// a magic portal that mkportal() made gets a real one; a portal made by a
// wish ("A magic portal to nowhere.") keeps {-1, -1}, and C code that
// follows it indexes svd.dungeons[-1], the 92 bytes before the array.
//
// Layout in the recorder's build (nethack-c/recorder), measured three ways:
// - `nm` on the recorder binary: svc at 0x541dd0, svd at 0x542090, so svc's
//   0x2c0 bytes end where svd begins; the objdump of depth() indexes svd
//   directly with a stride of 0x5c (92) and reads depth_start at +0x58.
// - A program compiled against the recorder's headers
//   (.cache/lead/wt-dneg1-notes/layout/layout.c): sizeof(dungeon) 92,
//   sizeof(struct context_info) 704 = sizeof(svc), offsetof(svd, dungeons)
//   0, so dungeons[-1] is svc.context bytes 612..703.
// - A second such program (layout/overlay.c, output in overlay.out) fills
//   each context field with distinct bytes and reads them back through a
//   dungeon pointer at svc offset 612.
//
// Field (offset in dungeon)    svc.context bytes it reads
// dname[24]        (0)         612-615 tribute padding (0), novel.id,
//                              novel.count, novel.pasg[0..11]
// proto[15]        (24)        novel.pasg[12..26]
// fill_lvl[15]     (39)        novel.pasg[27..29], 2 padding bytes (0),
//                              achieveo.mines_prize_oid, .soko_prize_oid,
//                              low half of .castle_prize_old
// themerms[15]     (54)        high half of .castle_prize_old,
//                              .mines_prize_otyp, .soko_prize_otyp,
//                              .castle_prize_otyp, .minetn_reached,
//                              5 padding bytes (0), byte 0 of
//                              lifelist.total_seen_upclose
// boneid           (69)        byte 1 of total_seen_upclose (signed char)
// flags            (72)        bytes 4-7 of total_seen_upclose; the bit
//                              fields are bits 0-7 of byte 4: town, hellish,
//                              maze_like, rogue_like, align (3), unconnected
// entry_lev        (76)        bytes 0-1 of lifelist.total_photographed
// num_dunlevs      (78)        bytes 2-3 of total_photographed
// dunlev_ureached  (80)        bytes 4-5 of total_photographed
// ledger_start     (84)        jingle[0..3]
// depth_start      (88)        jingle[4], jingle[5], 2 padding bytes (0)
//
// Multi-byte fields are little-endian; the xint16 fields sign-extend and the
// ints are signed. Padding bytes of the zero-initialized svc are taken as 0:
// no C code writes them. The strings run to the first NUL in these 92 bytes;
// one that runs past them would read svd.dungeons[0], which this does not
// model, so it throws. Only dunlev_ureached is ever written at -1 (by
// dunlev_reached(&u.uz) = ... in goto_level()); its setter writes the bytes
// of total_photographed it overlays.
function dungeon_before_table(state) {
    const context = state.context ?? {};
    const SVC_START = 612;
    const view = new DataView(new ArrayBuffer(92));
    const novel = context.novel ?? {};
    view.setUint32(616 - SVC_START, novel.id ?? 0, true);
    view.setInt32(620 - SVC_START, novel.count ?? 0, true);
    for (let i = 0; i < 30; i++)
        view.setInt8(624 - SVC_START + i, novel.pasg?.[i] ?? 0);
    const achieveo = context.achieveo ?? {};
    view.setUint32(656 - SVC_START, achieveo.mines_prize_oid ?? 0, true);
    view.setUint32(660 - SVC_START, achieveo.soko_prize_oid ?? 0, true);
    view.setUint32(664 - SVC_START, achieveo.castle_prize_old ?? 0, true);
    view.setInt16(668 - SVC_START, achieveo.mines_prize_otyp ?? 0, true);
    view.setInt16(670 - SVC_START, achieveo.soko_prize_otyp ?? 0, true);
    view.setInt16(672 - SVC_START, achieveo.castle_prize_otyp ?? 0, true);
    view.setUint8(674 - SVC_START, achieveo.minetn_reached ? 1 : 0);
    const lifelist = context.lifelist ?? {};
    view.setBigInt64(680 - SVC_START,
        BigInt(lifelist.total_seen_upclose ?? 0), true);
    view.setBigInt64(688 - SVC_START,
        BigInt(lifelist.total_photographed ?? 0), true);
    const jingle = context.jingle ?? '';
    for (let i = 0; i < 6 && i < jingle.length; i++)
        view.setUint8(696 - SVC_START + i, jingle.charCodeAt(i));

    const cstring = (offset) => {
        let text = '';
        for (let i = offset; i < 92; i++) {
            const byte = view.getUint8(i);
            if (!byte) return text;
            text += String.fromCharCode(byte);
        }
        throw new Error('svd.dungeons[-1] string runs into svd.dungeons[0]');
    };
    const flags = view.getUint8(72);
    return {
        dname: cstring(0),
        proto: cstring(24),
        fill_lvl: cstring(39),
        themerms: cstring(54),
        boneid: view.getUint8(69) ? String.fromCharCode(view.getUint8(69)) : '',
        flags: {
            town: Boolean(flags & 0x01),
            hellish: Boolean(flags & 0x02),
            maze_like: Boolean(flags & 0x04),
            rogue_like: Boolean(flags & 0x08),
            align: (flags >> 4) & 0x07,
            unconnected: Boolean(flags & 0x80),
        },
        entry_lev: view.getInt16(76, true),
        num_dunlevs: view.getInt16(78, true),
        get dunlev_ureached() {
            return view.getInt16(80, true);
        },
        set dunlev_ureached(value) {
            view.setInt16(80, value, true);
            context.lifelist ??= { total_seen_upclose: 0, total_photographed: 0 };
            context.lifelist.total_photographed
                = Number(view.getBigInt64(688 - SVC_START, true));
            state.context = context;
        },
        ledger_start: view.getInt32(84, true),
        depth_start: view.getInt32(88, true),
    };
}
