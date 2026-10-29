#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
typedef signed char schar;typedef int boolean;typedef short coordxy;
#define COLNO 80
#define ROWNO 21
#define TRUE 1
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
#define IS_WALL(typ) ((typ) && (typ) <= DBWALL)
#define IS_OBSTRUCTED(typ) ((typ) < POOL)      /* absolutely nonaccessible */
#define ICED_POOL 8
#define ICED_MOAT 16
static struct {int typ,lit,icedpool,roomno;} levl[COLNO][ROWNO];
static struct {int nroom;} svn;
struct room {int rlit;};
static struct {struct room rooms[80];} svr;
static void wallify_map(int a,int b,int c,int d){(void)a;(void)b;(void)c;(void)d;assert(!"walled outside this proof");}

#define FALSE 0
#define NO_ROOM 0
#define HEIGHT (ROWNO - 1)
#define WIDTH (COLNO - 2)
#define N_P1_ITER 1
#define N_P2_ITER 1
#define N_P3_ITER 2
#define new_loc(i, j) *(gn.new_locations + ((j) * (WIDTH + 1)) + (i))
typedef short xint16;
typedef struct{int bg,fg,smoothed,joined,lit,walled,icedpools;}lev_init;
static struct{char*new_locations;}gn;
static struct{struct{struct{int is_maze_lev,is_cavernous_lev;}flags;}level;}svl;
static struct{int uz;}u;
static int depth(int*p){(void)p;abort();} /* negative light excluded */
static int expectedCalls,consumed;
static int read_draw(int expectedOp,int expectedBound){int op,n,value;assert(consumed<expectedCalls&&scanf("%d%d%d",&op,&n,&value)==3);assert(op==expectedOp&&n==expectedBound);assert(value>=(op?1:0)&&value<(op?n+1:n));consumed++;return value;}
static int rn1(int n,int b){return b+read_draw(0,n);}
static int rn2(int n){return read_draw(0,n);}
static int rnd(int n){return read_draw(1,n);}
static void*alloc(size_t n){void*p=malloc(n);assert(p);return p;}
static void join_map(schar a,schar b){(void)a;(void)b;abort();} /* joined=false */
static const int dirs[16] = {
    -1, -1 /**/, -1,  0 /**/, -1, 1 /**/, 0, -1 /**/,
     0,  1 /**/,  1, -1 /**/,  1, 0 /**/, 1,  1
};
void
init_map(schar bg_typ)
{
    coordxy x, y;

    for (x = 1; x < COLNO; x++)
        for (y = 0; y < ROWNO; y++) {
            levl[x][y].roomno = NO_ROOM;
            levl[x][y].typ = bg_typ;
            levl[x][y].lit = FALSE;
        }
}

void
init_fill(schar bg_typ, schar fg_typ)
{
    coordxy x, y;
    long limit, count;

    limit = (WIDTH * HEIGHT * 2) / 5;
    count = 0;
    while (count < limit) {
        x = (coordxy) rn1(WIDTH - 1, 2);
        y = (coordxy) rnd(HEIGHT - 1);
        if (levl[x][y].typ == bg_typ) {
            levl[x][y].typ = fg_typ;
            count++;
        }
    }
}

schar
get_map(coordxy col, coordxy row, schar bg_typ)
{
    if (col <= 0 || row < 0 || col > WIDTH || row >= HEIGHT)
        return bg_typ;
    return levl[col][row].typ;
}

void
pass_one(schar bg_typ, schar fg_typ)
{
    coordxy x, y;
    short count, dr;

    for (x = 2; x <= WIDTH; x++)
        for (y = 1; y < HEIGHT; y++) {
            for (count = 0, dr = 0; dr < 8; dr++)
                if (get_map(x + dirs[dr * 2], y + dirs[(dr * 2) + 1], bg_typ)
                    == fg_typ)
                    count++;

            switch (count) {
            case 0: /* death */
            case 1:
            case 2:
                levl[x][y].typ = bg_typ;
                break;
            case 5:
            case 6:
            case 7:
            case 8:
                levl[x][y].typ = fg_typ;
                break;
            default:
                break;
            }
        }
}

void
pass_two(schar bg_typ, schar fg_typ)
{
    coordxy x, y;
    short count, dr;

    for (x = 2; x <= WIDTH; x++)
        for (y = 1; y < HEIGHT; y++) {
            for (count = 0, dr = 0; dr < 8; dr++)
                if (get_map(x + dirs[dr * 2], y + dirs[(dr * 2) + 1], bg_typ)
                    == fg_typ)
                    count++;
            if (count == 5)
                new_loc(x, y) = bg_typ;
            else
                new_loc(x, y) = get_map(x, y, bg_typ);
        }

    for (x = 2; x <= WIDTH; x++)
        for (y = 1; y < HEIGHT; y++)
            levl[x][y].typ = new_loc(x, y);
}

