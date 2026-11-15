import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Landing from "../Landing.jsx";
import LandingLoader from "./LandingLoader.jsx";
import { LOADER } from "./loaderMath.js";
import { clearFetchCache } from "@/data/fetchJson.js";
import { resetSample } from "@/data/sample.js";
import { mockFetch } from "@/test/mockFetch.js";
import { methodsJson, regionsJson, rulerJson } from "@/test/fixtures.js";

beforeEach(() => {
  clearFetchCache();
  resetSample();
  sessionStorage.clear();
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
  it("covers the page on the first visit while the h1 stays in the document, then marks the session", () => {
    mockFetch({
      "regions.json": regionsJson({ files: ["ruler"], optional_files: [] }),
      "testland/ruler.json": rulerJson(),
      "methods.json": methodsJson([]),
    });
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("landing-loader")).toBeTruthy();
    expect(screen.getByRole("status", { name: "Loading the globe" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    expect(sessionStorage.getItem("firerosetta-landing-loader")).toBe("1");
  });

  it("is not shown again in the same session", () => {
    sessionStorage.setItem("firerosetta-landing-loader", "1");
    mockFetch({
      "regions.json": regionsJson({ files: [], optional_files: [] }),
      "methods.json": methodsJson([]),
    });
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId("landing-loader")).toBeNull();
  });

  it("collapses and fades out once finished, and only then calls onDone", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"],
    });
    const onDone = vi.fn();
    const { rerender } = render(<LandingLoader finish={false} onDone={onDone} />);
    await act(async () => vi.advanceTimersByTime(3000));
    expect(onDone).not.toHaveBeenCalled(); // keeps turning while the globe loads
    rerender(<LandingLoader finish onDone={onDone} />);
    await act(async () => vi.advanceTimersByTime(LOADER.collapse + 100));
    await act(async () => vi.advanceTimersByTime(LOADER.hold + 50));
    expect(screen.getByTestId("landing-loader").dataset.fading).toBe("true");
    expect(onDone).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(LOADER.fade + 50));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("stops the page scrolling underneath while it is shown", () => {
    const { unmount } = render(<LandingLoader finish={false} onDone={() => {}} />);
    expect(document.documentElement.style.overflow).toBe("hidden");
    unmount();
    expect(document.documentElement.style.overflow).toBe("");
  });
});
