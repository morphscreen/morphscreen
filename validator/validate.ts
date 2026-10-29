// Prototype validator for the format: parses a finished answer (Markdown plus
// JSX-style component tags), checks it against a catalog (spec/catalog.ts; core
// only unless opts.catalog says otherwise), and returns a
// verdict shaped like generative-ui-bench's, so both formats are scored on the
// same rules:
//
//   complete = parses, every tag is known and closed and in a valid place,
//              required and enum attributes check out, content fits the
//              component, not truncated, and at least as many elements as the
//              brief has requirements (the coverage floor).
//
// Lenient by design, like the real core will be: enum values match without
// case and a few common synonyms are accepted. Those are reported as `coerced`
// notes, not errors; `strict: true` counts them as errors instead.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { attrSpec, defaultCatalog, type Catalog, type Component } from "../spec/catalog.ts";
import { safeUrl, stripEmoji } from "../spec/text.ts";
import { synonym } from "../spec/synonyms.ts";

// An alias read as "group" is a plain container: any content, no attributes.
const GROUP: Component = { about: "", attrs: {}, content: "any" };
// The catalog of the evaluate() call in progress (evaluate is synchronous).
let catalog: Catalog = defaultCatalog;

export type BenchError = { cls: string; detail: string };
export type Verdict = {
  renderable: boolean;
  complete: boolean;
  n: number;
  errs: BenchError[];
  notes: string[];
};


type Node = {
  kind: "element";
  name: string;
  attrs: Record<string, string | true>;
  children: Child[];
  line: number;
  closed: boolean;
};
type Child = Node | { kind: "text"; text: string };

function stripThink(t: string) {
  return t.includes("</think>") ? t.replace(/^[\s\S]*?<\/think>\s*/, "") : t;
}

/** Unwraps an answer the model put inside one code fence, which the format forbids but costs nothing. */
function unwrapFence(t: string, notes: string[]): string {
  const m = t.trim().match(/^```[\w-]*\n([\s\S]*?)\n```$/);
  if (m) {
    notes.push("unwrapped-fence");
    return m[1];
  }
  return t;
}

