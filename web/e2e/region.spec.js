import { expect, test } from "@playwright/test";
import { serveData } from "./fixtures.js";
import { open, watch } from "./helpers.js";

const query = (page) => new URLSearchParams(new URL(page.url()).hash.split("?")[1] ?? "");

test.describe("region page", () => {
  test("view, lens and mode change the URL and re-render", async ({ page }) => {
    const problems = watch(page);
    await serveData(page);
    await open(page, "#/r/alpha");
    const calendar = page.getByRole("region", { name: "The fire calendar" });

    await calendar.getByRole("radio", { name: "Months" }).click();
    await expect.poll(() => query(page).get("view")).toBe("months");
    await expect(calendar.locator('[data-viz-placeholder="CalendarHeatmap"], svg').first()).toBeVisible();

    await calendar.getByRole("radio", { name: "VIIRS, as recorded" }).click();
    await expect.poll(() => query(page).get("lens")).toBe("viirs_raw");
    await expect(calendar.getByRole("radio", { name: "VIIRS, as recorded" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await calendar.getByRole("radio", { name: "Compared with normal" }).click();
    await expect.poll(() => query(page).get("mode")).toBe("anomaly");
    await expect(calendar).toContainText("percentile");

    await calendar.getByRole("radio", { name: "Clock" }).click();
    await expect.poll(() => query(page).get("view")).toBeNull(); // default is omitted
    expect(problems).toEqual([]);
  });

  test("range presets write from/to and update In this period", async ({ page }) => {
    await serveData(page);
    await open(page, "#/r/alpha");
    const bar = page.getByRole("group", { name: "Date range" });
    const panel = page.getByRole("region", { name: /In this period/ });

    await bar.getByRole("button", { name: "VIIRS era 2012+" }).click();
    await expect.poll(() => query(page).get("from")).toBe("2012-01-01");
    await expect(panel).toContainText("2012-01-01 to 2026-11-13");

    await bar.getByRole("button", { name: "This year" }).click();
    await expect.poll(() => query(page).get("from")).toBe("2026-01-01");
    await expect(bar.getByRole("button", { name: "This year" })).toHaveAttribute("aria-pressed", "true");

    await bar.getByRole("button", { name: "Last 12 months" }).click();
    await expect.poll(() => query(page).get("from")).toBe("2025-11-14");

    await bar.getByRole("button", { name: "All years" }).click();
    await expect.poll(() => query(page).get("from")).toBeNull();
    await expect(panel).toContainText("2003-01-01 to 2026-11-13");
  });

  test("a download starts", async ({ page }) => {
    await serveData(page);
    await open(page, "#/r/alpha");
    const button = page.getByRole("button", { name: "Series CSV" });
    test.skip((await button.count()) === 0, "The Downloads panel (prompt C2) is not on this branch yet.");
    const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
    expect(download.suggestedFilename()).toMatch(/^firerosetta_alpha_harmonized_2003-01-01_2026-11-13\.csv$/);
    const text = await (
      await download.createReadStream()
    )
      .toArray()
      .then((c) => Buffer.concat(c).toString("utf8"));
    expect(text.split("\n")[0]).toMatch(/^# FireRosetta /);
  });

  test("the SAMPLE banner is present on sample data", async ({ page }) => {
    await serveData(page, { sample: true });
    for (const hash of ["#/", "#/r/alpha", "#/methods", "#/r/alpha/brief"]) {
      await open(page, hash);
      await expect(page.getByTestId("sample-banner")).toHaveText(
        "SAMPLE DATA: these numbers are placeholders, not results.",
      );
    }
  });

  test("the SAMPLE banner is absent when manifest.contains_sample is false", async ({ page }) => {
    await serveData(page, { sample: false });
    for (const hash of ["#/", "#/r/alpha", "#/methods", "#/r/alpha/brief"]) {
      await open(page, hash);
      await expect(page.getByTestId("sample-banner")).toHaveCount(0);
    }
  });
});
