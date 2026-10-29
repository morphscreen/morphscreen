// What the page sends back when the user acts.

import { sliderText } from "./interactive";

export type Upload = File;
export type FieldValue = string | number | boolean | string[] | Upload[] | { lat: number; lng: number; accuracy: number };

export type Action =
  | { type: "ask"; text: string; node: string }
  /** A form sent: each field's value by name, and the label the reader saw for it. */
  | { type: "submit"; node: string; form: string; button: string; fields: Record<string, FieldValue>; labels?: Record<string, string> }
  /** A Quiz finished: its title, the score, and each answer (right is null where the quiz had no key). */
  | { type: "quiz"; node: string; title?: string; score: number; total: number; answers: { question: string; choice: string; right: boolean | null }[] }
  /** A Poll answered: the question it asked and the choice. */
  | { type: "vote"; node: string; name: string; question?: string; choice: string }
  /** What the reader has done so far (a Checklist's ticks, the cards they know): kept, not a new turn. */
  | { type: "state"; node: string; name: string; value: unknown };

/** A field's label as the reader sees it, without the required mark. */
function labelOf(wrap: HTMLElement): string {
  // A field is a label with its words in a span, or a fieldset with a legend.
  const field = wrap.matches(".ms-field, fieldset") ? wrap : wrap.querySelector<HTMLElement>(".ms-field, fieldset");
  const el = field?.querySelector(":scope > legend, :scope > span");
  return (el?.textContent ?? "").replace(/\s*\*\s*$/, "").trim();
}

/** A form's fields, typed by the component each came from. */
export function serialize(form: HTMLFormElement, meta: { node: string; form: string; button: string }): Action {
  const fields: Record<string, FieldValue> = {};
  const labels: Record<string, string> = {};
  for (const wrap of Array.from(form.querySelectorAll<HTMLElement>("[data-ms-type]"))) {
    const type = wrap.dataset.msType!;
    const input = wrap.querySelector<HTMLInputElement>("input:not([type=file]), textarea, select");
    const name = (wrap.querySelector("[name]") as HTMLInputElement | null)?.name;
    if (!name) continue;
    const label = labelOf(wrap);
    if (label) labels[name] = label;
    switch (type) {
      case "Slider":
        fields[name] = Number(input?.value ?? 0);
        break;
      case "Switch":
        fields[name] = !!(input as HTMLInputElement)?.checked;
        break;
      case "Checkboxes":
        fields[name] = Array.from(wrap.querySelectorAll<HTMLInputElement>("input:checked")).map((i) => i.value);
        break;
      case "Radio":
        fields[name] = wrap.querySelector<HTMLInputElement>("input:checked")?.value ?? "";
        break;
      case "Camera":
      case "File":
        fields[name] = Array.from(wrap.querySelector<HTMLInputElement>("input[type=file]")?.files ?? []);
        break;
      case "Location": {
        const at = wrap.dataset.location;
        fields[name] = at ? JSON.parse(at) : (input?.value ?? "");
        break;
      }
      case "Scan": {
        const photo = wrap.querySelector<HTMLInputElement>("input[type=file]")?.files;
        fields[name] = input?.value ?? "";
        if (photo?.length) {
          fields[`${name}-photo`] = Array.from(photo);
          if (label) labels[`${name}-photo`] = `${label} (photo)`;
        }
        break;
      }
      default: {
        // Choices drawn as radios or checkboxes (TimeSlots, ToggleGroup, RatingInput and
        // custom components): what was picked, never the first option's value.
        const radios = wrap.querySelectorAll<HTMLInputElement>("input[type=radio]");
        const boxes = wrap.querySelectorAll<HTMLInputElement>("input[type=checkbox]");
        if (radios.length) fields[name] = wrap.querySelector<HTMLInputElement>("input[type=radio]:checked")?.value ?? "";
        else if (boxes.length > 1) fields[name] = Array.from(boxes).filter((b) => b.checked).map((b) => b.value);
        else if (boxes.length === 1) fields[name] = boxes[0].checked;
        else if (input) fields[name] = input.value;
      }
    }
  }
  return { type: "submit", ...meta, fields, labels };
}

/** A form's fields as state: what serialize reads, without the uploads (they stay on the device). */
export function fieldState(form: HTMLFormElement): Record<string, FieldValue> {
  const a = serialize(form, { node: "", form: "", button: "" }) as { fields: Record<string, FieldValue> };
  const out: Record<string, FieldValue> = {};
  for (const [k, v] of Object.entries(a.fields)) if (!(Array.isArray(v) && v.some((x) => x instanceof File))) out[k] = v;
  return out;
}

/** Sets a form's fields from state (an agent filling it in); uploads and locations are left alone. */
export function fill(form: HTMLFormElement, fields: Record<string, unknown>) {
  for (const wrap of Array.from(form.querySelectorAll<HTMLElement>("[data-ms-type]"))) {
    const type = wrap.dataset.msType!;
    const name = (wrap.querySelector("[name]") as HTMLInputElement | null)?.name;
    if (!name || !(name in fields)) continue;
    const v = fields[name];
    const input = wrap.querySelector<HTMLInputElement>("input:not([type=file]), textarea, select");
    switch (type) {
      case "Switch":
        if (input) input.checked = v === true;
        break;
      case "Checkboxes": {
        const on = new Set(Array.isArray(v) ? v.map(String) : []);
        wrap.querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach((i) => (i.checked = on.has(i.value)));
        break;
      }
      case "Radio":
        wrap.querySelectorAll<HTMLInputElement>("input[type=radio]").forEach((i) => (i.checked = i.value === String(v)));
        break;
      case "Camera":
      case "File":
      case "Location":
        break;
      default:
        if (input && (typeof v === "string" || typeof v === "number")) {
          input.value = String(v);
          const shown = input.parentElement?.querySelector(".ms-range output");
          if (shown) shown.textContent = sliderText(input);
        }
    }
  }
}
