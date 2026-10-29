---
title: Limits and errors
description: Every plan's limits, what happens when one is reached, and every error the API returns with what to do about it.
---

## The limits

| Limit | Free | Build | Scale |
|---|---|---|---|
| Calls a month | {{plan:free:monthly}} | {{plan:build:monthly}} | {{plan:scale:monthly}} |
| Of them on our model | {{plan:free:included}} | all | all |
| Calls a day | {{plan:free:daily}} | no daily limit | no daily limit |
| Extra calls past the month | none: calls stop | up to {{plan:build:monthly}} more | up to {{plan:scale:monthly}} more |
| Requests a minute | {{plan:free:per_minute}} | {{plan:build:per_minute}} | {{plan:scale:per_minute}} |
| Answers at once | {{plan:free:streams}} | {{plan:build:streams}} | {{plan:scale:streams}} |
| Renders a month, free | {{plan:free:renders}} | {{plan:build:renders}} | {{plan:scale:renders}} |

Limits are your account's, however many keys and projects it has. A call is one request to `/v1/chat/completions` or `/v1/ui`, its checking and any repair included. A call on the model in your plan may carry up to about 8,000 tokens of conversation. Prices are on the [pricing page](/pricing).

A plan's month counts from the day you moved to it. Extra calls are billed with the next charge, at the price of the plan they were made on.

## Errors

Every error has the same shape. `type` is the reason to act on; `message` says it in words.

```json
{ "error": { "code": 429, "message": "this account's plan allows 60 requests a minute", "type": "rate_limited", "metadata": { "error_type": "rate_limit_exceeded", "reason": "rate_limited" } } }
```

| Status | `type` | What happened | What to do |
|---|---|---|---|
| 400 | `model_needs_your_key` | a model other than the included one, without your OpenRouter key | send `Authorization: Bearer sk-or-...`, or use the included model |
| 400 | `invalid_input` and others | the request can't be run as written | fix the request; `message` says what |
| 401 | `morphscreen_key_required`, `morphscreen_key_invalid` | no MorphScreen key, or one we don't know or that was revoked | check `X-MorphScreen-Key` |
| 401 | `openrouter_key_required`, `openrouter_key_invalid` | OpenRouter turned your key down | check the key at OpenRouter |
| 402 | `plan_quota_reached` | this month's calls are used | wait for the month, or move to a bigger plan |
| 402 | `extra_limit_reached` | a paid plan's month and as many again as extra | wait for the month, or move up |
| 402 | `included_calls_used` | the free plan's calls on our model | send your own OpenRouter key, or pay for a plan |
| 402 | `included_calls_paused` | calls on our model are paused for the free plan | send your own OpenRouter key, or try later |
| 402 | `openrouter_out_of_credit` | your OpenRouter account is out of credit | add credit at OpenRouter |
| 403 | `account_suspended` | the account is suspended | write to support@morphscreen.com |
| 403 | `model_refused` | the model's moderation refused the request | change the request |
| 404 | `model_not_found` and others | no such model, or no such route | check the name |
| 413 | `payload_too_large` | the body is over 1 MB | send less |
| 413 | `conversation_too_long` | more than about 8,000 tokens of conversation on our model | trim the conversation, or use your own key |
| 429 | `rate_limited` | too many requests this minute | wait for `Retry-After` |
| 429 | `too_many_streams` | too many answers at once | wait for one to finish |
| 429 | `daily_limit_reached` | the free plan's calls today | wait for `Retry-After`: midnight UTC |
| 429 | `render_limit_reached` | this month's renders | wait for the month |
| 429 | `openrouter_rate_limited` | OpenRouter's own limit for your key | wait for `Retry-After` |
| 502 | | the model failed or couldn't be reached, after our retries | try again |
| 503 | | accounts can't be read just now | try again shortly |
| 504 | | the model took too long to start | try again, or another model |

A 429 always carries `Retry-After` in seconds. Retry 502, 503 and 504 with a backoff; don't retry the rest unchanged.

## Warnings before the end

At 80% and 100% of a month's calls, the account's address gets a mail saying how many are left and what happens next.
