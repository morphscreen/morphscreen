// Copies the core out of the package into public/, where the app serves it
// and loadCore("/morphscreen.wasm") fetches it. Run before each build.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
mkdirSync("public", { recursive: true });
copyFileSync(require.resolve("@morphscreen/web/morphscreen.wasm"), "public/morphscreen.wasm");
