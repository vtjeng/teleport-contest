#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
typedef int coordxy;typedef int boolean;typedef int lua_Integer;typedef void *genericptr_t;
typedef struct {int x,y;} coord;
typedef struct {int lx,ly,hx,hy;} NhRect;
typedef union {int a_int;} anything;
typedef struct {NhRect bounding_box,*rects;int nrects,ttl,attach_2_u,attach_2_m,expire_f,enter_f,can_enter_f,leave_f,can_leave_f,inside_f,n_monst,max_monst;const char *enter_msg,*leave_msg;unsigned *monsters;anything arg;} NhRegion;
#define COLNO 80
#define ROWNO 21
#define TRUE 1
#define FALSE 0
#define NO_CALLBACK (-1)
#define MAX_CLOUD_SIZE 150
#define M_POISONGAS_OK 1
#define LUA_TTABLE 5
#define alloc malloc
#define clear_hero_inside(r) ((void)0)
#define clear_heros_fault(r) ((void)0)
struct {NhRect zeroNhRect;anything zeroany;} cg;
struct {struct {int mon_moving;} context;} svc;
struct {int youmonst;} gy;
struct selectionvar {int x,y;};
typedef struct {int selection,ttl;} lua_State;
static NhRegion *last;
static int draws;
static int rn2(int n){assert(n==3);draws++;return 2;}
static int rn1(int n,int base){return rn2(n)+base;}
static int is_hero_inside_gas_cloud(void){return FALSE;}
static int u_at(int x,int y){return FALSE;}
static int m_poisongas_ok(void *m){abort();}
static int valid_cloud_pos(int x,int y){abort();}
static void impossible(const char *s,...){abort();}
static void selection_getbounds(struct selectionvar *s,NhRect *r){*r=(NhRect){s->x,s->y,s->x,s->y};}
static int selection_getpoint(int x,int y,struct selectionvar *s){return x==s->x&&y==s->y;}
/* Registration/visual effects omitted: no runtime, monsters or hero. */
static void make_gas_cloud(NhRegion *c,int damage,int inside){assert(damage==0&&!inside);last=c;}
static void create_des_coder(void){}
static int lua_gettop(lua_State *L){return 1;}
static int lua_type(lua_State *L,int i){return LUA_TTABLE;}
static void lcheck_param_table(lua_State *L){}
static void get_table_xy_or_coord(lua_State *L,lua_Integer *x,lua_Integer *y){*x=*y=L->selection?-1:2;}
static void lua_getfield(lua_State *L,int i,const char *s){assert(!strcmp(s,"selection"));}
static struct selectionvar *l_selection_check(lua_State *L,int i){static struct selectionvar s={12,8};assert(L->selection);return &s;}
static void lua_pop(lua_State *L,int i){}
static int get_table_int_opt(lua_State *L,const char *s,int def){if(!strcmp(s,"ttl"))return L->ttl;if(!strcmp(s,"damage"))return def;abort();}
static void nhl_error(lua_State *L,const char *s){abort();}

