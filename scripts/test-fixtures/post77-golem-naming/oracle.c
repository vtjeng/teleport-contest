#include "adapters.h"

char *
x_monnam(
    struct monst *mtmp,
    int article,
    const char *adjective,
    int suppress,
    boolean called)
{
    char *buf = nextmbuf();
    struct permonst *mdat = mtmp->data;
    const char *pm_name;
    boolean do_hallu, do_invis, do_it, do_saddle, do_mappear,
            do_exact, do_name, augment_it;
    boolean name_at_start, has_adjectives, insertbuf2,
            mappear_as_mon = (M_AP_TYPE(mtmp) == M_AP_MONSTER);
    char *bp, buf2[BUFSZ];

    if (mtmp == &gy.youmonst)
        return strcpy(buf, "you"); /* ignore article, "invisible", &c */

    if (program_state.gameover)
        suppress |= SUPPRESS_HALLUCINATION;
    if (article == ARTICLE_YOUR && !mtmp->mtame)
        article = ARTICLE_THE;

    if (u.uswallow && mtmp == u.ustuck) {
        /*
         * This monster has become important, for the moment anyway.
         * As the hero's consumer, it is worthy of ARTICLE_THE.
         * Also, suppress invisible as that particular characteristic
         * is unimportant now and you can see its interior anyway.
         */
        article = ARTICLE_THE;
        suppress |= SUPPRESS_INVISIBLE;
    }
    do_hallu = Hallucination && !(suppress & SUPPRESS_HALLUCINATION);
    do_invis = mtmp->minvis && !(suppress & SUPPRESS_INVISIBLE);
    do_it = !canspotmon(mtmp) && article != ARTICLE_YOUR
            && !program_state.gameover && mtmp != u.usteed
            && !engulfing_u(mtmp) && !(suppress & SUPPRESS_IT);
    do_saddle = !(suppress & SUPPRESS_SADDLE);
    do_mappear = mappear_as_mon && !(suppress & SUPPRESS_MAPPEARANCE);
    do_exact = (suppress & EXACT_NAME) == EXACT_NAME;
    do_name = !(suppress & SUPPRESS_NAME) || type_is_pname(mdat);
    augment_it = (suppress & AUGMENT_IT) != 0;

    buf[0] = '\0';

    /* unseen monsters, etc.; usually "it" but sometimes more specific;
       when hallucinating, the more specific values might be inverted */
    if (do_it) {
        /* !is_animal excludes all Y; !mindless excludes Z, M, \' */
        boolean s_one = humanoid(mdat) && !is_animal(mdat) && !mindless(mdat);

        Strcpy(buf, !augment_it ? "it"
                    : (!do_hallu ? s_one : !rn2(2)) ? "someone"
                      : "something");
        return buf;
    }

    /* priests and minions: don't even use this function */
    if ((mtmp->ispriest || mtmp->isminion) && !do_mappear) {
        char *name;
        long save_prop = EHalluc_resistance;
        unsigned save_invis = mtmp->minvis;

        /* when true name is wanted, explicitly block Hallucination */
        if (!do_hallu)
            EHalluc_resistance = 1L;
        if (!do_invis)
            mtmp->minvis = 0;
        /* EXACT_NAME will force "of <deity>" on the Astral Plane */
        name = priestname(mtmp, article, do_exact, buf2);
        EHalluc_resistance = save_prop;
        mtmp->minvis = save_invis;
        if (article == ARTICLE_NONE && !strncmp(name, "the ", 4))
            name += 4;
        return strcpy(buf, name);
    }

    /* 'pm_name' is the base part of most names */
    if (do_mappear) {
        /*assert(ismnum(mtmp->mappearance));*/
        pm_name = pmname(&mons[mtmp->mappearance], Mgender(mtmp));
    } else {
        pm_name = mon_pmname(mtmp);
    }

    /* Shopkeepers: use shopkeeper name.  For normal shopkeepers, just
     * "Asidonhopo"; for unusual ones, "Asidonhopo the invisible
     * shopkeeper" or "Asidonhopo the blue dragon".  If hallucinating,
     * none of this applies.
     */
    if (mtmp->isshk && !do_hallu && !do_mappear) {
        if (adjective && article == ARTICLE_THE) {
            /* pathological case: "the angry Asidonhopo the blue dragon"
               sounds silly */
            Strcpy(buf, "the ");
            Strcat(strcat(buf, adjective), " ");
            Strcat(buf, shkname(mtmp));
        } else {
            Strcat(buf, shkname(mtmp));
            if (mdat != &mons[PM_SHOPKEEPER] || do_invis){
                Strcat(buf, " the ");
                if (do_invis)
                    Strcat(buf, "invisible ");
                Strcat(buf, pm_name);
            }
        }
        return buf;
    }

    /* Put the adjectives in the buffer */
    if (adjective)
        Strcat(strcat(buf, adjective), " ");
    if (do_invis)
        Strcat(buf, "invisible ");
    if (do_saddle && (mtmp->misc_worn_check & W_SADDLE) && !Blind
        && !Hallucination)
        Strcat(buf, "saddled ");
    has_adjectives = (buf[0] != '\0');

    /* Put the actual monster name or type into the buffer now.
       Remember whether the buffer starts with a personal name. */
    if (do_hallu) {
        char rnamecode;
        char *rname = rndmonnam(&rnamecode);

        Strcat(buf, rname);
        name_at_start = bogon_is_pname(rnamecode);
    } else if (do_name && has_mgivenname(mtmp)) {
        char *name = MGIVENNAME(mtmp);

#if 0
      /* hardfought */
      if (has_ebones(mtmp)) {
#endif
        if (mdat == &mons[PM_GHOST]) {
            Sprintf(eos(buf), "%s ghost", s_suffix(name));
            name_at_start = TRUE;
        } else if (called) {
            Sprintf(eos(buf), "%s called %s", pm_name, name);
            name_at_start = (boolean) type_is_pname(mdat);
        } else if (is_mplayer(mdat) && (bp = strstri(name, " the ")) != 0) {
            /* <name> the <adjective> <invisible> <saddled> <rank> */
            char pbuf[BUFSZ];

            Strcpy(pbuf, name);
            pbuf[bp - name + 5] = '\0'; /* adjectives right after " the " */
            if (has_adjectives)
                Strcat(pbuf, buf);
            Strcat(pbuf, bp + 5); /* append the rest of the name */
            Strcpy(buf, pbuf);
            article = ARTICLE_NONE;
            name_at_start = TRUE;
        } else {
            Strcat(buf, name);
            name_at_start = TRUE;
        }
#if 0 /* hardfought */
      }
#endif
    } else if (is_mplayer(mdat) && !In_endgame(&u.uz)) {
        char pbuf[BUFSZ];

        Strcpy(pbuf, rank_of((int) mtmp->m_lev, monsndx(mdat),
                             (boolean) mtmp->female));
        Strcat(buf, lcase(pbuf));
        name_at_start = FALSE;
    } else {
        Strcat(buf, pm_name);
        name_at_start = (boolean) type_is_pname(mdat);
    }

    if (name_at_start && (article == ARTICLE_YOUR || !has_adjectives)) {
        if (mdat == &mons[PM_WIZARD_OF_YENDOR])
            article = ARTICLE_THE;
        else
            article = ARTICLE_NONE;
    } else if ((mdat->geno & G_UNIQ) != 0 && article == ARTICLE_A) {
        article = ARTICLE_THE;
    }

    insertbuf2 = TRUE;
    buf2[0] = '\0'; /* lint suppression */
    switch (article) {
    case ARTICLE_YOUR:
        Strcpy(buf2, "your ");
        break;
    case ARTICLE_THE:
        Strcpy(buf2, "the ");
        break;
    case ARTICLE_A:
        /* avoid an() here */
        (void) just_an(buf2, buf); /* copy "a " or "an " into buf2[] */
        break;
    case ARTICLE_NONE:
    default:
        insertbuf2 = FALSE;
        break;
    }
    if (insertbuf2) {
        Strcat(buf2, buf); /* buf2[] isn't viable to return,  */
        Strcpy(buf, buf2); /* so transfer the result to buf[] */
    }
    return buf;
}

char *
mon_nam(struct monst *mtmp)
{
    return x_monnam(mtmp, ARTICLE_THE, (char *) 0,
                    (has_mgivenname(mtmp)) ? SUPPRESS_SADDLE : 0, FALSE);
}

char *
noit_mon_nam(struct monst *mtmp)
{
    return x_monnam(mtmp, ARTICLE_YOUR, (char *) 0,
                    (has_mgivenname(mtmp) ? (SUPPRESS_SADDLE | SUPPRESS_IT)
                                          : SUPPRESS_IT),
                    FALSE);
}
int main(void) {
 const char *names[]={"paper golem","iron golem","wood golem"};
 const char *verbs[]={"roast","rust","rot"};
 for(int i=0;i<3;i++) {
  mons[i].name=names[i]; struct monst m={0};m.data=&mons[i];m.mtame=10;
  printf("May %s %s in peace.\n",noit_mon_nam(&m),verbs[i]);
  printf("unseen=%s\n",mon_nam(&m));
  m.mtame=0;printf("untamed=%s\n",noit_mon_nam(&m));
  m.mtame=10;m.given="Ada";printf("named=%s\n",noit_mon_nam(&m));
 }
 return 0;
}
