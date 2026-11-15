import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AppRoutes from "./AppRoutes.jsx";
import { clearFetchCache } from "@/data/fetchJson.js";
import { mockFetch } from "@/test/mockFetch.js";

const cases = [
  ["/", "Is it really burning more, or did the satellite get better eyes?"],
  ["/pick", "Pick a place"],
  ["/r/punjab", "Region"],
  ["/methods", "Methods and honesty"],
  ["/gallery", "Component gallery"],
];

beforeEach(() => {
  clearFetchCache();
  mockFetch({}); // no data files: every screen must still render
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("routes (contracts section 7)", () => {
  it("/r/punjab/brief renders without the site header or navigation", () => {
    render(
      <MemoryRouter initialEntries={["/r/punjab/brief"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Season Brief");
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });

  it.each(cases)("%s renders its heading, the nav and the FIRMS credit", (path, title) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(title);
    const credit = within(screen.getByRole("contentinfo")).getByRole("link", { name: "NASA FIRMS" });
    expect(credit.getAttribute("href")).toBe("https://firms.modaps.eosdis.nasa.gov/");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav.textContent).toContain("Pick a place");
    expect(nav.textContent).toContain("Methods");
    expect(nav.textContent).not.toContain("Gallery");
  });
});
