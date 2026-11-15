import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { SampleProvider } from "./SampleContext.jsx";
import SampleBanner, { SAMPLE_BANNER_TEXT } from "@/components/SampleBanner.jsx";
import { clearFetchCache, fetchJson } from "./fetchJson.js";
import { containsSampleKind, resetSample } from "./sample.js";
import { mockFetch } from "@/test/mockFetch.js";
import { manifestJson, weeklyJson } from "@/test/fixtures.js";

beforeEach(() => {
  clearFetchCache();
  resetSample();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderBanner() {
  return render(
    <SampleProvider>
      <SampleBanner />
    </SampleProvider>,
  );
}

describe("sample context and banner", () => {
  it("stays hidden for real data", async () => {
    mockFetch({ "manifest.json": manifestJson(false), "testland/weekly.json": weeklyJson("observed") });
    renderBanner();
    await act(() => fetchJson("testland/weekly.json"));
    expect(screen.queryByTestId("sample-banner")).toBeNull();
  });

  it("flips on when any loaded row has kind sample", async () => {
    mockFetch({ "manifest.json": manifestJson(false), "testland/weekly.json": weeklyJson("sample") });
    renderBanner();
    expect(screen.queryByTestId("sample-banner")).toBeNull();
    await act(() => fetchJson("testland/weekly.json"));
    expect(screen.getByTestId("sample-banner").textContent).toBe(SAMPLE_BANNER_TEXT);
  });

  it("flips on when manifest.contains_sample is true", async () => {
    mockFetch({ "manifest.json": manifestJson(true) });
    renderBanner();
    await waitFor(() => expect(screen.getByTestId("sample-banner")).toBeTruthy());
  });

  it("finds kind sample anywhere and skips numeric columns", () => {
    expect(containsSampleKind({ a: { b: [{ kind: "observed" }, { kind: "sample" }] } })).toBe(true);
    expect(containsSampleKind({ series: { h: { value: [1, null, 2] } }, kind_runs: [{ kind: "harmonized" }] })).toBe(false);
  });
});
