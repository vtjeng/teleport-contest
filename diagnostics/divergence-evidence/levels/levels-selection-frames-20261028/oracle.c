#include <stdio.h>
#include <string.h>
typedef int coordxy;
typedef struct {int lx,ly,hx,hy;} NhRect;
struct selectionvar {int points[80][21];NhRect bounds;};
typedef struct {struct selectionvar *a,*b,*out;} lua_State;
#define staticfn static
static struct {NhRect zeroNhRect;} cg;
static int selection_getpoint(int x,int y,struct selectionvar *s){return s->points[x][y];}
static void selection_setpoint(int x,int y,struct selectionvar *s,int v){s->points[x][y]=v;}
static struct selectionvar *l_selection_check(lua_State *L,int i){return i==1?L->a:L->b;}
static struct selectionvar *l_selection_push_new(lua_State *L){memset(L->out,0,sizeof *L->out);return L->out;}
/* Fixed argument adapter, not a Lua runtime; removal doesn't affect stored result. */
static void lua_remove(lua_State *L,int i){(void)L;(void)i;}
static void rect_bounds(NhRect a,NhRect b,NhRect *r){
 r->lx=a.lx<b.lx?a.lx:b.lx;r->ly=a.ly<b.ly?a.ly:b.ly;
 r->hx=a.hx>b.hx?a.hx:b.hx;r->hy=a.hy>b.hy?a.hy:b.hy;
}
static void selection_recalc_bounds(struct selectionvar *s){
 s->bounds=(NhRect){80,21,0,0};
 for(int x=0;x<80;x++)for(int y=0;y<21;y++)if(s->points[x][y]){
 if(x<s->bounds.lx)s->bounds.lx=x;if(x>s->bounds.hx)s->bounds.hx=x;
 if(y<s->bounds.ly)s->bounds.ly=y;if(y>s->bounds.hy)s->bounds.hy=y;}
}
staticfn int
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
staticfn int
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
int main(int argc,char **argv){
 if(argc!=2)return 2;
 struct selectionvar a={0},b={0},out={0};
 /* Valid constructor postconditions for default xstart=1:
  * area(10,10,10,10) resolves to (11,10); match('.') sees the
  * sole ROOM at (11,10). Both C constructors return absolute points. */
 selection_setpoint(11,10,&a,1);selection_setpoint(11,10,&b,1);
 selection_recalc_bounds(&a);selection_recalc_bounds(&b);
 lua_State L={&a,&b,&out};
 if(!strcmp(argv[1],"or"))l_selection_or(&L);else l_selection_sub(&L);
 for(int x=1;x<80;x++)for(int y=0;y<21;y++)if(out.points[x][y])printf("%d,%d\n",x,y);
}
