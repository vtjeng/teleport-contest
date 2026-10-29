#include <assert.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <strings.h>
typedef int coordxy;typedef signed char schar;typedef signed char boolean;typedef long lua_Integer;typedef void*genericptr_t;
#define TRUE 1
#define FALSE 0
#define COLNO 80
#define ROWNO 21
#define MAX_SUBROOMS 24
#define MAXNROFROOMS 40
#define ROOMOFFSET 3
#define SHARED 1
#define UNUSED
#define min(a,b) ((a)<(b)?(a):(b))
#define max(a,b) ((a)>(b)?(a):(b))
#define IS_DOOR(t) ((t)==DOOR)
#define IS_LAVA(t) ((t)==LAVAPOOL||(t)==LAVAWALL)
#define ANY_LOC 16
#define W_ANY 15
#define Free free
#define alloc malloc
#define panic(...) abort()
#define strcmpi strcasecmp
#define LUA_TNIL 0
#define LUA_TSTRING 4
#define LUA_TFUNCTION 6
#define NHLpa_panic 0
enum levl_typ_types {
    STONE     =  0,
    VWALL     =  1,
    HWALL     =  2,
    TLCORNER  =  3,
    TRCORNER  =  4,
    BLCORNER  =  5,
    BRCORNER  =  6,
    CROSSWALL =  7, /* For pretty mazes and special levels */
    TUWALL    =  8,
    TDWALL    =  9,
    TLWALL    = 10,
    TRWALL    = 11,
    DBWALL    = 12,
    TREE      = 13, /* KMH */
    SDOOR     = 14,
    SCORR     = 15,
    POOL      = 16,
    MOAT      = 17, /* pool that doesn't boil, adjust messages */
    WATER     = 18,
    DRAWBRIDGE_UP = 19,
    LAVAPOOL  = 20,
    LAVAWALL  = 21,
    IRONBARS  = 22, /* KMH */
    DOOR      = 23,
    CORR      = 24,
    ROOM      = 25,
    STAIRS    = 26,
    LADDER    = 27,
    FOUNTAIN  = 28,
    THRONE    = 29,
    SINK      = 30,
    GRAVE     = 31,
    ALTAR     = 32,
    ICE       = 33,
    DRAWBRIDGE_DOWN = 34,
    AIR       = 35,
    CLOUD     = 36,

    MAX_TYPE  = 37,
    /* for special levels */
    MATCH_WALL = 38,

    /* these aren't levl[][].typ values, they're additional indices
       into terrain_descr[] for status feedback */
    xFLOOR     = 39,
    xGROUND    = 40,
    xOPENDOOR  = 41,
    xSHUTDOOR  = 42,
    xSWAMP     = 43,
    xSUBMERGED = 44,
    xSEA       = 45,
    xWATERWALL = 46,

