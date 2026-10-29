// What every page shares: the addresses, number formats and the pricing
// block, which the home page and /pricing both show.

export const ORIGIN = "https://morphscreen.com";
export const APP = "https://app.morphscreen.com";
export const API = "https://api.morphscreen.com";
/** Booking a demo: our page, with Calendly's scheduler in it (/book). */
export const DEMO = "/book";
export const CALENDLY = "https://calendly.com/nandubhai222/30min";
export const STATUS = "https://status.morphscreen.com";
export const MAIL = "support@morphscreen.com";

export const esc = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** 25000 as "25,000". */
export const count = (n) => n.toLocaleString("en-US");
/** Rupees in Indian grouping: 479990 as "₹4,79,990"; 0.2 as "₹0.20". */
export const inr = (n) => `₹${Number.isInteger(n) ? n.toLocaleString("en-IN") : n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Dollars: 4790 as "$4,790"; 0.002 as "$0.002". */
export const usd = (n) => `$${Number.isInteger(n) ? n.toLocaleString("en-US") : String(n)}`;

const NAMES = { free: "Free", build: "Build", scale: "Scale" };

/** A price in both currencies; the page shows the one the switch picks, dollars until then. */
export const both = (rupees, dollars) => `<span class="cur-usd">${dollars}</span><span class="cur-inr">${rupees}</span>`;
/** Words for each billing period; the page shows the one the switch picks, monthly until then. */
export const cycle = (month, year) => `<span class="cyc-month">${month}</span><span class="cyc-year">${year}</span>`;

/** A year's price as a month's: 470 as "$39.17". */
const perMonth = (n, f) => f(Math.round((n / 12) * 100) / 100);

/** How the prices show: in dollars or rupees, by the month or the year. Each switch is a pair of radios the page's CSS reads. */
export const switches = `<div class="switches">
    <fieldset class="currency">
      <legend class="sr-only">Show prices in</legend>
      <input type="radio" name="currency" id="cur-usd" value="usd" checked><label for="cur-usd">Dollars</label>
      <input type="radio" name="currency" id="cur-inr" value="inr"><label for="cur-inr">Rupees</label>
    </fieldset>
    <fieldset class="currency">
      <legend class="sr-only">Billed</legend>
      <input type="radio" name="cycle" id="cyc-month" value="month" checked><label for="cyc-month">Monthly</label>
      <input type="radio" name="cycle" id="cyc-year" value="year"><label for="cyc-year">Yearly, 20% off</label>
    </fieldset>
  </div>`;

/** The three plans, with the switches above them. */
export function pricing(plans, { heading = "h2", id = "pricing", title = "Pricing" } = {}) {
  const [free] = plans;
  const card = (p) => {
    const paid = p.usd_month > 0;
    const lines = paid
      ? [
          `${count(p.monthly)} calls a month, every one able to run on our model`,
          `Past that, ${both(inr(p.inr_extra), usd(p.extra))} a call, up to ${count(p.monthly)} more, billed with the month`,
          `${p.per_minute} requests a minute, ${p.streams} answers at once`,
          cycle(`Or ${both(inr(p.inr_year), usd(p.usd_year))} a year, 20% off`, `${both(perMonth(p.inr_year, inr), perMonth(p.usd_year, usd))} a month, billed once a year`),
        ]
      : [
          `${count(p.included)} calls on our model, so no model key is needed to try it`,
          `Up to ${count(p.monthly)} calls a month and ${count(p.daily)} a day on your own OpenRouter key`,
          `${p.per_minute} requests a minute, ${p.streams} answers at once`,
          `Stops at its limits until the day or month starts again`,
        ];
    return `<article class="plan${p.name === "build" ? " plan--lead" : ""}" aria-labelledby="plan-${p.name}">
  <h3 id="plan-${p.name}" class="plan__name">${NAMES[p.name]}</h3>
  <p class="plan__price"><span class="plan__figure">${paid ? cycle(both(inr(p.inr_month), usd(p.usd_month)), both(inr(p.inr_year), usd(p.usd_year))) : both(inr(0), usd(0))}</span><span class="plan__per">${paid ? cycle("a month", "a year") : "always"}</span></p>
  <ul class="plan__lines">${lines.map((l) => `<li>${l}</li>`).join("")}</ul>
  <a class="btn${paid ? "" : " btn--primary"}" href="${APP}/signin">${paid ? `Start on ${NAMES[p.name]}` : "Get a free key"}</a>
</article>`;
  };
  return `<section class="section pricing" id="${id}" aria-labelledby="${id}-title" data-reveal>
  <div class="section__head">
    <${heading} id="${id}-title" class="title">${title}</${heading}>
    ${switches}
  </div>
  <div class="plans">${plans.map(card).join("\n")}</div>
  <p class="small fine">Every plan counts a call as one request to the chat or AG-UI endpoint, its checking and any repair included. Drawing an answer you already have again is free, up to ten times your plan's calls (${count(free.renders)} on the free plan). Every price includes its tax: Dodo Payments sells our plans as the merchant of record and works out the tax for your country at checkout. Cancel any time: the plan runs to the end of what you paid for (<a href="/refunds">cancellation and refunds</a>).</p>
</section>`;
}
