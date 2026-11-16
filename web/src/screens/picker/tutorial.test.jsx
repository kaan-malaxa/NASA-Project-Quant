import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import Tutorial from "./Tutorial.jsx";
import { markTutorialSeen, shouldAutoOpenTutorial } from "./tutorialSteps.js";
import { centeredCard, isSettled, sameRect, tourLayout, tourPlacement } from "./tourLayout.js";
import { targetState } from "./tutorial/waitForTarget.js";
import { useState } from "react";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});
function Harness() {
  const [open, setOpen] = useState(true);
  const location = useLocation();
  return (
    <>
      <button onClick={() => setOpen(true)}>Restart</button>
      <main>
        <div data-tour={location.pathname === "/pick" ? "places" : "verdict-figures"}>Real page target</div>
      </main>
      <p>{location.pathname}</p>
      <Tutorial open={open} onOpenChange={setOpen} />
    </>
  );
}
function setup() {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 20,
    top: 20,
    width: 200,
    height: 60,
    right: 220,
    bottom: 80,
    x: 20,
    y: 20,
    toJSON() {},
  });
  render(
    <MemoryRouter initialEntries={["/pick"]}>
      <Harness />
    </MemoryRouter>,
  );
}
describe("guided tutorial", () => {
  it("highlights the real page, navigates to the region, dismisses and restarts", async () => {
    setup();
    await screen.findByTestId("tour-highlight");
    // Next works only once the box is shown at its place
    await waitFor(() => expect(screen.getByRole("dialog").className).toContain("is-shown"));
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
    const blocked = {
      navigator: {},
      localStorage: {
        getItem() {
          throw Error();
        },
        setItem() {
          throw Error();
        },
      },
    };
    expect(shouldAutoOpenTutorial(blocked)).toBe(false);
    expect(() => markTutorialSeen(blocked)).not.toThrow();
    expect(shouldAutoOpenTutorial({ navigator: { webdriver: true } })).toBe(false);
  });
  it("never shows the box before it is placed, and centers a step whose target never appears", async () => {
    setup();
    const dialog = screen.getByRole("dialog");
    // straight after opening: not shown yet, not placed in a corner
    expect(dialog.className).not.toContain("is-shown");
    expect(dialog.getAttribute("data-placed")).toBe("waiting");
    await waitFor(() => expect(dialog.className).toContain("is-shown"));
    expect(dialog.getAttribute("data-placed")).toBe("anchored");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText(/Read the summary/)).toBeTruthy());
    await waitFor(() => expect(screen.getByRole("dialog").className).toContain("is-shown"));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    // the calendar target does not exist in this harness: after the wait, a centered dialog with no spotlight
    await waitFor(() => expect(screen.getByRole("dialog").getAttribute("data-placed")).toBe("centered"), {
      timeout: 4500,
    });
    expect(screen.getByRole("heading", { name: "The fire calendar" })).toBeTruthy();
    expect(screen.queryByTestId("tour-highlight")).toBeNull();
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

describe("tour layout helpers", () => {
  const r = (left, top, width = 200, height = 60) => ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  });

  it("settled = the same rect on two frames in a row (within 1 px)", () => {
    expect(sameRect(r(10, 10), r(10.6, 9.5))).toBe(true);
    expect(sameRect(r(10, 10), r(14, 10))).toBe(false);
    expect(isSettled([r(0, 0)])).toBe(false);
    expect(isSettled([r(0, 300), r(0, 120), r(0, 120.4)])).toBe(true);
    expect(isSettled([r(0, 300), r(0, 120)])).toBe(false);
  });

  it("no target (missing, or never ready): a centered dialog on wide screens, a bottom sheet on phones, never a corner", () => {
    const wide = tourPlacement({ rect: null, width: 1280, height: 800, cardHeight: 240 });
    expect(wide.mode).toBe("centered");
    expect(wide.box).toBeNull();
    expect(wide.card).toEqual(centeredCard(1280, 800, 240));
    expect(wide.card.left).toBeGreaterThan(400);
    expect(wide.card.top).toBeGreaterThan(200);
    const phone = tourPlacement({ rect: null, width: 390, height: 844, cardHeight: 240 });
    expect(phone).toMatchObject({ mode: "sheet", box: null });
    expect(phone.card.top + 240).toBeLessThanOrEqual(844);
  });

  it("anchored placement stays inside the viewport", () => {
    for (const rect of [r(1200, 700, 300, 200), r(-50, -30), r(600, 380)]) {
      const p = tourPlacement({ rect, width: 1280, height: 800, cardHeight: 260 });
      expect(p.mode).toBe("anchored");
      expect(p.card.left).toBeGreaterThanOrEqual(12);
      expect(p.card.left + p.card.width).toBeLessThanOrEqual(1280);
      expect(p.card.top).toBeGreaterThanOrEqual(12);
      expect(p.card.top + 260).toBeLessThanOrEqual(800);
      expect(p.box.left).toBeGreaterThanOrEqual(0);
    }
  });

  it("phones: the bottom sheet, and no spotlight when the target is off screen", () => {
    const off = tourPlacement({ rect: r(20, 1400), width: 390, height: 844, cardHeight: 240 });
    expect(off).toMatchObject({ mode: "sheet", box: null });
    const on = tourPlacement({ rect: r(20, 200), width: 390, height: 844, cardHeight: 240 });
    expect(on.box).not.toBeNull();
  });

  it("a target still loading (a skeleton inside it or its section) is not ready", () => {
    const section = document.createElement("section");
    section.innerHTML = '<div data-tour="x">Text<div data-state="loading"></div></div>';
    document.body.append(section);
    const el = section.querySelector('[data-tour="x"]');
    expect(targetState(el)).toBe("pending");
    section.querySelector('[data-state="loading"]').remove();
    section.insertAdjacentHTML("beforeend", '<div data-state="loading"></div>');
    expect(targetState(el)).toBe("pending"); // still loading elsewhere in its section
    section.querySelector('[data-state="loading"]').remove();
    el.getBoundingClientRect = () => r(0, 0);
    expect(targetState(el)).toBe("ready");
    expect(targetState(null)).toBe("pending");
    section.remove();
  });
});

describe("tour layout: no room around the target", () => {
  it("centres the box under a full-width target instead of a corner", () => {
    const rect = { left: 80, top: 250, width: 1120, height: 210, right: 1200, bottom: 460 };
    const p = tourPlacement({ rect, width: 1280, height: 720, cardHeight: 260 });
    const centre = p.card.left + p.card.width / 2;
    expect(Math.abs(centre - 640)).toBeLessThan(5);
    expect(p.card.top + 260).toBeLessThanOrEqual(720);
  });
});