    INVALID_TYPE = 127
};
enum roomtype_types {
    OROOM      =  0, /* ordinary room */
    THEMEROOM  =  1, /* like OROOM, but never converted to special room */
    COURT      =  2, /* contains a throne */
    SWAMP      =  3, /* contains pools */
    VAULT      =  4, /* detached room usually reached via teleport trap */
    BEEHIVE    =  5, /* contains killer bees and royal jelly */
    MORGUE     =  6, /* contains corpses, undead and graves */
    BARRACKS   =  7, /* contains soldiers and their gear */
    ZOO        =  8, /* floor covered with treasure and monsters */
    DELPHI     =  9, /* contains Oracle and peripherals */
    TEMPLE     = 10, /* contains a shrine (altar attended by priest[ess]) */
    LEPREHALL  = 11, /* leprechaun hall (Tom Proudfoot) */
    COCKNEST   = 12, /* cockatrice nest (Tom Proudfoot) */
    ANTHOLE    = 13, /* ants (Tom Proudfoot) */
    SHOPBASE   = 14, /* everything above this is a shop */
    ARMORSHOP  = 15, /* specific shop defines for level compiler */
    SCROLLSHOP = 16,
    POTIONSHOP = 17,
    WEAPONSHOP = 18,
    FOODSHOP   = 19,
    RINGSHOP   = 20,
    WANDSHOP   = 21,
    TOOLSHOP   = 22,
    BOOKSHOP   = 23,
    FODDERSHOP = 24, /* health food store */
    CANDLESHOP = 25
};
struct mkroom {
    coordxy lx, hx, ly, hy; /* usually coordxy, but hx may be -1 */
    schar rtype;          /* type of room (zoo, throne, etc...) */
    schar orig_rtype;     /* same as rtype, but not zeroed later */
    schar rlit;           /* is the room lit ? */
    schar needfill;       /* sp_lev: does the room need filling? */
    boolean needjoining;  /* sp_lev: should the room connect to others? */
    schar doorct;         /* door count */
    int   fdoor;          /* index for the first door of the room */
    schar nsubrooms;      /* number of subrooms */
    boolean irregular;    /* true if room is non-rectangular */
    schar roomnoidx;
    struct mkroom *sbrooms[MAX_SUBROOMS]; /* Subrooms pointers */
    struct monst *resident; /* priest/shopkeeper/guard for this room */
};
struct rm {int typ,lit,roomno,edge,horizontal;};static struct rm levl[80][21];
struct sp_coder{int n_subroom;struct mkroom*croom,*tmproomlist[8];int failed_room[8];};static struct sp_coder coder={.n_subroom=1};static struct{struct sp_coder*coder;}gc={&coder};
static struct{struct mkroom rooms[MAXNROFROOMS+1];}svr;static struct{int nroom;}svn;static struct{int doorindex;}gd;
static struct{int in_mk_themerooms;}gi;static struct{int min_rx,max_rx,min_ry,max_ry;}gm;static struct{int smeq[MAXNROFROOMS+1];}gs;
static struct{int xstart,xsize;}gx={1,79};static struct{int ystart,ysize;}gy={0,21};
typedef struct {int x1,y1,x2,y2,rlit;}region;
typedef struct{const char*name,*field;}lua_State;
static char emptystr[]="";
static void create_des_coder(void){}
static void lcheck_param_table(lua_State*L){assert(L&&!L->field);}
static int lua_gettop(lua_State*L){return 1;}
static void lua_getfield(lua_State*L,int i,const char*k){assert((i==-1||i==1)&&!L->field);L->field=k;}
static int lua_type(lua_State*L,int i){assert(i==-1&&L->field);return !strcmp(L->field,"type")?LUA_TSTRING:LUA_TNIL;}
static const char*luaL_optstring(lua_State*L,int i,const char*d){return lua_type(L,i)==LUA_TNIL?d:L->name;}
static void lua_pop(lua_State*L,int n){assert(n==1&&L->field);L->field=NULL;}
static void nhl_error(lua_State*L,const char*s){abort();}
static void nhl_pcall_handle(lua_State*L,int a,int b,const char*s,int m){abort();}
static int get_table_boolean_opt(lua_State*L,const char*k,int d){return d;}
static int get_table_int_opt(lua_State*L,const char*k,int d){if(!strcmp(k,"x1"))return 10;if(!strcmp(k,"y1"))return 6;if(!strcmp(k,"x2"))return 14;if(!strcmp(k,"y2"))return 8;if(!strcmp(k,"lit"))return 0;assert(!strcmp(k,"filled"));return 0;}
static void get_table_region(lua_State*L,const char*k,lua_Integer*a,lua_Integer*b,lua_Integer*c,lua_Integer*d,boolean e){abort();}
static int litstate_rnd(int n){assert(n==0);return n;}
static void get_location(coordxy*x,coordxy*y,int flags,struct mkroom*r){assert(flags==ANY_LOC&&!r&&*x>=0&&*y>=0);*x+=gx.xstart;*y+=gy.ystart;}
static void impossible(const char*s,...){abort();}
static void wallification(int a,int b,int c,int d){abort();}
static void reset_xystart_size(void){abort();}
static void maybe_add_door(int x,int y,struct mkroom*r){abort();}
static void flood_fill_rm(int x,int y,int r,int lit,int any){abort();}
struct selectionvar{int unused;};static struct selectionvar*l_selection_check(lua_State*L,int i){abort();}static struct selectionvar*selection_clone(struct selectionvar*s){abort();}
static void selection_do_grow(struct selectionvar*s,int w){abort();}static void selection_free(struct selectionvar*s,int w){abort();}
static void sel_set_lit(int x,int y,genericptr_t p){abort();}static void selection_iterate(struct selectionvar*s,void(*f)(int,int,genericptr_t),genericptr_t p){abort();}
static int luaL_checkoption(lua_State*L,int i,const char*d,const char*const*a){abort();}
static void lua_remove(lua_State*L,int i){abort();}static void l_push_mkroom_table(lua_State*L,struct mkroom*r){abort();}
static const struct {
    const char *name;
    int type;
} room_types[] = {
    { "ordinary", OROOM },
    { "themed", THEMEROOM },
    { "throne", COURT },
    { "swamp", SWAMP },
    { "vault", VAULT },
    { "beehive", BEEHIVE },
    { "morgue", MORGUE },
    { "barracks", BARRACKS },
    { "zoo", ZOO },
    { "delphi", DELPHI },
    { "temple", TEMPLE },
    { "anthole", ANTHOLE },
    { "cocknest", COCKNEST },
    { "leprehall", LEPREHALL },
    { "shop", SHOPBASE },
    { "armor shop", ARMORSHOP },
    { "scroll shop", SCROLLSHOP },
    { "potion shop", POTIONSHOP },
    { "weapon shop", WEAPONSHOP },
    { "food shop", FOODSHOP },
    { "ring shop", RINGSHOP },
    { "wand shop", WANDSHOP },
    { "tool shop", TOOLSHOP },
    { "book shop", BOOKSHOP },
    { "health food shop", FODDERSHOP },
    { "candle shop", CANDLESHOP },
    { 0, 0 }
};
char *
dupstr(const char *string)
{
    size_t len = strlen(string);

    /* make sure len+1 doesn't overflow plain unsigned (for alloc()) */
    if (len > (unsigned) (~0U - 1U))
        panic("dupstr: string length overflow");

    return strcpy((char *) alloc(len + 1), string);
}

