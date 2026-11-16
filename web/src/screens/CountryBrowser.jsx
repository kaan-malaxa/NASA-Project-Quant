import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Download, Globe2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import SectionState from "@/components/SectionState.jsx";
import KindBadge from "@/components/KindBadge.jsx";
import { useJson } from "@/data/useJson.js";
import { fmtNumber } from "@/lib/format.js";
import "@/styles/countries.css";

/** Original country source files, fetched only on the place picker. */
export default function CountryBrowser({ regions }) {
  const state = useJson("world.json");
  return (
    <section aria-labelledby="countries-title" className="country-browser">
      <div className="mb-6 max-w-2xl space-y-2">
        <h2 id="countries-title" className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
          <Globe2 aria-hidden="true" className="text-muted-foreground size-6" />
          World country data
        </h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Explore the original NASA FIRMS country archives by satellite product and year.
          Each source file includes its detection count, observation dates and original CSV download.
        </p>
      </div>
      <SectionState state={state} title="World country data" variant="stats">
        {(data) => <Catalog data={data} regions={regions} />}
      </SectionState>
    </section>
  );
}

/** @param {{data: import("@/data/types.gen").WorldJson, regions: import("@/data/types").Region[]}} props */
function Catalog({ data, regions }) {
  const [query, setQuery] = useState("");
  const [params, setParams] = useSearchParams();
  const defaultCountry = data.countries.find((entry) => entry.id === regions[0]?.id) || data.countries[0];
  const selectedId = params.get("country") || defaultCountry?.id;
  const country = data.countries.find((entry) => entry.id === selectedId);
  const search = query.trim().toLocaleLowerCase();
  const countries = data.countries.filter((entry) =>
    `${entry.name} ${entry.firms_name}`.toLocaleLowerCase().includes(search));
  const products = data.products.filter((product) => country?.records.some((record) => record.product === product.id));
  const requestedProduct = params.get("product");
  const product = products.find((entry) => entry.id === requestedProduct) || products[0];
  const records = country?.records.filter((record) => record.product === product?.id) || [];
  const analysis = regions.find((region) => region.id === country?.id);

  function selectCountry(id) {
    const next = new URLSearchParams(params);
    next.set("country", id);
    next.delete("product");
    setParams(next, { preventScrollReset: true });
  }

  function selectProduct(id) {
    const next = new URLSearchParams(params);
    next.set("product", id);
    setParams(next, { preventScrollReset: true });
  }

  return (
    <div className="country-layout">
      <div className="country-sidebar">
        <label htmlFor="country-search" className="mb-2 block text-sm font-medium">Find a country or territory</label>
        <div className="country-search">
          <Search aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
          <input
            id="country-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search countries…"
            autoComplete="off"
          />
        </div>
        <p role="status" className="text-muted-foreground my-3 text-xs">
          {fmtNumber(countries.length, 0)} of {fmtNumber(data.countries.length, 0)} countries and territories
        </p>
        <ul aria-label="Country archives" className="country-list">
          {countries.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                aria-pressed={entry.id === selectedId}
                onClick={() => selectCountry(entry.id)}
              >
                <span>{entry.name}</span>
                {entry.id === selectedId ? <ArrowRight aria-hidden="true" className="size-4 shrink-0" /> : null}
              </button>
            </li>
          ))}
        </ul>
        {!countries.length ? <p className="text-muted-foreground py-4 text-sm">No countries match your search.</p> : null}
      </div>
      {country ? (
        <section aria-labelledby="country-title" className="country-detail">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <h3 id="country-title" className="text-2xl font-semibold tracking-tight">{country.name}</h3>
              <KindBadge kind="observed" />
            </div>
            {analysis ? (
              <Button variant="outline" size="sm" asChild>
                <Link to={{ pathname: `/r/${analysis.id}`, search: params.get("debug") === "1" ? "?debug=1" : "" }}>
                  Open analysis <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            ) : <p className="text-muted-foreground max-w-48 text-xs leading-relaxed">Calibrated analysis is unavailable for this country.</p>}
          </div>
          <div className="mt-6">
            <label htmlFor="country-product" className="mb-2 block text-sm font-medium">Satellite product</label>
            <select
              id="country-product"
              className="country-product"
              value={product?.id || ""}
              onChange={(event) => selectProduct(event.target.value)}
            >
              {products.map((entry) => <option value={entry.id} key={entry.id}>{entry.label}</option>)}
            </select>
          </div>
          <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
            Original archive totals include daytime and nighttime detections at all confidence levels.
            A hotspot is a detection of heat in a satellite pixel. Sensor sensitivity and coverage vary over time.
          </p>
          <div className="country-table-wrap mt-5" tabIndex={0} role="region" aria-label={`${country.name} source files`}>
            <table className="country-table">
              <caption className="sr-only">{country.name} — {product?.label} original source files</caption>
              <thead>
                <tr>
                  <th scope="col">Year</th>
                  <th scope="col" className="text-right">Detections</th>
                  <th scope="col">Observation dates</th>
                  <th scope="col"><span className="sr-only">Download</span></th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.year} data-kind={record.kind}>
                    <th scope="row">{record.year}</th>
                    <td className="text-right tabular-nums">{fmtNumber(record.detections, 0)}</td>
                    <td className="text-muted-foreground text-xs">
                      {record.first_date && record.last_date ? <>{record.first_date}<br />to {record.last_date}</> : "Dates unavailable"}
                    </td>
                    <td>
                      <a
                        className="country-download"
                        href={record.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Download ${country.name} ${product?.label} ${record.year} CSV`}
                      >
                        <Download aria-hidden="true" className="size-4" /> CSV
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
            Downloads open the original file hosted by NASA FIRMS.
          </p>
        </section>
      ) : (
        <div className="country-detail"><p role="status">This country is unavailable in the source catalog. Choose a country from the list.</p></div>
      )}
    </div>
  );
}
