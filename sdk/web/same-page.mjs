// The page in the browser against the server HTML, compared as DOM trees
// (attribute order and whitespace between tags don't matter). What the SDK
// adds (data-ms-added) is left out, what it wraps (data-ms-wrap, a legend
// item's toggle button, a stepper's box, a video's stage) is unwrapped, and
// a media element its player took over (data-ms-player) has its controls back.
// It runs in the page, so it uses nothing from outside itself:
//   await page.evaluate(`(${samePage})(answerElement.innerHTML, answer.html())`)
// Used by the browser benchmark (bench/web/run.mjs) and sdk/web/test-stream.mjs.
export function samePage(page, server) {
  const clean = (html) => {
    const t = document.createElement("template");
    t.innerHTML = html;
    // The SDK's players take over a video's or audio's controls (data-ms-player): they were on in the HTML.
    t.content.querySelectorAll("[data-ms-player] :is(video, audio)").forEach((m) => m.setAttribute("controls", ""));
    // A map's pins and their numbers keep one size on screen at any width (device.ts
    // pinSize, since Q6), so their radius and label position are the SDK's, on both sides.
    t.content.querySelectorAll("figure.ms-map svg circle.ms-pin").forEach((c) => c.removeAttribute("r"));
    t.content.querySelectorAll("figure.ms-map svg text").forEach((x) => { x.removeAttribute("y"); x.removeAttribute("style"); });
    t.content.querySelectorAll("figure.ms-map svg .ms-route").forEach((x) => x.removeAttribute("style"));
    // A combobox's input lists the answer's suggestions through the SDK's own menu: its
    // datalist link comes back and the menu's ARIA goes (controls.ts combobox).
    t.content.querySelectorAll("input[data-ms-list]").forEach((i) => {
      i.setAttribute("list", i.dataset.msList);
      i.removeAttribute("data-ms-list");
      for (const k of ["role", "aria-autocomplete", "aria-expanded", "aria-controls", "aria-activedescendant"]) i.removeAttribute(k);
    });
    // Flashcards share the height of the tallest card turned over, measured by the SDK.
    t.content.querySelectorAll(".ms-flashcards[style]").forEach((f) => {
      f.style.removeProperty("--ms-card-h");
      if (!f.getAttribute("style")) f.removeAttribute("style");
    });
    const walk = (n) => {
      for (const c of [...n.childNodes]) {
        if (c.nodeType === 3 && !c.textContent.trim()) c.remove();
        else if (c.nodeType === 1 && c.dataset.msAdded) c.remove();
        else if (c.nodeType === 1 && c.dataset.msWrap) {
          const kids = [...c.childNodes];
          c.replaceWith(...kids);
          walk({ childNodes: kids });
        }
        else if (c.nodeType === 1) {
          for (const a of [...c.attributes]) if (a.name.startsWith("data-") || (c.matches(".ms-tabs > input, .ms-tabs > .ms-tablist > label") && ["name", "id", "for"].includes(a.name))) c.removeAttribute(a.name);
          walk(c);
        }
      }
    };
    walk(t.content);
    return t.content;
  };
  return clean(page).isEqualNode(clean(server));
}
