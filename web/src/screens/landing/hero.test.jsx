import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import GlobeHero from "./GlobeHero.jsx";

afterEach(cleanup);

const calibration = {
  eras: [
    { from: "2003-01-01", to: "2022-12-31", kind: "observed", source: "aqua" },
    { from: "2023-01-01", to: null, kind: "harmonized", source: "snpp" },
  ],
};

// jsdom has no WebGL, so these tests also cover the static fallback: the picture plus the same buttons.
describe("GlobeHero", () => {
  it("shows the static Earth and one real button per satellite when WebGL is not available", () => {
    render(<GlobeHero calibration={null} />);
    expect(screen.getByTestId("static-earth")).toBeTruthy();
    expect(screen.getByRole("img", { name: /five satellites/ })).toBeTruthy();
    const names = screen.getAllByRole("button").map((b) => b.textContent);
    expect(names).toEqual(["TerraMODIS", "AquaMODIS", "Suomi NPPVIIRS", "NOAA-20VIIRS", "NOAA-21VIIRS"]);
  });

  it("opens the panel from a button, with the role read from calibration.json", () => {
    render(<GlobeHero calibration={calibration} />);
    const aqua = screen.getByRole("button", { name: /^Aqua/ });
    fireEvent.click(aqua);
    const panel = screen.getByRole("dialog", { name: "Aqua" });
    expect(panel.textContent).toContain("Instrument: MODIS");
    expect(panel.textContent).toContain("about 1 km");
    expect(screen.getByTestId("satellite-role").textContent).toContain("Reference sensor");
    expect(screen.getByTestId("satellite-role").textContent).toContain("2003-01-01 to 2022-12-31");
    expect(aqua.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement.getAttribute("aria-label")).toBe("Close Aqua details");
  });

  it("leaves the role out when calibration.json is not available", () => {
    render(<GlobeHero calibration={null} />);
    fireEvent.click(screen.getByRole("button", { name: /^Suomi NPP/ }));
    expect(screen.getByRole("dialog").textContent).toContain("375 m");
    expect(screen.queryByTestId("satellite-role")).toBeNull();
  });

  it("closes with Escape (focus returns to the button), the X, and a press outside", () => {
    render(<GlobeHero calibration={calibration} />);
    const terra = screen.getByRole("button", { name: /^Terra/ });
    fireEvent.click(terra);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(terra);

    fireEvent.click(terra);
    fireEvent.click(screen.getByRole("button", { name: "Close Terra details" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(terra);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
