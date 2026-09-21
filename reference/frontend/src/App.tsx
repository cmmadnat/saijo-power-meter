import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import HistoricalReports from "./pages/HistoricalReports";
import FunctionTestModule from "./pages/FunctionTestModule";
import CalorieMeterModule from "./pages/CalorieMeterModule";
import EMCModule from "./pages/EMCModule";
import PowerMeterDashboard from "./pages/PowerMeterDashboard";
import PowerMeterDetail from "./pages/PowerMeterDetail";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout><Dashboard /></Layout>} />
          <Route path="/reports" element={<Layout><HistoricalReports /></Layout>} />
          <Route path="/function-test" element={<Layout><FunctionTestModule /></Layout>} />
          <Route path="/calorie-meter" element={<Layout><CalorieMeterModule /></Layout>} />
          <Route path="/emc" element={<Layout><EMCModule /></Layout>} />
          <Route path="/power-meters" element={<Layout><PowerMeterDashboard /></Layout>} />
          <Route path="/meters/:meterId" element={<Layout><PowerMeterDetail /></Layout>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
