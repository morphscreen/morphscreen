/* The format's core, for C, Swift and Kotlin. Strings in are NUL-terminated
 * UTF-8; strings out are freed with ms_string_free. A NULL result means
 * failure: ms_last_error says why. */
#ifndef MORPHSCREEN_H
#define MORPHSCREEN_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef struct MsParser MsParser;

/* packs: "device,data" (core is always included); custom: a JSON array of
 * the app's own packs, or NULL. */
MsParser *ms_parser_new(const char *packs, const char *custom);
/* Feeds len bytes of the model's text. */
void ms_parser_push(MsParser *p, const uint8_t *chunk, size_t len);
/* The stream is over (truncated: it hit the token limit). */
void ms_parser_finish(MsParser *p, bool truncated);
/* The ops since the last call, one JSON object per line. */
char *ms_parser_take_ops(MsParser *p);
/* The finished tree as HTML; one finished node (by id) as it appears in it. */
/* Pictures in the HTML load only from these hosts (comma-separated), as in
   the SDKs; with none set, only data: images do. */
void ms_parser_allow_images(MsParser *p, const char *hosts);
char *ms_parser_html(MsParser *p);
char *ms_parser_node_html(MsParser *p, const char *id);
/* The finished tree as JSON, and the validator's verdict as JSON. */
char *ms_parser_tree(MsParser *p);
char *ms_parser_verdict(MsParser *p, bool truncated, size_t reqs, bool strict);
void ms_parser_free(MsParser *p);

/* The system prompt for this catalog. */
char *ms_prompt(const char *packs, const char *custom);

/* Inline text (a table cell, a list item) parsed into spans, as JSON. */
char *ms_inline(const char *text);

/* A conversation with an AG-UI agent (protocol 1.0). Feed it the bytes of
 * each response (Server-Sent Events) as they arrive; it returns the updates
 * they made, one JSON object per line (rust/core/src/agui.rs lists them). */
typedef struct MsAgent MsAgent;
MsAgent *ms_agent_new(void);
char *ms_agent_feed(MsAgent *a, const uint8_t *bytes, size_t len);
/* Everything else by name, JSON both ways: "event" JSON, "close", "add"
 * MESSAGE, "input" THREAD RUN EXTRA, "load" MESSAGES STATE, "messages",
 * "state", "setState" JSON, "components" MESSAGE, "setComponent" MESSAGE
 * NODE JSON. Unused arguments may be NULL. NULL on failure. */
char *ms_agent_call(MsAgent *a, const char *op, const char *x, const char *y, const char *z);
void ms_agent_free(MsAgent *a);

/* The user message an action (JSON) starts, or "" when it starts none. */
char *ms_action_message(const char *action);

char *ms_last_error(void);
void ms_string_free(char *s);

#endif
