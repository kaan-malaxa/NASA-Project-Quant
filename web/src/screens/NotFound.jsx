import { Link } from "react-router-dom";
import { useDocumentMeta } from "@/lib/useDocumentMeta.js";

/** Catch-all route. */
export default function NotFound() {
  useDocumentMeta("Page not found");
  return (
    <section aria-labelledby="notfound-title" className="space-y-3">
      <h1 id="notfound-title" className="text-2xl font-semibold">
        Page not found
      </h1>
      <p>There is nothing at this address.</p>
      <p className="flex gap-4">
        <Link to="/" className="underline underline-offset-4">
          Home
        </Link>
        <Link to="/pick" className="underline underline-offset-4">
          Pick a place
        </Link>
      </p>
    </section>
  );
}
