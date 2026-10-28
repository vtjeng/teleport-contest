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
void
rect_bounds(NhRect r1, NhRect r2, NhRect *r3)
{
    r3->lx = min(r1.lx, r2.lx);
    r3->ly = min(r1.ly, r2.ly);
    r3->hx = max(r1.hx, r2.hx);
    r3->hy = max(r1.hy, r2.hy);
}
typedef struct {struct selectionvar*a,*b,*out;int removed;} lua_State;
static struct selectionvar*l_selection_check(lua_State*L,int i){assert(i==1||i==2);return i==1?L->a:L->b;}
static struct selectionvar*l_selection_push_new(lua_State*L){assert(!L->out);return L->out=selection_new();}
static void lua_remove(lua_State*L,int i){assert(i==1);L->removed++;}
static int
l_selection_or(lua_State *L)
{
    int x,y;
    struct selectionvar *sela = l_selection_check(L, 1);
    struct selectionvar *selb = l_selection_check(L, 2);
    struct selectionvar *selr = l_selection_push_new(L);
    NhRect rect = cg.zeroNhRect;

    rect_bounds(sela->bounds, selb->bounds, &rect);

    for (x = rect.lx; x <= rect.hx; x++)
        for (y = rect.ly; y <= rect.hy; y++) {
            int val = (selection_getpoint(x, y, sela)
                       | selection_getpoint(x, y, selb));

            selection_setpoint(x, y, selr, val);
        }
    selr->bounds = rect;

    lua_remove(L, 1);
    lua_remove(L, 1);
    return 1;
}
static int
l_selection_sub(lua_State *L)
{
    int x,y;
    struct selectionvar *sela = l_selection_check(L, 1);
    struct selectionvar *selb = l_selection_check(L, 2);
    struct selectionvar *selr = l_selection_push_new(L);
    NhRect rect = cg.zeroNhRect;

    rect_bounds(sela->bounds, selb->bounds, &rect);

    for (x = rect.lx; x <= rect.hx; x++)
        for (y = rect.ly; y <= rect.hy; y++) {
            coordxy a_pt = selection_getpoint(x, y, sela);
            coordxy b_pt = selection_getpoint(x, y, selb);
            int val = (a_pt ^ b_pt) & a_pt;
            selection_setpoint(x, y, selr, val);
        }
    /* this may have created a smaller or irregular selection with
     * bounds_dirty set to true - update its boundaries */
    selection_recalc_bounds(selr);

    lua_remove(L, 1);
    lua_remove(L, 1);
    return 1;
}
int main(int argc,char**argv){assert(argc==5);int op=atoi(argv[1]),a=atoi(argv[2]),b=atoi(argv[3]),layout=atoi(argv[4]);assert(op>=0&&op<=1&&a>=0&&a<=7&&b>=0&&b<=7&&layout>=0&&layout<=1);lua_State L={selection_new(),selection_new(),NULL,0};selection_setpoint(3,4,L.a,a);selection_setpoint(layout?7:3,layout?2:4,L.b,b);if(op)l_selection_sub(&L);else l_selection_or(&L);assert(L.removed==2);for(int i=0;i<COLNO*ROWNO;i++)printf("%02x",(unsigned char)L.out->map[i]);NhRect r;selection_getbounds(L.out,&r);printf(" %d %d %d %d\n",r.lx,r.ly,r.hx,r.hy);selection_free(L.a,TRUE);selection_free(L.b,TRUE);selection_free(L.out,TRUE);return 0;}
