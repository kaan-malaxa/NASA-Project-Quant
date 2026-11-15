import { Link, NavLink, Outlet } from "react-router-dom";
import SampleBanner from "@/components/SampleBanner.jsx";

export const FIRMS_URL = "https://firms.modaps.eosdis.nasa.gov/";

function navClass({ isActive }) {
  return [
    "rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2",
    isActive ? "underline underline-offset-4" : "hover:underline hover:underline-offset-4",
  ].join(" ");
}

/**
 * Header, main outlet, footer with the NASA FIRMS credit on every page.
 * `banner` is the slot for the SAMPLE DATA banner; it defaults to <SampleBanner/>, which shows itself
 * only while the sample context is true.
 */
export default function AppShell({ banner = <SampleBanner /> }) {
  return (
    <div className="flex min-h-svh flex-col">
      <div data-slot="sample-banner" className="sticky top-0 z-50">
        {banner}
      </div>
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <Link to="/" className="text-lg font-semibold tracking-tight focus-visible:outline-2">
            FireRosetta
          </Link>
          <nav aria-label="Main" className="flex gap-1">
            <NavLink to="/pick" className={navClass}>
              Pick a place
            </NavLink>
            <NavLink to="/methods" className={navClass}>
              Methods
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-4 text-sm">
          Fire data:{" "}
          <a href={FIRMS_URL} target="_blank" rel="noreferrer" className="underline underline-offset-4">
            NASA FIRMS
          </a>
        </div>
      </footer>
    </div>
  );
}
