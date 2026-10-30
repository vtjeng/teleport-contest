/* Restricted ordinary-golem inputs for the unchanged C naming functions.
 * No death engine, full Lua/tty game, priest/shopkeeper or hallucination model.
 * Unexpected special naming paths abort; tested inputs are explicitly validated.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
typedef int boolean;
#define TRUE 1
#define FALSE 0
#define BUFSZ 256
#define ARTICLE_NONE 0
#define ARTICLE_THE 1
#define ARTICLE_A 2
#define ARTICLE_YOUR 3
#define SUPPRESS_IT 1
#define SUPPRESS_INVISIBLE 2
#define SUPPRESS_HALLUCINATION 4
#define SUPPRESS_SADDLE 8
#define SUPPRESS_MAPPEARANCE 16
#define SUPPRESS_NAME 32
#define AUGMENT_IT 64
#define EXACT_NAME 31
#define M_AP_MONSTER 1
#define W_SADDLE 1
#define G_UNIQ 1
#define PM_SHOPKEEPER 3
#define PM_GHOST 4
#define PM_WIZARD_OF_YENDOR 5
struct permonst { const char *name; int geno; } mons[6];
struct monst {struct permonst *data; int mtame,minvis,ispriest,isminion,isshk;
 int misc_worn_check,mappearance,m_lev,female; char *given;};
struct {struct monst youmonst;} gy;
struct {int gameover;} program_state;
struct {int uswallow,uz; struct monst *ustuck,*usteed;} u;
static long EHalluc_resistance;
#define Hallucination 0
#define Blind 1
#define M_AP_TYPE(m) 0
#define Mgender(m) 0
#define has_mgivenname(m) ((m)->given != NULL)
#define MGIVENNAME(m) ((m)->given)
#define type_is_pname(m) 0
#define engulfing_u(m) 0
#define canspotmon(m) 0
#define humanoid(m) 1
#define is_animal(m) 0
#define mindless(m) 1
#define is_mplayer(m) 0
#define In_endgame(z) 0
#define Strcpy strcpy
#define Strcat strcat
#define Sprintf sprintf
static char *nextmbuf(void) {static char b[BUFSZ];return b;}
static char *unsupported(void) {abort();}
#define rn2(n) (abort(),0)
#define priestname(...) unsupported()
#define pmname(...) unsupported()
#define shkname(...) unsupported()
#define rndmonnam(...) unsupported()
#define bogon_is_pname(...) (abort(),0)
#define s_suffix(...) unsupported()
#define strstri(...) unsupported()
#define rank_of(...) unsupported()
#define monsndx(...) (abort(),0)
#define lcase(...) unsupported()
#define just_an(...) (abort(),0)
#define eos(b) ((b)+strlen(b))
static const char *mon_pmname(struct monst *m) {assert(m->data>=mons&&m->data<mons+3);return m->data->name;}
