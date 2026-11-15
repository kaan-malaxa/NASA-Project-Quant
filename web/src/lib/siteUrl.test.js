import { afterEach, describe, expect, it, vi } from "vitest";
import { siteUrl } from "./siteUrl.js";

afterEach(() => vi.unstubAllEnvs());

describe("siteUrl", () => {
  it("uses VITE_SITE_URL from the build, with a trailing slash", () => {
    vi.stubEnv("VITE_SITE_URL", "https://kaan-malaxa.github.io/NASA-Project-Quant");
    expect(siteUrl()).toBe("https://kaan-malaxa.github.io/NASA-Project-Quant/");
  });

  it("falls back to the address the page was opened at", () => {
    vi.stubEnv("VITE_SITE_URL", "");
    expect(siteUrl()).toBe(window.location.origin + window.location.pathname.replace(/\/?$/, "/"));
  });
});
