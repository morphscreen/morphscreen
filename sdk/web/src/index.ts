// The web SDK: the core (WASM) and a renderer that applies its ops to the
// page as the model streams.
//
//   const core = await loadCore(new URL("./morphscreen.wasm", import.meta.url));
//   const answer = createAnswer(document.querySelector("#answer"), { core, onAction });
//   for await (const chunk of stream) answer.push(chunk);
//   answer.end();
//
// Or a whole conversation with an agent that speaks AG-UI:
//
//   const chat = connectAgent(document.querySelector("#chat"), { core, url: "/agent" });
//   await chat.send("Plan a weekend in Lisbon");
//
// An app's own look, from a W3C Design Tokens file (theme.js, loaded only by
// apps that use it):
//
//   import { applyTheme } from "@morphscreen/web/theme";
//   applyTheme(await (await fetch("/brand.tokens.json")).json());

export { loadCore, Core, Session, AgentCore } from "./core";
export { createAnswer } from "./answer";
export { connectAgent } from "./agent";
export { enhanceCharts } from "./charts";
export { allowedImage } from "./media";
export type { Attrs, Message, Op, Pack, Span, Update } from "./core";
export type { Answer, AnswerOptions } from "./answer";
export type { AgentOptions, Conversation, RunResult, ToolCall } from "./agent";
export type { Action, FieldValue } from "./actions";
export type { ActionButton, Mount, RenderOptions } from "./dom";
export type { MediaOptions } from "./media";
export type { MapTiles } from "./maps";