/** Tokenizes into text runs and tags. Code fences and inline code are text; a tag starts with `<` + uppercase. */
function parse(src: string, errs: BenchError[]): Node {
  const root: Node = { kind: "element", name: "#root", attrs: {}, children: [], line: 1, closed: true };
  const stack: Node[] = [root];
  let text = "";
  let line = 1;
  const flush = () => {
    if (text) stack[stack.length - 1].children.push({ kind: "text", text });
    text = "";
  };
  let i = 0;
  let atLineStart = true;
  while (i < src.length) {
    const c = src[i];
    // Inside a code component every tag is text, up to the tag that closes it.
    const top = stack[stack.length - 1];
    if (top !== root && catalog.components[top.name]?.content === "code") {
      const close = `</${top.name}>`;
      const end = src.indexOf(close, i);
      const body = src.slice(i, end < 0 ? src.length : end);
      text += body;
      line += body.split("\n").length - 1;
      i += body.length;
      if (end >= 0) {
        flush();
        closeTag(top.name, line, stack, errs);
        i += close.length;
      }
      atLineStart = false;
      continue;
    }
    // Fenced code block: copied as text up to the closing fence.
    if (atLineStart && src.startsWith("```", i)) {
      const end = src.indexOf("\n```", i + 3);
      const stop = end < 0 ? src.length : src.indexOf("\n", end + 4) < 0 ? src.length : src.indexOf("\n", end + 4);
      const block = src.slice(i, stop);
      text += block;
      line += block.split("\n").length - 1;
      i = stop;
      atLineStart = false;
      continue;
    }
    if (c === "`") {
      const end = src.indexOf("`", i + 1);
      const nl = src.indexOf("\n", i + 1);
      if (end > 0 && (nl < 0 || end < nl)) {
        text += src.slice(i, end + 1);
        i = end + 1;
        atLineStart = false;
        continue;
      }
    }
    if (c === "<" && src[i + 1] === "/" && /[A-Z]/.test(src[i + 2] ?? "")) {
      const end = src.indexOf(">", i);
      // As the core: a closing tag's name is letters and digits, or it's text (</Product people>).
      if (end > 0 && /^[A-Za-z0-9]+$/.test(src.slice(i + 2, end))) {
        flush();
        const name = src.slice(i + 2, end);
        closeTag(name, line, stack, errs);
        i = end + 1;
        atLineStart = false;
        continue;
      }
    }
    // </badge> closes an open <Badge> on its line: models slip into HTML's
    // case. A </form> on a line of its own closes nothing (as the core).
    if (c === "<" && src[i + 1] === "/" && /[a-z]/.test(src[i + 2] ?? "")) {
      const end = src.indexOf(">", i);
      const top = stack[stack.length - 1];
      if (end > 0 && top !== root && top.line === line && src.slice(i + 2, end).trim().toLowerCase() === top.name.toLowerCase()) {
        flush();
        closeTag(top.name, line, stack, errs);
        i = end + 1;
        atLineStart = false;
        continue;
      }
    }
    if (c === "<" && /[A-Z]/.test(src[i + 1] ?? "")) {
      const tag = readOpenTag(src, i);
      // A line opening with a known component that isn't a valid tag shows as
      // text: an error of its own, as the core has it.
      if (!tag && /^[^\S\n]*$/.test(src.slice(src.lastIndexOf("\n", i - 1) + 1, i))) {
        const name = src.slice(i + 1).match(/^[A-Za-z0-9]*/)![0];
        if (catalog.components[name] || catalog.aliases[name]) errs.push({ cls: "unreadable-tag", detail: `<${name}> can't be read as a tag (line ${line})` });
      }
      if (tag) {
        flush();
        // Components that take no content are void, like HTML's <br>: they
        // never need closing, so a missing "/" can't swallow the rest.
        const isVoid = tag.selfClosing || catalog.components[tag.name]?.content === "none";
        const node: Node = {
          kind: "element",
          name: tag.name,
          attrs: tag.attrs,
          children: [],
          line,
          closed: isVoid,
        };
        stack[stack.length - 1].children.push(node);
        if (!isVoid) stack.push(node);
        line += src.slice(i, tag.end).split("\n").length - 1;
        i = tag.end;
        atLineStart = false;
        continue;
      }
    }
    text += c;
    if (c === "\n") line++;
    atLineStart = c === "\n";
    i++;
  }
  flush();
  return root;
}

