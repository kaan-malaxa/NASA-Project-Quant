import { HashRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppRoutes from "./AppRoutes.jsx";

export default function App() {
  return (
    <HashRouter>
      <TooltipProvider delayDuration={200}>
        <AppRoutes />
      </TooltipProvider>
    </HashRouter>
  );
}
