// The browser the web tests run in (roadmap C3): Chrome by default, Firefox
// with BROWSER=firefox (Puppeteer drives it over WebDriver BiDi), Safari with
// BROWSER=safari (safari.mjs, over Safari's own WebDriver). CHROME and
// FIREFOX point at other installs; Firefox is looked for in the tools folder
// first (~/.cache/morphscreen-web/Firefox.app), then in /Applications.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { launchSafari } from "./safari.mjs";

export const browserName = ["firefox", "safari"].includes(process.env.BROWSER) ? process.env.BROWSER : "chrome";

const firefox = [process.env.FIREFOX, join(process.env.HOME ?? "", ".cache/morphscreen-web/Firefox.app/Contents/MacOS/firefox"), "/Applications/Firefox.app/Contents/MacOS/firefox"].find((p) => p && existsSync(p));

/**
 * Puppeteer's launch options for the chosen browser: `chromeArgs` are
 * Chrome's own flags, `firefoxPrefs` Firefox's (what Chrome emulates per
 * page, like reduced motion, Firefox takes as a preference at launch).
 */
export function launchOptions(chromeArgs = [], firefoxPrefs = {}) {
  if (browserName === "firefox") return { browser: "firefox", executablePath: firefox, headless: true, extraPrefsFirefox: firefoxPrefs };
  return { executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: chromeArgs };
}

/** The browser to test in: Puppeteer's Chrome or Firefox, or Safari over its WebDriver. */
export function launch(puppeteer, chromeArgs = [], firefoxPrefs = {}) {
  return browserName === "safari" ? launchSafari() : puppeteer.launch(launchOptions(chromeArgs, firefoxPrefs));
}
