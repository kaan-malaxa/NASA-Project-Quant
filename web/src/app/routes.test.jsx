import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AppRoutes from "./AppRoutes.jsx";
import ErrorBoundary from "@/components/ErrorBoundary.jsx";
import { clearFetchCache } from "@/data/fetchJson.js";
import { mockFetch } from "@/test/mockFetch.js";

const cases = [
  ["/", "Is it really burning more, or did the satellite get better eyes?", "Prometheus Torch"],
  ["/pick", "Pick a place", "Pick a place · Prometheus Torch"],
  ["/r/punjab", "Region", "Region · Prometheus Torch"],
  ["/methods", "Methods and honesty", "Methods and honesty · Prometheus Torch"],
  ["/gallery", "Component gallery", "Component gallery · Prometheus Torch"],
  ["/no/such/page", "Page not found", "Page not found · Prometheus Torch"],
];

beforeEach(() => {
  clearFetchCache();
  mockFetch({}); // no data files: every screen must still render
  localStorage.setItem("firerosetta-loader-off", "1"); // the loader has its own tests (screens/landing)
  localStorage.setItem("pt-tutorial-seen", "1"); // the tutorial has its own tests (screens/picker)
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );

describe("routes (contracts section 7)", () => {
  it.each(cases)("%s renders its heading, title, the nav and the FIRMS credit", async (path, heading, title) => {
    renderAt(path);
    expect((await screen.findByRole("heading", { level: 1, name: heading }, { timeout: 10000 })).textContent).toBe(heading);
    await waitFor(() => expect(document.title).toBe(title));
    const credit = within(screen.getByRole("contentinfo")).getByRole("link", { name: "NASA FIRMS" });
    expect(credit.getAttribute("href")).toBe("https://firms.modaps.eosdis.nasa.gov/");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav.textContent).toContain("Pick a place");
    expect(nav.textContent).toContain("Methods");
    expect(nav.textContent).not.toContain("Gallery");
    expect(document.head.querySelector('meta[name="description"]').getAttribute("content").length).toBeGreaterThan(20);
  });

  it("/r/punjab/brief renders without the site header or navigation", async () => {
    renderAt("/r/punjab/brief");
    expect(await screen.findByRole("heading", { level: 1, name: "Season Brief" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });
});

describe("error boundary", () => {
  function Boom() {
    throw new Error("kaboom");
  }

  it("shows a friendly message and a link home instead of a blank page", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary resetKey="/x">
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert").textContent).toContain("Something went wrong on this page");
    expect(screen.getByRole("link", { name: "Go to the home page" }).getAttribute("href")).toBe("#/");
    expect(screen.getByText("kaboom")).toBeTruthy();
  });

  it("clears when the route changes", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let crash = true;
    function Maybe() {
      if (crash) throw new Error("once");
      return <p>recovered</p>;
    }
    const { rerender } = render(
      <ErrorBoundary resetKey="/a">
        <Maybe />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    crash = false;
    rerender(
      <ErrorBoundary resetKey="/b">
        <Maybe />
      </ErrorBoundary>,
    );
    expect(screen.getByText("recovered")).toBeTruthy();
  });
});