char *
get_table_str_opt(lua_State *L, const char *name, char *defval)
{
    const char *ret;
    int ltyp;

    lua_getfield(L, -1, name);
    ltyp = lua_type(L, -1);
    if (ltyp == LUA_TSTRING || ltyp == LUA_TNIL) {
        ret = luaL_optstring(L, -1, defval);
    } else if (ltyp == LUA_TFUNCTION) {
        nhl_pcall_handle(L, 0, 1, "get_table_str_opt", NHLpa_panic);
        ret = luaL_optstring(L, -1, defval);
    } else {
        nhl_error(L, "get_table_str_opt: no string");
    }
    if (ret) {
        lua_pop(L, 1);
        return dupstr(ret);
    }
    lua_pop(L, 1);
    return NULL;
}

void
do_room_or_subroom(struct mkroom *croom,
                   coordxy lowx, coordxy lowy, coordxy hix, coordxy hiy,
                   boolean lit, schar rtype, boolean special, boolean is_room)
{
    coordxy x, y;
    struct rm *lev;

    /* locations might bump level edges in wall-less rooms */
    /* add/subtract 1 to allow for edge locations */
    if (!lowx)
        lowx++;
    if (!lowy)
        lowy++;
    if (hix >= COLNO - 1)
        hix = COLNO - 2;
    if (hiy >= ROWNO - 1)
        hiy = ROWNO - 2;

    if (lit) {
        for (x = lowx - 1; x <= hix + 1; x++) {
            lev = &levl[x][max(lowy - 1, 0)];
            for (y = lowy - 1; y <= hiy + 1; y++)
                lev++->lit = 1;
        }
        croom->rlit = 1;
    } else
        croom->rlit = 0;

    croom->roomnoidx = (croom - svr.rooms);
    croom->lx = lowx;
    croom->hx = hix;
    croom->ly = lowy;
    croom->hy = hiy;
    croom->rtype = rtype;
    croom->doorct = 0;
    /* if we're not making a vault, gd.doorindex will still be 0
     * if we are, we'll have problems adding niches to the previous room
     * unless fdoor is at least gd.doorindex
     */
    croom->fdoor = gd.doorindex;
    croom->irregular = FALSE;

    croom->nsubrooms = 0;
    croom->sbrooms[0] = (struct mkroom *) 0;
    if (!special) {
        croom->needjoining = TRUE;
        for (x = lowx - 1; x <= hix + 1; x++)
            for (y = lowy - 1; y <= hiy + 1; y += (hiy - lowy + 2)) {
                levl[x][y].typ = HWALL;
                levl[x][y].horizontal = 1; /* For open/secret doors. */
            }
        for (x = lowx - 1; x <= hix + 1; x += (hix - lowx + 2))
            for (y = lowy; y <= hiy; y++) {
                levl[x][y].typ = VWALL;
                levl[x][y].horizontal = 0; /* For open/secret doors. */
            }
        for (x = lowx; x <= hix; x++) {
            lev = &levl[x][lowy];
            for (y = lowy; y <= hiy; y++)
                lev++->typ = ROOM;
        }
        if (is_room) {
            levl[lowx - 1][lowy - 1].typ = TLCORNER;
            levl[hix + 1][lowy - 1].typ = TRCORNER;
            levl[lowx - 1][hiy + 1].typ = BLCORNER;
            levl[hix + 1][hiy + 1].typ = BRCORNER;
        } else { /* a subroom */
            wallification(lowx - 1, lowy - 1, hix + 1, hiy + 1);
        }
    }
}

