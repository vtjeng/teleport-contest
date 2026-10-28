#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
typedef int coordxy;typedef int boolean;typedef int getloc_flags_t;typedef long lua_Integer;
#define TRUE 1
#define FALSE 0
#define ANY_LOC 1
#define NO_LOC_WARN 2
#define SP_COORD_IS_RANDOM 0x01000000L
#define SP_COORD_X(l) (l & 0xff)
#define SP_COORD_Y(l) ((l >> 16) & 0xff)
#define SP_COORD_PACK(x,y) (((x)&0xff)+(((y)&0xff)<<16))
#define alloc malloc
enum {LR_DOWNSTAIR,LR_UPSTAIR,LR_PORTAL,LR_BRANCH,LR_TELE,LR_UPTELE,LR_DOWNTELE,LR_MONGEN};
struct mkroom {int lx,ly,hx,hy;};typedef struct {int x,y;} coord;
typedef struct {int x,y,is_random,getloc_flags;} unpacked_coord;
static struct {int xstart,xsize,x_maze_max;} gx={1,79,78};static struct {int ystart,ysize,y_maze_max;} gy={0,21,20};
struct exclusion_zone {int zonetype,lx,ly,hx,hy;struct exclusion_zone*next;};
static struct {struct exclusion_zone*exclusion_zones;} sve;
static struct coder {struct mkroom*croom;} coder;static struct {struct coder*coder;} gc={&coder};
typedef struct {int type,second;} lua_State;
static void create_des_coder(void){}static void lcheck_param_table(lua_State*L){assert(L);}
static int get_table_option(lua_State*L,const char*n,const char*d,const char*const*opts){assert(!strcmp(n,"type")&&!strcmp(d,"teleport"));assert(!strcmp(opts[0],"teleport"));return L->type<0?0:L->type;}
static int get_table_region(lua_State*L,const char*n,lua_Integer*a,lua_Integer*b,lua_Integer*c,lua_Integer*d,int optional){assert(!strcmp(n,"region")&&!optional);*a=*b=L->second?0:1;*c=L->second?2:3;*d=L->second?1:2;return 1;}
static int rn2(int n){(void)n;abort();}static int somexy(struct mkroom*r,coord*c){(void)r;(void)c;abort();}
static int is_ok_location(int x,int y,int f){(void)x;(void)y;(void)f;abort();}
static int isok(int x,int y){return x>0&&x<80&&y>=0&&y<21;}static void impossible(const char*s){(void)s;abort();}
static void
get_location(
    coordxy *x, coordxy *y,
    getloc_flags_t humidity,
    struct mkroom *croom)
{
    int cpt = 0;
    int mx, my, sx, sy;

    if (croom) {
        mx = croom->lx;
        my = croom->ly;
        sx = croom->hx - mx + 1;
        sy = croom->hy - my + 1;
    } else {
        mx = gx.xstart;
        my = gy.ystart;
        sx = gx.xsize;
        sy = gy.ysize;
    }

    if (*x >= 0) { /* normal locations */
        *x += mx;
        *y += my;
    } else { /* random location */
        do {
            if (croom) { /* handle irregular areas */
                coord tmpc;
                (void) somexy(croom, &tmpc);
                *x = tmpc.x;
                *y = tmpc.y;
            } else {
                *x = mx + rn2((int) sx);
                *y = my + rn2((int) sy);
            }
            if (is_ok_location(*x, *y, humidity))
                break;
        } while (++cpt < 100);
        if (cpt >= 100) {
            int xx, yy;

            /* last try */
            for (xx = 0; xx < sx; xx++)
                for (yy = 0; yy < sy; yy++) {
                    *x = mx + xx;
                    *y = my + yy;
                    if (is_ok_location(*x, *y, humidity))
                        goto found_it;
                }
            if (!(humidity & NO_LOC_WARN)) {
                impossible("get_location:  can't find a place!");
            } else {
                *x = *y = -1;
            }
        }
    }
 found_it:
    ;

    if (!(humidity & ANY_LOC) && !isok(*x, *y)) {
        if (!(humidity & NO_LOC_WARN)) {
            /*warning("get_location:  (%d,%d) out of bounds", *x, *y);*/
            *x = gx.x_maze_max;
            *y = gy.y_maze_max;
        } else {
            *x = *y = -1;
        }
    }
}
static unpacked_coord
get_unpacked_coord(long loc, int defhumidity)
{
    static unpacked_coord c;

    if (loc & SP_COORD_IS_RANDOM) {
        c.x = c.y = -1;
        c.is_random = 1;
        c.getloc_flags = (getloc_flags_t)(loc & ~SP_COORD_IS_RANDOM);
        if (!c.getloc_flags)
            c.getloc_flags = defhumidity;
    } else {
        c.is_random = 0;
        c.getloc_flags = defhumidity;
        c.x = SP_COORD_X(loc);
        c.y = SP_COORD_Y(loc);
    }
    return c;
}
void
get_location_coord(
    coordxy *x, coordxy *y,
    int humidity,
    struct mkroom *croom,
    long crd)
{
    unpacked_coord c;

    c = get_unpacked_coord(crd, humidity);
    *x = c.x;
    *y = c.y;
    get_location(x, y, c.getloc_flags | (c.is_random ? NO_LOC_WARN : 0),
                 croom);

    if (*x == -1 && *y == -1 && c.is_random)
        get_location(x, y, humidity, croom);
}
int
lspo_exclusion(lua_State *L)
{
    static const char *const ez_types[] = {
        "teleport", "teleport-up", "teleport-down", "monster-generation", NULL
    };
    static const int ez_types2i[] = {
        LR_TELE, LR_UPTELE, LR_DOWNTELE, LR_MONGEN, 0
    };
    struct exclusion_zone *ez = (struct exclusion_zone *) alloc(sizeof *ez);
    lua_Integer x1,y1,x2,y2;
    coordxy a1,b1,a2,b2;

    create_des_coder();
    lcheck_param_table(L);
    ez->zonetype = ez_types2i[get_table_option(L, "type", "teleport",
                                                      ez_types)];
    get_table_region(L, "region", &x1, &y1, &x2, &y2, FALSE);

    a1 = x1, b1 = y1;
    a2 = x2, b2 = y2;

    get_location_coord(&a1, &b1, ANY_LOC|NO_LOC_WARN, gc.coder->croom,
                       SP_COORD_PACK(a1, b1));
    get_location_coord(&a2, &b2, ANY_LOC|NO_LOC_WARN, gc.coder->croom,
                       SP_COORD_PACK(a2, b2));

    ez->lx = a1;
    ez->ly = b1;
    ez->hx = a2;
    ez->hy = b2;

    ez->next = sve.exclusion_zones;
    sve.exclusion_zones = ez;
    return 0;
}
int main(int argc,char**argv){assert(argc==3);int frame=atoi(argv[1]);struct mkroom room={11,5,15,9};if(frame==1){gx.xstart=10;gy.ystart=6;gx.xsize=gy.ysize=5;}if(frame==2)coder.croom=&room;lua_State L={atoi(argv[2]),0};assert(lspo_exclusion(&L)==0);L.second=1;assert(lspo_exclusion(&L)==0);int count=0;while(sve.exclusion_zones){struct exclusion_zone*e=sve.exclusion_zones;printf("%d %d %d %d %d\n",e->zonetype,e->lx,e->ly,e->hx,e->hy);sve.exclusion_zones=e->next;free(e);count++;}assert(count==2);return 0;}