NhRegion *
create_region(NhRect *rects, int nrect)
{
    int i;
    NhRegion *reg;

    reg = (NhRegion *) alloc(sizeof(NhRegion));
    (void) memset((genericptr_t) reg, 0, sizeof(NhRegion));
    /* Determines bounding box */
    if (nrect > 0) {
        reg->bounding_box = rects[0];
    } else {
        reg->bounding_box.lx = COLNO;
        reg->bounding_box.ly = ROWNO;
        reg->bounding_box.hx = 0; /* 1 */
        reg->bounding_box.hy = 0;
    }
    reg->nrects = nrect;
    reg->rects = (nrect > 0) ? (NhRect *) alloc(nrect * sizeof (NhRect)) : 0;
    for (i = 0; i < nrect; i++) {
        if (rects[i].lx < reg->bounding_box.lx)
            reg->bounding_box.lx = rects[i].lx;
        if (rects[i].ly < reg->bounding_box.ly)
            reg->bounding_box.ly = rects[i].ly;
        if (rects[i].hx > reg->bounding_box.hx)
            reg->bounding_box.hx = rects[i].hx;
        if (rects[i].hy > reg->bounding_box.hy)
            reg->bounding_box.hy = rects[i].hy;
        reg->rects[i] = rects[i];
    }
    reg->ttl = -1L; /* Defaults */
    reg->attach_2_u = FALSE;
    reg->attach_2_m = 0;
    /* reg->attach_2_o = NULL; */
    reg->enter_msg = (const char *) 0;
    reg->leave_msg = (const char *) 0;
    reg->expire_f = NO_CALLBACK;
    reg->enter_f = NO_CALLBACK;
    reg->can_enter_f = NO_CALLBACK;
    reg->leave_f = NO_CALLBACK;
    reg->can_leave_f = NO_CALLBACK;
    reg->inside_f = NO_CALLBACK;
    clear_hero_inside(reg);
    clear_heros_fault(reg);
    reg->n_monst = 0;
    reg->max_monst = 0;
    reg->monsters = (unsigned *) 0;
    reg->arg = cg.zeroany;
    return reg;
}

void
add_rect_to_reg(NhRegion *reg, NhRect *rect)
{
    NhRect *tmp_rect;

    tmp_rect = (NhRect *) alloc((reg->nrects + 1) * sizeof (NhRect));
    if (reg->nrects > 0) {
        (void) memcpy((genericptr_t) tmp_rect, (genericptr_t) reg->rects,
                      reg->nrects * sizeof (NhRect));
        free((genericptr_t) reg->rects);
    }
    tmp_rect[reg->nrects] = *rect;
    reg->nrects++;
    reg->rects = tmp_rect;
    /* Update bounding box if needed */
    if (reg->bounding_box.lx > rect->lx)
        reg->bounding_box.lx = rect->lx;
    if (reg->bounding_box.ly > rect->ly)
        reg->bounding_box.ly = rect->ly;
    if (reg->bounding_box.hx < rect->hx)
        reg->bounding_box.hx = rect->hx;
    if (reg->bounding_box.hy < rect->hy)
        reg->bounding_box.hy = rect->hy;
}

NhRegion *
create_gas_cloud(
    coordxy x, coordxy y,
    int cloudsize,
    int damage)
{
    NhRegion *cloud;
    int i, j;
    NhRect tmprect;

    /* store visited coords */
    coordxy xcoords[MAX_CLOUD_SIZE];
    coordxy ycoords[MAX_CLOUD_SIZE];
    xcoords[0] = x;
    ycoords[0] = y;
    int curridx;
    int newidx = 1; /* initial spot is already taken */
    boolean inside_cloud = is_hero_inside_gas_cloud();

    /* a single-point cloud on hero and it deals no damage.
       probably a natural cause of being polyed. don't message about it */
    if (!svc.context.mon_moving && u_at(x, y) && cloudsize == 1
        && (!damage
            || (damage && m_poisongas_ok(&gy.youmonst) == M_POISONGAS_OK)))
        inside_cloud = TRUE;

    if (cloudsize > MAX_CLOUD_SIZE) {
        impossible("create_gas_cloud: cloud too large (%d)!", cloudsize);
        cloudsize = MAX_CLOUD_SIZE;
    }

    for (curridx = 0; curridx < newidx; curridx++) {
        if (newidx >= cloudsize)
            break;
        int xx = xcoords[curridx];
        int yy = ycoords[curridx];
        /* Do NOT check for if there is already a gas cloud created at some
         * other time at this position. They can overlap. */

        /* Primitive Fisher-Yates-Knuth shuffle to randomize the order of
         * directions chosen. */
        coord dirs[4] = { {0, -1}, {0, 1}, {-1, 0}, {1, 0} };
        for (i = 4; i > 0; --i) {
            coordxy swapidx = rn2(i);
            coord tmp = dirs[swapidx];

            dirs[swapidx] = dirs[i - 1];
            dirs[i - 1] = tmp;
        }
        int nvalid = 0; /* # of valid adjacent spots */
        for (i = 0; i < 4; ++i) {
            /* try all 4 cardinal directions */
            int dx = dirs[i].x, dy = dirs[i].y;
            boolean isunpicked = TRUE;

            if (valid_cloud_pos(xx + dx, yy + dy)) {
                nvalid++;
                /* don't pick a location we've already picked */
                for (j = 0; j < newidx; ++j) {
                    if (xcoords[j] == xx + dx && ycoords[j] == yy + dy) {
                        isunpicked = FALSE;
                        break;
                    }
                }
                /* randomly disrupt the natural breadth-first search, so that
                 * clouds released in open spaces don't always tend towards a
                 * rhombus shape */
                if (nvalid == 4 && !rn2(2))
                    continue;

                if (isunpicked) {
                    xcoords[newidx] = xx + dx;
                    ycoords[newidx] = yy + dy;
                    newidx++;
                }
            }
            if (newidx >= cloudsize) {
                /* don't try further directions */
                break;
            }
        }
    }
    /* We have now either filled up xcoord and ycoord entirely or run out
       of space.  In either case, newidx is the correct total number of
       coordinates inserted. */
    cloud = create_region((NhRect *) 0, 0);
    for (i = 0; i < newidx; ++i) {
        tmprect.lx = tmprect.hx = xcoords[i];
        tmprect.ly = tmprect.hy = ycoords[i];
        add_rect_to_reg(cloud, &tmprect);
    }
    cloud->ttl = rn1(3, 4);
    /* If cloud was constrained in small space, give it more time to live. */
    cloud->ttl = (cloud->ttl * cloudsize) / newidx;

    make_gas_cloud(cloud, damage, inside_cloud);
    return cloud;
}

