import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUrlState } from "@/data/useUrlState.js";
import { checkClaim, configFromDoc, seriesFromDoc } from "@/lib/claimCheck.js";
import ClaimCheckerSection from "./ClaimCheckerSection.jsx";
import example from "../../../../contracts/examples/claim_check.json";

const LAST = "2025-12-31";
let search = "";
function Harness() {
  const [url, setUrl] = useUrlState(LAST);
  search = useLocation().search;
  return (
    <ClaimCheckerSection region={{ id: "testland", name: "Testland" }} state={{ status: "ok", data: example }} files={{}} url={url} setUrl={setUrl} lastDataDay={LAST} />
  );
}
const renderAt = (path = "/r/testland") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <TooltipProvider>
        <Harness />
      </TooltipProvider>
    </MemoryRouter>,
  );
const expected = (claim) => checkClaim(claim, seriesFromDoc(example, "Testland"), configFromDoc(example));

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => cleanup());

describe("Claim Checker section", () => {
  it("checks a typed claim, announces the verdict and writes the shareable URL", () => {
    renderAt();
    fireEvent.change(screen.getByLabelText("Percent change claimed"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("First year"), { target: { value: "2008" } });
    fireEvent.change(screen.getByLabelText("Second year"), { target: { value: "2020" } });
    fireEvent.click(screen.getByRole("button", { name: "Check this claim" }));
    const want = expected({ place: "region", direction: "increased", claimed_pct: 12, from_year: 2008, to_year: 2020 });
    const live = screen.getByTestId("claim-result-live");
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(within(live).getByTestId("claim-verdict").dataset.verdict).toBe(want.verdict);
    expect(live.textContent).toContain(want.sentence);
    const params = new URLSearchParams(search);
    expect([params.get("claim_dir"), params.get("claim_pct"), params.get("claim_from"), params.get("claim_to")]).toEqual(["increased", "12", "2008", "2020"]);
    expect(screen.getByTestId("claim-bars")).toBeTruthy();
  });

  it("restores a shared claim from the URL, including can't-tell for a missing year", () => {
    renderAt("/r/testland?claim_dir=decreased&claim_pct=30&claim_from=2005&claim_to=2020");
    const want = expected({ place: "region", direction: "decreased", claimed_pct: 30, from_year: 2005, to_year: 2020 });
    expect(want.verdict).toBe("cant_tell_missing"); // the example record has no 2004 (missing is never zero)
    expect(screen.getByTestId("claim-verdict").dataset.verdict).toBe("cant_tell_missing");
    expect(screen.getByText(want.sentence)).toBeTruthy();
    expect(screen.getByLabelText("Percent change claimed").value).toBe("30");
  });

  it("rejects a first year that is not before the second", () => {
    renderAt("/r/testland?claim_dir=increased&claim_pct=10&claim_from=2020&claim_to=2010");
    expect(screen.getByRole("alert").textContent).toBe("The first year must be before the second.");
    expect(screen.queryByTestId("claim-verdict")).toBeNull();
  });

  it("runs an example chip computed by the pipeline and gets the verdict stored with it", () => {
    renderAt();
    const ex = example.examples[0];
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`by ${ex.claim.claimed_pct}% between ${ex.claim.from_year} and ${ex.claim.to_year}`) }));
    expect(screen.getByTestId("claim-verdict").dataset.verdict).toBe(ex.verdict);
  });

  it("offers the drawn area only once an area is drawn", () => {
    renderAt();
    const place = screen.getByLabelText("Place");
    expect(within(place).getByRole("option", { name: /drawn area/ }).disabled).toBe(true);
  });
});
