/* Fixed one-room constructor boundary oracle. */
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
typedef int coordxy;typedef int boolean;typedef int xint16;
typedef struct {int lx,ly,hx,hy;} NhRect;
#define COLNO 80
#define ROWNO 21
#define STONE 0
#define ROOM 25
#define OROOM 0
#define VAULT 4
#define TRUE 1
#define FALSE 0
#define XLIM 4
#define YLIM 3
#define SPLEV_LEFT 1
#define SPLEV_CENTER 3
#define SPLEV_RIGHT 5
#define TOP 1
#define BOTTOM 5
#define debugpline0(...) ((void)0)
#define debugpline2(...) ((void)0)
struct rm {int typ;};static struct rm levl[COLNO][ROWNO];
static NhRect rect[1]={{0,0,79,20}};static int rect_cnt=1;
static struct {int in_mk_themerooms;} gi;
static struct {int nroom;} svn;
static struct {int smeq[40];} gs;
static struct {struct {int lx,ly;} rooms[40];} svr;
static int calls,added,bounds[4];
static int rn2(int n){int bound,value;assert(scanf("%d %d",&bound,&value)==2);assert(bound==n&&value>=0&&value<n);calls++;return value;}
static int rnd(int n){(void)n;abort();}
static int rn1(int n,int b){(void)n;(void)b;abort();}
static int litstate_rnd(int lit){assert(lit==0);return 0;}
static NhRect *rnd_rect(void){abort();}
static void split_rects(NhRect *r,NhRect *cut){assert(r==rect&&cut->lx>=0&&cut->ly>=0&&cut->hx<=79&&cut->hy<=20);}
static void add_room(int lx,int ly,int hx,int hy,int lit,int type,int special){assert(lit==0&&type==OROOM&&!special);added++;bounds[0]=lx;bounds[1]=ly;bounds[2]=hx;bounds[3]=hy;}
static NhRect *
get_rect(NhRect *r)
{
    NhRect *rectp;
    int lx, ly, hx, hy;
    int i;

    lx = r->lx;
    ly = r->ly;
    hx = r->hx;
    hy = r->hy;
    for (i = 0, rectp = &rect[0]; i < rect_cnt; i++, rectp++)
        if (lx >= rectp->lx && ly >= rectp->ly && hx <= rectp->hx
            && hy <= rectp->hy)
            return rectp;
    return 0;
}
static int
check_room(
    coordxy *lowx, coordxy *ddx,
    coordxy *lowy, coordxy *ddy,
    boolean vault)
{
    int x, y, hix = *lowx + *ddx, hiy = *lowy + *ddy;
    struct rm *lev;
    int xlim, ylim, ymax;
    coordxy s_lowx, s_ddx, s_lowy, s_ddy;

    s_lowx = *lowx; s_ddx = *ddx;
    s_lowy = *lowy; s_ddy = *ddy;

    xlim = XLIM + (vault ? 1 : 0);
    ylim = YLIM + (vault ? 1 : 0);

    if (*lowx < 3)
        *lowx = 3;
    if (*lowy < 2)
        *lowy = 2;
    if (hix > COLNO - 3)
        hix = COLNO - 3;
    if (hiy > ROWNO - 3)
        hiy = ROWNO - 3;
 chk:
    if (hix <= *lowx || hiy <= *lowy)
        return FALSE;

    if (gi.in_mk_themerooms && (s_lowx != *lowx) && (s_ddx != *ddx)
        && (s_lowy != *lowy) && (s_ddy != *ddy))
        return FALSE;

    /* check area around room (and make room smaller if necessary) */
    for (x = *lowx - xlim; x <= hix + xlim; x++) {
        if (x <= 0 || x >= COLNO)
            continue;
        y = *lowy - ylim;
        ymax = hiy + ylim;
        if (y < 0)
            y = 0;
        if (ymax >= ROWNO)
            ymax = (ROWNO - 1);
        lev = &levl[x][y];
        for (; y <= ymax; y++) {
            if (lev++->typ != STONE) {
                if (!vault) {
                    debugpline2("strange area [%d,%d] in check_room.", x, y);
                }
                if (!rn2(3))
                    return FALSE;
                if (gi.in_mk_themerooms)
                    return FALSE;
                if (x < *lowx)
                    *lowx = x + xlim + 1;
                else
                    hix = x - xlim - 1;
                if (y < *lowy)
                    *lowy = y + ylim + 1;
                else
                    hiy = y - ylim - 1;
                goto chk;
            }
        }
    }
    *ddx = hix - *lowx;
    *ddy = hiy - *lowy;

    if (gi.in_mk_themerooms && (s_lowx != *lowx) && (s_ddx != *ddx)
        && (s_lowy != *lowy) && (s_ddy != *ddy))
        return FALSE;

    return TRUE;
}
static int
create_room(
    coordxy x, coordxy y,
    coordxy w, coordxy h,
    coordxy xal, coordxy yal,
    xint16 rtype, xint16 rlit)
{
    coordxy xabs = 0, yabs = 0;
    int wtmp, htmp, xaltmp, yaltmp, xtmp, ytmp;
    NhRect *r1 = 0, r2;
    int trycnt = 0;
    boolean vault = FALSE;
    int xlim = XLIM, ylim = YLIM;

    if (rtype == -1) /* Is the type random ? */
        rtype = OROOM;

    if (rtype == VAULT) {
        vault = TRUE;
        xlim++;
        ylim++;
    }

    /* on low levels the room is lit (usually) */
    /* some other rooms may require lighting */

    /* is light state random ? */
    rlit = litstate_rnd(rlit);

    /*
     * Here we will try to create a room. If some parameters are
     * random we are willing to make several try before we give
     * it up.
     */
    do {
        coordxy xborder, yborder;

        wtmp = w;
        htmp = h;
        xtmp = x;
        ytmp = y;
        xaltmp = xal;
        yaltmp = yal;

        /* First case : a totally random room */

        if ((xtmp < 0 && ytmp < 0 && wtmp < 0 && xaltmp < 0 && yaltmp < 0)
            || vault) {
            coordxy hx, hy, lx, ly, dx, dy;

            r1 = rnd_rect(); /* Get a random rectangle */

            if (!r1) { /* No more free rectangles ! */
                debugpline0("No more rects...");
                return FALSE;
            }
            hx = r1->hx;
            hy = r1->hy;
            lx = r1->lx;
            ly = r1->ly;
            if (vault) {
                dx = dy = 1;
            } else {
                dx = 2 + rn2((hx - lx > 28) ? 12 : 8);
                dy = 2 + rn2(4);
                if (dx * dy > 50)
                    dy = 50 / dx;
            }
            xborder = (lx > 0 && hx < COLNO - 1) ? 2 * xlim : xlim + 1;
            yborder = (ly > 0 && hy < ROWNO - 1) ? 2 * ylim : ylim + 1;
            if (hx - lx < dx + 3 + xborder || hy - ly < dy + 3 + yborder) {
                r1 = 0;
                continue;
            }
            xabs = lx + (lx > 0 ? xlim : 3)
                   + rn2(hx - (lx > 0 ? lx : 3) - dx - xborder + 1);
            yabs = ly + (ly > 0 ? ylim : 2)
                   + rn2(hy - (ly > 0 ? ly : 2) - dy - yborder + 1);
            if (ly == 0 && hy >= ROWNO - 1
                && (!svn.nroom || !rn2(svn.nroom))
                && (yabs + dy > ROWNO / 2)) {
                yabs = rn1(3, 2);
                if (svn.nroom < 4 && dy > 1)
                    dy--;
            }
            if (!check_room(&xabs, &dx, &yabs, &dy, vault)) {
                r1 = 0;
                continue;
            }
            wtmp = dx + 1;
            htmp = dy + 1;
            r2.lx = xabs - 1;
            r2.ly = yabs - 1;
            r2.hx = xabs + wtmp;
            r2.hy = yabs + htmp;
        } else { /* Only some parameters are random */
            int rndpos = 0;
            coordxy dx, dy;

            if (xtmp < 0 && ytmp < 0) { /* Position is RANDOM */
                xtmp = rnd(5);
                ytmp = rnd(5);
                rndpos = 1;
            }
            if (wtmp < 0 || htmp < 0) { /* Size is RANDOM */
                wtmp = rn1(15, 3);
                htmp = rn1(8, 2);
            }
            if (xaltmp == -1) /* Horizontal alignment is RANDOM */
                xaltmp = rnd(3);
            if (yaltmp == -1) /* Vertical alignment is RANDOM */
                yaltmp = rnd(3);

            /* Try to generate real (absolute) coordinates here! */

            xabs = (((xtmp - 1) * COLNO) / 5) + 1;
            yabs = (((ytmp - 1) * ROWNO) / 5) + 1;
            switch (xaltmp) {
            case SPLEV_LEFT:
                break;
            case SPLEV_RIGHT:
                xabs += (COLNO / 5) - wtmp;
                break;
            case SPLEV_CENTER:
                xabs += ((COLNO / 5) - wtmp) / 2;
                break;
            }
            switch (yaltmp) {
            case TOP:
                break;
            case BOTTOM:
                yabs += (ROWNO / 5) - htmp;
                break;
            case SPLEV_CENTER:
                yabs += ((ROWNO / 5) - htmp) / 2;
                break;
            }

            if (xabs + wtmp - 1 > COLNO - 2)
                xabs = COLNO - wtmp - 3;
            if (xabs < 2)
                xabs = 2;
            if (yabs + htmp - 1 > ROWNO - 2)
                yabs = ROWNO - htmp - 3;
            if (yabs < 2)
                yabs = 2;

            /* Try to find a rectangle that fit our room ! */

            r2.lx = xabs - 1;
            r2.ly = yabs - 1;
            r2.hx = xabs + wtmp + rndpos;
            r2.hy = yabs + htmp + rndpos;
            r1 = get_rect(&r2);
            dx = wtmp;
            dy = htmp;

            if (r1 && !check_room(&xabs, &dx, &yabs, &dy, vault)) {
                r1 = 0;
            }
        }
    } while (++trycnt <= 100 && !r1);
    if (!r1) { /* creation of room failed ? */
        return FALSE;
    }
    split_rects(r1, &r2);

    if (!vault) {
        gs.smeq[svn.nroom] = svn.nroom;
        add_room(xabs, yabs, xabs + wtmp - 1, yabs + htmp - 1, rlit, rtype,
                 FALSE);
    } else {
        svr.rooms[svn.nroom].lx = xabs;
        svr.rooms[svn.nroom].ly = yabs;
    }
    return TRUE;
}
int main(int argc,char **argv){assert(argc==2);int mode=atoi(argv[1]);if(mode==1)levl[14][2].typ=ROOM;if(mode==2)levl[20][8].typ=ROOM;int ok=create_room(2,2,8,6,SPLEV_LEFT,TOP,OROOM,0);int extra;assert(scanf("%d",&extra)==EOF);assert(ok==added);printf("%d %d %d %d %d %d\n",ok,calls,bounds[0],bounds[1],bounds[2],bounds[3]);}
