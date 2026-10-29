// OpenUI's side: its React renderer with its chat library, theme and
// stylesheet, the way its apps stream an answer: the response so far,
// rendered again on every piece (flushSync, so each piece's work is done
// when it's measured, as in our benchmark).
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { Renderer } from "@openuidev/react-lang";
import { ThemeProvider } from "@openuidev/react-ui";
import { openuiChatLibrary } from "@openuidev/react-ui/genui-lib";
import "@openuidev/react-ui/index.css";
import { streams } from "./frame.js";

const root = createRoot(document.getElementById("root"));
const view = (text, streaming) => (
  <ThemeProvider mode="dark">
    <Renderer response={text} library={openuiChatLibrary} isStreaming={streaming} />
  </ThemeProvider>
);
streams("openui", (text, done) => {
  flushSync(() => root.render(text === null ? null : view(text, !done)));
});
