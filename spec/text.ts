// Text rules shared by the validator and the renderers.

/** Emojis never reach the screen, whatever the model wrote. ©, ® and ™ stay. */
export function stripEmoji(s: string): string {
  return s
    .replace(/(?![©®™])\p{Extended_Pictographic}(️|⃣|[\u{1F3FB}-\u{1F3FF}]|‍\p{Extended_Pictographic}️?)* ?/gu, "")
    .replace(/[️⃣]/g, "");
}

/**
 * Links and images only to places that can't run script: no javascript:,
 * vbscript: or file:, no data: except images. The scheme is read as a browser
 * reads it, which drops spaces and control characters before it and tabs and
 * line breaks anywhere ("java\tscript:" is javascript:).
 */
export function safeUrl(u: string, image: boolean): boolean {
  const t = u.replace(/^[\u0000- ]+/, "").replace(/[\t\n\r]/g, "");
  const scheme = t.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/)?.[1].toLowerCase();
  if (!scheme || !["javascript", "vbscript", "file", "data"].includes(scheme)) return true;
  return image && scheme === "data" && /^data:image\/(png|jpe?g|gif|webp|avif);/i.test(t);
}
