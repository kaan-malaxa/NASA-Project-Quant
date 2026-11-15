import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Landing from "../Landing.jsx";
import LandingLoader from "./LandingLoader.jsx";
import { LOADER, resetLoaderBoot } from "./loaderMath.js";
import { createReadiness } from "./readiness.js";

const oneTask = () => createReadiness([{ id: "all", weight: 1, word: "Loading orbit data" }]);
import { clearFetchCache } from "@/data/fetchJson.js";
import { resetSample } from "@/data/sample.js";
import { mockFetch } from "@/test/mockFetch.js";
import { methodsJson, regionsJson, rulerJson } from "@/test/fixtures.js";

beforeEach(() => {
  clearFetchCache();
  resetSample();
  localStorage.clear();
  resetLoaderBoot({ hash: "#/" }); // as if the landing page was just loaded
  // jsdom has no 2D canvas; the loader then animates without drawing, which is what these tests need.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("landing loader", () => {
  const renderLanding = () =>
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );

  it("covers the landing page on a full page load while the h1 stays in the document", () => {
    mockFetch({
      "regions.json": regionsJson({ files: ["ruler"], optional_files: [] }),
      "testland/ruler.json": rulerJson(),
      "methods.json": methodsJson([]),
    });
    renderLanding();
    expect(screen.getByTestId("landing-loader")).toBeTruthy();
    expect(screen.getByText("Loading FireRosetta").getAttribute("role")).toBe("status");
    expect(screen.getByTestId("landing-loader").querySelector("canvas").getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });

  it("shows on every full load: each new page load starts with the loader again", () => {
    mockFetch({
      "regions.json": regionsJson({ files: [], optional_files: [] }),
      "methods.json": methodsJson([]),
    });
    renderLanding();
    expect(screen.getByTestId("landing-loader")).toBeTruthy();
    cleanup();
    resetLoaderBoot({ hash: "#/" }); // refresh
    renderLanding();
    expect(screen.getByTestId("landing-loader")).toBeTruthy();
  });

  it("not on in-app navigation to #/ (after the landing load, or when the page was opened elsewhere)", () => {
    mockFetch({
      "regions.json": regionsJson({ files: [], optional_files: [] }),
      "methods.json": methodsJson([]),
    });
    renderLanding(); // the page load's landing render
    cleanup();
    renderLanding(); // landing -> elsewhere -> landing, inside the app
    expect(screen.queryByTestId("landing-loader")).toBeNull();
    cleanup();
    resetLoaderBoot({ hash: "#/r/us" }); // opened on a region page, then the logo was clicked
    renderLanding();
    expect(screen.queryByTestId("landing-loader")).toBeNull();
  });

  const fakeTime = () =>
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"],
    });
  // The fetch mock reads bodies on real timers: let ruler.json arrive before the fake clock moves.
  const settle = async () => {
    for (let i = 0; i < 10; i++) await act(async () => new Promise((r) => setImmediate(r)));
  };
  const loaderData = () =>
    mockFetch({
      "regions.json": regionsJson({ files: ["ruler"], optional_files: [] }),
      "testland/ruler.json": rulerJson(),
    });

  it("waits with the two spheres side by side until loaded, then merges, flattens, fades and calls onDone", async () => {
    loaderData();
    fakeTime();
    const onDone = vi.fn();
    const tracker = oneTask();
    render(<LandingLoader tracker={tracker} onDone={onDone} />);
    await act(async () => vi.advanceTimersByTime(4000));
    expect(screen.getByTestId("landing-loader").dataset.stage).toBe("split");
    expect(onDone).not.toHaveBeenCalled();
    act(() => tracker.done("all"));
    await act(async () => vi.advanceTimersByTime(LOADER.merge / 2));
    expect(screen.getByTestId("landing-loader").dataset.stage).toBe("merge");
    await act(async () => vi.advanceTimersByTime(LOADER.merge / 2 + LOADER.flat + 50));
    expect(screen.getByTestId("landing-loader").dataset.fading).toBe("true");
    await act(async () => vi.advanceTimersByTime(LOADER.fade + 50));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("shows for at least 3 seconds even when everything is ready at once", async () => {
    loaderData();
    fakeTime();
    const onDone = vi.fn();
    const tracker = oneTask();
    tracker.done("all");
    render(<LandingLoader tracker={tracker} onDone={onDone} />);
    await settle();
    await act(async () => vi.advanceTimersByTime(2900));
    expect(onDone).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(600));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("Skip jumps straight to the fade", async () => {
    loaderData();
    fakeTime();
    const onDone = vi.fn();
    render(<LandingLoader tracker={oneTask()} onDone={onDone} />);
    await act(async () => vi.advanceTimersByTime(300));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    await act(async () => vi.advanceTimersByTime(LOADER.fade + 100));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("stops the page scrolling underneath while it is shown", () => {
    const { unmount } = render(<LandingLoader tracker={oneTask()} onDone={() => {}} />);
    expect(document.documentElement.style.overflow).toBe("hidden");
    unmount();
    expect(document.documentElement.style.overflow).toBe("");
  });
});
