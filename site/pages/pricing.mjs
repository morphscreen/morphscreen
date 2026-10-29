// /pricing: the plans, every limit side by side, and how billing works
// (what the payment provider's review looks for, K3).

import { APP, both, count, inr, pricing, usd } from "./shared.mjs";

export function pricingPage({ plans }) {
  const [free, build, scale] = plans;
  const row = (label, f) => `<tr><th scope="row">${label}</th>${[free, build, scale].map((p) => `<td>${f(p)}</td>`).join("")}</tr>`;
  const table = `<div class="table-scroll" tabindex="0" role="region" aria-label="Every limit by plan">
<table class="limits">
  <thead><tr><th scope="col"><span class="sr-only">Limit</span></th><th scope="col">Free</th><th scope="col">Build</th><th scope="col">Scale</th></tr></thead>
  <tbody>
    ${row("Calls a month", (p) => count(p.monthly))}
    ${row("Of them, on our model", (p) => (p.included === null ? "All" : count(p.included)))}
    ${row("Calls a day", (p) => (p.daily === null ? "No daily limit" : count(p.daily)))}
    ${row("Extra calls past the month", (p) => (p.extra === null ? "None: calls stop" : `${both(inr(p.inr_extra), usd(p.extra))} each, up to ${count(p.monthly)}`))}
    ${row("Requests a minute", (p) => count(p.per_minute))}
    ${row("Answers at once", (p) => count(p.streams))}
    ${row("Renders a month, free", (p) => count(p.renders))}
    ${row("Paid monthly", (p) => (p.usd_month === 0 ? "Free" : both(inr(p.inr_month), usd(p.usd_month))))}
    ${row("Paid yearly", (p) => (p.usd_year === 0 ? "Free" : both(inr(p.inr_year), usd(p.usd_year))))}
  </tbody>
</table>
</div>`;

  const body = `
<header class="page-head">
  <h1 class="title1">Pricing</h1>
  <p class="lead">One price per call, with the model included on paid plans. Start free and move up from the dashboard when you need to.</p>
</header>
${pricing(plans, { heading: "h2", id: "plans", title: "Plans" })}
<section class="section" aria-labelledby="limits-title">
  <div class="section__head"><h2 id="limits-title" class="title">Every limit</h2></div>
  ${table}
</section>
<section class="section prose" aria-labelledby="billing-title">
  <div class="section__head"><h2 id="billing-title" class="title">How billing works</h2></div>
  <ul>
    <li><strong>Who sells it.</strong> Dodo Payments sells our plans as the merchant of record: it takes the payment, works out and pays the tax for your country, and sends the invoice. Every price here already includes that tax.</li>
    <li><strong>Paying.</strong> You choose a plan on the dashboard's Billing tab, in dollars or rupees, monthly or yearly, and pay in Dodo's checkout, which opens over the same page. The plan starts as soon as Dodo confirms the payment.</li>
    <li><strong>Renewals.</strong> A plan renews each month or year on the day you started it, and Dodo charges the same card. Invoices and the card are a click away on the Billing tab.</li>
    <li><strong>Extra calls.</strong> Calls past a paid plan's month are counted under the plan they were made on, and charged once, early the next month.</li>
    <li><strong>Changing plans.</strong> A bigger plan, or a move from monthly to yearly, starts at once, and you pay now for the time left in the current period. A smaller plan starts on your next billing date, with nothing charged now. A yearly plan stays yearly.</li>
    <li><strong>A failed renewal.</strong> Dodo tries again over the next few days while the plan goes on. If every try fails, the plan is put on hold and the account moves to the free plan until the card is updated.</li>
    <li><strong>Cancelling.</strong> Cancel on the Billing tab whenever you like. The plan runs to the end of the period you paid for, then the account moves to the free plan; until then you can keep it with one click. Payments aren't refunded, except a charge we made by mistake: see <a href="/refunds">cancellation and refunds</a>.</li>
  </ul>
  <p><a class="btn btn--primary" href="${APP}/signin">Get a free key</a></p>
</section>`;

  return {
    path: "/pricing",
    title: "Pricing | MorphScreen",
    description: `Free: ${count(free.monthly)} calls a month. Build: ${count(build.monthly)} calls for ${usd(build.usd_month)} (${inr(build.inr_month)}) a month. Scale: ${count(scale.monthly)} calls for ${usd(scale.usd_month)} (${inr(scale.inr_month)}). The model included on paid plans, tax included.`,
    step: "pricing",
    body,
  };
}
