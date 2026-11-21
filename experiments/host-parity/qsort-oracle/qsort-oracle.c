/*
 * qsort-oracle.c -- log the comparator calls the host C library's qsort()
 * makes when the recorder's nh_deterministic_qsort() sorts.
 *
 * nethack-c/patches/002-deterministic-qsort.patch replaces every qsort()
 * in NetHack with nh_deterministic_qsort() (hacklib.c). The wrapper fills
 * an array of `struct nh_qsort_index { size_t idx; }` with 0..nmemb-1 and
 * hands it to the library's qsort() with nh_qsort_idx_cmp(), which calls
 * the game's comparator on elements a->idx and b->idx and breaks a tie by
 * index, so it never returns 0 for two different elements. The result is
 * the same on every host; the order of the comparator calls is the
 * library's. This program sorts the same struct, of the same size, the
 * same way, with a comparator that orders by a key array, and prints each
 * call.
 *
 * Each input line is one case: the keys of elements 0..n-1 as decimal
 * integers separated by spaces. Each output line is
 *   <a>,<b> <a>,<b> ... | <i> <i> ...
 * the (a->idx, b->idx) of every comparator call in call order and argument
 * order, then the sorted index array. A case of one key prints " | 0": the
 * wrapper returns before qsort() when nmemb < 2.
 *
 * ORACLE_QSORT names the function to ask. It is the host's qsort() unless
 * the build defines it, which lets a development build link a copy of a
 * library's source instead.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifndef ORACLE_QSORT
#define ORACLE_QSORT qsort
#else
void ORACLE_QSORT(void *, size_t, size_t,
                  int (*)(const void *, const void *));
#endif

#define MAX_KEYS 4096
#define LINE_SIZE (MAX_KEYS * 12)

struct nh_qsort_index {
    size_t idx;
};

static long keys[MAX_KEYS];

/* nh_qsort_idx_cmp() with the game's comparator replaced by the keys */
static int
idx_cmp(const void *va, const void *vb)
{
    const struct nh_qsort_index *a = (const struct nh_qsort_index *) va;
    const struct nh_qsort_index *b = (const struct nh_qsort_index *) vb;
    int c = (keys[a->idx] > keys[b->idx]) - (keys[a->idx] < keys[b->idx]);

    printf("%zu,%zu ", a->idx, b->idx);
    if (c)
        return c;
    if (a->idx < b->idx)
        return -1;
    return (a->idx > b->idx);
}

int
main(void)
{
    static char line[LINE_SIZE];

    while (fgets(line, sizeof line, stdin)) {
        struct nh_qsort_index *order;
        size_t n = 0, i;
        char *p = line, *end;

        for (;;) {
            long key = strtol(p, &end, 10);

            if (end == p)
                break;
            if (n == MAX_KEYS) {
                fprintf(stderr, "too many keys\n");
                return 1;
            }
            keys[n++] = key;
            p = end;
        }
        if (n == 0) {
            fprintf(stderr, "empty case\n");
            return 1;
        }
        /* malloc(), as the wrapper allocates its index array */
        order = (struct nh_qsort_index *) malloc(n * sizeof *order);
        if (!order)
            return 1;
        for (i = 0; i < n; ++i)
            order[i].idx = i;
        if (n >= 2)
            ORACLE_QSORT((void *) order, n, sizeof *order, idx_cmp);
        printf("|");
        for (i = 0; i < n; ++i)
            printf(" %zu", order[i].idx);
        printf("\n");
        free(order);
    }
    return 0;
}
