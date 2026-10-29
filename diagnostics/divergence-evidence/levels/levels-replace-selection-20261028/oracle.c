#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
typedef int coordxy;typedef int boolean;typedef long lua_Integer;typedef void *genericptr_t;
typedef struct {int lx,ly,hx,hy;} NhRect;
#define COLNO 80
#define ROWNO 21
#define TRUE 1
#define FALSE 0
#define ANY_LOC 16
#define INVALID_TYPE -1
#define MAX_TYPE 37
#define MATCH_WALL 99
#define IS_STWALL(t) ((t)<=12)
#define SET_LIT_NOCHANGE -2
#define LUA_TNIL 0
#define alloc malloc
#define min(a,b) ((a)<(b)?(a):(b))
#define max(a,b) ((a)>(b)?(a):(b))
struct selectionvar {int wid,hei,bounds_dirty;NhRect bounds;char *map;};
void selection_recalc_bounds(struct selectionvar*);int selection_getpoint(int,int,struct selectionvar*);
struct mapfragment {int dummy;};
static struct {int typ;} levl[80][21];
static struct {NhRect zeroNhRect;} cg;
static struct {struct {void *croom;} *coder;} gc;
typedef struct {int form,chance;struct selectionvar *sel;} lua_State;
static void create_des_coder(void){static struct {void*croom;} coder;gc.coder=(void*)&coder;}
static void lcheck_param_table(lua_State*L){assert(L);}
static int get_table_mapchr(lua_State*L,const char*n){(void)L;assert(!strcmp(n,"toterrain"));return 24;}
static int get_table_mapchr_opt(lua_State*L,const char*n,int d){(void)L;(void)d;assert(!strcmp(n,"fromterrain"));return 25;}
static int get_table_int_opt(lua_State*L,const char*n,int d){if(!strcmp(n,"chance"))return L->chance;if(!strcmp(n,"lit"))return d;if(L->form!=2)return d;if(!strcmp(n,"x1")||!strcmp(n,"y1"))return 0;if(!strcmp(n,"x2"))return 3;if(!strcmp(n,"y2"))return 2;abort();}
static int get_table_region(lua_State*L,const char*n,lua_Integer*a,lua_Integer*b,lua_Integer*c,lua_Integer*d,int opt){assert(!strcmp(n,"region")&&opt);if(L->form==1){*a=*b=0;*c=3;*d=2;}return 1;}
static void lua_getfield(lua_State*L,int i,const char*n){(void)L;assert(i==1&&!strcmp(n,"selection"));}
static int lua_type(lua_State*L,int i){assert(i==-1);return L->form>=3?1:LUA_TNIL;}
static void lua_pop(lua_State*L,int n){(void)L;assert(n==1);}
static struct selectionvar*l_selection_check(lua_State*L,int i){assert(i==-1);return L->sel;}
static void get_location(coordxy*x,coordxy*y,int flags,void*room){assert(flags==ANY_LOC&&!room&&*x>=0&&*y>=0);(*x)++;}
static int calls;
static int rn2(int n){int bound,val;assert(scanf("%d %d",&bound,&val)==2);assert(bound==n&&val>=0&&val<n);calls++;return val;}
static int set_levltyp_lit(int x,int y,int typ,int lit){assert(typ==24&&lit==-2);levl[x][y].typ=typ;return 1;}
static char*get_table_str(lua_State*L,const char*n){(void)L;(void)n;abort();}
static struct mapfragment*mapfrag_fromstr(char*s){(void)s;abort();}
static const char*mapfrag_error(struct mapfragment*m){(void)m;abort();}
static int mapfrag_match(struct mapfragment*m,int x,int y){(void)m;(void)x;(void)y;abort();}
static void mapfrag_free(struct mapfragment**m){assert(!*m);}
static void nhl_error(lua_State*L,const char*s){(void)L;(void)s;abort();}
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
selection_clear(struct selectionvar *sel, int val)
{
    (void) memset(sel->map, 1 + val, (COLNO * ROWNO));
    if (val) {
        sel->bounds.lx = 0;
        sel->bounds.ly = 0;
        sel->bounds.hx = COLNO - 1;
        sel->bounds.hy = ROWNO - 1;
    } else {
        sel->bounds.lx = COLNO;
        sel->bounds.ly = ROWNO;
        sel->bounds.hx = sel->bounds.hy = 0;
    }
    sel->bounds_dirty = FALSE;
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
int
lspo_replace_terrain(lua_State *L)
{
    coordxy totyp, fromtyp;
    struct mapfragment *mf = NULL;
    struct selectionvar *sel = NULL;
    boolean freesel = FALSE;
    coordxy x, y;
    lua_Integer x1, y1, x2, y2;
    int chance;
    int tolit;
    NhRect rect = cg.zeroNhRect;

    create_des_coder();

    lcheck_param_table(L);

    totyp = get_table_mapchr(L, "toterrain");

    if (totyp >= MAX_TYPE)
        return 0;

    fromtyp = get_table_mapchr_opt(L, "fromterrain", INVALID_TYPE);

    if (fromtyp == INVALID_TYPE) {
        const char *err;
        char *tmpstr = get_table_str(L, "mapfragment");
        mf = mapfrag_fromstr(tmpstr);
        free(tmpstr);

        if ((err = mapfrag_error(mf)) != NULL) {
            nhl_error(L, err);
            /*NOTREACHED*/
        }
    }

    chance = get_table_int_opt(L, "chance", 100);
    tolit = get_table_int_opt(L, "lit", SET_LIT_NOCHANGE);
    x1 = get_table_int_opt(L, "x1", -1);
    y1 = get_table_int_opt(L, "y1", -1);
    x2 = get_table_int_opt(L, "x2", -1);
    y2 = get_table_int_opt(L, "y2", -1);

    if (x1 == -1 && y1 == -1 && x2 == -1 && y2 == -1) {
        get_table_region(L, "region", &x1, &y1, &x2, &y2, TRUE);
    }

    if (x1 == -1 && y1 == -1 && x2 == -1 && y2 == -1) {
        lua_getfield(L, 1, "selection");
        if (lua_type(L, -1) != LUA_TNIL)
            sel = l_selection_check(L, -1);
        lua_pop(L, 1);
    }

    if (!sel) {
        sel = selection_new();
        freesel = TRUE;

        if (x1 == -1 && y1 == -1 && x2 == -1 && y2 == -1) {
            (void) selection_clear(sel, 1);
        } else {
            coordxy rx1, ry1, rx2, ry2;
            rx1 = x1, ry1 = y1, rx2 = x2, ry2 = y2;
            get_location(&rx1, &ry1, ANY_LOC, gc.coder->croom);
            get_location(&rx2, &ry2, ANY_LOC, gc.coder->croom);
            for (x = max(rx1, 0); x <= min(rx2, COLNO - 1); x++)
                for (y = max(ry1, 0); y <= min(ry2, ROWNO - 1); y++)
                    selection_setpoint(x, y, sel, 1);
        }
    }

    selection_getbounds(sel, &rect);

    for (x = max(1, rect.lx); x <= rect.hx; x++)
        for (y = rect.ly; y <= rect.hy; y++)
            if (selection_getpoint(x, y,sel)) {
                if (mf) {
                    if (mapfrag_match(mf, x, y) && (rn2(100)) < chance)
                        (void) set_levltyp_lit(x, y, totyp, tolit);
                } else {
                    if (((fromtyp == MATCH_WALL && IS_STWALL(levl[x][y].typ))
                         || levl[x][y].typ == fromtyp)
                        && rn2(100) < chance)
                        (void) set_levltyp_lit(x, y, totyp, tolit);
                }
            }

    if (freesel)
        selection_free(sel, TRUE);

    mapfrag_free(&mf);

    return 0;
}
int main(int argc,char**argv){assert(argc==3);lua_State L={atoi(argv[1]),atoi(argv[2]),NULL};int points[5][2]={{2,2},{3,2},{4,2},{4,3},{8,8}};for(int i=0;i<5;i++)levl[points[i][0]][points[i][1]].typ=25;if(L.form>=3){L.sel=selection_new();if(L.form==3){selection_setpoint(2,2,L.sel,1);selection_setpoint(4,3,L.sel,1);}}assert(lspo_replace_terrain(&L)==0);int extra;assert(scanf("%d",&extra)==EOF);printf("%d",calls);for(int x=1;x<80;x++)for(int y=0;y<21;y++)if(levl[x][y].typ==24)printf(" %d,%d",x,y);puts("");selection_free(L.sel,TRUE);return 0;}
