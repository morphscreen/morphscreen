# rust/api

The hosted API (`msapi`, at api.morphscreen.com) is MorphScreen's paid
service and its server is private. This folder holds only what the website
and the docs read from it:

- `src/plans.rs`: the plans, as the pricing page and the docs show them.
- `openapi.json`: the API's description, which docs/api.md and the API
  reference in the docs are written from (`node tools/api-reference.mjs`).
