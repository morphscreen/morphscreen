// The core's keep_ids (rust/core/src/html.rs), for text the DOM renderer
// builds itself while an answer streams (card and step subtitles), so the
// page matches the core's HTML: IDs, dates, times and codes in one piece,
// a word kept with the dash after it, long URLs broken only after slashes.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const len = (s: string) => [...s].length;
const nb = (s: string) => `<span class="ms-nb">${esc(s)}</span>`;

function token(tok: string): string {
  const core = tok.replace(/^[(),;"'[\]]+|[(),;"'[\]]+$/g, "");
  const id =
    (len(core) >= 3 && len(core) <= 32 && /[0-9]/.test(core) && /[-/:._–]/.test(core.replace(/[.:]+$/, "")) && !core.includes("://")) ||
    (len(core) <= 40 && core.includes("@") && core.replace(/\.+$/, "").includes(".") && !core.includes("://"));
  if (id) return nb(tok);
  if (len(tok) > 32 && /[/;]/.test(tok))
    return tok
      .split(/(?<=[/;])/)
      .map((p) => (len(p) > 1 && len(p) <= 32 && /[0-9\-_.]/.test(p) ? nb(p) : esc(p)))
      .join("<wbr>");
  let out = "";
  let rest = tok;
  for (let p = rest.search(/[–—]/); p >= 0; p = rest.search(/[–—]/)) {
    out += p === 0 ? esc(rest.slice(0, 1)) : nb(rest.slice(0, p + 1));
    rest = rest.slice(p + 1);
  }
  return out + esc(rest);
}

/** Escaped HTML for `text`, split and joined on ASCII whitespace as the core does. */
export const keepIds = (text: string) => text.split(/([ \t\n\r\f]+)/).map((part, i) => (i % 2 ? part : part ? token(part) : "")).join("");

/** The core's dashes: a dash between words never starts a line. */
const dashes = (s: string) => s.replace(/ ([-–—]) /g, "\u00a0$1 ");

/**
 * A heading's or label's text with its last two words held together in an
 * inline block (the core's pair_at and title): no word alone on its last line,
 * and IDs, dates and dash joins kept as in body text.
 */
export function withPair(s: string): string {
  const t = s.trimEnd();
  if (t.split(/\s+/).filter(Boolean).length < 3) return keepIds(dashes(s));
  const last = t.lastIndexOf(" ");
  const start = t.slice(0, last).trimEnd().lastIndexOf(" ") + 1;
  if (start <= 0 || len(t.slice(start)) > 30) return keepIds(dashes(s));
  return `${keepIds(dashes(s.slice(0, start)))}<span class="ms-pair">${keepIds(dashes(s.slice(start)))}</span>`;
}
