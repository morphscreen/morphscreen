// One answer: the core's session and the DOM renderer, fed the model's text
// as it streams.

import type { Core, Op, Pack } from "./core";
import { Renderer, type RenderOptions } from "./dom";

export interface AnswerOptions extends RenderOptions {
  core: Core;
  /** Packs beyond core, like ["device"]: every one unless named, [] for core alone. */
  packs?: string[];
  /** The app's own components, as packs. */
  custom?: Pack[];
  /** Every op, for logging or a custom renderer. */
  onOps?: (ops: Op[]) => void;
}

export interface Answer {
  /** The next chunk of the model's text. */
  push(text: string): void;
  /** The answer is over (truncated: it hit the token limit). */
  end(truncated?: boolean): void;
  /** The finished answer as HTML (what a server would send). */
  html(): string;
  /** Sets interactive components' state, by node id (an agent's shared state). */
  applyState(states: Record<string, unknown>): void;
  destroy(): void;
}

export function createAnswer(el: HTMLElement, opts: AnswerOptions): Answer {
  const session = opts.core.session(opts.packs ?? ["all"], opts.custom ?? []);
  // The core's HTML follows the page's rule for pictures, so the two match.
  session.allowImages(opts.imageHosts);
  const renderer = new Renderer(el, session, opts);
  const apply = (ops: Op[]) => {
    renderer.apply(ops);
    opts.onOps?.(ops);
  };
  let done = false;
  return {
    push(text) {
      if (!done && text) apply(session.push(text));
    },
    end(truncated = false) {
      if (done) return;
      done = true;
      apply(session.finish(truncated));
    },
    html() {
      return session.html();
    },
    applyState(states) {
      renderer.applyState(states);
    },
    destroy() {
      renderer.destroy();
      session.free();
    },
  };
}
