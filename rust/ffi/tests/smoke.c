// Calls every C entry point once: cc ffi/tests/smoke.c -Iffi/include target.nosync/release/libmorphscreen.a
#include "morphscreen.h"
#include <stdio.h>
#include <string.h>

int main(void) {
    MsParser *p = ms_parser_new("device", NULL);
    if (!p) { char *e = ms_last_error(); printf("new failed: %s\n", e); ms_string_free(e); return 1; }
    const char *chunks[] = {"# Plan\n\n<Card title=\"Trip\">\nPack ", "light.\n<Camera label=\"Ticket\" />\n</Card>\n"};
    for (int i = 0; i < 2; i++) ms_parser_push(p, (const uint8_t *)chunks[i], strlen(chunks[i]));
    ms_parser_finish(p, false);
    char *ops = ms_parser_take_ops(p), *html = ms_parser_html(p), *tree = ms_parser_tree(p);
    char *node = ms_parser_node_html(p, "1.1"), *verdict = ms_parser_verdict(p, false, 0, false);
    char *prompt = ms_prompt("device", NULL);
    int ok = ops && strstr(ops, "\"op\":\"end\"") && html && strstr(html, "capture=\"environment\"") && tree && node && strstr(node, "Ticket")
             && verdict && strstr(verdict, "\"complete\":true") && prompt && strstr(prompt, "<Camera");
    printf("ops %zu bytes, html %zu, tree %zu, node %zu, verdict %s, prompt %zu: %s\n", strlen(ops), strlen(html), strlen(tree), strlen(node), verdict, strlen(prompt), ok ? "ok" : "FAILED");
    MsParser *bad = ms_parser_new("nope", NULL);
    char *err = ms_last_error();
    printf("unknown pack: %s (%s)\n", bad ? "accepted?" : "refused", err);
    char *strs[] = {ops, html, tree, node, verdict, prompt, err};
    for (int i = 0; i < 7; i++) ms_string_free(strs[i]);
    ms_parser_free(p);
    return ok && !bad ? 0 : 1;
}
