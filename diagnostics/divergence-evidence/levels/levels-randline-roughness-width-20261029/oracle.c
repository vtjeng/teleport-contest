#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <limits.h>
typedef int boolean;typedef int16_t coordxy;typedef signed char schar;typedef void*genericptr_t;
typedef struct {int lx,ly,hx,hy;} NhRect;
#define COLNO 80
#define ROWNO 21
#define TRUE 1
#define FALSE 0
#define ANY_LOC 16
#define LUA_TNUMBER 3
#define max(a,b) ((a)>(b)?(a):(b))
#define SP_COORD_PACK(x,y) (((x)&0xffL)|(((y)&0xffL)<<16))
struct selectionvar{int wid,hei,bounds_dirty;NhRect bounds;char*map;};
static void*alloc(unsigned n){void*p=malloc(n);assert(p);return p;}
static void panic(const char*s){abort();}

char*
dupstr(const char *string)
{
    size_t len = strlen(string);

    /* make sure len+1 doesn't overflow plain unsigned (for alloc()) */
    if (len > (unsigned) (~0U - 1U))
        panic("dupstr: string length overflow");

    return strcpy((char *) alloc(len + 1), string);
}
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

struct selectionvar *
selection_clone(struct selectionvar *sel)
{
    struct selectionvar *tmps = (struct selectionvar *) alloc(sizeof *tmps);

    *tmps = *sel;
    tmps->map = dupstr(sel->map);

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

static int calls;
static int rn2(int n){int bound,v;assert(scanf("%d %d",&bound,&v)==2);assert(bound==n&&v>=0&&v<n);calls++;return v;}

void
selection_do_randline(
    coordxy x1, coordxy y1,
    coordxy x2, coordxy y2,
    schar rough,
    schar rec,
    struct selectionvar *ov)
{
    int mx, my;
    int dx, dy;

    if (rec < 1 || (x2 == x1 && y2 == y1))
        return;

    if (rough > max(abs(x2 - x1), abs(y2 - y1)))
        rough = max(abs(x2 - x1), abs(y2 - y1));

    if (rough < 2) {
        mx = ((x1 + x2) / 2);
        my = ((y1 + y2) / 2);
    } else {
        do {
            dx = rn2(rough) - (rough / 2);
            dy = rn2(rough) - (rough / 2);
            mx = ((x1 + x2) / 2) + dx;
            my = ((y1 + y2) / 2) + dy;
        } while ((mx > COLNO - 1 || mx < 0 || my < 0 || my > ROWNO - 1));
    }

    if (!selection_getpoint(mx, my, ov)) {
        selection_setpoint(mx, my, ov, 1);
    }

    rough = (rough * 2) / 3;

    rec--;

    selection_do_randline(x1, y1, mx, my, rough, rec, ov);
    selection_do_randline(mx, my, x2, y2, rough, rec, ov);

    selection_setpoint(x2, y2, ov, 1);
}
typedef struct {int values[5];struct selectionvar*sel[2];int created,cloned;} lua_State;
static struct {struct {void*croom;}*coder;}gc;
static int lua_gettop(lua_State*L){assert(L);return 5;}
static int lua_type(lua_State*L,int i){assert(L&&i==1);return LUA_TNUMBER;}
static int luaL_checkinteger(lua_State*L,int i){assert(i>=1&&i<=5);return L->values[i-1];}
static void lua_pop(lua_State*L,int n){assert(L&&n==5);}
static int l_selection_new(lua_State*L){assert(!L->created);L->sel[0]=selection_new();L->created=1;return 1;}
static int l_selection_clone(lua_State*L){assert(L->created&&!L->cloned);L->sel[1]=selection_clone(L->sel[0]);L->cloned=1;return 1;}
static struct selectionvar*l_selection_check(lua_State*L,int i){assert((i==1&&L->created)||(i==2&&L->cloned));return L->sel[i-1];}
/* Explicit interior endpoints under the default map frame(1,0); no rooms/random coordinates. */
static void get_location_coord(coordxy*x,coordxy*y,int humidity,void*room,long packed){assert(humidity==ANY_LOC&&!room&&packed==SP_COORD_PACK(*x,*y));assert((*x==20&&*y==8)||(*x==30&&*y==12));(*x)++;}

int
l_selection_randline(lua_State *L)
{
    int argc = lua_gettop(L);
    struct selectionvar *sel;
    coordxy x1 = 0, y1 = 0, x2 = 0, y2 = 0;
    int roughness = 7;

    if (argc == 6) {
        (void) l_selection_check(L, 1);
        x1 = (coordxy) luaL_checkinteger(L, 2);
        y1 = (coordxy) luaL_checkinteger(L, 3);
        x2 = (coordxy) luaL_checkinteger(L, 4);
        y2 = (coordxy) luaL_checkinteger(L, 5);
        roughness = (int) luaL_checkinteger(L, 6);
        lua_pop(L, 5);
    } else if (argc == 5 && lua_type(L, 1) == LUA_TNUMBER) {
        x1 = (coordxy) luaL_checkinteger(L, 1);
        y1 = (coordxy) luaL_checkinteger(L, 2);
        x2 = (coordxy) luaL_checkinteger(L, 3);
        y2 = (coordxy) luaL_checkinteger(L, 4);
        roughness = (int) luaL_checkinteger(L, 5);
        lua_pop(L, 5);
        (void) l_selection_new(L);
        (void) l_selection_check(L, 1);
    }

    get_location_coord(&x1, &y1, ANY_LOC, gc.coder ? gc.coder->croom : NULL,
                       SP_COORD_PACK(x1, y1));
    get_location_coord(&x2, &y2, ANY_LOC, gc.coder ? gc.coder->croom : NULL,
                       SP_COORD_PACK(x2, y2));

    (void) l_selection_clone(L);
    sel = l_selection_check(L, 2);
    selection_do_randline(x1, y1, x2, y2, roughness, 12, sel);
    return 1;
}
int main(int argc,char**argv){assert(argc==2);assert(CHAR_BIT==8&&SCHAR_MIN==-128&&SCHAR_MAX==127);int rough=atoi(argv[1]);assert(rough>=0&&rough<=256);lua_State L={.values={20,8,30,12,rough}};l_selection_randline(&L);printf("%d %d\n",(int)(schar)rough,calls);for(int x=0;x<COLNO;x++)for(int y=0;y<ROWNO;y++)if(selection_getpoint(x,y,L.sel[1]))printf("%d %d\n",x,y);/* Drain unused comparison tape after evaluation to keep stdin delivery deterministic. */
while(getchar()!=EOF){}selection_free(L.sel[0],TRUE);selection_free(L.sel[1],TRUE);return 0;}
