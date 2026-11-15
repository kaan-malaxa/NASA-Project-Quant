import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** The optional basemap host (OpenFreeMap) may fail without failing the test (prompt D3). */
export const OPTIONAL_HOSTS = ["tiles.openfreemap.org"];

/**
 * Collect console errors, page errors, failed requests, and any request that leaves the site's origin
 * (except the optional basemap host) for one page.
 */
export function watch(page) {
  const problems = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.protocol === "data:" || u.protocol === "blob:") return;
    if (u.origin !== new URL(page.url() === "about:blank" ? (process.env.PLAYWRIGHT_BASE_URL || "http://localhost:4173/") : page.url()).origin && !OPTIONAL_HOSTS.includes(u.host)) {
      problems.push(`external request: ${r.url()}`);
    }
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const location = message.location().url;
    const networkFailure = /Failed to load resource|Failed to fetch|AJAXError/.test(message.text());
    const optionalLocation = OPTIONAL_HOSTS.some((host) => location?.startsWith(`https://${host}/`));
    const optionalMessage = OPTIONAL_HOSTS.some((host) => message.text().includes(`https://${host}/`));
    if (networkFailure && (optionalLocation || optionalMessage)) return;
    problems.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  const optional = (url) => OPTIONAL_HOSTS.some((h) => new URL(url).host === h);
  page.on("requestfailed", (r) => !optional(r.url()) && problems.push(`request failed: ${r.url()} (${r.failure()?.errorText})`));
  page.on("response", (r) => r.status() >= 400 && !optional(r.url()) && problems.push(`HTTP ${r.status()}: ${r.url()}`));
  return problems;
}

/** Go to a hash route and wait until its data have loaded. */
export async function open(page, hash) {
  await page.goto(`./${hash}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");
  // No skeletons left = every section finished loading.
  await expect(page.locator('[data-state="loading"]')).toHaveCount(0);
}

/** Serious and critical axe violations, as readable lines. */
export async function seriousAxe(page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.impact} ${v.id}: ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

/** True when the page scrolls sideways. */
export function overflowsHorizontally(page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
}
