#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <assert.h>
typedef int boolean;typedef int16_t coordxy;typedef void*genericptr_t;typedef struct {int unused;}lua_State;typedef struct{int dnum,dlevel;}d_level;typedef struct{coordxy x,y;}coord;
#define TRUE 1
#define FALSE 0
#define COLNO 80
#define ROWNO 21
#define GLYPH_UNEXPLORED 0
#define Free(p) free(p)
struct rm{int a,b,c,d,e,f,g,h,i,j;};static struct rm levl[80][21];
static struct{struct{void*objects[80][21];void*monsters[80][21];void*objlist,*buriedobjlist,*monlist,*damagelist,*bonesinfo;struct{int arboreal,corrmaze,deathdrops,fumaroles,graveyard,hardfloor,has_barracks,has_beehive,has_court,has_morgue,has_shop,has_swamp,has_temple,has_town,has_vault,has_zoo,hero_memory,is_cavernous_lev,is_maze_lev,nfountains,noautosearch,nommap,noteleport,nsinks,rndmongen,shortsighted,sokoban_rules,stasis_until,stormy,temperature,wizard_bones;}flags;}level;}svl;
static struct{int ux,uy;d_level uz;}u;
static struct{struct{struct{int hellish;}flags;}dungeons[32];coord*doors;int doors_alloc;}svd;
static struct{int nroom;}svn;static struct{struct{int hx;}rooms[1];}svr;
static struct{int nsubroom;}gn;static struct{struct{int hx;}subrooms[1];}gs;
static struct{int doorindex;}gd;static struct{int made_branch;}gm;static struct{char*lev_message;}gl;
static struct{void*coder;}gc;static struct{int lua_testing;}iflags;static struct{int in_mklev;}gi;
static int hooks;
/* Absent-resource cleanup and coordinate/rectangle hooks do not affect temperature.
 * This oracle proves the reset API's final clear, not these subsystems. */
static void init_rect(void){hooks++;}static void init_vault(void){hooks++;}
static void stairway_free_all(void){hooks++;}static void clear_regions(void){hooks++;}
static void free_exclusions(void){hooks++;}static void reset_xystart_size(void){hooks++;}
static int In_W_tower(int x,int y,d_level*lev){assert(lev->dlevel>=1&&lev->dlevel<=3);return 0;}
static void makemap_prepost(int pre,int tower){assert(pre&&!tower);hooks++;}
static void oinit(void){hooks++;}
/* Initialized typed coder interface: allocation is valid; final clear overwrites
 * all tested temperature state, independent of the coder's other fields. */
static void create_des_coder(void){assert(!gc.coder);gc.coder=malloc(1);assert(gc.coder);}

boolean
In_hell(d_level *lev)
{
    return (boolean) (svd.dungeons[lev->dnum].flags.hellish);
}

void
clear_level_structures(void)
{
    static struct rm zerorm = { GLYPH_UNEXPLORED,
                                0, 0, 0, 0, 0, 0, 0, 0, 0 };
    coordxy x, y;
    struct rm *lev;

    /* note:  normally we'd start at x=1 because map column #0 isn't used
       (except for placing vault guard at <0,0> when removed from the map
       but not from the level); explicitly reset column #0 along with the
       rest so that we start the new level with a completely clean slate */
    for (x = 0; x < COLNO; x++) {
        lev = &levl[x][0];
        for (y = 0; y < ROWNO; y++) {
            *lev++ = zerorm;
            svl.level.objects[x][y] = (struct obj *) 0;
            svl.level.monsters[x][y] = (struct monst *) 0;
        }
    }
    svl.level.objlist = (struct obj *) 0;
    svl.level.buriedobjlist = (struct obj *) 0;
    svl.level.monlist = (struct monst *) 0;
    svl.level.damagelist = (struct damage *) 0;
    svl.level.bonesinfo = (struct cemetery *) 0;

    svl.level.flags.nfountains = 0;
    svl.level.flags.nsinks = 0;
    svl.level.flags.has_shop = 0;
    svl.level.flags.has_vault = 0;
    svl.level.flags.has_zoo = 0;
    svl.level.flags.has_court = 0;
    svl.level.flags.has_morgue = svl.level.flags.graveyard = 0;
    svl.level.flags.has_beehive = 0;
    svl.level.flags.has_barracks = 0;
    svl.level.flags.has_temple = 0;
    svl.level.flags.has_swamp = 0;
    svl.level.flags.noteleport = 0;
    svl.level.flags.hardfloor = 0;
    svl.level.flags.nommap = 0;
    svl.level.flags.hero_memory = 1;
    svl.level.flags.shortsighted = 0;
    svl.level.flags.sokoban_rules = 0;
    svl.level.flags.is_maze_lev = 0;
    svl.level.flags.is_cavernous_lev = 0;
    svl.level.flags.arboreal = 0;
    svl.level.flags.has_town = 0;
    svl.level.flags.wizard_bones = 0;
    svl.level.flags.corrmaze = 0;
    svl.level.flags.temperature = In_hell(&u.uz) ? 1 : 0;
    svl.level.flags.rndmongen = 1;
    svl.level.flags.deathdrops = 1;
    svl.level.flags.noautosearch = 0;
    svl.level.flags.fumaroles = 0;
    svl.level.flags.stormy = 0;
    svl.level.flags.stasis_until = 0L;

    svn.nroom = 0;
    svr.rooms[0].hx = -1;
    gn.nsubroom = 0;
    gs.subrooms[0].hx = -1;
    gd.doorindex = 0;
    if (svd.doors_alloc) {
        free((genericptr_t) svd.doors);
        svd.doors = (coord *) 0;
        svd.doors_alloc = 0;
    }
    init_rect();
    init_vault();
    stairway_free_all();
    gm.made_branch = FALSE;
    clear_regions();
    free_exclusions();
    reset_xystart_size();
    if (gl.lev_message) {
        free(gl.lev_message);
        gl.lev_message = (char *) 0;
    }
}

int
lspo_reset_level(lua_State *L)
{
    boolean wtower = In_W_tower(u.ux, u.uy, &u.uz);

    iflags.lua_testing = TRUE;
    if (L) {
        if (gc.coder) {
            Free(gc.coder);
            gc.coder = NULL;
        }
        create_des_coder();
    }
    makemap_prepost(TRUE, wtower);
    gi.in_mklev = TRUE;
    oinit(); /* assign level dependent obj probabilities */
    clear_level_structures();
    return 0;
}
int main(int argc,char**argv){assert(argc==5);int dnum=atoi(argv[1]),hell=atoi(argv[2]),depth=atoi(argv[3]),initial=atoi(argv[4]);assert(dnum>=0&&dnum<32&&(hell==0||hell==1)&&depth>=1&&depth<=3&&initial>=-1&&initial<=1);u.uz=(d_level){dnum,depth};svd.dungeons[dnum].flags.hellish=hell;svl.level.flags.temperature=initial;gc.coder=malloc(1);assert(gc.coder);lua_State L={0};int result=lspo_reset_level(&L);assert(result==0&&iflags.lua_testing&&gi.in_mklev&&hooks==8);printf("%d\n",svl.level.flags.temperature);free(gc.coder);return 0;}
