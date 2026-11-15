import { describe, expect, it } from "vitest";
import { pngSize, serializeSvg, svgSize } from "./exportImage.js";

function makeSvg() {
  document.body.innerHTML = `
    <style>.bar { fill: rgb(10, 20, 30); stroke-width: 2px; }</style>
    <svg viewBox="0 0 200 100" class="chart"><rect class="bar" x="0" y="0" width="10" height="10"/><text style="font-size: 12px">Label</text></svg>`;
  return document.querySelector("svg");
}

describe("exportImage", () => {
  it("inlines computed styles, drops classes and declares the SVG namespace", () => {
    const { text, width, height } = serializeSvg(makeSvg(), { background: "rgb(255, 255, 255)" });
    expect(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(text).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(text).toMatch(/<rect[^>]*style="[^"]*fill:\s*rgb\(10, 20, 30\)/);
    expect(text).toContain("stroke-width:2px");
    expect(text).not.toContain('class="');
    expect(text).toContain('fill="rgb(255, 255, 255)"');
    // jsdom has no layout, so the size comes from the viewBox
    expect({ width, height }).toEqual({ width: 200, height: 100 });
  });

  it("leaves the page's SVG untouched", () => {
    const svg = makeSvg();
    serializeSvg(svg);
    expect(svg.getAttribute("class")).toBe("chart");
    expect(svg.querySelector("rect").getAttribute("style")).toBeNull();
  });

  it("sizes the PNG at 2x by default", () => {
    expect(pngSize({ width: 400, height: 250 })).toEqual({ width: 800, height: 500 });
    expect(pngSize({ width: 333.4, height: 0.2 }, 3)).toEqual({ width: 1000, height: 1 });
    expect(svgSize({ getBoundingClientRect: () => ({ width: 0, height: 0 }), viewBox: { baseVal: null } })).toEqual({ width: 800, height: 600 });
  });
});