function readOpenTag(
  src: string,
  start: number,
): { name: string; attrs: Record<string, string | true>; selfClosing: boolean; end: number } | null {
  let i = start + 1;
  const nameMatch = src.slice(i).match(/^[A-Z][A-Za-z0-9]*/);
  if (!nameMatch) return null;
  const name = nameMatch[0];
  i += name.length;
  const attrs: Record<string, string | true> = {};
  for (;;) {
    while (i < src.length && /\s/.test(src[i])) i++;
    if (i >= src.length) return null; // unterminated tag: leave it as text
    if (src.startsWith("/>", i)) return { name, attrs, selfClosing: true, end: i + 2 };
    if (src[i] === ">") return { name, attrs, selfClosing: false, end: i + 1 };
    const key = src.slice(i).match(/^[A-Za-z_][\w-]*/);
    if (!key) return null;
    i += key[0].length;
    while (i < src.length && src[i] === " ") i++;
    if (src[i] !== "=") {
      attrs[key[0]] = true;
      continue;
    }
    i++;
    while (i < src.length && src[i] === " ") i++;
    const q = src[i];
    if (q === '"' || q === "'") {
      // A quote escaped JSON-style (12\" for inches) belongs to the value.
      let end = i + 1;
      while (end < src.length && !(src[end] === q && src[end - 1] !== "\\")) end++;
      if (end >= src.length) return null;
      attrs[key[0]] = src.slice(i + 1, end).replaceAll(`\\${q}`, q);
      i = end + 1;
    } else if (q === "{") {
      // JSX-style {value}: accepted and unwrapped.
      const end = src.indexOf("}", i + 1);
      if (end < 0) return null;
      attrs[key[0]] = src.slice(i + 1, end).trim().replace(/^["']|["']$/g, "");
      i = end + 1;
    } else {
      const bare = src.slice(i).match(/^[^\s/>]+/);
      if (!bare) return null;
      attrs[key[0]] = bare[0];
      i += bare[0].length;
    }
  }
}

function closeTag(name: string, line: number, stack: Node[], errs: BenchError[]) {
  // A closing tag for a void component (<Input ...></Input>) has nothing to close.
  if (catalog.components[name]?.content === "none" && !stack.some((n) => n.name === name)) return;
  for (let d = stack.length - 1; d > 0; d--) {
    if (stack[d].name === name) {
      for (let k = stack.length - 1; k > d; k--) {
        errs.push({ cls: "malformed-syntax", detail: `<${stack[k].name}> closed by </${name}> (line ${line})` });
      }
      stack[d].closed = true;
      stack.length = d;
      return;
    }
  }
  errs.push({ cls: "malformed-syntax", detail: `stray </${name}> (line ${line})` });
}

// ---- Markdown blocks (for content checks and the element count) ----

type Blocks = { headings: number; paragraphs: number; listItems: number; tables: number; tableCols: number; images: number; code: number; quotes: number };

function markdownBlocks(text: string): Blocks {
  const b: Blocks = { headings: 0, paragraphs: 0, listItems: 0, tables: 0, tableCols: 0, images: 0, code: 0, quotes: 0 };
  const lines = text.split("\n");
  let inPara = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) {
      inPara = false;
      continue;
    }
    if (l.startsWith("```")) {
      b.code++;
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) i++;
      inPara = false;
      continue;
    }
    if (/^#{1,6}\s/.test(l)) {
      b.headings++;
      inPara = false;
      continue;
    }
    if (/^([-*+]|\d+[.)])\s/.test(l)) {
      b.listItems++;
      inPara = false;
      continue;
    }
    if (l.startsWith("|") && /^\|?\s*:?-{2,}/.test((lines[i + 1] ?? "").trim())) {
      b.tables++;
      b.tableCols += l.replace(/^\||\|$/g, "").split("|").length;
      i++;
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith("|")) i++;
      inPara = false;
      continue;
    }
    if (/^>\s?/.test(l)) {
      b.quotes++;
      inPara = false;
      continue;
    }
    if (/^(---|\*\*\*|___)$/.test(l)) {
      inPara = false;
      continue;
    }
    const imgs = l.match(/!\[[^\]]*\]\([^)]+\)/g);
    if (imgs) b.images += imgs.length;
    if (imgs && l.replace(/!\[[^\]]*\]\([^)]+\)/g, "").trim() === "") {
      inPara = false;
      continue;
    }
    if (!inPara) b.paragraphs++;
    inPara = true;
  }
  return b;
}

function textOf(n: Node): string {
  return n.children.map((c) => (c.kind === "text" ? c.text : "")).join("");
}

/** A Chart's table: the separator row under the header is optional there. */
function parseTable(text: string): { header: string[]; rows: string[][] } | null {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("|"));
  if (lines.length < 2) return null;
  const sep = /^\|?\s*:?-{2,}/.test(lines[1]);
  const cells = (l: string) => l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  return { header: cells(lines[0]), rows: lines.slice(sep ? 2 : 1).map(cells) };
}

// ---- A What-if Result's formula, checked as the core compiles it (rust/core/src/formula.rs) ----

const UNARY = ["round", "floor", "ceil", "abs", "sqrt"];
const BINARY = ["min", "max"];
const isFn = (t: string) => UNARY.includes(t) || BINARY.includes(t);
type Lex = { num: string } | { name: string } | { op: string } | "(" | ")" | ",";

function lexFormula(s: string): Lex[] | string {
  const b = [...s];
  const out: Lex[] = [];
  const digit = (c?: string) => c !== undefined && c >= "0" && c <= "9";
  const alpha = (c?: string) => c !== undefined && /\p{Alphabetic}/u.test(c);
  let i = 0;
  while (i < b.length) {
    const c = b[i];
    if (c === " " || c === "\t") i++;
    else if (digit(c) || c === ".") {
      const st = i;
      // "1,250" is a number; "max(1, 2)" two arguments.
      const thousands = (k: number) => b[k] === "," && [1, 2, 3].every((d) => digit(b[k + d])) && !digit(b[k + 4]);
      while (i < b.length && (digit(b[i]) || b[i] === "." || b[i] === "_" || thousands(i))) i++;
      const t = b.slice(st, i).filter((x) => x !== "_" && x !== ",").join("");
      if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return `not a number: ${t}`;
      out.push({ num: t });
    } else if (alpha(c) || c === "_") {
      const st = i;
      while (i < b.length && (/[\p{Alphabetic}\p{N}_]/u.test(b[i]) || (b[i] === "-" && alpha(b[i + 1])))) i++;
      out.push({ name: b.slice(st, i).join("") });
    } else if ("+-*/^%×÷".includes(c)) {
      out.push({ op: c === "×" ? "*" : c === "÷" ? "/" : c });
      i++;
    } else if (c === "(" || c === ")" || c === ",") {
      out.push(c);
      i++;
    } else return `unexpected ${c}`;
  }
  return out;
}

