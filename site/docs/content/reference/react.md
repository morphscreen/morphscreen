---
title: "@morphscreen/web/react"
description: The Answer component for React 18 and later, and the props for your own components.
---

```tsx
import { Answer, type CustomProps } from "@morphscreen/web/react";

<Answer core={core} text={text} done={done} onAction={send} />;
```

## Answer

| Prop | Type | What it is |
|---|---|---|
| `core` | `Core` | from `loadCore` |
| `text` | `string` | the answer so far; when it grows, only the new part is read |
| `stream` | `AsyncIterable<string>` | or the chunks as they arrive |
| `done` | `boolean` | the answer is complete |
| `packs` | `string[]` | packs beyond core |
| `custom` | `Pack[]` | your own packs |
| `components` | `Record<string, ComponentType<CustomProps>>` | React components for your own components, by name |
| `onAction` | `(action: Action) => void` | what the reader did |
| `onComponentState` | `(node: string, state: unknown) => void` | an interactive component's state changed because the reader acted (a quiz answered, a card known); save it to restore the answer later |
| `state` | `Record<string, unknown>` | components' state by node id, what `onComponentState` gave: applied as the answer draws, and again when it changes |
| `onOps` | `(ops: Op[]) => void` | every op the core makes, for logging |
| `imageHosts` | `string[]` | hosts pictures may load from |
| `maps` | `MapTiles` | your map provider and key |
| `maplibre` | module | MapLibre GL, for live maps |
| `className` | `string` | your classes for the answer's element, which keeps `ms-answer` too |

## CustomProps

```ts
type CustomProps = { attrs: Attrs; html: string; text: string; streaming: boolean };
```

`attrs` are the component's attributes as the model wrote them, and `html` and `text` its content. Your component is drawn as soon as it opens, with `streaming: true` and its attributes only, then again when it's complete. [React](/docs/integrations/react) has a whole example.

## Saving what the reader did

```tsx
const [state, setState] = useState<Record<string, unknown>>(() => JSON.parse(localStorage.getItem("answer-1") ?? "{}"));

<Answer
  core={core}
  text={text}
  done={done}
  state={state}
  onComponentState={(node, s) => {
    const next = { ...state, [node]: s };
    setState(next);
    localStorage.setItem("answer-1", JSON.stringify(next));
  }}
/>;
```

A quiz answered before a reload comes back answered, with its marks ([Actions and state](/docs/format/actions)).
