import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import LoadingFrame, { PageLoading } from "./LoadingFrame.jsx";
import SectionState from "./SectionState.jsx";

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});
describe("loading frames", () => {
    it("reserves space immediately but only paints after 150ms, with hidden shapes and a busy label", () => {
        vi.useFakeTimers();
        const { container } = render(<LoadingFrame title="Calendar" variant="calendar" />);
        expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
        expect(container.querySelector('[data-state="loading"]')).toBeTruthy();
        expect(container.querySelector(".loading-shapes").getAttribute("data-visible")).toBe("false");
        act(() => vi.advanceTimersByTime(150));
        expect(container.querySelector(".loading-shapes").getAttribute("data-visible")).toBe("true");
        expect(container.querySelector(".loading-shapes").getAttribute("aria-hidden")).toBe("true");
    });
    it("does not flash cached data and removes busy markers for success, missing files and validation errors", () => {
        const { rerender, container } = render(
            <SectionState state={{ status: "loading" }} title="Verdict" />,
        );
        rerender(
            <SectionState state={{ status: "ok", data: {} }} title="Verdict">
                {() => <p>Ready</p>}
            </SectionState>,
        );
        expect(container.querySelector('[data-state="loading"]')).toBeNull();
        rerender(<SectionState state={{ status: "invalid", detail: "missing field" }} title="Verdict" />);
        expect(screen.getByText("This file failed validation.")).toBeTruthy();
        expect(container.querySelector('[aria-busy="true"]')).toBeNull();
        rerender(<SectionState state={{ status: "absent" }} title="Verdict" />);
        expect(container.querySelector('[data-state="loading"]')).toBeNull();
    });
    it("replaces a stuck skeleton with a recovery action instead of pulsing forever", () => {
        vi.useFakeTimers();
        const { container } = render(<LoadingFrame title="Calendar" />);
        act(() => vi.advanceTimersByTime(45000));
        expect(container.querySelector('[data-state="loading"]')).toBeNull();
        expect(screen.getByRole("alert")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Reload this page to try again" })).toBeTruthy();
    });
    it("reuses the measured content height while a section reloads", () => {
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ height: 276 });
        const { rerender, container } = render(
            <SectionState state={{ status: "ok", data: {} }} title="Verdict">
                {() => <p>Loaded</p>}
            </SectionState>,
        );
        rerender(<SectionState state={{ status: "loading" }} title="Verdict" />);
        expect(container.querySelector('[data-state="loading"]').style.height).toBe("276px");
        vi.restoreAllMocks();
    });
    it("uses complete card silhouettes on picker routes", () => {
        const { container } = render(<PageLoading kind="pick" />);
        expect(container.querySelectorAll(".sk-card")).toHaveLength(24); // one full picker page
        expect(container.querySelectorAll('.sk-card [data-slot="skeleton"]')).toHaveLength(24 * 6);
    });
});
