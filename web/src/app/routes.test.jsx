import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AppRoutes from "./AppRoutes.jsx";

const cases = [
  ["/", "1 · The broken ruler"],
  ["/pick", "2 · Place picker"],
  ["/r/punjab", "Region story"],
  ["/r/punjab/brief", "8 · Season Brief"],
  ["/methods", "9 · Methods and honesty"],
  ["/gallery", "Component gallery"],
];

afterEach(cleanup);

describe("routes (contracts section 7)", () => {
  it.each(cases)("%s renders its placeholder and the FIRMS credit", (path, title) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(title);
    const credit = screen.getByRole("link", { name: "NASA FIRMS" });
    expect(credit.getAttribute("href")).toBe("https://firms.modaps.eosdis.nasa.gov/");
    expect(screen.getByRole("link", { name: "Pick a place" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Methods" })).toBeTruthy();
  });
});