void
pass_three(schar bg_typ, schar fg_typ)
{
    coordxy x, y;
    short count, dr;

    for (x = 2; x <= WIDTH; x++)
        for (y = 1; y < HEIGHT; y++) {
            for (count = 0, dr = 0; dr < 8; dr++)
                if (get_map(x + dirs[dr * 2], y + dirs[(dr * 2) + 1], bg_typ)
                    == fg_typ)
                    count++;
            if (count < 3)
                new_loc(x, y) = bg_typ;
            else
                new_loc(x, y) = get_map(x, y, bg_typ);
        }

    for (x = 2; x <= WIDTH; x++)
        for (y = 1; y < HEIGHT; y++)
            levl[x][y].typ = new_loc(x, y);
}

void
finish_map(
    schar fg_typ,
    schar bg_typ,
    boolean lit,
    boolean walled,
    boolean icedpools)
{
    coordxy x, y;

    if (walled)
        wallify_map(1, 0, COLNO-1, ROWNO-1);

    if (lit) {
        for (x = 1; x < COLNO; x++)
            for (y = 0; y < ROWNO; y++)
                if ((!IS_OBSTRUCTED(fg_typ) && levl[x][y].typ == fg_typ)
                    || (!IS_OBSTRUCTED(bg_typ) && levl[x][y].typ == bg_typ)
                    || (bg_typ == TREE && levl[x][y].typ == bg_typ)
                    || (walled && IS_WALL(levl[x][y].typ)))
                    levl[x][y].lit = TRUE;
        for (x = 0; x < svn.nroom; x++)
            svr.rooms[x].rlit = 1;
    }
    /* light lava even if everything's otherwise unlit;
       ice might be frozen pool rather than frozen moat */
    for (x = 1; x < COLNO; x++)
        for (y = 0; y < ROWNO; y++) {
            if (levl[x][y].typ == LAVAPOOL)
                levl[x][y].lit = TRUE;
            else if (levl[x][y].typ == ICE)
                levl[x][y].icedpool = icedpools ? ICED_POOL : ICED_MOAT;
        }
}

boolean
litstate_rnd(int litstate)
{
    if (litstate < 0)
        return (rnd(1 + abs(depth(&u.uz))) < 11 && rn2(77)) ? TRUE : FALSE;
    return (boolean) litstate;
}

void
mkmap(lev_init *init_lev)
{
    schar bg_typ = init_lev->bg, fg_typ = init_lev->fg;
    boolean smooth = init_lev->smoothed, join = init_lev->joined;
    xint16 lit = init_lev->lit, walled = init_lev->walled;
    int i;

    lit = litstate_rnd(lit);

    gn.new_locations = (char *) alloc((WIDTH + 1) * HEIGHT);

    init_map(bg_typ);
    init_fill(bg_typ, fg_typ);

    for (i = 0; i < N_P1_ITER; i++)
        pass_one(bg_typ, fg_typ);

    for (i = 0; i < N_P2_ITER; i++)
        pass_two(bg_typ, fg_typ);

    if (smooth)
        for (i = 0; i < N_P3_ITER; i++)
            pass_three(bg_typ, fg_typ);

    if (join)
        join_map(bg_typ, fg_typ);

    finish_map(fg_typ, bg_typ, (boolean) lit, (boolean) walled,
               init_lev->icedpools);
    /* a walled, joined level is cavernous, not mazelike -dlc */
    if (walled && join) {
        svl.level.flags.is_maze_lev = FALSE;
        svl.level.flags.is_cavernous_lev = TRUE;
    }
    free(gn.new_locations);
}
int main(int argc,char**argv){assert(argc==6);lev_init l={.fg=atoi(argv[1]),.bg=atoi(argv[2]),.lit=atoi(argv[3]),.smoothed=atoi(argv[4]),.joined=0,.walled=0,.icedpools=0};assert(l.lit==0||l.lit==1);assert(l.smoothed==0||l.smoothed==1);expectedCalls=atoi(argv[5]);assert(expectedCalls>0);mkmap(&l);assert(consumed==expectedCalls);printf("%d\n",consumed);for(int x=0;x<COLNO;x++)for(int y=0;y<ROWNO;y++)printf("%d %d %d %d\n",levl[x][y].typ,levl[x][y].lit,levl[x][y].roomno,levl[x][y].icedpool);return 0;}
