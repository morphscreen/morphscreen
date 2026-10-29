// Renders one OpenUI Lang answer the way OpenUI's apps do: react-lang's
// Renderer, react-ui's chat library and react-ui's stylesheet and theme.
//
// Bundled against a built checkout of thesysdev/openui ($OPENUI_REPO): link
// @openuidev/{react-ui,react-lang,lang-core} from its packages and react,
// react-dom from packages/react-ui/node_modules into compare/node_modules, then
//   npx esbuild@0.25.12 compare/openui-entry.jsx --bundle --format=esm \
//     --jsx=automatic --minify --define:process.env.NODE_ENV='"production"' \
//     --outfile=compare/build/openui.js
import { createRoot } from "react-dom/client";
import { Renderer } from "@openuidev/react-lang";
import { ThemeProvider } from "@openuidev/react-ui";
import { openuiChatLibrary } from "@openuidev/react-ui/genui-lib";

const text = document.getElementById("answer").value;
const mode = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
createRoot(document.getElementById("root")).render(
  <ThemeProvider mode={mode}>
    <Renderer response={text} library={openuiChatLibrary} isStreaming={false} />
  </ThemeProvider>,
);
