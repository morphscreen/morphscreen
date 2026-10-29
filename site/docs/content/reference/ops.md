---
title: The op stream
description: What the core hands a renderer as an answer streams: one JSON operation per line, for drawing answers on a platform of your own.
---

The SDKs never parse the format: they apply the core's operations. `output: "ops"` on `/v1/ui` and `/v1/render` gives you the same operations, for drawing answers yourself, without the core.

{{md:spec/format.md#Output: the op stream (v1)}}

## Actions

{{md:spec/format.md#Actions: what the app sends back (v1)}}
