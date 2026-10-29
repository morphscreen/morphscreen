<!-- Written by tools/api-reference.mjs from rust/api/openapi.json; edit those, not this. -->

# MorphScreen API reference

Version 0.1.0, at https://api.morphscreen.com. The description itself is served at `GET /v1/openapi.json`.

MorphScreen turns a model's answer into UI written in one format, checked by the core as it streams and repaired when it breaks a rule. Our own key goes in `X-MorphScreen-Key`. The model is included on paid plans (and 100 calls a month on the free one): leave out `Authorization` and the call runs deepseek/deepseek-v4.1-flash on our OpenRouter key (deepseek/deepseek-v4-flash when that can't serve it; ask for either), reasoning off, at most about 8,000 tokens of conversation in and 4,000 out. To run any other model, send your own OpenRouter key as `Authorization: Bearer sk-or-...`; it's passed to OpenRouter and never kept.

Three ways in: `/v1/chat/completions` speaks OpenAI's and OpenRouter's chat format, so an app already on either switches by its base URL and one header; `/v1/ui` is an AG-UI run, what the MorphScreen SDKs read; `/v1/render` draws an answer you already have, with no model.

The options ride in one shape everywhere (`morphscreen` in a chat completion, `forwardedProps` in an AG-UI run, the body of a render): `packs`, `components`, `image_hosts`, `images`, `photos`, `output`, `repair`.

Errors come as `{"error": {"code": <HTTP status>, "message", "type": <our reason>, "metadata": {"error_type", "reason"}}}`, a shape both OpenAI's and OpenRouter's SDKs read; inside a stream, a failure is an `error` on a chunk, or an AG-UI `RUN_ERROR`.

## Keys

- `Authorization: Bearer ...` (openRouterKey): Your own OpenRouter key (`sk-or-...`), for any model: the model runs on it. Left out, the call runs the model included in your plan on ours. Passed to OpenRouter and nowhere else; never stored or logged.
- `X-MorphScreen-Key` (morphscreenKey): Your MorphScreen key (ms_live_...): the call counts against your plan. Shown once when made; only its hash is kept.
- `Authorization: Bearer ...` (dashboardSession): The session opening a sign-up or sign-in link, or signing in with GitHub, sets.

## Operations

### POST /v1/chat/completions

A chat completion in our format, OpenAI's and OpenRouter's request and response.

Keys: `openRouterKey` and `morphscreenKey`, or `morphscreenKey`.

