/**
 * Chart image export (contracts section 7, download 3). No dependency: XMLSerializer + canvas.
 * The SVG is cloned with its computed styles inlined, so CSS variables and stylesheet rules (which do not travel
 * with an SVG file) are resolved to plain values.
 */

/** Presentation properties copied from computed style onto each cloned element. */
export const INLINE_PROPS = [
  "fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-linecap",
  "stroke-linejoin", "opacity", "color", "font-family", "font-size", "font-weight", "font-style", "text-anchor",
  "dominant-baseline", "letter-spacing", "visibility", "display", "mix-blend-mode",
];

/** Width/height of the exported image: the SVG's on-screen box, else its viewBox, else 800x600. */
export function svgSize(svg) {
  const box = svg.getBoundingClientRect?.();
  if (box && box.width > 0 && box.height > 0) return { width: Math.round(box.width), height: Math.round(box.height) };
  const vb = svg.viewBox?.baseVal;
  if (vb && vb.width > 0 && vb.height > 0) return { width: Math.round(vb.width), height: Math.round(vb.height) };
  return { width: 800, height: 600 };
}

/** PNG pixel size at a scale factor (2x by default), rounded to whole pixels. */
export function pngSize({ width, height }, scale = 2) {
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * @param {SVGSVGElement} svg the chart's root <svg> (viz components expose it by ref)
 * @param {{ background?: string }} [opts] background colour drawn behind the chart (resolved, e.g. from body)
 * @returns {{ text: string, width: number, height: number }}
 */
export function serializeSvg(svg, opts = {}) {
  const { width, height } = svgSize(svg);
  const clone = /** @type {SVGSVGElement} */ (svg.cloneNode(true));
  const src = [svg, ...svg.querySelectorAll("*")];
  const dst = [clone, ...clone.querySelectorAll("*")];
  const view = svg.ownerDocument.defaultView;
  for (let i = 0; i < src.length; i++) {
    const cs = view.getComputedStyle(src[i]);
    const decl = [];
    for (const p of INLINE_PROPS) {
      const v = cs.getPropertyValue(p);
      if (v && v !== "normal" && !v.includes("var(")) decl.push(`${p}:${v}`);
    }
    if (decl.length) dst[i].setAttribute("style", `${decl.join(";")};${dst[i].getAttribute("style") || ""}`);
    dst[i].removeAttribute("class");
  }
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  if (!clone.getAttribute("viewBox")) clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  if (opts.background) {
    const ns = "http://www.w3.org/2000/svg";
    const bg = svg.ownerDocument.createElementNS(ns, "rect");
    bg.setAttribute("x", "0");
    bg.setAttribute("y", "0");
    bg.setAttribute("width", "100%");
    bg.setAttribute("height", "100%");
    bg.setAttribute("fill", opts.background);
    clone.insertBefore(bg, clone.firstChild);
  }
  const text = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}\n`;
  return { text, width, height };
}

/** Render serialized SVG text to a PNG Blob at `scale` x (browser only). */
export function svgToPng({ text, width, height }, scale = 2) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => {
      const size = pngSize({ width, height }, scale);
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))), "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("The chart image could not be drawn"));
    };
    img.src = url;
  });
}

/** Save a Blob or text as a file through a temporary link (browser only). */
export function saveFile(name, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
