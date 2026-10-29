#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
typedef int coordxy;typedef int boolean;typedef void*genericptr_t;
typedef struct {int lx,ly,hx,hy;} NhRect;
#define COLNO 80
#define ROWNO 21
#define TRUE 1
#define FALSE 0
#define alloc malloc
#define min(a,b) ((a)<(b)?(a):(b))
#define max(a,b) ((a)>(b)?(a):(b))
struct selectionvar {int wid,hei,bounds_dirty;NhRect bounds;char*map;};
static struct {NhRect zeroNhRect;} cg;
void selection_recalc_bounds(struct selectionvar*);int selection_getpoint(int,int,struct selectionvar*);
struct selectionvar *
selection_new(void)
{
    struct selectionvar *tmps = (struct selectionvar *) alloc(sizeof *tmps);

    tmps->wid = COLNO;
    tmps->hei = ROWNO;
    tmps->bounds_dirty = FALSE;
    tmps->bounds.lx = COLNO;
    tmps->bounds.ly = ROWNO;
    tmps->bounds.hx = tmps->bounds.hy = 0;
    tmps->map = (char *) alloc((COLNO * ROWNO) + 1);
    (void) memset(tmps->map, 1, (COLNO * ROWNO));
    tmps->map[(COLNO * ROWNO)] = '\0';

    return tmps;
}
void
selection_free(struct selectionvar *sel, boolean freesel)
{
    if (sel) {
        if (sel->map)
            free(sel->map);
        sel->map = NULL;
        if (freesel)
            free((genericptr_t) sel);
        else
            (void) memset((genericptr_t) sel, 0, sizeof *sel);
    }
}
void
selection_getbounds(struct selectionvar *sel, NhRect *b)
{
    if (!sel || !b)
        return;

    selection_recalc_bounds(sel);

    if (sel->bounds.lx >= sel->wid) {
        b->lx = 0;
        b->ly = 0;
        b->hx = COLNO - 1;
        b->hy = ROWNO - 1;
    } else {
        b->lx = sel->bounds.lx;
        b->ly = sel->bounds.ly;
        b->hx = sel->bounds.hx;
        b->hy = sel->bounds.hy;
    }
}
void
selection_recalc_bounds(struct selectionvar *sel)
{
    coordxy x, y;
    NhRect r;

    if (!sel->bounds_dirty)
        return;

    sel->bounds.lx = COLNO;
    sel->bounds.ly = ROWNO;
    sel->bounds.hx = sel->bounds.hy = 0;

    r.lx = r.ly = r.hx = r.hy = -1;

    /* left */
    for (x = 0; x < sel->wid; x++) {
        for (y = 0; y < sel->hei; y++) {
            if (selection_getpoint(x, y, sel)) {
                r.lx = x;
                break;
            }
        }
        if (r.lx > -1)
            break;
    }

    if (r.lx > -1) {
        /* right */
        for (x = sel->wid-1; x >= r.lx; x--) {
            for (y = 0; y < sel->hei; y++) {
                if (selection_getpoint(x, y, sel)) {
                    r.hx = x;
                    break;
                }
            }
            if (r.hx > -1)
                break;
        }

        /* top */
        for (y = 0; y < sel->hei; y++) {
            for (x = r.lx; x <= r.hx; x++) {
                if (selection_getpoint(x, y, sel)) {
                    r.ly = y;
                    break;
                }
            }
            if (r.ly > -1)
                break;
        }

        /* bottom */
        for (y = sel->hei-1; y >= r.ly; y--) {
            for (x = r.lx; x <= r.hx; x++) {
                if (selection_getpoint(x, y, sel)) {
                    r.hy = y;
                    break;
                }
            }
            if (r.hy > -1)
                break;
        }
        sel->bounds = r;
    }

    sel->bounds_dirty = FALSE;
}
coordxy
selection_getpoint(
    coordxy x, coordxy y,
    struct selectionvar *sel)
{
    if (!sel || !sel->map)
        return 0;
    if (x < 0 || y < 0 || x >= sel->wid || y >= sel->hei)
        return 0;

    return (sel->map[sel->wid * y + x] - 1);
}
void
selection_setpoint(
    coordxy x, coordxy y,
    struct selectionvar *sel,
    int c)
{
    if (!sel || !sel->map)
        return;
    if (x < 0 || y < 0 || x >= sel->wid || y >= sel->hei)
        return;

    if (c && !sel->bounds_dirty) {
        if (sel->bounds.lx > x)
            sel->bounds.lx = x;
        if (sel->bounds.ly > y)
            sel->bounds.ly = y;
        if (sel->bounds.hx < x)
            sel->bounds.hx = x;
        if (sel->bounds.hy < y)
            sel->bounds.hy = y;

    /* only set bounds_dirty if changing a point from 1 to 0; if changing
       a point from 0 to 0, nothing has really changed with the bounds */
    } else if (sel->map[sel->wid * y + x] != 0) {
        sel->bounds_dirty = TRUE;
    }

    sel->map[sel->wid * y + x] = (char) (c + 1);
}

