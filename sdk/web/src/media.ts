// Where pictures may load from. An answer's image URLs are the model's:
// loading one tells its host who is reading, and a URL can carry what the
// page holds out to anyone. So only the app's own hosts load (with a photo
// key for the API, its provider's too); any other image shows its
// description in a tile.

import { keepIds } from "./text";

export interface MediaOptions {
  /** The image hosts that load ("cdn.example.com", "images.pexels.com"); nothing else does. */
  imageHosts?: string[];
}

const hostOf = (u: string) => {
  try {
    return new URL(u).host;
  } catch {
    return u.replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, "");
  }
};

/** Whether `src` may load: a data: image, or https (http on this machine) from an allowed host. */
export function allowedImage(src: string, o: MediaOptions): boolean {
  if (/^data:image\//i.test(src)) return true;
  let u: URL;
  try {
    u = new URL(src);
  } catch {
    return false;
  }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) return false;
  const hosts = (o.imageHosts ?? []).map(hostOf);
  return hosts.includes(u.host);
}

/** Phosphor's image icon (regular), as the core sends icons. */
const PICTURE = "M216 40l-176 0c-9 0-16 7-16 16l0 144c0 9 7 16 16 16l176 0c9 0 16-7 16-16l0-144c0-9-7-16-16-16zM216 56l0 103-26-26c-3-3-7-5-11-5-5 0-9 2-12 5l-20 20-44-44c-6-7-16-7-22 0l-41 40 0-93zM40 172l52-52 80 80-132 0zM216 200l-21 0-36-36 20-20 37 37 0 19zM144 100c0-7 5-12 12-12 7 0 12 5 12 12 0 7-5 12-12 12-7 0-12-5-12-12z";

/** The tile an image becomes when it can't or mustn't load; `small` (a product's photo beside its name) gets a picture's outline instead of words. */
export function imageTile(alt: string, small = false): HTMLElement {
  const tile = document.createElement("span");
  if (small) {
    tile.className = "ms-img-missing ms-icon-only";
    tile.setAttribute("role", "img");
    tile.setAttribute("aria-label", alt || "Image");
    tile.innerHTML = `<svg class="ms-icon" viewBox="0 0 256 256" aria-hidden="true"><path d="${PICTURE}"/></svg>`;
    return tile;
  }
  tile.className = [...(alt || "")].length > 32 ? "ms-img-missing ms-long" : "ms-img-missing";
  tile.setAttribute("role", "img");
  tile.setAttribute("aria-label", alt || "Image");
  tile.innerHTML = keepIds(alt || "Image");
  return tile;
}

/**
 * Before `root` joins the page: images from elsewhere become tiles (an
 * avatar's become its initials, as when one fails), and a video keeps its
 * player but loses a poster from elsewhere.
 */
export function guardImages(root: ParentNode, o: MediaOptions) {
  for (const img of Array.from(root.querySelectorAll("img"))) {
    const src = img.getAttribute("src") ?? "";
    if (allowedImage(src, o)) continue;
    img.removeAttribute("src");
    // Its credit goes with it, and a caption left empty (the core's HTML does the same).
    if (img.parentElement?.tagName === "FIGURE") {
      const credit = img.parentElement.querySelector(".ms-credit");
      const cap = credit?.parentElement;
      credit?.remove();
      if (cap?.tagName === "FIGCAPTION" && !cap.childNodes.length) cap.remove();
    }
    const pic = img.closest(".ms-pic");
    const avatar = img.parentElement?.classList.contains("ms-avatar") ? img.parentElement : null;
    if (avatar) {
      const name = avatar.querySelector("strong")?.textContent ?? "";
      const s = document.createElement("span");
      s.textContent = name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
      img.replaceWith(s);
    } else (pic ?? img).replaceWith(imageTile(img.alt, !!img.closest(".ms-product")));
  }
  for (const v of Array.from(root.querySelectorAll("video[poster]"))) {
    if (!allowedImage(v.getAttribute("poster") ?? "", o)) v.removeAttribute("poster");
  }
}