Body: [ChatCompletionRequest](#chatcompletionrequest).

| Status | What comes back |
|---|---|
| 200 | The answer whole, or with stream true as server-sent events: chat.completion.chunk after chunk, the last with finish_reason and morphscreen (and the repaired text when a repair was needed), a usage chunk when asked, then `data: [DONE]`. ([ChatCompletion](#chatcompletion); events, each [ChatCompletionChunk](#chatcompletionchunk)) |
| 400 | The request can't be run as written; model_needs_your_key: a model other than the included one, asked for without your own OpenRouter key. ([Error](#error)) |
| 401 | No key, or one turned down: your MorphScreen key (morphscreen_key_required, morphscreen_key_invalid) or your OpenRouter key (openrouter_key_required, openrouter_key_invalid). ([Error](#error)) |
| 402 | This month's calls on your plan are used (plan_quota_reached), a paid plan's month and as many again as extra (extra_limit_reached), the free plan's calls with the model included (included_calls_used, or included_calls_paused while our credit is low), or the OpenRouter account is out of credit (openrouter_out_of_credit). ([Error](#error)) |
| 403 | The account is suspended (account_suspended), or the model's moderation refused the request (model_refused). ([Error](#error)) |
| 404 | No such model. ([Error](#error)) |
| 413 | The body is over 1 MB (payload_too_large), or a call with the model included has more than about 8,000 tokens of conversation (conversation_too_long). ([Error](#error)) |
| 429 | A limit reached, with Retry-After saying how long to wait: requests a minute (rate_limited), answers at once (too_many_streams), the free tier's day (daily_limit_reached), renders this month (render_limit_reached), or OpenRouter's own (openrouter_rate_limited). ([Error](#error)) |
| 502 | The model failed or couldn't be reached, after the retries. ([Error](#error)) |
| 503 | Accounts can't be read just now; try again. ([Error](#error)) |
| 504 | The model took too long to start. ([Error](#error)) |

### POST /v1/ui

An AG-UI run (protocol 1.0), what the MorphScreen SDKs read.

Keys: `openRouterKey` and `morphscreenKey`, or `morphscreenKey`.

Body: [RunAgentInput](#runagentinput).

| Status | What comes back |
|---|---|
| 200 | Server-sent events: AG-UI events (output agui), or the core's ops (output ops). (events, each [AguiEvent](#aguievent) or [Op](#op)) |
| 400 | The request can't be run as written; model_needs_your_key: a model other than the included one, asked for without your own OpenRouter key. ([Error](#error)) |
| 401 | No key, or one turned down: your MorphScreen key (morphscreen_key_required, morphscreen_key_invalid) or your OpenRouter key (openrouter_key_required, openrouter_key_invalid). ([Error](#error)) |
| 402 | This month's calls on your plan are used (plan_quota_reached), a paid plan's month and as many again as extra (extra_limit_reached), the free plan's calls with the model included (included_calls_used, or included_calls_paused while our credit is low), or the OpenRouter account is out of credit (openrouter_out_of_credit). ([Error](#error)) |
| 403 | The account is suspended (account_suspended), or the model's moderation refused the request (model_refused). ([Error](#error)) |
| 404 | No such model. ([Error](#error)) |
| 413 | The body is over 1 MB (payload_too_large), or a call with the model included has more than about 8,000 tokens of conversation (conversation_too_long). ([Error](#error)) |
| 429 | A limit reached, with Retry-After saying how long to wait: requests a minute (rate_limited), answers at once (too_many_streams), the free tier's day (daily_limit_reached), renders this month (render_limit_reached), or OpenRouter's own (openrouter_rate_limited). ([Error](#error)) |
| 502 | The model failed or couldn't be reached, after the retries. ([Error](#error)) |
| 503 | Accounts can't be read just now; try again. ([Error](#error)) |
| 504 | The model took too long to start. ([Error](#error)) |

### POST /v1/render

An answer you already have, drawn again with no model.

Keys: `morphscreenKey`.

Body: [RenderRequest](#renderrequest).

| Status | What comes back |
|---|---|
| 200 | The answer as HTML, ops or the tree, with the core's verdict. ([RenderResponse](#renderresponse)) |
| 400 | The request can't be run as written: invalid_json, invalid_input, invalid_options or invalid_catalog, or text_required: no `text`. ([Error](#error)) |
| 401 | No key, or one turned down: your MorphScreen key (morphscreen_key_required, morphscreen_key_invalid) or your OpenRouter key (openrouter_key_required, openrouter_key_invalid). ([Error](#error)) |
| 403 | The account is suspended (account_suspended). ([Error](#error)) |
| 413 | The body is over 1 MB (payload_too_large). ([Error](#error)) |
| 429 | A limit reached, with Retry-After saying how long to wait: requests a minute (rate_limited), or renders this month (render_limit_reached). ([Error](#error)) |
| 503 | Accounts can't be read just now; try again. ([Error](#error)) |

### POST /v1/prompt

The system prompt for some packs, for an agent that runs its own model.

Keys: `morphscreenKey`.

Body: [PromptRequest](#promptrequest).

| Status | What comes back |
|---|---|
| 200 | The prompt. ([PromptResponse](#promptresponse)) |
| 400 | The request can't be run as written: invalid_json, invalid_input, invalid_options or invalid_catalog. ([Error](#error)) |
| 401 | No key, or one turned down: your MorphScreen key (morphscreen_key_required, morphscreen_key_invalid) or your OpenRouter key (openrouter_key_required, openrouter_key_invalid). ([Error](#error)) |
| 403 | The account is suspended (account_suspended). ([Error](#error)) |
| 413 | The body is over 1 MB (payload_too_large). ([Error](#error)) |
| 429 | A limit reached, with Retry-After saying how long to wait: requests a minute (rate_limited). ([Error](#error)) |
| 503 | Accounts can't be read just now; try again. ([Error](#error)) |

### GET /v1/health

Whether the API is up.

| Status | What comes back |
|---|---|
| 200 | ok (`ok`) |

### GET /v1/openapi.json

This description.

| Status | What comes back |
|---|---|
| 200 | OpenAPI 3.1 (object) |

### POST /v1/visit

Counts a page seen on the website, without cookies.

Body: [Visit](#visit).

| Status | What comes back |
|---|---|
| 204 | Counted, or not counted: the answer is the same. |
| 503 | Accounts can't be read just now; try again. ([Error](#error)) |

### POST /v1/signup

A magic link to sign up, or to sign in when the address has an account.

Body: [SignupRequest](#signuprequest).

| Status | What comes back |
|---|---|
| 202 | The link is on its way. ([Sent](#sent)) |
| 400 | The request can't be run as written; model_needs_your_key: a model other than the included one, asked for without your own OpenRouter key. ([Error](#error)) |
| 403 | The account is suspended (account_suspended), or the model's moderation refused the request (model_refused). ([Error](#error)) |
| 429 | A limit reached, with Retry-After saying how long to wait: requests a minute (rate_limited), answers at once (too_many_streams), the free tier's day (daily_limit_reached), renders this month (render_limit_reached), or OpenRouter's own (openrouter_rate_limited). ([Error](#error)) |
| 503 | Accounts can't be read just now; try again. ([Error](#error)) |

### POST /v1/signup/verify

Opens a magic link: a new account with its first key, a sign-in, or a deletion.

Body: [VerifyRequest](#verifyrequest).

| Status | What comes back |
|---|---|
| 200 | What the link did. ([VerifyResponse](#verifyresponse)) |
| 400 | The request can't be run as written; model_needs_your_key: a model other than the included one, asked for without your own OpenRouter key. ([Error](#error)) |
| 410 | link_expired: the link was used, has expired, or was never ours. Ask for a new one. ([Error](#error)) |
| 503 | Accounts can't be read just now; try again. ([Error](#error)) |

### POST /v1/signin/github

GitHub's page to sign up or in on.

Body: [GithubSigninRequest](#githubsigninrequest).

| Status | What comes back |
|---|---|
| 200 | GitHub's page. (object) |
| 400 | The request can't be run as written; model_needs_your_key: a model other than the included one, asked for without your own OpenRouter key. ([Error](#error)) |
| 403 | The account is suspended (account_suspended), or the model's moderation refused the request (model_refused). ([Error](#error)) |
| 429 | A limit reached, with Retry-After saying how long to wait: requests a minute (rate_limited), answers at once (too_many_streams), the free tier's day (daily_limit_reached), renders this month (render_limit_reached), or OpenRouter's own (openrouter_rate_limited). ([Error](#error)) |
| 503 | Accounts can't be read just now; try again. ([Error](#error)) |

### GET /v1/signin/github/callback

Back from GitHub: a session, then the dashboard.

| Parameter | In | Type | What it is |
|---|---|---|---|
| `code` | query | string |  |
| `state` | query | string |  |
| `error` | query | string |  |

| Status | What comes back |
|---|---|
| 303 | To the dashboard, or back to its sign-in page with the reason. |

### POST /v1/account/delete

A link that deletes an account and everything it holds.

Body: [DeleteRequest](#deleterequest).

| Status | What comes back |
|---|---|
| 202 | The link is on its way, when the address has an account. ([Sent](#sent)) |
| 400 | The request can't be run as written; model_needs_your_key: a model other than the included one, asked for without your own OpenRouter key. ([Error](#error)) |
| 403 | The account is suspended (account_suspended), or the model's moderation refused the request (model_refused). ([Error](#error)) |
| 429 | A limit reached, with Retry-After saying how long to wait: requests a minute (rate_limited), answers at once (too_many_streams), the free tier's day (daily_limit_reached), renders this month (render_limit_reached), or OpenRouter's own (openrouter_rate_limited). ([Error](#error)) |
| 503 | Accounts can't be read just now; try again. ([Error](#error)) |

### GET /v1/account

The dashboard's account: its plan's limits, usage by day, projects and keys.

Keys: `dashboardSession`.

| Status | What comes back |
|---|---|
| 200 | The account. ([Account](#account)) |
| 401 | No key, or one turned down: your MorphScreen key (morphscreen_key_required, morphscreen_key_invalid) or your OpenRouter key (openrouter_key_required, openrouter_key_invalid). ([Error](#error)) |
| 503 | Accounts can't be read just now; try again. ([Error](#error)) |

### GET /v1/account/calls

The account's newest calls (100), never a prompt or an answer.

Keys: `dashboardSession`.

| Parameter | In | Type | What it is |
|---|---|---|---|
| `failed` | query | boolean | true: only calls that failed or whose answer wasn't valid. |

| Status | What comes back |
|---|---|
| 200 | The calls, newest first. (object) |
| 401 | No key, or one turned down: your MorphScreen key (morphscreen_key_required, morphscreen_key_invalid) or your OpenRouter key (openrouter_key_required, openrouter_key_invalid). ([Error](#error)) |
| 503 | Accounts can't be read just now; try again. ([Error](#error)) |

### POST /v1/account/keys

A new key for a project, shown this once.

Keys: `dashboardSession`.

Body: object.

| Status | What comes back |
|---|---|
| 200 | The key. (object) |
| 400 | The request can't be run as written; model_needs_your_key: a model other than the included one, asked for without your own OpenRouter key. ([Error](#error)) |
| 401 | No key, or one turned down: your MorphScreen key (morphscreen_key_required, morphscreen_key_invalid) or your OpenRouter key (openrouter_key_required, openrouter_key_invalid). ([Error](#error)) |
| 404 | No such model. ([Error](#error)) |
| 409 | already_subscribed: the account already pays for a plan (change it instead); not_subscribed: there's no plan to change, cancel or open the portal for; same_plan: it's on that plan already; yearly_stays_yearly: a yearly plan changes only to another yearly one; ending: the plan is set to end (keep it first); already_cancelled: it's set to end already; not_cancelled: there's no cancel to take back. ([Error](#error)) |
| 503 | Accounts can't be read just now; try again. ([Error](#error)) |

### POST /v1/account/keys/revoke

The account's key with this prefix stops working in 8 seconds.

Keys: `dashboardSession`.

Body: object.

| Status | What comes back |
|---|---|
| 200 | Revoked; the key stops working at stops_at. (object) |
| 400 | The request can't be run as written; model_needs_your_key: a model other than the included one, asked for without your own OpenRouter key. ([Error](#error)) |
| 401 | No key, or one turned down: your MorphScreen key (morphscreen_key_required, morphscreen_key_invalid) or your OpenRouter key (openrouter_key_required, openrouter_key_invalid). ([Error](#error)) |
| 404 | No such model. ([Error](#error)) |
| 503 | Accounts can't be read just now; try again. ([Error](#error)) |

### POST /v1/account/keys/restore

A revoke taken back while the key still works.

Keys: `dashboardSession`.

Body: object.

| Status | What comes back |
|---|---|
| 200 | Restored: the key works as before. (object) |
| 400 | The request can't be run as written; model_needs_your_key: a model other than the included one, asked for without your own OpenRouter key. ([Error](#error)) |
| 401 | No key, or one turned down: your MorphScreen key (morphscreen_key_required, morphscreen_key_invalid) or your OpenRouter key (openrouter_key_required, openrouter_key_invalid). ([Error](#error)) |
| 404 | No such model. ([Error](#error)) |
| 409 | Too late: the key has already stopped working (`too_late`). ([Error](#error)) |
| 503 | Accounts can't be read just now; try again. ([Error](#error)) |

### POST /v1/account/debug

Keeps a project's prompts and answers 7 days, to debug, or stops.

Keys: `dashboardSession`.

Body: object.

| Status | What comes back |
|---|---|
| 200 | Set. (object) |
| 400 | The request can't be run as written; model_needs_your_key: a model other than the included one, asked for without your own OpenRouter key. ([Error](#error)) |
| 401 | No key, or one turned down: your MorphScreen key (morphscreen_key_required, morphscreen_key_invalid) or your OpenRouter key (openrouter_key_required, openrouter_key_invalid). ([Error](#error)) |
| 404 | No such model. ([Error](#error)) |
| 503 | Accounts can't be read just now; try again. ([Error](#error)) |

### POST /v1/signout

Ends this session.

| Status | What comes back |
|---|---|
| 200 | Signed out. (object) |
| 503 | Accounts can't be read just now; try again. ([Error](#error)) |

### GET /v1/billing

The account's plan, its subscription and the prices.

Keys: `dashboardSession`.

| Status | What comes back |
|---|---|
| 200 | The plan and the prices. ([BillingStatus](#billingstatus)) |
| 401 | No key, or one turned down: your MorphScreen key (morphscreen_key_required, morphscreen_key_invalid) or your OpenRouter key (openrouter_key_required, openrouter_key_invalid). ([Error](#error)) |
| 503 | Accounts can't be read just now; try again. ([Error](#error)) |

### POST /v1/billing/subscribe

A subscription to Build or Scale, paid in Dodo Payments' checkout.

Keys: `dashboardSession`.

Body: [Subscribe](#subscribe).

| Status | What comes back |
|---|---|
| 200 | The checkout to pay in. (object) |
| 400 | The request can't be run as written; model_needs_your_key: a model other than the included one, asked for without your own OpenRouter key. ([Error](#error)) |
| 401 | No key, or one turned down: your MorphScreen key (morphscreen_key_required, morphscreen_key_invalid) or your OpenRouter key (openrouter_key_required, openrouter_key_invalid). ([Error](#error)) |
| 409 | already_subscribed: the account already pays for a plan (change it instead); not_subscribed: there's no plan to change, cancel or open the portal for; same_plan: it's on that plan already; yearly_stays_yearly: a yearly plan changes only to another yearly one; ending: the plan is set to end (keep it first); already_cancelled: it's set to end already; not_cancelled: there's no cancel to take back. ([Error](#error)) |
| 502 | The model failed or couldn't be reached, after the retries. ([Error](#error)) |
| 503 | Accounts can't be read just now; try again. ([Error](#error)) |

### POST /v1/billing/confirm

Back from checkout: the subscription Dodo made, applied at once.

Keys: `dashboardSession`.

Body: object.

| Status | What comes back |
|---|---|
| 200 | Where the subscription stands, and the account's plan now. (object) |
| 400 | The request can't be run as written; model_needs_your_key: a model other than the included one, asked for without your own OpenRouter key. ([Error](#error)) |
| 401 | No key, or one turned down: your MorphScreen key (morphscreen_key_required, morphscreen_key_invalid) or your OpenRouter key (openrouter_key_required, openrouter_key_invalid). ([Error](#error)) |
| 404 | No such model. ([Error](#error)) |
| 502 | The model failed or couldn't be reached, after the retries. ([Error](#error)) |
| 503 | Accounts can't be read just now; try again. ([Error](#error)) |

### POST /v1/billing/change

Another plan on the same subscription: now, or from the next billing date.

Keys: `dashboardSession`.

Body: [ChangePlan](#changeplan).

| Status | What comes back |
|---|---|
| 200 | Changed now, or set to change at the next billing date. (object) |
| 400 | The request can't be run as written; model_needs_your_key: a model other than the included one, asked for without your own OpenRouter key. ([Error](#error)) |
| 401 | No key, or one turned down: your MorphScreen key (morphscreen_key_required, morphscreen_key_invalid) or your OpenRouter key (openrouter_key_required, openrouter_key_invalid). ([Error](#error)) |
| 409 | already_subscribed: the account already pays for a plan (change it instead); not_subscribed: there's no plan to change, cancel or open the portal for; same_plan: it's on that plan already; yearly_stays_yearly: a yearly plan changes only to another yearly one; ending: the plan is set to end (keep it first); already_cancelled: it's set to end already; not_cancelled: there's no cancel to take back. ([Error](#error)) |
| 502 | The model failed or couldn't be reached, after the retries. ([Error](#error)) |
| 503 | Accounts can't be read just now; try again. ([Error](#error)) |

### POST /v1/billing/cancel

Cancels the plan at the end of what's paid; then the free plan.

Keys: `dashboardSession`.

| Status | What comes back |
|---|---|
| 200 | Cancelled. (object) |
| 401 | No key, or one turned down: your MorphScreen key (morphscreen_key_required, morphscreen_key_invalid) or your OpenRouter key (openrouter_key_required, openrouter_key_invalid). ([Error](#error)) |
| 409 | already_subscribed: the account already pays for a plan (change it instead); not_subscribed: there's no plan to change, cancel or open the portal for; same_plan: it's on that plan already; yearly_stays_yearly: a yearly plan changes only to another yearly one; ending: the plan is set to end (keep it first); already_cancelled: it's set to end already; not_cancelled: there's no cancel to take back. ([Error](#error)) |
| 502 | The model failed or couldn't be reached, after the retries. ([Error](#error)) |
| 503 | Accounts can't be read just now; try again. ([Error](#error)) |

### POST /v1/billing/keep

A cancel taken back: the plan renews as before.

Keys: `dashboardSession`.

| Status | What comes back |
|---|---|
| 200 | Kept. (object) |
| 401 | No key, or one turned down: your MorphScreen key (morphscreen_key_required, morphscreen_key_invalid) or your OpenRouter key (openrouter_key_required, openrouter_key_invalid). ([Error](#error)) |
| 409 | already_subscribed: the account already pays for a plan (change it instead); not_subscribed: there's no plan to change, cancel or open the portal for; same_plan: it's on that plan already; yearly_stays_yearly: a yearly plan changes only to another yearly one; ending: the plan is set to end (keep it first); already_cancelled: it's set to end already; not_cancelled: there's no cancel to take back. ([Error](#error)) |
| 502 | The model failed or couldn't be reached, after the retries. ([Error](#error)) |
| 503 | Accounts can't be read just now; try again. ([Error](#error)) |

### POST /v1/billing/portal

Dodo's page for the account's invoices and payment method.

Keys: `dashboardSession`.

| Status | What comes back |
|---|---|
| 200 | A link to Dodo's customer portal, good for a short while. (object) |
| 401 | No key, or one turned down: your MorphScreen key (morphscreen_key_required, morphscreen_key_invalid) or your OpenRouter key (openrouter_key_required, openrouter_key_invalid). ([Error](#error)) |
| 409 | already_subscribed: the account already pays for a plan (change it instead); not_subscribed: there's no plan to change, cancel or open the portal for; same_plan: it's on that plan already; yearly_stays_yearly: a yearly plan changes only to another yearly one; ending: the plan is set to end (keep it first); already_cancelled: it's set to end already; not_cancelled: there's no cancel to take back. ([Error](#error)) |
| 502 | The model failed or couldn't be reached, after the retries. ([Error](#error)) |
| 503 | Accounts can't be read just now; try again. ([Error](#error)) |

### POST /v1/billing/dodo

Dodo Payments' webhooks.

Body: object.

| Status | What comes back |
|---|---|
| 200 | Handled, or handled before. (object) |
| 400 | The request can't be run as written; model_needs_your_key: a model other than the included one, asked for without your own OpenRouter key. ([Error](#error)) |
| 503 | Accounts can't be read just now; try again. ([Error](#error)) |

## Schemas

### Options

How the answer is checked and what comes back.

| Field | Type | Required | What it is |
|---|---|---|---|
| `packs` | array of string |  | The core's packs to add: data, commerce, scheduling, media, docs, inputs, device, interactive, or all. Left out, every pack ("all"); [] for the core alone, a prompt about half as long. |
| `components` | array of object |  | Your own packs, in the shape the custom components docs give; 256 KB at most. |
| `image_hosts` | array of string |  | Hosts the HTML's pictures may load from, besides the app's images' hosts and its photo provider's. |
| `images` | array of [AppImage](#appimage) |  | Your own pictures, which the model shows by id. |
| `photos` | [PhotoKey](#photokey) |  |  |
| `output` | string |  | What comes back; each endpoint has its own choices. |
| `repair` | boolean |  | Repair an answer with errors, and give a blank one a fresh try. |

### Message

A chat message, as OpenAI and OpenRouter take it.

| Field | Type | Required | What it is |
|---|---|---|---|
| `role` | `system`, `developer`, `user`, `assistant`, `tool` | yes |  |
| `content` | string or array or null |  |  |

### ChatCompletionRequest

OpenAI's chat completion request. Every field not listed here (temperature, max_tokens, models, provider, reasoning...) goes to the model as you set it. DeepSeek V4 Flash answers with reasoning off unless you set `reasoning`.

| Field | Type | Required | What it is |
|---|---|---|---|
| `model` | string | yes | An OpenRouter model name, like deepseek/deepseek-v4.1-flash. |
| `messages` | array of [Message](#message) | yes |  |
| `stream` | boolean |  | Default false. |
| `stream_options` | object |  |  |
| `n` | `1` |  |  |
| `morphscreen` | [Options](#options) |  | output: text (the answer in our format, the default) or html (drawn by the core; not streamed). |

### Usage

Tokens and cost, OpenRouter's usage object as it came (its detail fields included).

| Field | Type | Required | What it is |
|---|---|---|---|
| `prompt_tokens` | integer | yes |  |
| `completion_tokens` | integer | yes |  |
| `total_tokens` | integer | yes |  |
| `cost` | number |  |  |

### Diagnostic

| Field | Type | Required | What it is |
|---|---|---|---|
| `line` | integer | yes |  |
| `class` | string | yes | What kind of problem: hallucinated-component, signature-mismatch, required-field, enum-mismatch, placement (content where its parent doesn't take it, like text directly inside a Quiz), malformed-syntax, unreadable-tag or unsafe-url. The op stream's `diag` op names the same field `cls`. |
| `detail` | string | yes |  |
| `severity` | `error`, `note` | yes |  |

### Repair

How a repair went. In a stream's last chunk it also carries the repaired `text` and whether it is `valid`.

| Field | Type | Required | What it is |
|---|---|---|---|
| `repaired` | boolean | yes |  |
| `errors_before` | integer | yes |  |
| `errors_left` | integer |  |  |
| `rounds` | integer | yes |  |
| `nesting` | boolean | yes | Broken nesting mended with no model. |
| `ms` | integer | yes |  |
| `lines` | array of integer or array |  | The lines replaced, a number or [first, last]. |
| `why` | string |  |  |
| `provider` | string |  |  |
| `usage` | object |  |  |
| `text` | string |  |  |
| `valid` | boolean |  |  |

### Verdict

The core's word on the answer to draw: the repaired one when a repair kept one (its `repair.text` in a stream), else the answer as written. `repair.errors_before` counts what the written one had.

| Field | Type | Required | What it is |
|---|---|---|---|
| `valid` | boolean | yes |  |
| `truncated` | boolean | yes |  |
| `components` | integer | yes |  |
| `diagnostics` | array of [Diagnostic](#diagnostic) | yes |  |
| `repair` | [Repair](#repair) |  |  |

### ChatCompletion

Through OpenRouter, the id, model (a fallback's, when one answered) and provider are OpenRouter's own.

| Field | Type | Required | What it is |
|---|---|---|---|
| `id` | string | yes |  |
| `object` | `chat.completion` | yes |  |
| `created` | integer | yes |  |
| `model` | string | yes |  |
| `provider` | string |  |  |
| `system_fingerprint` | string or null | yes |  |
| `choices` | array of object | yes |  |
| `usage` | [Usage](#usage) |  |  |
| `morphscreen` | [Verdict](#verdict) | yes |  |

### ChatCompletionChunk

| Field | Type | Required | What it is |
|---|---|---|---|
| `id` | string | yes |  |
| `object` | `chat.completion.chunk` | yes |  |
| `created` | integer | yes |  |
| `model` | string | yes |  |
| `provider` | string |  |  |
| `system_fingerprint` | string or null |  |  |
| `choices` | array of object | yes |  |
| `usage` | [Usage](#usage) |  |  |
| `morphscreen` | [Verdict](#verdict) or [Repairing](#repairing) |  |  |
| `error` | [ErrorBody](#errorbody) |  |  |

### RunAgentInput

AG-UI's RunAgentInput (protocol 1.0). Tools aren't supported yet: `tools` must be empty.

| Field | Type | Required | What it is |
|---|---|---|---|
| `threadId` | string |  |  |
| `runId` | string |  |  |
| `messages` | array of object |  |  |
| `tools` | array |  |  |
| `state` | any |  |  |
| `context` | array |  |  |
| `forwardedProps` | object | yes | The model and the options. output: agui (AG-UI events, the default) or ops (the core's op stream). |

### AguiEvent

An AG-UI event: RUN_STARTED, TEXT_MESSAGE_START, TEXT_MESSAGE_CONTENT, TEXT_MESSAGE_END, then MESSAGES_SNAPSHOT when a repair put its answer in place, CUSTOM morphscreen.verdict and morphscreen.repair, and RUN_FINISHED; or RUN_ERROR.

| Field | Type | Required | What it is |
|---|---|---|---|
| `type` | `RUN_STARTED`, `TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT`, `TEXT_MESSAGE_END`, `MESSAGES_SNAPSHOT`, `CUSTOM`, `RUN_FINISHED`, `RUN_ERROR` | yes |  |
| `threadId` | string |  |  |
| `runId` | string |  |  |
| `messageId` | string |  |  |
| `delta` | string |  |  |
| `name` | `morphscreen.verdict`, `morphscreen.repair` |  |  |
| `value` | object |  |  |
| `messages` | array |  |  |
| `message` | string |  |  |
| `code` | string |  |  |

### Op

One op of the core's op stream (the specification's Output section). After an `event: reset` a repaired answer's ops start again from the top; a failure is an `event: error` with {code, message}.

| Field | Type | Required | What it is |
|---|---|---|---|
| `op` | `open`, `spans`, `node`, `close`, `diag`, `end` | yes |  |

### RenderRequest

An answer you already have, in our format, with the options. output: html (the default), ops or tree. Free, counted, within a fair-use limit.

| Field | Type | Required | What it is |
|---|---|---|---|
| `text` | string | yes |  |
| `packs` | array of string |  |  |
| `components` | array of object |  |  |
| `image_hosts` | array of string |  |  |
| `images` | array of [AppImage](#appimage) |  | Pictures the kept answer shows: their hosts are allowed in the HTML. The answer already has their addresses (img: ids were put in when it was made). |
| `photos` | [PhotoKey](#photokey) |  | Its provider's image hosts are allowed in the HTML; nothing is searched, as no model writes this answer. |
| `output` | `html`, `ops`, `tree` |  |  |

### RenderResponse

One of html, ops or tree, as output asked, with the verdict.

| Field | Type | Required | What it is |
|---|---|---|---|
| `html` | string |  |  |
| `ops` | array of [Op](#op) |  |  |
| `tree` | object |  |  |
| `morphscreen` | [Verdict](#verdict) | yes |  |

### PromptRequest

The packs the answers may use (every pack when left out) and the app's own components.

| Field | Type | Required | What it is |
|---|---|---|---|
| `packs` | array of string |  |  |
| `components` | array of object |  |  |

### PromptResponse

| Field | Type | Required | What it is |
|---|---|---|---|
| `prompt` | string | yes |  |

### ErrorBody

| Field | Type | Required | What it is |
|---|---|---|---|
| `code` | integer | yes | The HTTP status (502, or 504 for a model that went quiet, inside a stream). |
| `message` | string | yes |  |
| `type` | string | yes | Our reason: invalid_json, model_required, model_not_found, openrouter_key_invalid, openrouter_out_of_credit, openrouter_rate_limited, payload_too_large, model_unavailable, model_error, model_timeout, and for sign-up: invalid_email, consent_required, bot_check_required, bot_check_failed, email_not_allowed, email_takes_no_mail, too_many_links, too_many_sign_ups, link_expired, sign_up_closed, mail_unavailable, and for billing: sign_in_required, already_subscribed, not_subscribed, billing_unavailable, billing_closed, invalid_signature |
| `metadata` | object | yes |  |

### Error

| Field | Type | Required | What it is |
|---|---|---|---|
| `error` | [ErrorBody](#errorbody) | yes |  |

### AppImage

One of your own pictures. The model shows it as ![alt](img:ID) and the API puts its URL and credit in; its host is allowed with it.

| Field | Type | Required | What it is |
|---|---|---|---|
| `id` | string | yes | Letters, digits, '-', '_' or '.'. |
| `url` | string | yes | Where it loads from, http(s). |
| `alt` | string |  | What it shows, told to the model. |
| `credit` | string |  | Shown under it, as written (Markdown links allowed). |

### PhotoKey

The app's own photo key, for one provider: with it the model may ask for photos, searched there on the app's quota, each loading from the provider's own address with its credit. Without one (or with false) the model isn't asked for photos.

any or object or object or object.

### SignupRequest

| Field | Type | Required | What it is |
|---|---|---|---|
| `email` | string | yes | The address to sign up with. Throwaway domains and domains that take no mail are turned down; Gmail's dots and any +tag are the same address. |
| `consent` | string | yes | The version of the terms and privacy notice the person agreed to, like 2026-10-26. |
| `turnstile` | string | yes | The token Cloudflare Turnstile gave the page. |
| `device` | string |  | FingerprintJS's visitor id. Kept only as a hash under our own pepper: a second free account from one device runs on its own OpenRouter key only. |
| `from` | object |  | Where the sign-up came from: ref and utm_* tags, kept with the sign-up; anything else is dropped. |

### GithubSigninRequest

| Field | Type | Required | What it is |
|---|---|---|---|
| `consent` | string | yes | The version of the terms and privacy notice the person agreed to, like 2026-10-26. |
| `turnstile` | string | yes | The token Cloudflare Turnstile gave the page. |
| `device` | string |  | FingerprintJS's visitor id. Kept only as a hash under our own pepper: a second free account from one device runs on its own OpenRouter key only. |
| `from` | object |  | Where the sign-up came from: ref and utm_* tags, kept with the sign-up; anything else is dropped. |

### DeleteRequest

| Field | Type | Required | What it is |
|---|---|---|---|
| `email` | string | yes |  |
| `turnstile` | string | yes | The token Cloudflare Turnstile gave the page. |

### Sent

| Field | Type | Required | What it is |
|---|---|---|---|
| `sent` | `true` | yes | The same answer whether or not the address has an account. |

### VerifyRequest

| Field | Type | Required | What it is |
|---|---|---|---|
| `token` | string | yes | The 64 characters after #t= in the link. |

### VerifyResponse

| Field | Type | Required | What it is |
|---|---|---|---|
| `email` | string |  |  |
| `new` | boolean |  | A new account; false for a sign-in. |
| `key` | string |  | A new account's first API key (ms_live_...), shown this once and never kept. |
| `project` | string |  | The project the key belongs to. |
| `deleted` | boolean |  | A deletion link: the account and everything it held are gone. |

### BillingStatus

| Field | Type | Required | What it is |
|---|---|---|---|
| `plan` | string | yes |  |
| `yearly` | boolean | yes |  |
| `subscription` | object or null |  | The subscription paying now, or the newest when none does: id, plan, yearly, currency, status (pending, active, on_hold, paused, cancelled, failed, expired, past_due), current_end (the next billing date), ends_at (set when it's cancelled to end with what's paid), next ({plan, yearly, starts_at}: a change set for the next billing date). |
| `prices` | array of object | yes | Each paid plan's calls and, by currency, its price a month and a year in cents (USD) or paise (INR), tax included, and `extra`: an extra call past the month, in dollars or rupees. |
| `tax_included` | boolean | yes | Every price includes its tax: Dodo Payments sells as the merchant of record and works out the tax in checkout. |
| `portal` | boolean | yes | There's something paid, so /v1/billing/portal opens Dodo's page for invoices and the payment method. |
| `test_mode` | boolean | yes | Billing runs against Dodo's test mode: no money moves. |
| `given` | boolean |  | The plan was given by us, not paid for: it stops at its month rather than running on as extra. |

### Subscribe

| Field | Type | Required | What it is |
|---|---|---|---|
| `plan` | `build`, `scale` | yes |  |
| `yearly` | boolean |  |  |
| `currency` | `USD`, `INR` |  | Dollars unless rupees are picked; USD if left out. |

### ChangePlan

| Field | Type | Required | What it is |
|---|---|---|---|
| `plan` | `build`, `scale` | yes |  |
| `yearly` | boolean |  |  |

### Account

| Field | Type | Required | What it is |
|---|---|---|---|
| `email` | string | yes |  |
| `plan` | `free`, `build`, `scale` | yes |  |
| `yearly` | boolean | yes |  |
| `created_at` | string | yes | ISO 8601. |
| `github` | boolean | yes | Linked to a GitHub account. |
| `limits` | object | yes |  |
| `usage` | object | yes |  |
| `days` | array of object | yes | The last 30 days (UTC) with any use. |
| `projects` | array of object | yes |  |

### CallLine

| Field | Type | Required | What it is |
|---|---|---|---|
| `id` | integer | yes |  |
| `at` | string | yes |  |
| `project` | string | yes |  |
| `endpoint` | string | yes |  |
| `model` | string | yes |  |
| `answered_by` | string or null |  |  |
| `outcome` | string | yes | done, cut (at the model's length limit), failed, gone (the reader left), or the reason it was turned down. |
| `counted` | boolean | yes |  |
| `ms` | integer | yes |  |
| `first_ms` | integer or null |  |  |
| `valid` | boolean or null |  |  |
| `repaired` | boolean or null |  |  |
| `model_valid` | boolean or null |  |  |
| `model_errors` | array or null |  |  |
| `repair_rounds` | integer or null |  |  |
| `ours` | boolean | yes | Ran on our key. |

### Visit

| Field | Type | Required | What it is |
|---|---|---|---|
| `path` | string | yes | The page's path, as location.pathname: lower-case letters, digits and / - _ . |
| `source` | string |  | Where the visit came from: the UTM source, or the referring host; empty for none. |

### Repairing

In a stream, after the answer's text: it had `errors` and a repair has started. The repaired answer, if one is kept, comes in the last chunk.

| Field | Type | Required | What it is |
|---|---|---|---|
| `repairing` | object | yes |  |
