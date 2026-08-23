#include <locale.h>
#include <regex.h>
#include <stdio.h>
#include <stdlib.h>

int
main(int argc, char **argv)
{
    regex_t regex;
    char error[256];
    int result;

    if (argc < 2)
        return 2;
    if (!setlocale(LC_ALL, "C.UTF-8"))
        return 3;
    result = regcomp(&regex, argv[1], REG_EXTENDED | REG_NOSUB);
    if (result) {
        regerror(result, &regex, error, sizeof error);
        printf("error\t%s\n", error);
        return 0;
    }
    puts("ok");
    for (int i = 2; i < argc; ++i)
        printf("%d\n", regexec(&regex, argv[i], 0, NULL, 0) == 0);
    regfree(&regex);
    return 0;
}
