# Contributing

Thanks for wanting to help. Bugs, ideas and pull requests are all welcome.

## Issues

Open one for a bug (what you did, what you expected, what happened, and the
answer text if a model's answer drew wrong) or for an idea (what you're
trying to build and what's in the way). Search first; someone may have
written it already.

A security problem goes to support@morphscreen.com, not an issue
(SECURITY.md).

## Pull requests

- For anything bigger than a small fix, open an issue first so we can agree
  on the approach before you spend time on it.
- Keep a pull request to one change, with its tests: a bug fix comes with a
  test that fails without it.
- Run what CI runs for the parts you touched (README.md, "Working on it";
  .github/workflows/ci.yml has the full list). The core keeps the
  TypeScript validator and renderer in step through the parity test, and
  conformance replays every recorded answer.
- Match the code around you: its naming, its comments, its idioms. The core
  is `no_std`; the web SDK has no runtime dependencies beyond the ones it
  bundles, and a size budget (sdk/web/size.mjs).
- A change to how answers look is checked in Chrome and Firefox, at phone
  width too, with axe finding nothing.

By sending a pull request you agree to license it under the Apache License
2.0, the same as the rest of the repository.

## The benchmark

bench/SCOREBOARD.md is generated (`node bench/scoreboard.ts`); don't edit
it by hand. New runs need model calls on your own OpenRouter key, and their
raw answers go in bench/raw with the run, so anyone can check them.
