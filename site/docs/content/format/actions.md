---
title: Actions and state
description: Components never run code. When the reader taps, types or answers, your app gets an action and decides what happens next.
---

Nothing in an answer runs code. When the reader acts, the SDK hands your app an action, and your app decides what happens: usually the model's next turn.

## Actions

| The reader | The action |
|---|---|
| Taps a `Button` with `ask`, a button outside a form, or a follow-up question | `{ type: "ask", text, node }` |
| Submits a `Form` | `{ type: "submit", node, form, button, fields, labels }` |
| Finishes a `Quiz` | `{ type: "quiz", node, title, score, total, answers }` |
| Votes in a `Poll` | `{ type: "vote", node, name, question, choice }` |
| Ticks a `Checklist` item, marks a flashcard known | `{ type: "state", node, name, value }` |
| Taps a `Button` with `href` | nothing: the link opens |
| Switches a tab, opens details, moves a what-if slider | nothing: it all happens on the page |

```ts
createAnswer(el, {
  core,
  onAction: (action) => {
    if (action.type === "ask") send(action.text);
    if (action.type === "submit") send(`Book ${action.fields.flight} for ${action.fields.guests}`);
  },
});
```

`title` is the quiz's title and `question` the poll's, left out when there's none, so your app can say "1 of 2 right on Check your reading" without looking the answer up.

With `connectAgent`, actions become the next user message by themselves (`sendActions: false` stops that), in words the core writes the same way everywhere. With your own chat, `core.actionMessage(action)` gives the same words:

```text
I finished the quiz: 1 of 2 right.
1. What absorbs light in a leaf? I answered "B. Chlorophyll" (right).
2. Which gas do plants take in? I answered "Oxygen" (wrong).
```

```text
I voted for "Bright and breezy" in the poll "Which mood do you want above your desk?".
```

```text
I filled in the form "route" and pressed "Plan my visit":
- Choose your focus: The Night Watch and Rembrandt
- Would you also like to see?: The library, The gardens
```

## Form fields

`fields` is keyed by each field's `name`, or its label as one word when it has none, and `labels` holds the label the reader saw for each, by the same key (the message above uses them):

| Field | Value |
|---|---|
| Input, TextArea, Select, Radio, Date, Time, Stepper, Combobox, TimeSlots, RatingInput | text |
| Slider | a number |
| Switch | `true` or `false` |
| Checkboxes, and a ToggleGroup that allows several | a list of the chosen options |
| Camera, File | a list of `File`s, the browser's own, for your app to upload |
| Location | `{ lat, lng, accuracy }` in degrees and metres when the reader shared it, or the place they typed |
| Scan | the code, as text; a photo of it, when they took one, as files under `<name>-photo` |

The SDK checks `required` before it sends anything. A photo, a file or a location exists only after the reader acted: nothing is captured until they tap.

## State

What the reader has done is also kept as plain JSON for each component, so it can be saved, restored, or shared with an agent:

| Component | State |
|---|---|
| Quiz | `{ "answers": [index or null per question] }` |
| Flashcards | `{ "known": [card index] }` |
| Poll | `{ "vote": option or null }` |
| Checklist | `{ "done": [item index] }` |
| WhatIf | `{ "values": { slider name: number } }` |
| Form | `{ "fields": { name: value } }` |

`onComponentState(node, state)` tells you when it changes, and `answer.applyState({ [node]: state })` sets it, say from a saved session. In React, the `<Answer>` component takes the same as `onComponentState` and `state` ([its reference](/docs/reference/react#saving-what-the-reader-did)). With AG-UI the state rides in the shared state's `morphscreen` key, so an agent can read what the reader did and set it too ([AG-UI agents](/docs/agents/ag-ui)).
