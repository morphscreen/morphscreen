---
title: Versions and deprecation
description: How the API and the web SDK are versioned during the public beta, what counts as a breaking change, and how much notice you get.
---

## The API

The API is `v1`, in its address. Within `v1`:

- **We add, we don't take away.** New endpoints, new optional fields and new values in a response can arrive at any time; your code should ignore what it doesn't know.
- **A breaking change gets notice.** Removing or renaming a field, changing its type, or changing what a status means waits at least 90 days after a mail to every account and a note on this page, with the old behaviour working until then.
- **A breaking change that can't wait** (a security fix) is mailed the same day, with what to change.

The API's [OpenAPI description](https://api.morphscreen.com/v1/openapi.json) is the contract, and our tests hold the server to it.

## The web SDK

`@morphscreen/web` follows semantic versions. Before 1.0 it's published under npm's `beta` tag, and a minor version (0.2 after 0.1) may break things, each written in the package's changelog. From 1.0, only a major version breaks anything.

The SDK and the API agree on the format: a newer API never sends what an SDK from the same major version can't read.

## The format

Every pack has a version, and a catalog has a hash of everything in it. A component or attribute is added in a minor version; one is removed only with the same notice as an API change. A model that writes something removed sees it reported, never a silent change.

## Deprecated

Nothing yet.
