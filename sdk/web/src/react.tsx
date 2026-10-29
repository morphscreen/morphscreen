// React: <Answer> renders an answer as it streams. Give it the text so far
// (it reads only what's new), or an async iterable of chunks.

import { useEffect, useRef, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { createAnswer, type Action, type ActionButton, type Answer as Handle, type Attrs, type Core, type MapTiles, type Mount, type Op, type Pack } from "./index.js";

/** An app's own component: rendered when it opens (`streaming`, attributes only) and again when it's complete. */
export type CustomProps = { attrs: Attrs; html: string; text: string; actions: ActionButton[]; streaming: boolean };

export interface AnswerProps {
  core: Core;
  /** The answer so far; when it grows, only the new part is read. */
  text?: string;
  /** Or the chunks as they arrive. */
  stream?: AsyncIterable<string>;
  /** The answer is complete. */
  done?: boolean;
  packs?: string[];
  custom?: Pack[];
  /** React components for the app's own components, by name. */
  components?: Record<string, ComponentType<CustomProps>>;
  onAction?: (a: Action) => void;
  /** An interactive component's state changed because the reader acted, by node id: save it to restore the answer later. */
  onComponentState?: (node: string, state: unknown) => void;
  /** Interactive components' state by node id (what onComponentState gave), applied as the answer draws and whenever it changes. */
  state?: Record<string, unknown>;
  /** Every op, for logging. */
  onOps?: (ops: Op[]) => void;
  /** MapLibre GL for live maps; they need `maps` too. */
  maplibre?: unknown;
  /** The app's own map provider and key: a Map's tiles load from it, with its credit. */
  maps?: MapTiles;
  /** The image hosts that load; images from anywhere else show their description. */
  imageHosts?: string[];
  /** The app's own classes for the answer's element (it also gets ms-answer, which the stylesheet styles). */
  className?: string;
}

export function Answer(props: AnswerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const handle = useRef<Handle | null>(null);
  const fed = useRef("");
  const onAction = useRef(props.onAction);
  onAction.current = props.onAction;
  const onComponentState = useRef(props.onComponentState);
  onComponentState.current = props.onComponentState;
  const onOps = useRef(props.onOps);
  onOps.current = props.onOps;
  const state = useRef(props.state);
  state.current = props.state;
  const key = `${(props.packs ?? ["all"]).join(",")}|${JSON.stringify(props.custom ?? [])}`;

  useEffect(() => {
    const mounts: Record<string, Mount> = {};
    for (const [name, C] of Object.entries(props.components ?? {})) {
      mounts[name] = (el, p) => {
        const root = createRoot(el);
        root.render(<C {...p} />);
        return () => root.unmount();
      };
    }
    ref.current!.textContent = "";
    fed.current = "";
    handle.current = createAnswer(ref.current!, {
      core: props.core,
      packs: props.packs,
      custom: props.custom,
      components: mounts,
      maplibre: props.maplibre,
      maps: props.maps,
      imageHosts: props.imageHosts,
      onAction: (a) => onAction.current?.(a),
      onComponentState: (node, s) => onComponentState.current?.(node, s),
      onOps: (ops) => onOps.current?.(ops),
    });
    if (state.current) handle.current.applyState(state.current);
    return () => {
      handle.current?.destroy();
      handle.current = null;
    };
    // The answer starts over when the catalog changes.
  }, [props.core, key, (props.imageHosts ?? []).join(",")]);

  useEffect(() => {
    const h = handle.current;
    if (!h || props.text === undefined) return;
    if (!props.text.startsWith(fed.current)) return;
    h.push(props.text.slice(fed.current.length));
    fed.current = props.text;
    if (props.done) h.end();
  }, [props.text, props.done, key]);

  const stateKey = props.state ? JSON.stringify(props.state) : "";
  useEffect(() => {
    if (props.state) handle.current?.applyState(props.state);
  }, [stateKey, key]);

  useEffect(() => {
    const h = handle.current;
    if (!h || !props.stream) return;
    let stop = false;
    (async () => {
      for await (const chunk of props.stream!) {
        if (stop) return;
        h.push(chunk);
      }
      if (!stop) h.end();
    })();
    return () => {
      stop = true;
    };
  }, [props.stream, key]);

  // ms-answer in React's own className, so a change to the app's classes keeps it.
  return <div ref={ref} className={props.className ? `ms-answer ${props.className}` : "ms-answer"} />;
}
