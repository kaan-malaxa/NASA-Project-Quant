import { Suspense, lazy } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorBoundary from "@/components/ErrorBoundary.jsx";
import AppShell from "./AppShell.jsx";
import Landing from "@/screens/Landing.jsx";
import Picker from "@/screens/Picker.jsx";
import NotFound from "@/screens/NotFound.jsx";

// Landing and picker load with the app; heavier screens load on first visit (own chunks).
const Region = lazy(() => import("@/screens/Region.jsx"));
const Brief = lazy(() => import("@/screens/Brief.jsx"));
const Methods = lazy(() => import("@/screens/Methods.jsx"));
const GalleryScreen = lazy(() => import("@/screens/GalleryScreen.jsx"));

function ScreenLoading() {
  return (
    <div role="status" aria-label="Loading page" className="space-y-3">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

function Lazy({ children }) {
  return <Suspense fallback={<ScreenLoading />}>{children}</Suspense>;
}

// Routes exactly as plan/02_CONTRACTS.md section 7 (hash routing via HashRouter in App.jsx), plus a catch-all.
export default function AppRoutes() {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary resetKey={pathname}>
      <Routes>
        <Route element={<AppShell resetKey={pathname} />}>
          <Route index element={<Landing />} />
          <Route path="pick" element={<Picker />} />
          <Route path="r/:region" element={<Lazy><Region /></Lazy>} />
          <Route path="methods" element={<Lazy><Methods /></Lazy>} />
          <Route path="gallery" element={<Lazy><GalleryScreen /></Lazy>} />
          <Route path="*" element={<NotFound />} />
        </Route>
        {/* The Season Brief is a print page: no header, no navigation. It carries its own credit footer. */}
        <Route path="r/:region/brief" element={<Lazy><Brief /></Lazy>} />
      </Routes>
    </ErrorBoundary>
  );
}