const prec = (op: string): [number, boolean] => (op === "^" ? [4, true] : op === "neg" ? [3, true] : "*/%".includes(op) ? [2, false] : [1, false]);

/** Why the core can't compile a Result's formula, or null when it can. */
export function formulaError(src: string): string | null {
  const toks = lexFormula(src);
  if (typeof toks === "string") return toks;
  const out: string[] = [];
  const ops: string[] = [];
  let value = false;
  for (const t of toks) {
    if (t === "(") {
      ops.push("(");
      value = false;
    } else if (t === ",") {
      while (ops.length && ops[ops.length - 1] !== "(") out.push(ops.pop()!);
      value = false;
    } else if (t === ")") {
      for (;;) {
        const o = ops.pop();
        if (o === undefined) return "a ) without its (";
        if (o === "(") break;
        out.push(o);
      }
      if (ops.length && isFn(ops[ops.length - 1])) out.push(ops.pop()!);
      value = true;
    } else if ("num" in t) {
      if (value) return "two values in a row";
      out.push(t.num);
      value = true;
    } else if ("name" in t) {
      const l = t.name.toLowerCase();
      if (isFn(l)) {
        ops.push(l);
        value = false;
      } else {
        if (value) return "two values in a row";
        out.push(t.name);
        value = true;
      }
    } else {
      let op: string;
      if (!value && t.op === "-") op = "neg";
      else if (!value && t.op === "+") continue;
      else if (!value) return `${t.op} needs a value before it`;
      else op = t.op;
      const [p, right] = prec(op);
      // A prefix minus applies to what comes after it: it takes nothing off the stack.
      while (op !== "neg" && ops.length) {
        const top = ops[ops.length - 1];
        if (top === "(" || isFn(top)) break;
        const [tp] = prec(top);
        if (tp > p || (tp === p && !right)) out.push(ops.pop()!);
        else break;
      }
      ops.push(op);
      value = false;
    }
  }
  while (ops.length) {
    const o = ops.pop()!;
    if (o === "(") return "a ( without its )";
    out.push(o);
  }
  // It must leave exactly one value.
  let depth = 0;
  for (const t of out) {
    depth += ["+", "-", "*", "/", "^", "%", "min", "max"].includes(t) ? -1 : t === "neg" || UNARY.includes(t) ? 0 : 1;
    if (depth < 1) return "an operator without its values";
  }
  return depth === 1 ? null : "values without an operator between them";
}

function looksNumeric(v: string): boolean {
  return /^[-+]?[$€£₹¥]?\s*[-+]?\d[\d,]*(\.\d+)?\s*(%|[kKmMbB]n?|x)?$/.test(v.trim());
}

// ---- Validation ----

function validate(node: Node, parent: Node | null, errs: BenchError[], notes: string[], strict: boolean): number {
  let count = 0;
  for (const child of node.children) {
    if (child.kind === "text") {
      const b = markdownBlocks(child.text);
      count += b.headings + b.paragraphs + b.listItems + b.tables + b.tableCols + b.images + b.code + b.quotes;
      continue;
    }
    count += validateElement(child, node, errs, notes, strict);
  }
  return count;
}

/** The elements around the one being checked, outermost first (it last). */
const around: Node[] = [];

function validateElement(n: Node, parent: Node, errs: BenchError[], notes: string[], strict: boolean): number {
  around.push(n);
  try {
    return checkElement(n, parent, errs, notes, strict);
  } finally {
    around.pop();
  }
}