void
add_room(coordxy lowx, coordxy lowy, coordxy hix, coordxy hiy,
         boolean lit, schar rtype, boolean special)
{
    struct mkroom *croom;

#ifdef DEBUG
    if (svn.nroom >= MAXNROFROOMS)
        panic("level has too many rooms");
#endif /*DEBUG*/
    croom = &svr.rooms[svn.nroom];
    do_room_or_subroom(croom, lowx, lowy, hix, hiy, lit, rtype, special,
                       (boolean) TRUE);
    croom++;
    croom->hx = -1;
    svn.nroom++;
}

int
get_table_roomtype_opt(lua_State *L, const char *name, int defval)
{
    char *roomstr = get_table_str_opt(L, name, emptystr);
    int i, res = defval;

    if (roomstr && *roomstr) {
        for (i = 0; room_types[i].name; i++)
            if (!strcmpi(roomstr, room_types[i].name)) {
                res = room_types[i].type;
                break;
            }
        if (!room_types[i].name)
            impossible("Unknown room type '%s'", roomstr);
    }
    Free(roomstr);
    return res;
}

void
get_table_coords_or_region(lua_State *L,
                           coordxy *dx1, coordxy *dy1,
                           coordxy *dx2, coordxy *dy2)
{
    *dx1 = get_table_int_opt(L, "x1", -1);
    *dy1 = get_table_int_opt(L, "y1", -1);
    *dx2 = get_table_int_opt(L, "x2", -1);
    *dy2 = get_table_int_opt(L, "y2", -1);

    if (*dx1 == -1 && *dy1 == -1 && *dx2 == -1 && *dy2 == -1) {
        lua_Integer rx1, ry1, rx2, ry2;

        get_table_region(L, "region", &rx1, &ry1, &rx2, &ry2, FALSE);
        *dx1 = rx1; *dy1 = ry1;
        *dx2 = rx2; *dy2 = ry2;
    }
}

void
light_region(region *tmpregion)
{
    boolean litstate = tmpregion->rlit ? 1 : 0;
    int hiy = tmpregion->y2;
    int x, y;
    struct rm *lev;
    int lowy = tmpregion->y1;
    int lowx = tmpregion->x1, hix = tmpregion->x2;

    if (litstate) {
        /* adjust region size for walls, but only if lighted */
        lowx = max(lowx - 1, 1);
        hix = min(hix + 1, COLNO - 1);
        lowy = max(lowy - 1, 0);
        hiy = min(hiy + 1, ROWNO - 1);
    }
    for (x = lowx; x <= hix; x++) {
        lev = &levl[x][lowy];
        for (y = lowy; y <= hiy; y++) {
            lev->lit = IS_LAVA(lev->typ) ? 1 : litstate;
            lev++;
        }
    }
}

void
update_croom(void)
{
    if (!gc.coder)
        return;

    if (gc.coder->n_subroom)
        gc.coder->croom = gc.coder->tmproomlist[gc.coder->n_subroom - 1];
    else
        gc.coder->croom = NULL;
}

void
spo_endroom(struct sp_coder *coder UNUSED)
{
    if (gc.coder->n_subroom > 1) {
        gc.coder->n_subroom--;
        gc.coder->tmproomlist[gc.coder->n_subroom] = NULL;
        gc.coder->failed_room[gc.coder->n_subroom] = TRUE;
    } else {
        /* no subroom, get out of top-level room */
        /* Need to ensure xstart/ystart/xsize/ysize have something sensible,
           in case there's some stuff to be created outside the outermost
           room, and there's no MAP. */
        if (gx.xsize <= 1 && gy.ysize <= 1)
            reset_xystart_size();
    }
    update_croom();
}