#define ANY_LOC 16
#define SP_COORD_PACK(x,y) ((long)(x)|((long)(y)<<16))
#define SP_COORD_PACK_RANDOM(x) (-1L)
typedef struct {int argc,x,y,val;struct selectionvar*sel;int popped,newcalls,settop;} lua_State;
static int originx,originy;
static struct {struct {void*croom;} *coder;} gc;
static int lua_gettop(lua_State*L){return L->argc;}
static int luaL_checkinteger(lua_State*L,int n){assert((L->argc==2&&(n==1||n==2))||(L->argc>=3&&(n==2||n==3)));return n==(L->argc==2?1:2)?L->x:L->y;}
static int luaL_optinteger(lua_State*L,int n,int def){assert(n==4&&def==1);return L->argc==4?L->val:def;}
static void lua_pop(lua_State*L,int n){assert(L->argc==2&&n==2);L->popped=2;}
static struct selectionvar*l_selection_check(lua_State*L,int n){assert(n==1&&L->sel);return L->sel;}
static int l_selection_new(lua_State*L){assert(L->argc==2&&L->popped==2&&!L->sel);L->sel=selection_new();L->newcalls++;return 1;}
static void nhl_error(lua_State*L,const char*s){(void)L;(void)s;assert(!"invalid input outside fixture");}
static void lua_settop(lua_State*L,int n){assert(n==1);L->settop=1;}
/* Typed coordinate adapter: explicit positive map-relative coordinates only. */
static void get_location_coord(coordxy*x,coordxy*y,int humid,void*room,long packed){assert(humid==ANY_LOC&&!room&&*x>=0&&*y>=0&&packed==SP_COORD_PACK(*x,*y));*x+=originx;*y+=originy;assert(*x>0&&*x<80&&*y>=0&&*y<21);}
static int
l_selection_setpoint(lua_State *L)
{
    struct selectionvar *sel = (struct selectionvar *) 0;
    coordxy x = -1, y = -1;
    int val = 1;
    int argc = lua_gettop(L);
    long crd = 0L;

    if (argc == 0) {
        (void) l_selection_new(L);
    } else if (argc == 1) {
        sel = l_selection_check(L, 1);
    } else if (argc == 2) {
        x = (coordxy) luaL_checkinteger(L, 1);
        y = (coordxy) luaL_checkinteger(L, 2);
        lua_pop(L, 2);
        (void) l_selection_new(L);
        sel = l_selection_check(L, 1);
    } else {
        sel = l_selection_check(L, 1);
        x = (coordxy) luaL_checkinteger(L, 2);
        y = (coordxy) luaL_checkinteger(L, 3);
        val = (int) luaL_optinteger(L, 4, 1);
    }

    if (!sel || !sel->map) {
        nhl_error(L, "Selection setpoint error");
        /*NOTREACHED*/
        return 0;
    }

    if (x == -1 && y == -1)
        crd = SP_COORD_PACK_RANDOM(0);
    else
        crd = SP_COORD_PACK(x,y);
    get_location_coord(&x, &y, ANY_LOC,
                       gc.coder ? gc.coder->croom : NULL, crd);
    selection_setpoint(x, y, sel, val);
    lua_settop(L, 1);
    return 1;
}
int main(int argc,char**argv){assert(argc==6);int form=atoi(argv[1]),value=atoi(argv[2]),frame=atoi(argv[3]),point=atoi(argv[4]),anchor=atoi(argv[5]);assert((form==2||form==3||form==4)&&value>=0&&value<=126&&(frame==0||frame==1)&&(point==0||point==1)&&anchor==(form!=2));originx=frame?10:1;originy=frame?6:0;
lua_State L={.argc=form,.x=point?4:2,.y=point?3:2,.val=value};if(anchor){L.sel=selection_new();selection_setpoint(35,17,L.sel,1);}assert(l_selection_setpoint(&L)==1&&L.settop==1&&L.newcalls==(form==2));
for(int i=0;i<COLNO*ROWNO;i++)printf("%02x",(unsigned char)L.sel->map[i]);NhRect b;selection_getbounds(L.sel,&b);printf(" %d %d %d %d\n",b.lx,b.ly,b.hx,b.hy);selection_free(L.sel,TRUE);return 0;}
