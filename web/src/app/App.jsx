import { HashRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SampleProvider } from "@/data/SampleContext.jsx";
import AppRoutes from "./AppRoutes.jsx";

export default function App() {
  return (
    <HashRouter>
      <SampleProvider>
        <TooltipProvider delayDuration={200}>
          <AppRoutes />
        </TooltipProvider>
      </SampleProvider>
    </HashRouter>
  );
}