void
add_doors_to_room(struct mkroom *croom)
{
    coordxy x, y;
    int i;

    for (x = croom->lx - 1; x <= croom->hx + 1; x++)
        for (y = croom->ly - 1; y <= croom->hy + 1; y++)
            if (IS_DOOR(levl[x][y].typ) || levl[x][y].typ == SDOOR)
                maybe_add_door(x, y, croom);
    for (i = 0; i < croom->nsubrooms; i++)
        add_doors_to_room(croom->sbrooms[i]);
}
void topologize(struct mkroom*croom)
{
    coordxy x, y;
    int roomno = (int) ((croom - svr.rooms) + ROOMOFFSET);
    coordxy lowx = croom->lx, lowy = croom->ly;
    coordxy hix = croom->hx, hiy = croom->hy;
#ifdef SPECIALIZATION
    schar rtype = croom->rtype;
#endif
    int subindex, nsubrooms = croom->nsubrooms;

    /* skip the room if already done; i.e. a shop handled out of order */
    /* also skip if this is non-rectangular (it _must_ be done already) */
    if ((int) levl[lowx][lowy].roomno == roomno || croom->irregular)
        return;
#ifdef SPECIALIZATION
    if (Is_rogue_level(&u.uz))
        do_ordinary = TRUE; /* vision routine helper */
    if ((rtype != OROOM) || do_ordinary)
#endif
        {
        /* do innards first */
        for (x = lowx; x <= hix; x++)
            for (y = lowy; y <= hiy; y++)
#ifdef SPECIALIZATION
                if (rtype == OROOM)
                    levl[x][y].roomno = NO_ROOM;
                else
#endif
                    levl[x][y].roomno = roomno;
        /* top and bottom edges */
        for (x = lowx - 1; x <= hix + 1; x++)
            for (y = lowy - 1; y <= hiy + 1; y += (hiy - lowy + 2)) {
                levl[x][y].edge = 1;
                if (levl[x][y].roomno)
                    levl[x][y].roomno = SHARED;
                else
                    levl[x][y].roomno = roomno;
            }
        /* sides */
        for (x = lowx - 1; x <= hix + 1; x += (hix - lowx + 2))
            for (y = lowy; y <= hiy; y++) {
                levl[x][y].edge = 1;
                if (levl[x][y].roomno)
                    levl[x][y].roomno = SHARED;
                else
                    levl[x][y].roomno = roomno;
            }
    }
    /* gs.subrooms */
    for (subindex = 0; subindex < nsubrooms; subindex++)
#ifdef SPECIALIZATION
        topologize(croom->sbrooms[subindex], (boolean) (rtype != OROOM));
#else
        topologize(croom->sbrooms[subindex]);
#endif
}
int
lspo_region(lua_State *L)
{
    coordxy dx1, dy1, dx2, dy2;
    struct mkroom *troom;
    boolean do_arrival_room = FALSE, room_not_needed,
            irregular = FALSE, joined = TRUE;
    int rtype = OROOM, rlit = 1, needfill = 0;
    int argc = lua_gettop(L);

    create_des_coder();

    if (argc <= 1) {
        lcheck_param_table(L);

        /* TODO: "unfilled" => filled=0, "filled" => filled=1, and
         * "lvflags_only" => filled=2, probably in a get_table_needfill_opt */
        needfill = get_table_int_opt(L, "filled", 0);
        irregular = get_table_boolean_opt(L, "irregular", 0);
        joined = get_table_boolean_opt(L, "joined", TRUE);
        do_arrival_room = get_table_boolean_opt(L, "arrival_room", 0);
        rtype = get_table_roomtype_opt(L, "type", OROOM);
        rlit = get_table_int_opt(L, "lit", -1);

        get_table_coords_or_region(L, &dx1, &dy1, &dx2, &dy2);

        if (dx1 == -1 && dy1 == -1 && dx2 == -1 && dy2 == -1) {
            nhl_error(L, "region needs region");
        }

    } else if (argc == 2) {
        /* region(selection, "lit"); */
        static const char *const lits[] = { "unlit", "lit", NULL };
        struct selectionvar *orig = l_selection_check(L, 1),
                            *sel = selection_clone(orig);

        rlit = luaL_checkoption(L, 2, "lit", lits);

        /*
    TODO: lit=random
        */
        if (rlit)
            selection_do_grow(sel, W_ANY);
        selection_iterate(sel, sel_set_lit, (genericptr_t) &rlit);

        selection_free(sel, TRUE);

        /* TODO: skip the rest of this function? */
        return 0;
    } else {
        nhl_error(L, "Wrong parameters");
        /*NOTREACHED*/
        return 0;
    }

    rlit = litstate_rnd(rlit);

    get_location(&dx1, &dy1, ANY_LOC, (struct mkroom *) 0);
    get_location(&dx2, &dy2, ANY_LOC, (struct mkroom *) 0);

    /* Many regions are simple, rectangular areas that just need to set
     * lighting in an area. In that case, we don't need to do anything
     * complicated by creating a room. The exceptions are:
     *  - Special rooms (which usually need to be filled).
     *  - Irregular regions (more convenient to use the room-making code).
     *  - Themed room regions (which often have contents).
     *  - When a room is desired to constrain the arrival of migrating
     *    monsters (see the mon_arrive function for details).
     */
    room_not_needed = (rtype == OROOM && !irregular
                       && !do_arrival_room && !gi.in_mk_themerooms);
    if (room_not_needed || svn.nroom >= MAXNROFROOMS) {
        region tmpregion;
        if (!room_not_needed)
            impossible("Too many rooms on new level!");
        tmpregion.rlit = rlit;
        tmpregion.x1 = dx1;
        tmpregion.y1 = dy1;
        tmpregion.x2 = dx2;
        tmpregion.y2 = dy2;
        light_region(&tmpregion);

        return 0;
    }

    troom = &svr.rooms[svn.nroom];

    /* mark rooms that must be filled, but do it later */
    troom->needfill = needfill;

    troom->needjoining = joined;

    if (irregular) {
        gm.min_rx = gm.max_rx = dx1;
        gm.min_ry = gm.max_ry = dy1;
        gs.smeq[svn.nroom] = svn.nroom;
        flood_fill_rm(dx1, dy1, svn.nroom + ROOMOFFSET, rlit, TRUE);
        add_room(gm.min_rx, gm.min_ry, gm.max_rx, gm.max_ry, FALSE, rtype,
                 TRUE);
        troom->rlit = rlit;
        troom->irregular = TRUE;
    } else {
        add_room(dx1, dy1, dx2, dy2, rlit, rtype, TRUE);
#ifdef SPECIALIZATION
        topologize(troom, FALSE); /* set roomno */
#else
        topologize(troom); /* set roomno */
#endif
    }

    if (!room_not_needed) {
        if (gc.coder->n_subroom > 1) {
            impossible("region as subroom");
        } else {
            gc.coder->tmproomlist[gc.coder->n_subroom] = troom;
            gc.coder->failed_room[gc.coder->n_subroom] = FALSE;
            gc.coder->n_subroom++;
            update_croom();
            lua_getfield(L, 1, "contents");
            if (lua_type(L, -1) == LUA_TFUNCTION) {
                lua_remove(L, -2);
                l_push_mkroom_table(L, troom);
                nhl_pcall_handle(L, 1, 0, "lspo_region", NHLpa_panic);
            } else {
                lua_pop(L, 1);
            }
            spo_endroom(gc.coder);
            add_doors_to_room(troom);
        }
    }

    return 0;
}
int main(int argc,char**argv){assert(argc==2);size_t n=strlen(argv[1]);assert(n%2==0&&n<1000);char*name=calloc(n/2+1,1);for(size_t i=0;i<n/2;i++){unsigned v;assert(sscanf(argv[1]+2*i,"%2x",&v)==1);name[i]=(char)v;}for(int x=0;x<80;x++)for(int y=0;y<21;y++)levl[x][y].typ=ROOM;lua_State L={name,NULL};lspo_region(&L);printf("%d",svn.nroom);for(int i=0;i<svn.nroom;i++){struct mkroom*r=&svr.rooms[i];printf(" %d %d %d %d %d %d %d",r->rtype,r->lx,r->ly,r->hx,r->hy,r->needfill,r->needjoining);}puts("");free(name);}
