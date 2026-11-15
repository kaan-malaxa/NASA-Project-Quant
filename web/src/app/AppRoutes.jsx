import { Route, Routes } from "react-router-dom";
import AppShell from "./AppShell.jsx";
import Landing from "@/screens/Landing.jsx";
import Picker from "@/screens/Picker.jsx";
import Region from "@/screens/Region.jsx";
import Brief from "@/screens/Brief.jsx";
import Methods from "@/screens/Methods.jsx";
import GalleryScreen from "@/screens/GalleryScreen.jsx";

// Routes exactly as plan/02_CONTRACTS.md section 7 (hash routing via HashRouter in App.jsx).
export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Landing />} />
        <Route path="pick" element={<Picker />} />
        <Route path="r/:region" element={<Region />} />
        <Route path="r/:region/brief" element={<Brief />} />
        <Route path="methods" element={<Methods />} />
        <Route path="gallery" element={<GalleryScreen />} />
      </Route>
    </Routes>
  );
}
