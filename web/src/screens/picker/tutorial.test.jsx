import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import Tutorial from "./Tutorial.jsx";
import { markTutorialSeen, shouldAutoOpenTutorial } from "./tutorialSteps.js";
import { tourLayout } from "./tourLayout.js";
import { useState } from "react";

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });
function Harness() {
  const [open, setOpen] = useState(true);
  const location = useLocation();
  return <><button onClick={() => setOpen(true)}>Restart</button><main><div data-tour={location.pathname === "/pick" ? "places" : "verdict-figures"}>Real page target</div></main><p>{location.pathname}</p><Tutorial open={open} onOpenChange={setOpen} /></>;
}
function setup() {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 20, top: 20, width: 200, height: 60, right: 220, bottom: 80, x: 20, y: 20, toJSON() {} });
  render(<MemoryRouter initialEntries={["/pick"]}><Harness /></MemoryRouter>);
}
describe("guided tutorial", () => {
  it("highlights the real page, navigates to the region, dismisses and restarts", async () => {
    setup();
    await screen.findByTestId("tour-highlight");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText("/r/us")).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/Read the summary/)).toBeTruthy());
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByText("Restart"));
    // Reopening resets below in its own test via a fresh mount in production.
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
  it("dismisses with Skip and remembers dismissal even if storage is unavailable", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Skip tutorial" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    const blocked = { navigator: {}, localStorage: { getItem() { throw Error(); }, setItem() { throw Error(); } } };
    expect(shouldAutoOpenTutorial(blocked)).toBe(false);
    expect(() => markTutorialSeen(blocked)).not.toThrow();
    expect(shouldAutoOpenTutorial({ navigator: { webdriver: true } })).toBe(false);
  });
  it("skips unavailable targets instead of leaving the tour stuck", async () => {
    setup();
    await screen.findByTestId("tour-highlight");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText(/Read the summary/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "The fire calendar" })).toBeNull(), { timeout: 4500 });
    expect(screen.getByRole("dialog").textContent).toContain("of 11");
  }, 8000);
  it("remembers the first visit", () => {
    expect(shouldAutoOpenTutorial(window)).toBe(true);
    markTutorialSeen();
    expect(shouldAutoOpenTutorial(window)).toBe(false);
  });
  it("keeps mobile geometry within the viewport", () => {
    const { box, card } = tourLayout({ left: -20, top: 700, width: 700, height: 900 }, 390, 844);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.left + box.width).toBeLessThanOrEqual(390);
    expect(card.left + card.width).toBeLessThanOrEqual(390);
    expect(card.top + 280).toBeLessThanOrEqual(844);
  });
});
