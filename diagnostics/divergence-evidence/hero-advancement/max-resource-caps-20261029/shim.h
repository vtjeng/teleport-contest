/* Narrow oracle adapter: resource/XP fields only, no natural-play claim.
 * Field types follow include/you.h; bounded fixtures avoid overflow. */
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <stdarg.h>
#include <assert.h>
#define staticfn static
#define TRUE 1
#define FALSE 0
#define MAXULEV 30
#define max(a,b) ((a)>(b)?(a):(b))
#define Upolyd 0
#define A_CON 4
#define A_WIS 2
#define ACURR(a) ((a)==A_CON?con_attr:wis_attr)
#define Role_switch role_kind
#define PM_WIZARD 343
#define PM_CLERIC 337
#define PM_HEALER 334
#define PM_KNIGHT 335
#define PM_BARBARIAN 331
#define PM_VALKYRIE 342
#define LL_MINORAC 0
#define sa2_xpleveldown 0
#define sa2_xplevelup 0
#define KILLED_BY 0
#define DIED 0
#define Strcpy strcpy
typedef int boolean;
typedef int16_t xint16;
struct { int ulevel,ulevelmax,ulevelpeak,uhp,uhpmax,uhppeak,uen,uenmax,uenpeak,mh,mhmax; long uexp; xint16 uhpinc[30],ueninc[30]; struct {int type,record;} ualign; } u;
struct advance {int infix,inrnd,lofix,lornd,hifix,hirnd;};
struct role {struct advance hpadv,enadv;int xlev,initrecord;};
/* Independently pinned to the Wizard and human entries in src/role.c. */
struct {struct role urole,urace;} gu={{{10,0,0,8,1,0},{4,3,0,2,0,3},12,0},{{2,0,0,2,1,0},{1,0,2,0,2,0},0,0}};
struct {int botl;} disp;
struct {int youmonst;} gy;
struct {long moves;} svm={1};
struct {int initalign;} flags;
struct {int value;} aligns[3];
struct {struct {int format;char name[256];} killer;} svk;
static int upper,draws,role_kind,con_attr,wis_attr;
static char rng[1024];
static int rnd(int n){int result=upper?n:1;assert(n>0);char b[64];snprintf(b,sizeof b,"rnd(%d)=%d;",n,result);strcat(rng,b);draws++;return result;}
static int rn1(int n,int b){int result=b+(upper?n-1:0);assert(n>0);char text[64];snprintf(text,sizeof text,"rn1(%d,%d)=%d;",n,b,result);strcat(rng,text);draws++;return result;}
