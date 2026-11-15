# morphscreen

Set [MorphScreen](https://morphscreen.com) up in your app with one command, then check it. MorphScreen lets a model answer with UI (cards, charts, tables, forms, quizzes and your own components), checked line by line and drawn while it streams.

```sh
npx morphscreen init
```

In a Next.js app with the App Router, that:

- installs `@morphscreen/web` with your package manager
- writes `app/api/morphscreen/route.ts`, which adds your key on the server and streams the answer back
- writes a chat page at `/morphscreen` (`app/morphscreen/page.tsx` and `chat.tsx`)
- writes `scripts/copy-morphscreen-core.mjs` and runs it before `dev` and `build`, so the WebAssembly core is in `public/`
- adds `MORPHSCREEN_KEY=` to `.env.local` for your key

It never overwrites a file that's already there, asks nothing, and is safe to run twice. Put your key in `.env.local` ([free, no card](https://app.morphscreen.com)), start the app and open `/morphscreen`.

Other frameworks aren't set up by `init` yet. It says which guide to follow instead: [React](https://morphscreen.com/docs/guides/generative-ui-react), [Vue](https://morphscreen.com/docs/integrations/vue), [Svelte](https://morphscreen.com/docs/integrations/svelte), [Angular](https://morphscreen.com/docs/integrations/angular), or [any page](https://morphscreen.com/docs/quickstart).

```sh
npx morphscreen doctor
```

Checks the SDK's version, the core in `public/`, the stylesheet import, the server route, the key (set, the right shape, never `NEXT_PUBLIC_`, never in browser code), a content security policy that blocks WebAssembly, whether the API is up and whether it takes your key. Each problem comes with its fix. `--offline` skips npm and the API.

Both take `--json`, for scripts and coding agents. The exit code is 0 when everything's fine and 1 otherwise.

Apache-2.0. Source: [sdk/cli](https://github.com/morphscreen/morphscreen/tree/main/sdk/cli).
