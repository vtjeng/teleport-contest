/* Exact upstream function bodies below; fixed table adapter for 72 valid inputs.
 * No Lua interpreter, random coordinates, room frame, or finalization. */
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
typedef int coordxy;
typedef int getloc_flags_t;
typedef long lua_Integer;
typedef void *genericptr_t;
#define staticfn static
#define TRUE 1
#define FALSE 0
#define ANY_LOC 1
#define NO_LOC_WARN 2
#define Free free
#define alloc malloc
enum {LR_DOWNSTAIR,LR_UPSTAIR,LR_PORTAL,LR_BRANCH,LR_TELE,LR_UPTELE,LR_DOWNTELE,LR_MONGEN};
struct mkroom {int lx,ly,hx,hy;};
typedef struct {int x,y;} coord;
typedef struct {int x1,y1,x2,y2;} area;
typedef struct {area inarea,delarea;int in_islev,del_islev,rtype,padding;union {char *str;} rname;} lev_region;
typedef struct {int mode,ri,ei;const char *option;int api;const char *name,*field;} lua_State;
static struct {int xstart,xsize,x_maze_max;} gx={10,5,79};
static struct {int ystart,ysize,y_maze_max;} gy={6,5,20};
static struct {int num_lregions;} gn;
static struct {lev_region *lregions;} gl;
static int rn2(int n){(void)n;abort();}
static int somexy(struct mkroom *r,coord *c){(void)r;(void)c;abort();}
static int is_ok_location(int x,int y,int f){(void)x;(void)y;(void)f;abort();}
static int isok(int x,int y){return x>0&&x<80&&y>=0&&y<21;}
static void impossible(const char *s){(void)s;abort();}
static void create_des_coder(void){}
static void lcheck_param_table(lua_State *L){assert(L);}
static void get_table_region(lua_State *L,const char *key,lua_Integer *x1,lua_Integer *y1,lua_Integer *x2,lua_Integer *y2,int optional){
 if(!strcmp(key,"exclude")){assert(optional);if(!L->mode)return;*x1=2;*y1=2;*x2=3;*y2=3;}
 else {assert(!strcmp(key,"region")&&!optional);*x1=1;*y1=1;*x2=4;*y2=4;}
}
static int get_table_boolean_opt(lua_State *L,const char *key,int def){assert(!def);if(!strcmp(key,"region_islev"))return L->ri;assert(!strcmp(key,"exclude_islev"));return L->ei;}
static int get_table_option(lua_State *L,const char *key,const char *def,const char *const *opts){assert(!strcmp(key,L->api?"type":"dir"));const char *wanted=L->option?L->option:def;for(int i=0;opts[i];++i)if(!strcmp(opts[i],wanted))return i;abort();}
static int get_table_int_opt(lua_State *L,const char *key,int def){(void)L;assert(!strcmp(key,"padding")&&!def);return 2;}
#define panic(...) abort()
#define LUA_TNIL 0
#define LUA_TSTRING 4
#define LUA_TFUNCTION 6
#define NHLpa_panic 0
static void lua_getfield(lua_State*L,int i,const char*k){assert(i==-1&&!L->field&&!strcmp(k,"name"));L->field=k;}
static int lua_type(lua_State*L,int i){assert(i==-1&&L->field);return L->name?LUA_TSTRING:LUA_TNIL;}
static const char*luaL_optstring(lua_State*L,int i,const char*d){assert(i==-1&&L->field);return L->name?L->name:d;}
static void lua_pop(lua_State*L,int n){assert(n==1&&L->field);L->field=NULL;}
static void nhl_pcall_handle(lua_State*L,int a,int b,const char*s,int m){abort();}
static void nhl_error(lua_State*L,const char*s){abort();}
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
static void
levregion_add(lev_region *lregion)
{
    if (!lregion->in_islev) {
        get_location(&lregion->inarea.x1, &lregion->inarea.y1, ANY_LOC,
                     (struct mkroom *) 0);
        get_location(&lregion->inarea.x2, &lregion->inarea.y2, ANY_LOC,
                     (struct mkroom *) 0);
    }

    if (!lregion->del_islev) {
        get_location(&lregion->delarea.x1, &lregion->delarea.y1,
                     ANY_LOC, (struct mkroom *) 0);
        get_location(&lregion->delarea.x2, &lregion->delarea.y2,
                     ANY_LOC, (struct mkroom *) 0);
    }
    if (gn.num_lregions) {
        /* realloc the lregion space to add the new one */
        lev_region *newl = (lev_region *) alloc(
            sizeof (lev_region) * (unsigned) (1 + gn.num_lregions));

        (void) memcpy((genericptr_t) (newl), (genericptr_t) gl.lregions,
                      sizeof (lev_region) * gn.num_lregions);
        Free(gl.lregions);
        gn.num_lregions++;
        gl.lregions = newl;
    } else {
        gn.num_lregions = 1;
        gl.lregions = (lev_region *) alloc(sizeof (lev_region));
    }
    (void) memcpy(&gl.lregions[gn.num_lregions - 1], lregion,
                  sizeof (lev_region));
}
static void
l_get_lregion(lua_State *L, lev_region *tmplregion)
{
    lua_Integer x1,y1,x2,y2;

    get_table_region(L, "region", &x1, &y1, &x2, &y2, FALSE);
    tmplregion->inarea.x1 = x1;
    tmplregion->inarea.y1 = y1;
    tmplregion->inarea.x2 = x2;
    tmplregion->inarea.y2 = y2;

    x1 = y1 = x2 = y2 = -1;
    get_table_region(L, "exclude", &x1, &y1, &x2, &y2, TRUE);
    tmplregion->delarea.x1 = x1;
    tmplregion->delarea.y1 = y1;
    tmplregion->delarea.x2 = x2;
    tmplregion->delarea.y2 = y2;

    tmplregion->in_islev = get_table_boolean_opt(L, "region_islev", 0);
    tmplregion->del_islev = get_table_boolean_opt(L, "exclude_islev", 0);

    /* if x1 is still negative, exclude wasn't specified, so we should treat
     * it as if there is no exclude region at all. Force exclude_islev to
     * true so the -1,-1,-1,-1 region is safely off the map and won't
     * interfere with branch or portal placement. */
    if (x1 < 0)
        tmplregion->del_islev = TRUE;
}
int
lspo_teleport_region(lua_State *L)
{
    static const char *const teledirs[] = { "both", "down", "up", NULL };
    static const int teledirs2i[] = { LR_TELE, LR_DOWNTELE, LR_UPTELE, -1 };
    lev_region tmplregion;

    create_des_coder();
    lcheck_param_table(L);
    l_get_lregion(L, &tmplregion);
    tmplregion.rtype = teledirs2i[get_table_option(L, "dir", "both",
                                                   teledirs)];
    tmplregion.padding = 0;
    tmplregion.rname.str = NULL;

    levregion_add(&tmplregion);

    return 0;
}
int
lspo_levregion(lua_State *L)
{
    static const char *const regiontypes[] = {
        "stair-down", "stair-up", "portal", "branch",
        "teleport", "teleport-up", "teleport-down", NULL
    };
    static const int regiontypes2i[] = {
        LR_DOWNSTAIR, LR_UPSTAIR, LR_PORTAL, LR_BRANCH,
        LR_TELE, LR_UPTELE, LR_DOWNTELE, 0
    };
    lev_region tmplregion;

    create_des_coder();
    lcheck_param_table(L);
    l_get_lregion(L, &tmplregion);
    tmplregion.rtype = regiontypes2i[get_table_option(L, "type", "stair-down",
                                                      regiontypes)];
    tmplregion.padding = get_table_int_opt(L, "padding", 0);
    tmplregion.rname.str = get_table_str_opt(L, "name", NULL);

    levregion_add(&tmplregion);
    return 0;
}

int main(int argc,char**argv){assert(argc==2);size_t n=strlen(argv[1]);assert(n%2==0&&n<1000);char*bytes=calloc(n/2+1,1);for(size_t i=0;i<n/2;i++){unsigned v;assert(sscanf(argv[1]+2*i,"%2x",&v)==1);bytes[i]=(char)v;}lua_State L={.mode=0,.ri=1,.ei=0,.option="portal",.api=1,.name=bytes};lspo_levregion(&L);assert(gn.num_lregions==1);lev_region*q=gl.lregions;printf("%d %d %d %d %d %d\n",q->rtype,q->padding,q->inarea.x1,q->inarea.y1,q->inarea.x2,q->inarea.y2);for(const unsigned char*t=(const unsigned char*)q->rname.str;*t;t++)printf("%02x",*t);puts("");free(q->rname.str);free(gl.lregions);free(bytes);}
