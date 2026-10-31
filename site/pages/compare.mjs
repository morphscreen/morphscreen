// /compare/openui: every row of the newest scoreboard (bench/scoreboard.jsonl)
// with how it was measured, the rows OpenUI wins included (roadmap N5).

import { esc } from "./shared.mjs";

const AHEAD = { ours: "MorphScreen", OpenUI: "OpenUI", tie: "Even" };

/** Text with its ids (deepseek/deepseek-v4-flash, 32-char, a JSON setting) kept whole on one line. */
const keep = (s) =>
  String(s)
    .split(/(\s+)/)
    .map((w) => (/[A-Za-z0-9"\]}][-/_:{[][A-Za-z0-9"{[]/.test(w) ? `<span class="nb">${esc(w)}</span>` : esc(w)))
    .join("");

export function compareOpenUI({ board }) {
  const measured = board.tally.ours + board.tally.openui + board.tally.tie;
  const rows = board.rows
    .map((r) => {
      const ahead = AHEAD[r.winner] ?? "Not measured";
      const tone = r.winner === "ours" ? "mint" : r.winner === "OpenUI" ? "rose" : "none";
      return `<tr>
      <th scope="row">${keep(r.axis)}</th>
      <td class="msui-num">${keep(r.ours)}</td>
      <td class="msui-num">${keep(r.openui)}</td>
      <td><span class="ahead"><span class="ahead__dot" data-tone="${tone}" aria-hidden="true"></span>${ahead}</span></td>
      <td class="how">${keep(board.method.get(r.axis) ?? "")}</td>
    </tr>`;
    })
    .join("");

  const body = `
<header class="page-head">
  <h1 class="title1">MorphScreen against OpenUI,&nbsp;measured</h1>
  <p class="lead">OpenUI is the open-source generative UI library we measure ourselves against. Both formats get the same briefs, the same models and providers, and the same rules for what counts as valid. Of ${measured} rows with numbers for both, MorphScreen is ahead on ${board.tally.ours}, OpenUI on ${board.tally.openui}, and ${board.tally.tie} are even. ${board.tally.unmeasured} rows are ours alone so far.</p>
  <p class="small">Scoreboard of ${board.date}: commit ${esc(board.commit)}, prompt ${esc(board.prompt)}. <a href="/benchmark">How it's run, every raw answer, and why OpenUI is ahead where it is</a>. <a href="/demo">Both renderers drawing the same answer, live</a>.</p>
</header>
<section class="section" aria-labelledby="rows-title">
  <h2 id="rows-title" class="sr-only">Every row</h2>
  <div class="table-scroll" tabindex="0" role="region" aria-label="Every measurement">
    <table class="board">
      <thead><tr><th scope="col">What</th><th scope="col">MorphScreen</th><th scope="col">OpenUI</th><th scope="col">Ahead</th><th scope="col">How it was measured</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</section>`;

  return {
    path: "/compare/openui",
    title: "MorphScreen vs OpenUI: every measurement | MorphScreen",
    description: `MorphScreen against OpenUI on ${measured} measurements: valid answers per model, tokens, layout shift, CPU, download size and memory. Ahead on ${board.tally.ours}, behind on ${board.tally.openui}.`,
    step: "compare",
    body,
  };
}
