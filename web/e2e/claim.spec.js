import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { open, seriousAxe, watch } from "./helpers.js";
import { checkClaim, configFromDoc, seriesFromDoc } from "../src/lib/claimCheck.js";

const published = (path) => JSON.parse(readFileSync(fileURLToPath(new URL(`../public/data/${path}`, import.meta.url)), "utf8"));
const query = (page) => new URLSearchParams(new URL(page.url()).hash.split("?")[1] ?? "");

for (const [id, name, hash, claim] of [
  ["us", "United States", "#/r/us", { direction: "increased", claimed_pct: 100, from_year: 2005, to_year: 2020 }],
  ["synthland", "Synthland", "#/r/synthland?debug=1", { direction: "increased", claimed_pct: 20, from_year: 2005, to_year: 2020 }],
]) {
  test(`claim checker: fill a claim for ${id}, see the verdict and the URL`, async ({ page }) => {
    const errors = watch(page);
    await page.route("https://tiles.openfreemap.org/**", (route) => route.abort("blockedbyclient"));
    await open(page, hash);
    const section = page.getByRole("region", { name: "Check a claim" });
    await section.getByLabel("Direction").selectOption(claim.direction);
    await section.getByLabel("Percent change claimed").fill(String(claim.claimed_pct));
    await section.getByLabel("First year").selectOption(String(claim.from_year));
    await section.getByLabel("Second year").selectOption(String(claim.to_year));
    await section.getByRole("button", { name: "Check this claim" }).click();

    const doc = published(`${id}/claim_check.json`);
    const regionName = published("regions.json").regions.find((r) => r.id === id).name;
    const want = checkClaim({ place: "region", ...claim }, seriesFromDoc(doc, regionName), configFromDoc(doc));
    const verdict = section.getByTestId("claim-verdict");
    await expect(verdict).toHaveAttribute("data-verdict", want.verdict);
    await expect(verdict).toContainText(want.sentence);
    expect(Object.fromEntries(["claim_dir", "claim_pct", "claim_from", "claim_to"].map((k) => [k, query(page).get(k)]))).toEqual({
      claim_dir: claim.direction, claim_pct: String(claim.claimed_pct), claim_from: String(claim.from_year), claim_to: String(claim.to_year),
    });
    console.log(`VERDICT ${name}: [${want.verdict}] ${await verdict.locator("p").nth(1).textContent()}`);
    expect(await seriousAxe(page)).toEqual([]);
    expect(errors).toEqual([]);
  });
}