NhRegion *
create_gas_cloud_selection(
    struct selectionvar *sel,
    int damage)
{
    NhRegion *cloud;
    NhRect tmprect;
    coordxy x, y;
    NhRect r = cg.zeroNhRect;
    boolean inside_cloud = is_hero_inside_gas_cloud();

    selection_getbounds(sel, &r);

    cloud = create_region((NhRect *) 0, 0);
    for (x = r.lx; x <= r.hx; x++)
        for (y = r.ly; y <= r.hy; y++)
            if (selection_getpoint(x, y, sel)) {
                tmprect.lx = tmprect.hx = x;
                tmprect.ly = tmprect.hy = y;
                add_rect_to_reg(cloud, &tmprect);
            }

    make_gas_cloud(cloud, damage, inside_cloud);
    return cloud;
}

int
lspo_gas_cloud(lua_State *L)
{
    coordxy x = 0, y = 0;
    struct selectionvar *sel = NULL;
    int argc = lua_gettop(L);
    int damage = 0;
    int ttl = -2;

    create_des_coder();

    if (argc == 1 && lua_type(L, 1) == LUA_TTABLE) {
        lua_Integer tx, ty;
        NhRegion *reg;

        lcheck_param_table(L);

        get_table_xy_or_coord(L, &tx, &ty);
        x = tx, y = ty;
        if (tx == -1 && ty == -1) {
            lua_getfield(L, 1, "selection");
            sel = l_selection_check(L, -1);
            lua_pop(L, 1);
        }
        damage = get_table_int_opt(L, "damage", 0);
        ttl = get_table_int_opt(L, "ttl", -2);
        if (!sel) {
            reg = create_gas_cloud(x, y, 1, damage);
        } else
            reg = create_gas_cloud_selection(sel, damage);
        if (ttl > -2)
            reg->ttl = ttl;
    } else {
        nhl_error(L, "wrong parameters");
    }

    return 0;
}
int main(int argc,char **argv){
 if(argc!=3)return 2;lua_State L={atoi(argv[1]),atoi(argv[2])};lspo_gas_cloud(&L);
 assert(last&&last->nrects==1);NhRect r=last->rects[0];
 printf("%d %d %d %d %d %d\n",r.lx,r.ly,r.hx,r.hy,last->ttl,draws);
 free(last->rects);free(last);
}