function checkElement(n: Node, parent: Node, errs: BenchError[], notes: string[], strict: boolean): number {
  const alias = catalog.components[n.name] ? undefined : catalog.aliases[n.name]?.as;
  const spec = catalog.components[n.name] ?? (alias === "group" ? GROUP : alias ? catalog.components[alias] : undefined);
  if (alias && spec) {
    notes.push(`alias <${n.name}> read as ${alias}`);
    if (strict) errs.push({ cls: "hallucinated-component", detail: n.name });
  }
  if (!spec) {
    errs.push({ cls: "hallucinated-component", detail: n.name });
    // Left open, it's never closed, whatever it is (as the core has it).
    if (!n.closed) errs.push({ cls: "malformed-syntax", detail: `<${n.name}> never closed (line ${n.line})` });
    return validate(n, parent, errs, notes, strict);
  }
  if (!n.closed && spec.content !== "none") {
    errs.push({ cls: "malformed-syntax", detail: `<${n.name}> never closed (line ${n.line})` });
  }
  // A Result works its What-if's sliders out wherever it sits inside it (in
  // a Columns, say); the rest need theirs directly around them (as the core).
  const inside = parent.name === spec.parent || (spec === catalog.components.Result && around.slice(0, -1).some((a) => a.name === "WhatIf"));
  if (spec.parent && !inside) {
    errs.push({ cls: "placement", detail: `${n.name} outside ${spec.parent}` });
  }
  let count = 1;
  for (const [key, value] of Object.entries(n.attrs)) {
    const raw = spec.attrs[key];
    if (raw === undefined) {
      // An icon where none is taught is harmless: dropped (the core notes it).
      if (key !== "icon") errs.push({ cls: "signature-mismatch", detail: `${n.name}.${key}` });
      continue;
    }
    const s = attrSpec(raw);
    if (Array.isArray(s.type)) {
      const v = String(value);
      if (s.type.includes(v)) continue;
      const lower = v.toLowerCase();
      const coerced = s.type.includes(lower) ? lower : synonym(key, lower);
      if (coerced && s.type.includes(coerced)) {
        notes.push(`coerced ${n.name}.${key}=${v}`);
        if (strict) errs.push({ cls: "enum-mismatch", detail: `${n.name}.${key}=${v}` });
      } else {
        errs.push({ cls: "enum-mismatch", detail: `${n.name}.${key}=${v}` });
      }
    } else if (s.type === "number") {
      if (!looksNumeric(String(value))) errs.push({ cls: "signature-mismatch", detail: `${n.name}.${key} not a number` });
    } else if (s.type === "boolean") {
      if (value !== true && !/^(true|false)$/i.test(String(value)))
        errs.push({ cls: "signature-mismatch", detail: `${n.name}.${key} not true/false` });
    } else if (s.type === "url") {
      if (!safeUrl(String(value).trim(), key === "src")) errs.push({ cls: "unsafe-url", detail: `${n.name}.${key}` });
    } else if (s.type === "list") {
      const items = String(value).split(/\s*\|\s*/).filter(Boolean);
      // An empty list is only wrong where the list is required (options); an
      // empty value just means nothing is chosen.
      if (!items.length && s.required) errs.push({ cls: "required-field", detail: `${n.name}.${key} empty` });
      count += items.length;
    }
  }
  for (const [key, raw] of Object.entries(spec.attrs)) {
    const s = attrSpec(raw);
    if (s.required && (n.attrs[key] === undefined || n.attrs[key] === "")) {
      errs.push({ cls: "required-field", detail: `${n.name}.${key}` });
    }
  }
  const text = textOf(n).trim();
  const tags = n.children.filter((c): c is Node => c.kind === "element");
  // Components written inside list or image content are still components
  // (the core opens them as nodes), with their own checks.
  const nested = () => tags.reduce((k, t) => k + validateElement(t, n, errs, notes, strict), 0);
  switch (spec.content) {
    case "none":
      if (n.children.length && (text || tags.length))
        errs.push({ cls: "signature-mismatch", detail: `${n.name} takes no content` });
      // The core's QR encoder takes up to 213 bytes (version 10, level M).
      if (n.name === "QR" && new TextEncoder().encode(String(n.attrs.value ?? "")).length > 213)
        errs.push({ cls: "signature-mismatch", detail: "QR.value longer than 213 bytes" });
      if (n.name === "Result") {
        const why = formulaError(String(n.attrs.value ?? ""));
        if (why) errs.push({ cls: "signature-mismatch", detail: `Result.value: ${why}` });
      }
      return count;
    case "text":
      // A label that is only emoji shows as nothing: emoji never reach the screen.
      // A label attribute stands in for the text only where the component has one (Button).
      if (!stripEmoji(text).trim() && !tags.length && !(spec.attrs.label && typeof n.attrs.label === "string" && n.attrs.label.trim()))
        errs.push({ cls: "required-field", detail: `${n.name} label` });
      {
        // Buttons may go inside one with actions (a Product's Add to cart); nothing else may,
        // but a Badge or a Button inside a sentence is part of the text (spec/format.md, inline components).
        const inSentence = (t: Node) => {
          const k = n.children.indexOf(t), before = n.children[k - 1], after = n.children[k + 1];
          const words = (before?.kind === "text" && /\S[^\n]*$/.test(before.text)) || (after?.kind === "text" && /^[^\n]*\S/.test(after.text));
          return (t.name === "Badge" || t.name === "Button") && words;
        };
        const stray = tags.filter((t) => !(spec.actions && t.name === "Button") && !inSentence(t));
        if (stray.length) errs.push({ cls: "placement", detail: spec.actions ? `${stray[0].name} inside ${n.name}` : `components inside ${n.name}` });
      }
      return count;
    case "code":
      if (!text.trim()) errs.push({ cls: "required-field", detail: `${n.name} needs code` });
      return count;
    case "table": {
      const t = parseTable(text);
      if (!t || !t.rows.length) {
        errs.push({ cls: "required-field", detail: `${n.name} needs a Markdown table` });
        return count;
      }
      if (spec.columns !== "numeric") return count + t.rows.length;
      const series = t.header.slice(1);
      const numeric = t.rows.every((r) => r.slice(1).every((v) => v === "" || looksNumeric(v)));
      if (!series.length || !numeric) errs.push({ cls: "signature-mismatch", detail: `${n.name} data not numeric` });
      return count + series.length;
    }
    case "images": {
      const b = markdownBlocks(text);
      if (!b.images) errs.push({ cls: "required-field", detail: `${n.name} needs images` });
      return count + b.images + nested();
    }
    case "list": {
      const b = markdownBlocks(text);
      if (!b.listItems) errs.push({ cls: "required-field", detail: `${n.name} needs a list` });
      return count + b.listItems + nested();
    }
    default:
      if (spec.content.startsWith("only:")) {
        const allowed = spec.content.slice(5);
        if (text) errs.push({ cls: "placement", detail: `text directly inside ${n.name}` });
        for (const t of tags) if (t.name !== allowed) errs.push({ cls: "placement", detail: `${t.name} inside ${n.name}` });
        if (!tags.length) errs.push({ cls: "required-field", detail: `${n.name} is empty` });
      }
      return count + validate(n, n, errs, notes, strict);
  }
}

export function evaluate(
  text: string,
  opts: { truncated?: boolean; reqs?: number; strict?: boolean; catalog?: Catalog } = {},
): Verdict {
  catalog = opts.catalog ?? defaultCatalog;
  const errs: BenchError[] = [];
  const notes: string[] = [];
  // Judged as it will show: emoji never reach the screen (the core strips them first too).
  const src = stripEmoji(unwrapFence(stripThink(text), notes));
  const root = parse(src, errs);
  const n = validate(root, null, errs, notes, opts.strict === true);
  const renderable = src.trim().length > 0;
  if (!renderable) errs.push({ cls: "root-missing", detail: "empty answer" });
  if (opts.truncated) errs.push({ cls: "truncation", detail: "hit ceiling" });
  const out: Verdict = { renderable, complete: errs.length === 0, n, errs, notes };
  if (out.complete && n < (opts.reqs ?? 0)) {
    out.errs.push({ cls: "coverage-floor", detail: `elements ${n} < requirements ${opts.reqs}` });
    out.complete = false;
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  const v = evaluate(readFileSync(file, "utf8"), { reqs: Number(process.argv[3] ?? 0) });
  console.log(JSON.stringify(v, null, 1));
}
